import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import {
  ambientColorFrom,
  effectTuningsFrom,
  lightDefaultsFrom,
  lightingConfigNotice,
  type LightingConfig,
} from '../../../../src/mapEditor/modules/lighting/lightingConfig.ts';

/*
 * A light whose tag names no colour or intensity takes the project's own, from data/config.lighting.json, as the server
 * reads it. J-Lighting cannot start without that file, and fails on its first light when the file's colour is no colour,
 * so in either case the editor falls back to white, the default the game ships; the intensity the file gives is kept
 * whatever its colour.
 *
 * That fallback is never quiet. A config that could not be read, or whose colour is no colour, comes with a notice that
 * names the file, says why in the server's words or its own, says lights draw in white until the file is fixed, and
 * says the notice clears as soon as it is, since the file is read again whenever it changes; a config that serves comes
 * with none.
 *
 * A map's dark falls back to the project's own colour of the dark, which J-Lighting fills in for a map writing a colour
 * it cannot use; a project without the file, or whose colour of the dark is no colour, falls back to ordinary black.
 *
 * Each effect runs as the project tunes it. The server reads the file strictly, so an effect the file leaves out arrives
 * with every number at zero, where the game, finding no entry, runs it with its steady tuning, taking nothing away; a
 * cycle of no frames could mean nothing else, so the editor runs such an effect steady too. A project without the file
 * runs every effect steady.
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
          detail: 'It could not be read: decoding /game/data/config.lighting.json: json: unknown field "tint". This clears as soon as the file is fixed.',
        });
    });

    it('says the file was not read when nothing says why', () =>
    {
      // Arrange: no config and no reason.

      // Act.
      const notice = lightingConfigNotice(null, undefined);

      // Assert.
      expect(notice?.detail)
        .toBe('It was not read. This clears as soon as the file is fixed.');
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
          detail: 'Its light colour is "white", and the game takes only a hex colour such as #ffbb73. This clears as soon as the file is fixed.',
        });
    });
  });

  describe('ambientColorFrom', () =>
  {
    it('takes the colour of the dark the project configures', () =>
    {
      // Arrange: a project whose dark is teal.
      const teal = { ...config('#ffffff') as object, ambient: { color: '#0a2a2a' } } as unknown as JsonValue;

      // Act.
      const color = ambientColorFrom(teal);

      // Assert.
      expect(color)
        .toBe('#0a2a2a');
    });

    it('falls back to ordinary black for a configured colour of the dark that is no colour', () =>
    {
      // Arrange: a colour by name.
      const named = { ...config('#ffffff') as object, ambient: { color: 'teal' } } as unknown as JsonValue;

      // Act.
      const color = ambientColorFrom(named);

      // Assert.
      expect(color)
        .toBe('#000000');
    });

    it('falls back to ordinary black for a project without the file', () =>
    {
      // Arrange: nothing was read.

      // Act.
      const color = ambientColorFrom(null);

      // Assert.
      expect(color)
        .toBe('#000000');
    });
  });

  describe('effectTuningsFrom', () =>
  {
    /**
     * The config the game ships, with its effects as given.
     * @param {object} effects The effects block.
     * @returns {JsonValue} The config, as the server serves it.
     */
    const tuned = (effects: object): JsonValue =>
    {
      return { light: { radius: 5, color: '#ffffff', intensity: 0, effects }, ambient: { color: '#000000' } } as unknown as JsonValue;
    };

    it('runs each effect as the project tunes it', () =>
    {
      // Arrange: Chef Adventure's shipped tunings.
      const shipped = {
        flicker: { depth: 0.2, period: 40, chance: 0, variance: 0.18 },
        pulse: { depth: 0.45, period: 165, chance: 0, variance: 0.22 },
        glitch: { depth: 0.85, period: 55, chance: 0.28, variance: 0.12 },
      };

      // Act.
      const tunings = effectTuningsFrom(tuned(shipped));

      // Assert.
      expect(tunings)
        .toStrictEqual(shipped);
    });

    it('runs steady an effect whose cycle takes no frames, as the server serves one the file leaves out', () =>
    {
      // Arrange: glitch left out of the file, so served all zeros, beside a flicker and a pulse tuned as shipped.
      const flicker = { depth: 0.2, period: 40, chance: 0, variance: 0.18 };
      const pulse = { depth: 0.45, period: 165, chance: 0, variance: 0.22 };
      const glitch = { depth: 0, period: 0, chance: 0, variance: 0 };

      // Act.
      const tunings = effectTuningsFrom(tuned({ flicker, pulse, glitch }));

      // Assert: the steady tuning in glitch's place, the others as given.
      expect(tunings)
        .toStrictEqual({ flicker, pulse, glitch: { depth: 0, period: 1, chance: 0, variance: 0 } });
    });

    it('runs every effect steady for a project without the file', () =>
    {
      // Arrange: nothing was read.

      // Act.
      const tunings = effectTuningsFrom(null);

      // Assert.
      expect(tunings)
        .toStrictEqual({
          flicker: { depth: 0, period: 1, chance: 0, variance: 0 },
          pulse: { depth: 0, period: 1, chance: 0, variance: 0 },
          glitch: { depth: 0, period: 1, chance: 0, variance: 0 },
        });
    });
  });
});
