import type { JsonValue } from '../../core/model/json.ts';
import type { ModuleNotice } from '../../core/modules/PluginModule.ts';
import { isHexColor, PLUGIN_DEFAULTS, type LightDefaults } from './lightTags.ts';

/**
 * The name the server serves J-Lighting's config under, from {@code data/config.lighting.json}.
 */
const LIGHTING_CONFIG = 'lighting';

/**
 * The id of the notice J-Lighting's module shows while its config fails it.
 */
const LIGHTING_CONFIG_NOTICE_ID = 'lighting.config';

/**
 * What the notice says first: what the failure means on the map, and the file to fix.
 */
const WHITE_UNTIL_FIXED = 'Lights without a colour of their own draw in white until data/config.lighting.json is fixed.';

/**
 * What the notice says last: the config is read as the window opens, so a fixed file shows once the window opens again.
 */
const REOPEN = 'Reopen the map editor once it is fixed.';

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
 * file's colour is no colour, so in either case lights fall back to white, the shipped default, and
 * {@link lightingConfigNotice} says so over the map. A light whose tag names its own colour keeps it whatever the config
 * says.
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

/**
 * Says what is wrong when the config fails the lights, so the white they fall back to is never mistaken for the game's
 * look: the file could not be read (it is missing, is not JSON, or holds a field the strict read refuses), in the
 * server's words, or its colour is no colour the game can use. Nothing is said of a config that serves.
 * @param {JsonValue | null} config The config as the server served it, or null when it could not be read.
 * @param {string | undefined} problem Why it could not be read, or undefined when nothing said why.
 * @returns {ModuleNotice | null} The notice, or null when the config serves.
 */
const lightingConfigNotice = (config: JsonValue | null, problem: string | undefined): ModuleNotice | null =>
{
  if (config === null)
  {
    const why = problem === undefined
      ? 'It was not read.'
      : `It could not be read: ${problem}.`;
    return { id: LIGHTING_CONFIG_NOTICE_ID, title: WHITE_UNTIL_FIXED, detail: `${why} ${REOPEN}` };
  }

  const { light } = config as unknown as LightingConfig;
  if (isHexColor(light.color))
  {
    return null;
  }

  return {
    id: LIGHTING_CONFIG_NOTICE_ID,
    title: WHITE_UNTIL_FIXED,
    detail: `Its light colour is "${light.color}", and the game takes only a hex colour such as #ffbb73. ${REOPEN}`,
  };
};

export { LIGHTING_CONFIG, LIGHTING_CONFIG_NOTICE_ID, lightDefaultsFrom, lightingConfigNotice };
export type { LightEffectTuning, LightingConfig };
