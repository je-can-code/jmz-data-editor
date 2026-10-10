import { describe, expect, it } from 'vitest';
import { between, darknessOfHour, rateIntoPhase, toneOfHour, type Tone } from '../../../../src/mapEditor/modules/lighting/timeTone.ts';

/*
 * The sky at an hour is worked out exactly as J-Lighting-Time's TimeToneResolver works it out, so the editor's sky is the
 * game's to the last bit. Each phase begins on its own value and spends its four hours travelling toward the next
 * phase's: an hour sits a quarter further along for each hour into its phase, never quite reaching the next, which
 * opens on its own value. A tone moves channel by channel, each its own share of the gap, rounded to a whole number,
 * up or down toward the target, so the order of the two tones matters; the darkness, a single fraction, travels in a
 * straight line, unrounded. The sequence lists its first phase again at the end, so the day's last hours travel back
 * toward it with no wraparound. An hour off the clock casts no colour and takes no light away.
 */

/**
 * The tones of Chef Adventure's curve, in its sequence's order: Moontide, Dawn, Morning, Afternoon, Evening, Night, and
 * Moontide again.
 */
const TONES: readonly Tone[] = [
  [ -30, -18, 34, 170 ],
  [ 30, 6, -12, 40 ],
  [ 0, 0, 0, 0 ],
  [ 12, 8, -4, 0 ],
  [ 26, 0, -34, 22 ],
  [ -34, -14, 40, 95 ],
  [ -30, -18, 34, 170 ],
];

/**
 * The darkness of Chef Adventure's curve, in the same order.
 */
const DARKNESS: readonly number[] = [ 0.72, 0.3, 0, 0, 0.08, 0.55, 0.72 ];

describe('timeTone', () =>
{
  describe('rateIntoPhase', () =>
  {
    it('moves a quarter of the way along for each hour into the phase, starting again with the next', () =>
    {
      // Arrange: the first phase's four hours, the next phase's first, and the day's last.
      const hours = [ 0, 1, 2, 3, 4, 23 ];

      // Act.
      const rates = hours.map(rateIntoPhase);

      // Assert.
      expect(rates)
        .toStrictEqual([ 0, 0.25, 0.5, 0.75, 0, 0.75 ]);
    });
  });

  describe('between', () =>
  {
    it('moves each channel its share of the gap toward the target, up or down, rounded', () =>
    {
      // Arrange: Night halfway to Moontide: red up 2, green down 2, blue down 3, grey up 37.5, rounded to 38.

      // Act.
      const tone = between([ -34, -14, 40, 95 ], [ -30, -18, 34, 170 ], 0.5);

      // Assert.
      expect(tone)
        .toStrictEqual([ -32, -16, 37, 133 ]);
    });

    it('travels from the first tone toward the second, so swapping them lands elsewhere', () =>
    {
      // Arrange: a quarter of the way between Morning and Afternoon, each way round.

      // Act.
      const tones = [ between([ 0, 0, 0, 0 ], [ 12, 8, -4, 0 ], 0.25), between([ 12, 8, -4, 0 ], [ 0, 0, 0, 0 ], 0.25) ];

      // Assert.
      expect(tones)
        .toStrictEqual([ [ 3, 2, -1, 0 ], [ 9, 6, -3, 0 ] ]);
    });
  });

  describe('toneOfHour', () =>
  {
    it('sits on each phase\'s own tone at its first hour, both ends of the sequence included', () =>
    {
      // Arrange: midnight, Morning's first hour, and Night's.
      const hours = [ 0, 8, 20 ];

      // Act.
      const tones = hours.map(hour => toneOfHour(hour, TONES));

      // Assert.
      expect(tones)
        .toStrictEqual([ [ -30, -18, 34, 170 ], [ 0, 0, 0, 0 ], [ -34, -14, 40, 95 ] ]);
    });

    it('fades each hour further into the next phase, the day\'s last hours back toward Moontide', () =>
    {
      // Arrange: 14:00 halfway from Afternoon to Evening; 22:00 and 23:00 on the way from Night to Moontide.
      const hours = [ 14, 22, 23 ];

      // Act.
      const tones = hours.map(hour => toneOfHour(hour, TONES));

      // Assert.
      expect(tones)
        .toStrictEqual([ [ 19, 4, -19, 11 ], [ -32, -16, 37, 133 ], [ -31, -17, 35, 151 ] ]);
    });

    it('casts no colour at an hour off the clock', () =>
    {
      // Arrange: an hour past the day.

      // Act.
      const tone = toneOfHour(24, TONES);

      // Assert.
      expect(tone)
        .toStrictEqual([ 0, 0, 0, 0 ]);
    });
  });

  describe('darknessOfHour', () =>
  {
    it('sits on each phase\'s own darkness at its first hour, both ends of the sequence included', () =>
    {
      // Arrange: midnight, noon, and Night's first hour.
      const hours = [ 0, 12, 20 ];

      // Act.
      const darkness = hours.map(hour => darknessOfHour(hour, DARKNESS));

      // Assert.
      expect(darkness)
        .toStrictEqual([ 0.72, 0, 0.55 ]);
    });

    it('travels in a line toward the next phase\'s darkness, unrounded', () =>
    {
      // Arrange: 02:00 halfway from Moontide to Dawn, 14:00 halfway from Afternoon to Evening, and 22:00 and 23:00 on the
      // way from Night back to Moontide.
      const hours = [ 2, 14, 22, 23 ];

      // Act.
      const darkness = hours.map(hour => darknessOfHour(hour, DARKNESS));

      // Assert.
      expect(darkness)
        .toStrictEqual([ 0.51, 0.04, 0.635, 0.6775 ]);
    });

    it('takes no light away at an hour off the clock', () =>
    {
      // Arrange: an hour before the day.

      // Act.
      const darkness = darknessOfHour(-1, DARKNESS);

      // Assert.
      expect(darkness)
        .toBe(0);
    });
  });
});
