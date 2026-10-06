import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { lightDefaultsFrom, type LightingConfig } from '../../../../src/mapEditor/modules/lighting/lightingConfig.ts';

/*
 * A light whose tag names no colour or intensity takes the project's own, from data/config.lighting.json, as the server
 * reads it. J-Lighting cannot start without that file, and fails on its first light when the file's colour is no colour,
 * so in either case the editor falls back to white, the default the game ships; the intensity the file gives is kept
 * whatever its colour.
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
});
