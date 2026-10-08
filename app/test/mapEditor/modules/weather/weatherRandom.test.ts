import { describe, expect, it } from 'vitest';
import { rollsFrom, seededRoller, weatherSeed } from '../../../../src/mapEditor/modules/weather/weatherRandom.ts';

/*
 * The game rolls its weather with Math.random, so no two showers are alike; the editor rolls from a seed, so a map shows
 * the same shower every time it opens and a test can hold a population to exact numbers. A seed gives the same stream
 * of rolls every time, each from 0 up to 1 as Math.random's are, and another seed another stream. A layer's seed comes
 * from its map, its look, its strength and which of the look's layers it is, so two layers of one look, or one look on
 * two maps, never fall in step. A particle's rolls are drawn one per choice, in J-Weather's own order.
 */
describe('weatherRandom', () =>
{
  describe('seededRoller', () =>
  {
    it('gives the same rolls from the same seed, each from 0 up to 1, and others from another seed', () =>
    {
      // Arrange.
      const first = seededRoller(12345);
      const again = seededRoller(12345);
      const other = seededRoller(12346);

      // Act.
      const rolls = [ [ first(), first(), first() ], [ again(), again(), again() ], [ other(), other(), other() ] ];

      // Assert.
      expect([ rolls[0], rolls[1], rolls[2][0] === rolls[0][0] ])
        .toStrictEqual([ [ 0.9797282677609473, 0.3067522644996643, 0.484205421525985 ], [ 0.9797282677609473, 0.3067522644996643, 0.484205421525985 ], false ]);
    });

    it('keeps every roll of a long stream from 0 up to 1', () =>
    {
      // Arrange.
      const roll = seededRoller(7);

      // Act.
      const rolls = Array.from({ length: 10_000 }, () => roll());

      // Assert.
      expect([ Math.min(...rolls) >= 0, Math.max(...rolls) < 1 ])
        .toStrictEqual([ true, true ]);
    });
  });

  describe('weatherSeed', () =>
  {
    it('seeds each layer of each look on each map apart', () =>
    {
      // Arrange: the first and second layers of moderate rain on Map220, and the first on Map221.

      // Act.
      const seeds = [ weatherSeed(220, 'rain', 'moderate', 0), weatherSeed(220, 'rain', 'moderate', 1), weatherSeed(221, 'rain', 'moderate', 0) ];

      // Assert.
      expect(seeds)
        .toStrictEqual([ 4144890462, 3758969531, 1223075937 ]);
    });
  });

  describe('rollsFrom', () =>
  {
    it('draws one roll per choice, in J-Weather\'s own order', () =>
    {
      // Arrange: a stream, and the same stream drawn by hand.
      const roll = seededRoller(1);
      const byHand = seededRoller(1);

      // Act.
      const rolls = rollsFrom(roll);
      const expected = Array.from({ length: 14 }, () => byHand());

      // Assert.
      expect([ Object.keys(rolls), Object.values(rolls) ])
        .toStrictEqual([
          [ 'along', 'across', 'speedX', 'speedY', 'scale', 'stagger', 'life', 'edge', 'phase', 'flip', 'pulse', 'tilt', 'stretchX', 'stretchY' ],
          expected,
        ]);
    });
  });
});
