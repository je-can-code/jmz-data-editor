import type { JsonValue } from '../../core/model/json.ts';
import { isHexColor, PLUGIN_DEFAULTS, type LightDefaults } from './lightTags.ts';

/**
 * The name the server serves J-Lighting's config under, from {@code data/config.lighting.json}.
 */
const LIGHTING_CONFIG = 'lighting';

/**
 * How strongly and how fast one light effect runs.
 */
type LightEffectTuning = {
  readonly depth: number;
  readonly period: number;
  readonly chance: number;
  readonly variance: number;
};

/**
 * J-Lighting's config as the server serves it ({@code server/internal/models/plugins/lighting.go}): read strictly, so
 * every field is there and holds what it says, a field the file leaves out coming back as zero or empty.
 */
type LightingConfig = {
  readonly light: {
    readonly radius: number;
    readonly color: string;
    readonly intensity: number;
    readonly effects: {
      readonly flicker: LightEffectTuning;
      readonly pulse: LightEffectTuning;
      readonly glitch: LightEffectTuning;
    };
  };
  readonly ambient: {
    readonly color: string;
  };
};

/**
 * Settles what a light falls back to in a project, from its J-Lighting config: the configured colour and intensity.
 * J-Lighting cannot start without the file (its config loader throws at boot), and fails on its first light when the
 * file's colour is no colour, so in either case lights fall back to white, the shipped default. A light whose tag names
 * its own colour keeps it whatever the config says.
 * @param {JsonValue | null} config The config as the server served it, or null when the project has none.
 * @returns {LightDefaults} The defaults.
 */
const lightDefaultsFrom = (config: JsonValue | null): LightDefaults =>
{
  if (config === null)
  {
    return PLUGIN_DEFAULTS;
  }

  // the server read the file into its model, so the shape is the model's.
  const { light } = config as unknown as LightingConfig;
  return {
    color: isHexColor(light.color) ? light.color : PLUGIN_DEFAULTS.color,
    intensity: light.intensity,
  };
};

export { LIGHTING_CONFIG, lightDefaultsFrom };
export type { LightEffectTuning, LightingConfig };
