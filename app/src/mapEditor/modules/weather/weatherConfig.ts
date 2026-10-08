import type { JsonValue } from '../../core/model/json.ts';

/**
 * One motion or one authored layer as config.weather.json holds it: plain knobs by name. Nothing here is checked against
 * a shape, because J-Weather checks nothing either: it reads each knob as it finds it, and an absent one reads as
 * undefined, so the arithmetic that folds them together meets the same values the plugin's does.
 */
type RawKnobs = Readonly<Record<string, JsonValue | undefined>>;

/**
 * J-Weather's config as the server serves it, as far as drawing goes: every motion by name, and every look by name,
 * each with its ladder of intensities.
 */
type WeatherConfigFile = {
  readonly motions: Readonly<Record<string, RawKnobs>>;
  readonly presets: Readonly<Record<string, { readonly stops: Readonly<Record<string, readonly RawKnobs[]>> }>>;
};

/**
 * Reads J-Weather's config as the server served it, for drawing: the file holds a table of motions and a table of
 * looks, or it cannot be drawn from at all, as J-Weather could not start from it. It lives apart from the arithmetic
 * that draws from the config, so the editor can tell whether a config serves without loading the code that draws.
 * @param {JsonValue | null} config The config as the server served it, or null when it could not be read.
 * @returns {WeatherConfigFile | null} The config, or null when it holds no motions or no looks to draw.
 */
const weatherConfigFrom = (config: JsonValue | null): WeatherConfigFile | null =>
{
  const isTable = (value: JsonValue | undefined): boolean => value !== null && typeof value === 'object' && Array.isArray(value) === false;
  if (config === null || isTable(config) === false)
  {
    return null;
  }

  const { motions, presets } = config as Readonly<Record<string, JsonValue>>;
  return isTable(motions) && isTable(presets)
    ? config as unknown as WeatherConfigFile
    : null;
};

export { weatherConfigFrom };
export type { RawKnobs, WeatherConfigFile };
