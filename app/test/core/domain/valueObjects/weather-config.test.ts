import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  hydrateWeatherConfig,
  serializeWeatherConfig,
  type WeatherConfigRoot,
} from '../../../../src/core/domain/valueObjects/weather-config.ts';

/** Chef Adventure sits beside this repo in the workspace; see the Go unmarshal test for the same path. */
const CHEF_ADVENTURE_CONFIG = '../../ca/chef-adventure/data/config.weather.json';

/**
 * The weather configuration owes its callers one thing above all others: **a save must never lose
 * anything the editor did not model.**
 *
 * That file is not a tidy data structure. It interleaves `_comment_*` blocks that are the only
 * documentation an author reading it by hand has, presets carry their own per-stop notes, and the
 * motions hold a couple of hundred numbers tuned by eye against a running game which this editor
 * deliberately offers no controls for. A serializer that rebuilt the root from a typed model would
 * delete every one of them on the first save, and nothing would report it — the game would simply
 * stop having weather at the next boot.
 *
 * So the contract is: hydrate carries the original through, serialize lays edits on top of it, and
 * anything unmodelled comes back out byte for byte. The first case below is the one that matters;
 * the rest prove the edits actually land.
 */
describe('weather-config', () =>
{
  /**
   * A configuration shaped like the real one, including the parts the editor does not model.
   */
  const buildFile = (): Record<string, unknown> => ({
    motions: {
      fall: { edge: 'top', speedX: 0, speedY: 4, jitterY: 3 },
      _comment_motions: [ 'a note the author left themselves' ],
    },
    presets: {
      rain: { description: 'wet', stops: { light: [ { motion: 'fall', asset: 'Rain_01A' } ] } },
      snow: { description: 'cold', iconIndex: 64, stops: { light: [] } },
    },
    _comment_ids: [ 'never renumber an existing preset' ],
    presetIds: { rain: 1, snow: 2 },
    intensityIds: { light: 1, moderate: 2, heavy: 3 },
    variables: { enabled: true, weatherType: 131, weatherIntensity: 132 },
    _comment_sky: [ 'a season says what is possible' ],
    sky: {
      types: {
        clear: {
          preset: 'clear',
          intensities: [ 'light', 'moderate' ],
          _comment: 'order matters',
          faces: [ { phases: [ 0, 5 ], preset: 'starfall' } ],
        },
      },
      seasons: {
        spring: { _comment: 'mild', allowed: [ 'clear' ], transitions: { clear: { clear: 100 } } },
      },
      _comment_months: [ 'a month says what is likely' ],
      months: { 4: { sakura: 4 } },
      intensityDrift: { hold: 50, up: 25, down: 25 },
      settleTo: 'clear',
      forecastPhases: 2160,
      visibleDays: 3,
      _comment_voices: [ 'who is an actor id' ],
      voices: { rain: { any: [ { who: 1, says: 'wet one' } ] } },
      _comment_places: [ 'a place is a name and a map id' ],
      places: [ { name: 'Raevula', mapId: 19 } ],
    },
    _comment_climates: [ 'byType or byIntensity, not both' ],
    climates: { dreaming: { _comment: 'the forest', byType: { clear: 'heavy' }, default: 'moderate' } },
  });

  describe('hydrateWeatherConfig', () =>
  {
    it('reads the icon a look was given', () =>
    {
      // Arrange.
      const file = buildFile();

      // Act.
      const root = hydrateWeatherConfig(file);

      // Assert - snow rather than rain, so a reader that took the first entry would be visible.
      expect(root.presetIcons[ 'snow' ])
        .toBe(64);
    });

    it('reports no icon for a look that has none yet', () =>
    {
      // Arrange - all fifteen looks are in this state today, so it is the normal case.
      const root = hydrateWeatherConfig(buildFile());

      // Assert.
      expect(root.presetIcons[ 'rain' ])
        .toBe(0);
    });

    it('reads the lines written about the weather', () =>
    {
      // Arrange.
      const root = hydrateWeatherConfig(buildFile());

      // Assert.
      expect(root.sky.voices[ 'rain' ][ 'any' ])
        .toEqual([ { who: 1, says: 'wet one' } ]);
    });

    it('reads a month lean', () =>
    {
      // Arrange.
      const root = hydrateWeatherConfig(buildFile());

      // Assert.
      expect(root.sky.months[ '4' ])
        .toEqual({ sakura: 4 });
    });

    it('reads a climate table and its fallback', () =>
    {
      // Arrange - `default` is a reserved word in the file and a plain field here.
      const root = hydrateWeatherConfig(buildFile());

      // Assert.
      expect(root.climates[ 'dreaming' ].byType)
        .toEqual({ clear: 'heavy' });
      expect(root.climates[ 'dreaming' ].fallback)
        .toBe('moderate');
    });

    it('ignores the authoring notes rather than treating them as entries', () =>
    {
      // Arrange - `_comment_months` sits beside `months` inside the sky, and a reader that took
      // every key would offer the author a month called "_comment_months" to edit.
      const root = hydrateWeatherConfig(buildFile());

      // Assert.
      expect(Object.keys(root.sky.months))
        .toEqual([ '4' ]);
      expect(Object.keys(root.climates))
        .toEqual([ 'dreaming' ]);
    });

    it('survives a file that is not an object at all', () =>
    {
      // Arrange - a corrupt or empty read should produce an empty editor, not a crash.
      const root = hydrateWeatherConfig(null);

      // Assert.
      expect(root.sky.settleTo)
        .toBe('clear');
      expect(Object.keys(root.presetIcons))
        .toEqual([]);
    });
  });

  describe('serializeWeatherConfig', () =>
  {
    it('returns a file identical to the one it read when nothing was edited', () =>
    {
      // Arrange - the contract this whole module exists for. Every authoring note, every motion,
      // every layer stack and every per-preset comment has to come back untouched.
      const file = buildFile();

      // Act.
      const written = serializeWeatherConfig(hydrateWeatherConfig(file));

      // Assert.
      expect(written)
        .toEqual(file);
    });

    it('keeps the keys in the order the file carried them', () =>
    {
      // Arrange - the authoring notes read as headings for the blocks beneath them, so reordering
      // separates each note from what it describes.
      const file = buildFile();

      // Act.
      const written = serializeWeatherConfig(hydrateWeatherConfig(file));

      // Assert.
      expect(Object.keys(written))
        .toEqual(Object.keys(file));
      expect(Object.keys(written[ 'sky' ] as object))
        .toEqual(Object.keys(file[ 'sky' ] as object));
    });

    it('writes an icon that was set', () =>
    {
      // Arrange.
      const root = hydrateWeatherConfig(buildFile());
      root.presetIcons[ 'rain' ] = 72;

      // Act.
      const written = serializeWeatherConfig(root) as { presets: Record<string, Record<string, unknown>>; };

      // Assert - and the stops beside it survive, which is what makes this an edit rather than a
      // replacement.
      expect(written.presets[ 'rain' ][ 'iconIndex' ])
        .toBe(72);
      expect(written.presets[ 'rain' ][ 'stops' ])
        .toEqual({ light: [ { motion: 'fall', asset: 'Rain_01A' } ] });
    });

    it('leaves the icon field off a look that has none rather than writing a zero', () =>
    {
      // Arrange - an author opening the file should see nothing, not a zero to wonder about.
      const root = hydrateWeatherConfig(buildFile());
      root.presetIcons[ 'snow' ] = 0;

      // Act.
      const written = serializeWeatherConfig(root) as { presets: Record<string, Record<string, unknown>>; };

      // Assert.
      expect('iconIndex' in written.presets[ 'snow' ])
        .toBe(false);
    });

    it('writes added voice lines', () =>
    {
      // Arrange.
      const root = hydrateWeatherConfig(buildFile());
      root.sky.voices[ 'rain' ][ 'heavy' ] = [ { who: 2, says: 'this is absurd' } ];

      // Act.
      const written = serializeWeatherConfig(root) as { sky: Record<string, unknown>; };

      // Assert - beside the lines that were already there, not instead of them.
      expect(written.sky[ 'voices' ])
        .toEqual({
          rain: {
            any: [ { who: 1, says: 'wet one' } ],
            heavy: [ { who: 2, says: 'this is absurd' } ],
          },
        });
    });

    it('drops a strength whose every line was deleted', () =>
    {
      // Arrange - an empty array would read as "written, and says nothing", which the plugin
      // treats differently from unwritten.
      const root = hydrateWeatherConfig(buildFile());
      root.sky.voices[ 'rain' ][ 'any' ] = [];

      // Act.
      const written = serializeWeatherConfig(root) as { sky: Record<string, unknown>; };

      // Assert.
      expect(written.sky[ 'voices' ])
        .toEqual({});
    });

    it('keeps a per-condition note while rewriting the condition around it', () =>
    {
      // Arrange - the sky's `clear` carries its own `_comment` explaining why face order matters.
      const root = hydrateWeatherConfig(buildFile());
      root.sky.types[ 'clear' ].intensities = [ 'light', 'moderate', 'heavy' ];

      // Act.
      const written = serializeWeatherConfig(root) as { sky: Record<string, Record<string, Record<string, unknown>>>; };

      // Assert.
      expect(written.sky[ 'types' ][ 'clear' ][ '_comment' ])
        .toBe('order matters');
      expect(written.sky[ 'types' ][ 'clear' ][ 'intensities' ])
        .toEqual([ 'light', 'moderate', 'heavy' ]);
    });

    it('writes a face with no seasons as a rule that matches every season', () =>
    {
      // Arrange - an omitted key is a wildcard; writing an empty array instead would author a
      // rule that can never match anything.
      const root: WeatherConfigRoot = hydrateWeatherConfig(buildFile());

      // Act.
      const written = serializeWeatherConfig(root) as { sky: Record<string, Record<string, Record<string, unknown>>>; };
      const [ face ] = written.sky[ 'types' ][ 'clear' ][ 'faces' ] as Record<string, unknown>[];

      // Assert.
      expect('seasons' in face)
        .toBe(false);
      expect(face[ 'phases' ])
        .toEqual([ 0, 5 ]);
    });

    it('round-trips the real Chef Adventure config byte for byte', () =>
    {
      // Arrange - the synthetic fixture above is the same shape, but only the real file has all
      // seventeen motions, fifteen presets with their per-stop notes, and every authoring comment
      // in the positions an author actually put them. Optional, like the Go unmarshal test beside
      // it: the check is worth having when the sibling repo is there and worth skipping when not.
      if (existsSync(CHEF_ADVENTURE_CONFIG) === false) return;

      const file = JSON.parse(readFileSync(CHEF_ADVENTURE_CONFIG, 'utf8'));

      // Act.
      const written = serializeWeatherConfig(hydrateWeatherConfig(file));

      // Assert - stringified rather than deep-equal, because key order is the half that a
      // deep comparison cannot see and the half an author notices in a diff.
      expect(JSON.stringify(written))
        .toBe(JSON.stringify(file));
    });

    it('writes only the climate table that was authored', () =>
    {
      // Arrange - a climate carrying both tables is reported as ambiguous by the plugin's own
      // configuration validation, so an empty one must not be written.
      const root = hydrateWeatherConfig(buildFile());

      // Act.
      const written = serializeWeatherConfig(root) as { climates: Record<string, Record<string, unknown>>; };

      // Assert.
      expect('byIntensity' in written.climates[ 'dreaming' ])
        .toBe(false);
      expect(written.climates[ 'dreaming' ][ 'byType' ])
        .toEqual({ clear: 'heavy' });
    });
  });
});
