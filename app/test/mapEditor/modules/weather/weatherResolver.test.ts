import { describe, expect, it } from 'vitest';
import { intensityFor, isSameWeather, resolveWeather } from '../../../../src/mapEditor/modules/weather/weatherResolver.ts';
import type { WeatherDeclaration } from '../../../../src/mapEditor/modules/weather/weatherTags.ts';

/*
 * A map's weather is decided as MapWeatherResolver#resolve decides it, in J-Weather's own order: an opt-out shows
 * nothing whatever the sky does; a look the map names shows wherever it was named; a map naming none under a roof shows
 * nothing; and one naming none under open sky shows whatever the sky is doing, which with nothing driving a sky, as with
 * J-Weather on its own and in the editor until the sky is driven, is nothing at all. A named look runs at the sky's
 * strength under open sky and at its middle rung under a roof or with no sky driven. Two resolutions are the same
 * weather when their look and strength are, nothing being the same as nothing.
 */
describe('weatherResolver', () =>
{
  const SKY = { preset: 'clear', intensity: 'heavy' };

  /**
   * Builds a declaration.
   * @param {Partial<WeatherDeclaration>} said What the note says beyond nothing.
   * @returns {WeatherDeclaration} The declaration.
   */
  const declared = (said: Partial<WeatherDeclaration>): WeatherDeclaration => ({ suppressed: false, preset: null, hasSky: true, ...said });

  describe('resolveWeather', () =>
  {
    it('shows nothing on a map that opts out, whatever it names and whatever the sky does', () =>
    {
      // Arrange: an outdoor map naming rain and opting out, under a sky that has its own.
      const declaration = declared({ suppressed: true, preset: 'rain' });

      // Act.
      const weather = resolveWeather(declaration, SKY);

      // Assert.
      expect(weather)
        .toBeNull();
    });

    it('shows the look a map names at its middle strength under a roof, and with no sky driven at all', () =>
    {
      // Arrange: a cave naming motes under a heavy sky, and an outdoor map naming rain with nothing driving a sky.
      const cave = declared({ preset: 'motes', hasSky: false });
      const field = declared({ preset: 'rain' });

      // Act.
      const weathers = [ resolveWeather(cave, SKY), resolveWeather(field, null) ];

      // Assert.
      expect(weathers)
        .toStrictEqual([ { preset: 'motes', intensity: 'moderate' }, { preset: 'rain', intensity: 'moderate' } ]);
    });

    it('runs a look a map names at the sky\'s strength under open sky', () =>
    {
      // Arrange: an outdoor map naming rain under a heavy clear sky.
      const declaration = declared({ preset: 'rain' });

      // Act.
      const weather = resolveWeather(declaration, SKY);

      // Assert: the map's own look, the sky's strength.
      expect(weather)
        .toStrictEqual({ preset: 'rain', intensity: 'heavy' });
    });

    it('shows the sky\'s weather on an outdoor map naming none, and nothing with no sky driven', () =>
    {
      // Arrange: an outdoor map naming nothing.
      const declaration = declared({});

      // Act.
      const weathers = [ resolveWeather(declaration, SKY), resolveWeather(declaration, null) ];

      // Assert.
      expect(weathers)
        .toStrictEqual([ SKY, null ]);
    });

    it('shows nothing on a map with a roof that names nothing, whatever the sky does', () =>
    {
      // Arrange: an interior naming nothing, under a sky that has weather.
      const declaration = declared({ hasSky: false });

      // Act.
      const weather = resolveWeather(declaration, SKY);

      // Assert.
      expect(weather)
        .toBeNull();
    });
  });

  describe('intensityFor', () =>
  {
    it('follows the sky only where the sky can be seen and something drives it', () =>
    {
      // Arrange: open sky with a sky, a roof with a sky, and open sky with none.
      const cases: [ WeatherDeclaration, typeof SKY | null ][] = [
        [ declared({ preset: 'rain' }), SKY ],
        [ declared({ preset: 'rain', hasSky: false }), SKY ],
        [ declared({ preset: 'rain' }), null ],
      ];

      // Act.
      const intensities = cases.map(([ declaration, sky ]) => intensityFor(declaration, sky));

      // Assert.
      expect(intensities)
        .toStrictEqual([ 'heavy', 'moderate', 'moderate' ]);
    });
  });

  describe('isSameWeather', () =>
  {
    it('compares by look and strength, nothing being the same only as nothing', () =>
    {
      // Arrange.
      const rain = { preset: 'rain', intensity: 'moderate' };
      const pairs: [ typeof rain | null, typeof rain | null ][] = [
        [ rain, { preset: 'rain', intensity: 'moderate' } ],
        [ rain, { preset: 'rain', intensity: 'heavy' } ],
        [ rain, { preset: 'snow', intensity: 'moderate' } ],
        [ null, null ],
        [ null, rain ],
        [ rain, null ],
      ];

      // Act.
      const same = pairs.map(([ left, right ]) => isSameWeather(left, right));

      // Assert.
      expect(same)
        .toStrictEqual([ true, false, false, true, false, false ]);
    });
  });
});
