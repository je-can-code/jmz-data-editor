import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { weatherConfigFrom } from '../../../../src/mapEditor/modules/weather/weatherConfig.ts';

/*
 * J-Weather's config can be drawn from only when it holds a table of motions and a table of looks, as J-Weather could
 * start from nothing less; such a config is taken as it is, and anything else, an unread config included, is refused.
 * The editor asks this before it loads the code that draws, to say over the map views whether the config serves.
 */
describe('weatherConfig', () =>
{
  describe('weatherConfigFrom', () =>
  {
    it('takes a config holding a table of motions and a table of looks as it is', () =>
    {
      // Arrange.
      const served = { motions: { fall: { edge: 'top' } }, presets: { snow: { stops: { moderate: [] } } } } as JsonValue;

      // Act.
      const read = weatherConfigFrom(served);

      // Assert.
      expect(read)
        .toBe(served);
    });

    it('refuses no config, a config that is no table, and one missing its motions or its looks', () =>
    {
      // Arrange.
      const served: (JsonValue | null)[] = [ null, [ 1 ], 'rain', { motions: {} }, { presets: {} }, { motions: [], presets: {} } ];

      // Act.
      const read = served.map(weatherConfigFrom);

      // Assert.
      expect(read)
        .toStrictEqual([ null, null, null, null, null, null ]);
    });
  });
});
