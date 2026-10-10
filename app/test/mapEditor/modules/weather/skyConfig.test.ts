import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { isDataKey, skyConditionNames, skyConfigFrom } from '../../../../src/mapEditor/modules/weather/skyConfig.ts';
import { CHEF_WEATHER_CONFIG } from '../../support/skyFixtures.ts';

/*
 * J-Weather-Time keeps its sky in J-Weather's config.weather.json, beside the looks it names, and the editor reads it out
 * of the config as served, only as the shape the data editor's Weather board writes: every condition with its own look,
 * the strengths it lists, at least one when it lists any, and its faces, each with a look and, if it says them, the
 * seasons by name and the phases by number it applies in; every season with what it allows and a graph of weights; the
 * months' leans, if any, as weights; and the condition a season's last day settles toward. The file's authoring notes,
 * any key beginning _comment, may sit among the conditions, the seasons, a graph's rows and the months, and are
 * neither. Anything else, a config without a sky included, is no sky the editor shows weather from, rather than a sky
 * it would walk wrongly.
 */
describe('skyConfig', () =>
{
  /**
   * Chef Adventure's config with its sky block changed.
   * @param {(sky: Record<string, unknown>) => void} change What to change in a copy of the sky.
   * @returns {JsonValue} The config.
   */
  const withSky = (change: (sky: Record<string, unknown>) => void): JsonValue =>
  {
    const config = JSON.parse(JSON.stringify(CHEF_WEATHER_CONFIG)) as Record<string, Record<string, unknown>>;
    change(config['sky']);
    return config as unknown as JsonValue;
  };

  /**
   * One condition of a sky, to change.
   * @param {Record<string, unknown>} sky The sky.
   * @param {string} name The condition.
   * @returns {Record<string, unknown>} Its block.
   */
  const typeIn = (sky: Record<string, unknown>, name: string): Record<string, unknown> => (sky['types'] as Record<string, Record<string, unknown>>)[name];

  /**
   * One season of a sky, to change.
   * @param {Record<string, unknown>} sky The sky.
   * @param {string} name The season.
   * @returns {Record<string, unknown>} Its block.
   */
  const seasonIn = (sky: Record<string, unknown>, name: string): Record<string, unknown> => (sky['seasons'] as Record<string, Record<string, unknown>>)[name];

  describe('skyConfigFrom', () =>
  {
    it('reads Chef Adventure\'s sky, its authoring notes and all', () =>
    {
      // Arrange: the game's config, its notes among the conditions and the seasons; and the same with notes among a
      // graph's rows, in a row, and among the months.
      const noted = withSky(sky =>
      {
        (sky['types'] as Record<string, unknown>)['_comment_order'] = 'Clear first.';
        (seasonIn(sky, 'spring')['transitions'] as Record<string, unknown>)['_comment'] = [ 'Rows are where the sky is.' ];
        ((seasonIn(sky, 'spring')['transitions'] as Record<string, Record<string, unknown>>)['clear'])['_comment'] = 'Mostly stays.';
        (sky['months'] as Record<string, unknown>)['_comment'] = 'One lean a month.';
      });

      // Act.
      const skies = [ skyConfigFrom(CHEF_WEATHER_CONFIG), skyConfigFrom(noted) ];

      // Assert.
      expect(skies.map(sky => (sky === null ? null : [ sky.settleTo, skyConditionNames(sky).length ])))
        .toStrictEqual([ [ 'clear', 8 ], [ 'clear', 8 ] ]);
    });

    it('reads no sky from a config that could not be read, is no table, or holds no sky table', () =>
    {
      // Arrange.
      const configs: (JsonValue | null)[] = [
        null,
        [ 1, 2 ],
        { motions: {}, presets: {} },
        { motions: {}, presets: {}, sky: 'clear' },
        { motions: {}, presets: {}, sky: [] },
      ];

      // Act.
      const skies = configs.map(skyConfigFrom);

      // Assert.
      expect(skies)
        .toStrictEqual([ null, null, null, null, null ]);
    });

    it('reads no sky from conditions not as the Weather board writes them', () =>
    {
      // Arrange: no conditions; a condition with no look of its own; one listing no strengths; one listing a strength
      // by number; one whose faces are no list; a face with no look; a face whose seasons are no list; and a face naming
      // a phase by text.
      const configs = [
        withSky(sky =>
        {
          delete sky['types'];
        }),
        withSky(sky =>
        {
          delete typeIn(sky, 'rain')['preset'];
        }),
        withSky(sky =>
        {
          typeIn(sky, 'rain')['intensities'] = [];
        }),
        withSky(sky =>
        {
          typeIn(sky, 'rain')['intensities'] = [ 'light', 2 ];
        }),
        withSky(sky =>
        {
          typeIn(sky, 'breezy')['faces'] = { seasons: [ 'autumn' ], preset: 'maple' };
        }),
        withSky(sky =>
        {
          typeIn(sky, 'breezy')['faces'] = [ { seasons: [ 'autumn' ] } ];
        }),
        withSky(sky =>
        {
          typeIn(sky, 'breezy')['faces'] = [ { seasons: 'autumn', preset: 'maple' } ];
        }),
        withSky(sky =>
        {
          typeIn(sky, 'clear')['faces'] = [ { phases: [ '0' ], preset: 'starfall' } ];
        }),
      ];

      // Act.
      const skies = configs.map(skyConfigFrom);

      // Assert.
      expect(skies)
        .toStrictEqual(configs.map(() => null));
    });

    it('reads no sky from seasons, months or a settling condition not as the Weather board writes them', () =>
    {
      // Arrange: no seasons; a season allowing nothing listed; one without a graph; a graph's weight written as text; a
      // month's lean written as text; and no settling condition.
      const configs = [
        withSky(sky =>
        {
          delete sky['seasons'];
        }),
        withSky(sky =>
        {
          delete seasonIn(sky, 'summer')['allowed'];
        }),
        withSky(sky =>
        {
          delete seasonIn(sky, 'summer')['transitions'];
        }),
        withSky(sky =>
        {
          ((seasonIn(sky, 'summer')['transitions'] as Record<string, Record<string, unknown>>)['clear'])['breezy'] = '30';
        }),
        withSky(sky =>
        {
          (sky['months'] as Record<string, Record<string, unknown>>)['5']['sakura'] = '0';
        }),
        withSky(sky =>
        {
          delete sky['settleTo'];
        }),
      ];

      // Act.
      const skies = configs.map(skyConfigFrom);

      // Assert.
      expect(skies)
        .toStrictEqual(configs.map(() => null));
    });

    it('reads a sky naming no months, its conditions\' strengths and faces left out, as a sky leaning nowhere', () =>
    {
      // Arrange: no months block, and rain listing neither strengths nor faces.
      const config = withSky(sky =>
      {
        delete sky['months'];
        delete typeIn(sky, 'rain')['intensities'];
      });

      // Act.
      const sky = skyConfigFrom(config);

      // Assert.
      expect([ sky?.months, sky?.types['rain'] ])
        .toStrictEqual([ undefined, { preset: 'rain' } ]);
    });
  });

  describe('skyConditionNames and isDataKey', () =>
  {
    it('lists the conditions in the order the config writes them, passing over its notes', () =>
    {
      // Arrange: the game's sky with a note among its conditions.
      const sky = skyConfigFrom(withSky(each =>
      {
        (each['types'] as Record<string, unknown>)['_comment'] = 'Eight conditions.';
      }));

      // Act.
      const names = sky === null ? [] : skyConditionNames(sky);

      // Assert.
      expect([ names, isDataKey('_comment_faces'), isDataKey('comment') ])
        .toStrictEqual([ [ 'clear', 'overcast', 'breezy', 'rain', 'mist', 'sakura', 'monsoon', 'snow' ], false, true ]);
    });
  });
});
