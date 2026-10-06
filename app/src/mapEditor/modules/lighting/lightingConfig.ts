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
 * What the notice says last: the config is read again whenever the file changes on disk, so fixing it clears this.
 */
const CLEARS_ONCE_FIXED = 'This clears as soon as the file is fixed.';

/**
 * The colour of the dark when the project's config cannot say: ordinary black, which is what J-Lighting's own words call
 * a dark with no colour named.
 */
const ORDINARY_BLACK = '#000000';

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
    return { id: LIGHTING_CONFIG_NOTICE_ID, title: WHITE_UNTIL_FIXED, detail: `${why} ${CLEARS_ONCE_FIXED}` };
  }

  const { light } = config as unknown as LightingConfig;
  if (isHexColor(light.color))
  {
    return null;
  }

  return {
    id: LIGHTING_CONFIG_NOTICE_ID,
    title: WHITE_UNTIL_FIXED,
    detail: `Its light colour is "${light.color}", and the game takes only a hex colour such as #ffbb73. ${CLEARS_ONCE_FIXED}`,
  };
};

/**
 * Settles the colour a map's dark falls back to, from the project's J-Lighting config: its {@code ambient.color}.
 * J-Lighting fills it in only for a map whose tag writes a colour it cannot use; a tag writing none leaves the colour of
 * the dark to whoever names one, and to black when nobody does. A project without the file, or whose colour is no
 * colour, falls back to ordinary black: the game, given a colour it cannot read there, would turn such a map's dark
 * pitch black outright, which only a map writing a broken colour of its own could ever show.
 * @param {JsonValue | null} config The config as the server served it, or null when the project has none.
 * @returns {string} The colour, a hex colour.
 */
const ambientColorFrom = (config: JsonValue | null): string =>
{
  if (config === null)
  {
    return ORDINARY_BLACK;
  }

  // the server read the file into its model, so the shape is the model's.
  const { ambient } = config as unknown as LightingConfig;
  return isHexColor(ambient.color)
    ? ambient.color
    : ORDINARY_BLACK;
};

export { ambientColorFrom, LIGHTING_CONFIG, LIGHTING_CONFIG_NOTICE_ID, lightDefaultsFrom, lightingConfigNotice };
export type { LightEffectTuning, LightingConfig };
