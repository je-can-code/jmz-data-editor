import { describe, expect, it } from 'vitest';
import {
  motionDefaultsFrom,
  motionLinesOf,
  readMotionLine,
  writtenMotionLine,
} from '../../../../src/mapEditor/modules/jabs/motionTags.ts';
import { command, page } from '../../support/eventKindFixtures.ts';

/*
 * The battler panel shows a battler's motions as J-Motion reads a page: every comment line holding a motion tag, its
 * motion first and then its settings by place, a token asking it to move in step riding anywhere among them. A motion
 * J-Motion ships, with no more settings than it takes, can be changed; any other is shown as written, since an extension
 * may add motions of its own. A setting left out is the project's config.motion.json default, else J-Motion's own; and a
 * line written back must read as the very motion meant, or it is refused rather than written.
 */
describe('motionTags', () =>
{
  describe('readMotionLine', () =>
  {
    it('reads the motion, its settings by place and the step token wherever it rides, and nothing from another tag', () =>
    {
      // Arrange.
      const lines = [ '<motion:[breathe, 0.08, sync, 90]>', '<MOTION: [swing,15]>', '<light:[3]>' ];

      // Act.
      const read = lines.map((text, index) => readMotionLine(index, text));

      // Assert.
      expect(read)
        .toStrictEqual([
          { listIndex: 0, text: '<motion:[breathe, 0.08, sync, 90]>', type: 'breathe', values: [ '0.08', '90' ], sync: true, known: true },
          { listIndex: 1, text: '<MOTION: [swing,15]>', type: 'swing', values: [ '15' ], sync: false, known: true },
          null,
        ]);
    });

    it('knows a motion J-Motion ships only by its exact name and with no more settings than it takes', () =>
    {
      // Arrange: a motion in capitals, one with a setting too many, and an extension's.
      const lines = [ '<motion:[Breathe]>', '<motion:[float, 12, 180, 3]>', '<motion:[collapse, swift]>' ];

      // Act.
      const known = lines.map(text => readMotionLine(0, text)?.known);

      // Assert.
      expect(known)
        .toStrictEqual([ false, false, false ]);
    });
  });

  describe('motionLinesOf', () =>
  {
    it('finds every motion on a page in the order written, from the lines J-Base offers alone', () =>
    {
      // Arrange: a motion carried on a comment, one quoted in a Show Text, and one with words after it.
      const motions = page([
        command(108, [ '<motion:[float]>' ]),
        command(408, [ '<motion:[ghost]>' ]),
        command(401, [ '<motion:[spin]>' ]),
        command(108, [ '<motion:[hop]> high' ]),
      ]);

      // Act.
      const lines = motionLinesOf(motions).map(line => [ line.listIndex, line.type ]);

      // Assert.
      expect(lines)
        .toStrictEqual([ [ 0, 'float' ], [ 1, 'ghost' ] ]);
    });
  });

  describe('motionDefaultsFrom', () =>
  {
    it('fills a setting from the project\'s config first, then J-Motion\'s own, and nothing for a setting the motion lacks', () =>
    {
      // Arrange: a config retuning breathing's depth alone.
      const defaults = motionDefaultsFrom({ breathe: { amount: 0.08 } });
      const none = motionDefaultsFrom(null);

      // Act.
      const read = [ defaults('breathe', 'amount'), defaults('breathe', 'period'), defaults('breathe', 'angle'), none('breathe', 'amount'), defaults('wobble', 'amount') ];

      // Assert.
      expect(read)
        .toStrictEqual([ 0.08, 150, undefined, 0.05, undefined ]);
    });
  });

  describe('writtenMotionLine', () =>
  {
    const defaults = motionDefaultsFrom({ swing: { angle: 10 } });

    it('writes a new line as the game\'s examples write one, with only the settings given', () =>
    {
      // Arrange: nothing beyond the project's swing.

      // Act.
      const lines = [
        writtenMotionLine(null, { type: 'float', values: [], sync: false }, defaults),
        writtenMotionLine(null, { type: 'swing', values: [ '15', '200' ], sync: true }, defaults),
      ];

      // Assert.
      expect(lines)
        .toStrictEqual([ '<motion:[float]>', '<motion:[swing, 15, 200, sync]>' ]);
    });

    it('writes a setting left out ahead of one given as the project\'s default, and drops those left out at the end', () =>
    {
      // Arrange: the period given, the angle and nothing after it left out.

      // Act.
      const line = writtenMotionLine('<motion:[swing,15]>', { type: 'swing', values: [ null, '90' ], sync: false }, defaults);

      // Assert: the line's own separator kept.
      expect(line)
        .toBe('<motion:[swing,10,90]>');
    });

    it('keeps what comes before and after the list exactly as the line writes it', () =>
    {
      // Arrange.

      // Act.
      const line = writtenMotionLine('<MOTION: [float]>', { type: 'ghost', values: [ '0.5' ], sync: false }, defaults);

      // Assert.
      expect(line)
        .toBe('<MOTION: [ghost, 0.5]>');
    });

    it('refuses a motion the game does not know, and a setting it cannot write for its kind', () =>
    {
      // Arrange: a motion nobody ships, a number with a letter, a colour without its hash, and an axis the game lacks.
      const asks = [
        { type: 'wobble', values: [], sync: false },
        { type: 'float', values: [ '12px' ], sync: false },
        { type: 'tint', values: [ 'ffa0a0' ], sync: false },
        { type: 'shake', values: [ '4', 'z' ], sync: false },
      ];

      // Act.
      const refusals = asks.map(ask =>
      {
        try
        {
          return writtenMotionLine(null, ask, defaults);
        }
        catch (error)
        {
          return (error as Error).message;
        }
      });

      // Assert.
      expect(refusals)
        .toStrictEqual([
          'wobble is not a motion the game knows',
          'a float\'s distance cannot be 12px',
          'a tint\'s colour cannot be ffa0a0',
          'a shake\'s axis cannot be z',
        ]);
    });

    it('writes a colour, a direction and an axis the game takes, beside negative numbers', () =>
    {
      // Arrange.

      // Act.
      const lines = [
        writtenMotionLine(null, { type: 'tint', values: [ '#FFA0A0' ], sync: false }, defaults),
        writtenMotionLine(null, { type: 'spin', values: [ '60', 'ccw' ], sync: false }, defaults),
        writtenMotionLine(null, { type: 'shake', values: [ '4', 'both' ], sync: false }, defaults),
        writtenMotionLine(null, { type: 'angle', values: [ '-45' ], sync: false }, defaults),
      ];

      // Assert.
      expect(lines)
        .toStrictEqual([ '<motion:[tint, #FFA0A0]>', '<motion:[spin, 60, ccw]>', '<motion:[shake, 4, both]>', '<motion:[angle, -45]>' ]);
    });
  });
});
