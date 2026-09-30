import { describe, expect, it } from 'vitest';
import type { FrameReport } from '../../../src/mapEditor/render/PixiMapRenderer.ts';
import { whenMapDrawn, type DrawnSource } from '../../../src/mapEditor/render/openTiming.ts';

/*
 * A map open, cold or warm, is timed to the first frame that shows the map complete: its tiles rebuilt and every
 * character sheet and the parallax loaded. The frame that rebuilds the tiles comes before the sheets land, so ending
 * the timer there would report an open the author has not yet seen, which is what the speed budgets exist to prevent.
 */

/**
 * A renderer stand-in whose frames the test draws by hand, each with its rebuilt chunks and the pictures still loading.
 * @returns {{ renderer: DrawnSource, draw: (rebuiltChunks: number, loadingImages: number) => void, listeners: () => number }}
 * The stand-in, a way to draw a frame, and how many frame listeners it holds.
 */
const standIn = () =>
{
  const listeners = new Set<(report: FrameReport) => void>();
  let loading = 0;
  const renderer: DrawnSource = {
    onFrame: listener =>
    {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stats: () => ({ loadingImages: loading }),
  };
  const draw = (rebuiltChunks: number, loadingImages: number) =>
  {
    loading = loadingImages;
    [ ...listeners ].forEach(listener => listener({ time: 0, workMs: 0, rebuiltChunks }));
  };
  return { renderer, draw, listeners: () => listeners.size };
};

describe('whenMapDrawn', () =>
{
  it('ends at the first frame after the tiles rebuilt with no picture still loading, and only once', () =>
  {
    // Arrange: a clock that reads each frame's number.
    const { renderer, draw, listeners } = standIn();
    let frame = 0;
    const drawnAt: number[] = [];
    whenMapDrawn(renderer, at => drawnAt.push(at), () => frame);

    // Act: nothing loading before the map arrives; the tiles rebuild with three sheets loading; one sheet left; none
    // left; then another frame.
    [ [ 0, 0 ], [ 25, 3 ], [ 0, 1 ], [ 0, 0 ], [ 0, 0 ] ].forEach(([ rebuiltChunks, loadingImages ], index) =>
    {
      frame = index + 1;
      draw(rebuiltChunks, loadingImages);
    });

    // Assert: frame 4, the first complete one; the watch then stops listening.
    expect([ drawnAt, listeners() ])
      .toStrictEqual([ [ 4 ], 0 ]);
  });

  it('ends at the rebuilding frame itself when every picture is already loaded', () =>
  {
    // Arrange.
    const { renderer, draw } = standIn();
    const drawnAt: number[] = [];
    whenMapDrawn(renderer, at => drawnAt.push(at), () => 7);

    // Act.
    draw(4, 0);

    // Assert.
    expect(drawnAt)
      .toStrictEqual([ 7 ]);
  });

  it('stops waiting when asked, before the map is complete', () =>
  {
    // Arrange.
    const { renderer, draw, listeners } = standIn();
    const drawnAt: number[] = [];
    const stop = whenMapDrawn(renderer, at => drawnAt.push(at), () => 1);

    // Act.
    draw(4, 2);
    stop();
    draw(0, 0);

    // Assert.
    expect([ drawnAt, listeners() ])
      .toStrictEqual([ [], 0 ]);
  });
});
