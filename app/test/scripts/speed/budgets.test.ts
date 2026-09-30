import { describe, expect, it } from 'vitest';
import { BUDGETS, judgeCameraPath, judgeOpen, judgeStrokeFrames, matchStrokeFrames } from '../../../../scripts/speed/budgets.ts';
import type { FrameSample, InputSample, RunSummary } from '../../../../scripts/speed/frameStats.ts';
import { summarizeFrames } from '../../../../scripts/speed/frameStats.ts';

/*
 * The speed script fails the build on any D3 budget, so its verdicts are the gate itself: a camera path passes only
 * with no dropped frame, a brush stroke only when every frame that drew an input stayed under one refresh and no frame
 * was dropped between its first input and its last, and an open only inside its budget. A verdict that passed on
 * nothing measured would let a broken renderer through, so each rule is tested on both sides of its line and on an
 * empty recording.
 */

/**
 * Builds frames on a steady 60 Hz clock, each with the given main-thread work and GPU time.
 * @param {number[][]} costs Each frame's work and GPU time.
 * @param {number[]} skips Frame indexes whose begin comes a whole refresh late.
 * @returns {FrameSample[]} The frames.
 */
const frames = (costs: number[][], skips: number[] = []): FrameSample[] =>
{
  let time = 1000;
  return costs.map(([ work, gpu ], index) =>
  {
    time += skips.includes(index) ? 2000 / 60 : 1000 / 60;
    return { time, firstCallbackAt: time + 0.5, lastCallbackEnd: time + 0.5 + work, work, gpu };
  });
};

/**
 * Builds a pointer move handled at a moment.
 * @param {number} handledAt When the page handled it.
 * @returns {InputSample} The input.
 */
const move = (handledAt: number): InputSample => ({ type: 'pointermove', timeStamp: handledAt - 1, handledAt, coalesced: 1 });

describe('budgets', () =>
{
  describe('judgeCameraPath', () =>
  {
    it('passes a path with no dropped frame, fails one with a dropped frame, and fails an empty recording', () =>
    {
      // Arrange.
      const smooth = summarizeFrames(frames([ [ 1, 1 ], [ 1, 1 ], [ 1, 1 ] ]));
      const dropped = summarizeFrames(frames([ [ 1, 1 ], [ 1, 1 ], [ 1, 1 ] ], [ 2 ]));
      const empty: RunSummary = summarizeFrames([]);

      // Act.
      const verdicts = [ judgeCameraPath(smooth), judgeCameraPath(dropped), judgeCameraPath(empty) ];

      // Assert.
      expect(verdicts.map(verdict => verdict.pass))
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('matchStrokeFrames', () =>
  {
    it('matches each input to the first frame whose callbacks began after it was handled', () =>
    {
      // Arrange: frames begin at 1016.7, 1033.3 and 1050; the first input is handled exactly as frame 0's callbacks
      // begin, the next two between frames, the last after every frame.
      const recorded = frames([ [ 1, 0 ], [ 2, 0 ], [ 3, 0 ] ]);
      const inputs = [ move(recorded[0].firstCallbackAt), move(1020), move(1040), move(2000) ];

      // Act.
      const matches = matchStrokeFrames(inputs, recorded);

      // Assert: the first input lands exactly on a frame's first callback; the last came after every frame.
      expect(matches.map(match => match.frame.work))
        .toStrictEqual([ 1, 2, 3 ]);
    });
  });

  describe('judgeStrokeFrames', () =>
  {
    it('passes a stroke whose drawing frames all stayed under one refresh with none dropped', () =>
    {
      // Arrange.
      const recorded = frames([ [ 1, 2 ], [ 1, 2 ], [ 1, 2 ] ]);
      const inputs = [ move(1010), move(1030) ];

      // Act.
      const result = judgeStrokeFrames(inputs, recorded);

      // Assert.
      expect([ result.verdict.pass, result.matched, result.frames, result.dropped, result.cost.max ])
        .toStrictEqual([ true, 2, 2, 0, 3 ]);
    });

    it('fails a stroke with a drawing frame at or over one refresh, main thread and GPU together', () =>
    {
      // Arrange: 10 ms of work and 7 ms of GPU is over 16.7 ms though neither alone is.
      const recorded = frames([ [ 1, 1 ], [ 10, 7 ] ]);
      const inputs = [ move(1010), move(1020) ];

      // Act.
      const result = judgeStrokeFrames(inputs, recorded);

      // Assert.
      expect([ result.verdict.pass, result.verdict.reasons ])
        .toStrictEqual([ false, [ 'worst stroke frame 17.00 ms' ] ]);
    });

    it('fails a stroke that dropped a frame between its first input and its last, but not one outside it', () =>
    {
      // Arrange: a frame drops before the second drawing frame; in the other recording it drops after the last.
      const inside = frames([ [ 1, 1 ], [ 1, 1 ], [ 1, 1 ] ], [ 1 ]);
      const outside = frames([ [ 1, 1 ], [ 1, 1 ], [ 1, 1 ] ], [ 2 ]);
      const inputs = [ move(1010), move(1030) ];

      // Act.
      const results = [ judgeStrokeFrames(inputs, inside), judgeStrokeFrames(inputs, outside) ];

      // Assert.
      expect(results.map(result => [ result.verdict.pass, result.dropped ]))
        .toStrictEqual([ [ false, 1 ], [ true, 0 ] ]);
    });

    it('fails a stroke that no frame drew', () =>
    {
      // Arrange: inputs handled after every recorded frame.
      const recorded = frames([ [ 1, 1 ] ]);

      // Act.
      const result = judgeStrokeFrames([ move(5000) ], recorded);

      // Assert.
      expect([ result.verdict.pass, result.verdict.reasons ])
        .toStrictEqual([ false, [ 'no stroke input was matched to a frame' ] ]);
    });
  });

  describe('judgeOpen', () =>
  {
    it('passes an open inside its budget, and fails one at it, over it, or never finished', () =>
    {
      // Arrange.
      const opens = [ 499, 500, 750, -1 ];

      // Act.
      const verdicts = opens.map(ms => judgeOpen(ms, BUDGETS.coldOpenMs, 'cold open'));

      // Assert.
      expect(verdicts)
        .toStrictEqual([
          { pass: true, reasons: [] },
          { pass: false, reasons: [ 'cold open took 500 ms, over 500 ms' ] },
          { pass: false, reasons: [ 'cold open took 750 ms, over 500 ms' ] },
          { pass: false, reasons: [ 'the cold open never finished' ] },
        ]);
    });
  });
});
