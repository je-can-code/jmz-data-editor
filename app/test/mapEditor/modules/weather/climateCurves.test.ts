import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { SkyWeather } from '../../../../src/mapEditor/core/renderer/weatherLayer.ts';
import { climateFor, climateIntensity, climatesFrom, NO_CLIMATES } from '../../../../src/mapEditor/modules/weather/climateCurves.ts';
import type { WeatherDeclaration } from '../../../../src/mapEditor/modules/weather/weatherTags.ts';

/*
 * A place with a climate answers the sky rather than following it, as J-Weather-Time bends the sky's strength for a map
 * naming a look (ClimateCurves.apply). No Chef Adventure map names a climate yet, so these hold the plugin's rules on
 * their own: under a roof, or with no sky driven, the strength stands as J-Weather gave it; a map naming no climate, or
 * one the config does not know, follows the sky. A climate answers by the sky's condition first, since how clear the
 * sky is is no amount, then by the strength, then by its own default, and with nothing to say the sky's strength stands.
 * A table says nothing for a key it lacks or holds nothing under, and whatever it does say is read as the strength's
 * name, as J-Weather then looks it up among a look's strengths. Names are found as the config holds them, never among
 * what every object holds by birth, and the climates block is read only as a table.
 */
describe('climateCurves', () =>
{
  /**
   * The Forest of Dreams' climate as Chef Adventure's config writes it: foggiest when the sky is clearest.
   */
  const DREAMING = {
    byType: { clear: 'heavy', breezy: 'moderate', overcast: 'light', rain: 'light', monsoon: 'light', mist: 'heavy', snow: 'moderate', sakura: 'moderate' },
    default: 'moderate',
  };

  /**
   * A sky in a condition at a strength.
   * @param {string} type The condition.
   * @param {string} intensity The strength.
   * @returns {SkyWeather} The sky.
   */
  const skyOf = (type: string, intensity: string): SkyWeather => ({ preset: type, intensity, type });

  /**
   * A map naming fog under the sky, in a place answering it through a climate.
   * @param {Partial<WeatherDeclaration>} said What the note says beyond that.
   * @returns {WeatherDeclaration} The declaration.
   */
  const fogIn = (said: Partial<WeatherDeclaration>): WeatherDeclaration => ({ suppressed: false, preset: 'fog', hasSky: true, climate: 'dreaming', ...said });

  describe('climatesFrom and climateFor', () =>
  {
    it('reads the climates as a table, and none from a config holding no table of them', () =>
    {
      // Arrange: a table, none at all, a list and some text.
      const blocks: (JsonValue | undefined)[] = [ { dreaming: DREAMING }, undefined, [ DREAMING ], 'dreaming' ];

      // Act.
      const read = blocks.map(climatesFrom);

      // Assert.
      expect(read)
        .toStrictEqual([ { dreaming: DREAMING }, NO_CLIMATES, NO_CLIMATES, NO_CLIMATES ]);
    });

    it('finds a climate the config holds as a table, and none for no name, a name it lacks, a birthright, or one held as text', () =>
    {
      // Arrange.
      const climates = { dreaming: DREAMING, waking: 'clear skies' };
      const names = [ 'dreaming', null, 'Dreaming', 'constructor', 'waking' ];

      // Act.
      const found = names.map(name => climateFor(name, climates));

      // Assert.
      expect(found)
        .toStrictEqual([ DREAMING, null, null, null, null ]);
    });
  });

  describe('climateIntensity', () =>
  {
    it('answers the sky by its condition, so the forest is foggiest under a clear sky and lightest under rain', () =>
    {
      // Arrange: a light clear sky, and a heavy rain.
      const skies = [ skyOf('clear', 'light'), skyOf('rain', 'heavy') ];

      // Act.
      const strengths = skies.map(sky => climateIntensity(fogIn({}), sky, sky.intensity, { dreaming: DREAMING }));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 'heavy', 'light' ]);
    });

    it('lets the strength stand under a roof, with no sky driven, and in a place naming no climate or one the config lacks', () =>
    {
      // Arrange: under a roof at the sheltered strength, with no sky at it, naming none, and naming one unknown.
      const sky = skyOf('clear', 'light');
      const asks: [ WeatherDeclaration, SkyWeather | null, string ][] = [
        [ fogIn({ hasSky: false }), sky, 'moderate' ],
        [ fogIn({}), null, 'moderate' ],
        [ fogIn({ climate: null }), sky, 'light' ],
        [ fogIn({ climate: 'waking' }), sky, 'light' ],
      ];

      // Act.
      const strengths = asks.map(([ declaration, given, strength ]) => climateIntensity(declaration, given, strength, { dreaming: DREAMING }));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 'moderate', 'moderate', 'light', 'light' ]);
    });

    it('answers by the strength where its condition table says nothing, then by its default, then lets the sky\'s stand', () =>
    {
      // Arrange: a climate answering clear by condition and heavy skies by strength, with a default; the same without a
      // default; one saying nothing under clear; and one answering only by strength.
      const climates = {
        byBoth: { byType: { clear: 'heavy' }, byIntensity: { heavy: 'light' }, default: 'moderate' },
        bare: { byType: { clear: 'heavy' } },
        silent: { byType: { clear: null }, default: 'moderate' },
        graded: { byIntensity: { light: 'heavy', moderate: 'light' } },
      };
      const asks: [ string, SkyWeather ][] = [
        [ 'byBoth', skyOf('clear', 'light') ],
        [ 'byBoth', skyOf('rain', 'heavy') ],
        [ 'byBoth', skyOf('rain', 'light') ],
        [ 'bare', skyOf('rain', 'light') ],
        [ 'silent', skyOf('clear', 'light') ],
        [ 'graded', skyOf('snow', 'moderate') ],
        [ 'graded', skyOf('snow', 'heavy') ],
      ];

      // Act.
      const strengths = asks.map(([ climate, sky ]) => climateIntensity(fogIn({ climate }), sky, sky.intensity, climates));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 'heavy', 'light', 'moderate', 'light', 'moderate', 'light', 'heavy' ]);
    });

    it('reads whatever a table names as the strength\'s name, and a table held as anything but a table as saying nothing', () =>
    {
      // Arrange: a climate naming a strength by number, and one whose condition table is a list.
      const climates = { numbered: { byType: { clear: 2 } }, listed: { byType: [ 'heavy' ], default: 'light' } };

      // Act.
      const strengths = [ 'numbered', 'listed' ].map(climate => climateIntensity(fogIn({ climate }), skyOf('clear', 'moderate'), 'moderate', climates));

      // Assert.
      expect(strengths)
        .toStrictEqual([ '2', 'light' ]);
    });
  });
});
