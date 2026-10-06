import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { lightDefaultsFrom, lightingConfigNotice, type LightingConfig } from '../../../../src/mapEditor/modules/lighting/lightingConfig.ts';

/*
 * A light whose tag names no colour or intensity takes the project's own, from data/config.lighting.json, as the server
 * reads it. J-Lighting cannot start without that file, and fails on its first light when the file's colour is no colour,
 * so in either case the editor falls back to white, the default the game ships; the intensity the file gives is kept
 * whatever its colour.
 *
 * That fallback is never quiet. A config that could not be read, or whose colour is no colour, comes with a notice that
 * names the file, says why in the server's words or its own, and says lights draw in white until the file is fixed; a
 * config that serves comes with none.
 */

/**
 * The config the game ships, with a colour of its own.
 * @param {string} color The default light colour.
 * @returns {JsonValue} The config, as the server serves it.
 */
const config = (color: string): JsonValue =>
{
  const tuning = { depth: 0.2, period: 40, chance: 0, variance: 0.18 };
  const shipped: LightingConfig = {
    light: { radius: 5, color, intensity: 0.3, effects: { flicker: tuning, pulse: tuning, glitch: tuning } },
    ambient: { color: '#000000' },
  };
  return shipped as unknown as JsonValue;
};

describe('lightingConfig', () =>
{
  describe('lightDefaultsFrom', () =>
  {
    it('takes the colour and the intensity the project configures', () =>
    {
      // Arrange.
      const shipped = config('#FFBB73');

      // Act.
      const defaults = lightDefaultsFrom(shipped);

      // Assert.
      expect(defaults)
        .toStrictEqual({ color: '#FFBB73', intensity: 0.3 });
    });

    it('falls back to white for a configured colour that is no colour, keeping the configured intensity', () =>
    {
      // Arrange: a colour by name, which J-Lighting cannot use.
      const named = config('white');

      // Act.
      const defaults = lightDefaultsFrom(named);

      // Assert.
      expect(defaults)
        .toStrictEqual({ color: '#ffffff', intensity: 0.3 });
    });

    it('falls back to white and a soft pool for a project without the file', () =>
    {
      // Arrange: nothing was read.

      // Act.
      const defaults = lightDefaultsFrom(null);

      // Assert.
      expect(defaults)
        .toStrictEqual({ color: '#ffffff', intensity: 0 });
    });
  });

  describe('lightingConfigNotice', () =>
  {
    it('says nothing of a config that serves', () =>
    {
      // Arrange.
      const shipped = config('#FFBB73');

      // Act.
      const notice = lightingConfigNotice(shipped, undefined);

      // Assert.
      expect(notice)
        .toBeNull();
    });

    it('says lights draw in white until the file is fixed, naming why it could not be read in the server\'s words', () =>
    {
      // Arrange: the strict read refused a field it has not learned.
      const problem = 'decoding /game/data/config.lighting.json: json: unknown field "tint"';

      // Act.
      const notice = lightingConfigNotice(null, problem);

      // Assert.
      expect(notice)
        .toStrictEqual({
          id: 'lighting.config',
          title: 'Lights without a colour of their own draw in white until data/config.lighting.json is fixed.',
          detail: 'It could not be read: decoding /game/data/config.lighting.json: json: unknown field "tint". Reopen the map editor once it is fixed.',
        });
    });

    it('says the file was not read when nothing says why', () =>
    {
      // Arrange: no config and no reason.

      // Act.
      const notice = lightingConfigNotice(null, undefined);

      // Assert.
      expect(notice?.detail)
        .toBe('It was not read. Reopen the map editor once it is fixed.');
    });

    it('says a configured colour that is no colour is why lights draw in white', () =>
    {
      // Arrange: a colour by name.
      const named = config('white');

      // Act.
      const notice = lightingConfigNotice(named, undefined);

      // Assert.
      expect(notice)
        .toStrictEqual({
          id: 'lighting.config',
          title: 'Lights without a colour of their own draw in white until data/config.lighting.json is fixed.',
          detail: 'Its light colour is "white", and the game takes only a hex colour such as #ffbb73. Reopen the map editor once it is fixed.',
        });
    });
  });
});
