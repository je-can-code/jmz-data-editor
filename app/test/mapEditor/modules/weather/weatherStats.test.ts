import { describe, expect, it } from 'vitest';
import { WeatherField } from '../../../../src/mapEditor/modules/weather/weatherField.ts';
import type { WeatherLayer } from '../../../../src/mapEditor/modules/weather/weatherPresets.ts';
import { seededRoller } from '../../../../src/mapEditor/modules/weather/weatherRandom.ts';
import { layerStatsOf, spreadOf } from '../../../../src/mapEditor/modules/weather/weatherStats.ts';

/*
 * The parity check holds a layer's population against the game's own by its numbers, never pixel for pixel, since the
 * particles are random: how many there are and in which life, how many still wait, what share of them is on the screen,
 * and the spread of how fast, which way, how big, how turned and how long-lived the first-life ones are, and how
 * strongly every one draws, a waiting particle drawing at nothing. A spread is the least, the greatest, the mean and how
 * far a sample of them strays from it, its standard deviation, so the check can tell what chance alone makes of a few
 * particles; all four nothing for no one, and one alone straying nowhere.
 */
describe('weatherStats', () =>
{
  describe('spreadOf', () =>
  {
    it('sums up the least, the greatest, the mean and a sample\'s standard deviation, and nothing for no one', () =>
    {
      // Arrange: four numbers straying 1, 3, 2 and 0 from their mean of 2, so 14 over 3 squared.
      const values = [ 3, -1, 4, 2 ];

      // Act.
      const spreads = [ spreadOf(values), spreadOf([]) ];

      // Assert.
      expect(spreads)
        .toStrictEqual([ { min: -1, max: 4, mean: 2, sd: expect.closeTo(Math.sqrt(14 / 3), 12) }, { min: 0, max: 0, mean: 0, sd: 0 } ]);
    });

    it('says one number alone strays nowhere', () =>
    {
      // Arrange: one number.

      // Act.
      const spread = spreadOf([ 7 ]);

      // Assert.
      expect(spread)
        .toStrictEqual({ min: 7, max: 7, mean: 7, sd: 0 });
    });
  });

  describe('layerStatsOf', () =>
  {
    it('sums up a population by life, wait, place, speed, size, turn, lifetime and strength', () =>
    {
      // Arrange: four drops on the default window, placed by hand: one waiting above it, one on it, one landed as a
      // ripple on it, and one below it.
      const layer: WeatherLayer = {
        edge: 'top', speedX: 0, speedY: 4, jitterX: 0, jitterY: 3, roll: 0, growth: 0, fadeIn: 25, staggerFrames: 0, life: 30, lifeJitter: 132,
        fadeOut: 40, scale: 1, scaleJitter: 0, peakOpacity: 255, tint: 0xffffff, asset: 'Rain_01A', density: 4, blend: 'normal',
        becomes: { edge: 'anywhere', speedX: 0, speedY: 0, jitterX: 0, jitterY: 0, roll: 0, growth: 0.011, fadeIn: 60, staggerFrames: 0, life: 26,
          fadeOut: 12, scale: 0.09, scaleJitter: 0, peakOpacity: 87, tint: 0xffffff, asset: 'Particles', density: 4, blend: 'normal', becomes: null },
      };
      const field = new WeatherField(layer, { width: 816, height: 624 }, seededRoller(3), true);
      const placed = [
        { x: 100, y: -100, velocityX: 0, velocityY: 6, stagger: 5, stage: 0, opacity: 255, life: 50, scaleX: 1, scaleY: 1, rotation: 0 },
        { x: 100, y: 300, velocityX: 1, velocityY: 8, stagger: 0, stage: 0, opacity: 200, life: 90, scaleX: 2, scaleY: 3, rotation: 0.5 },
        { x: 200, y: 400, velocityX: 0, velocityY: 0, stagger: 0, stage: 1, opacity: 40, life: 26, scaleX: 0.09, scaleY: 0.09, rotation: 0 },
        { x: 300, y: 700, velocityX: -1, velocityY: 10, stagger: 0, stage: 0, opacity: 100, life: 70, scaleX: 1, scaleY: 1, rotation: 0 },
      ];
      placed.forEach((fields, index) => Object.assign(field.particles[index], fields, { flipPhase: 0, pulsePhase: 0 }));

      // Act.
      const stats = layerStatsOf(field);

      // Assert.
      expect(stats)
        .toStrictEqual({
          count: 4,
          firstLife: 3,
          secondLife: 1,
          waiting: 1,
          onScreen: 0.5,
          velocityX: { min: -1, max: 1, mean: 0, sd: 1 },
          velocityY: { min: 6, max: 10, mean: 8, sd: 2 },
          scaleX: { min: 1, max: 2, mean: 4 / 3, sd: expect.closeTo(Math.sqrt(1 / 3), 12) },
          scaleY: { min: 1, max: 3, mean: 5 / 3, sd: expect.closeTo(Math.sqrt(4 / 3), 12) },
          rotation: { min: 0, max: 0.5, mean: 0.5 / 3, sd: expect.closeTo(Math.sqrt(1 / 12), 12) },
          life: { min: 50, max: 90, mean: 70, sd: 20 },
          opacity: { min: 0, max: 200, mean: 85, sd: expect.closeTo(Math.sqrt(22700 / 3), 9) },
        });
    });
  });
});
