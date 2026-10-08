import { isJsonObject, type JsonObject, type JsonValue } from '../../core/model/json.ts';
import type { SkyWeather } from '../../core/renderer/weatherLayer.ts';
import { entryOf } from './weatherConfig.ts';
import type { WeatherDeclaration } from './weatherTags.ts';

/**
 * The climates block of J-Weather's config as the server serves it, each climate's table by name, as J-Weather-Time
 * reads it (J.WEATHER.EXT.TIME.Metadata.climates): unchecked, since the plugin checks nothing of it either, and reads
 * each table as it finds it.
 */
type ClimateTables = Readonly<Record<string, JsonValue>>;

/**
 * No climates at all, as a config without a climates block holds, and as the editor reads one it cannot.
 */
const NO_CLIMATES: ClimateTables = {};

/**
 * Reads the climates block out of J-Weather's config as served: the table of climates by name, or none for a config
 * holding no such table.
 * @param {JsonValue | undefined} block The config's climates block, or undefined when it has none.
 * @returns {ClimateTables} The climates.
 */
const climatesFrom = (block: JsonValue | undefined): ClimateTables =>
{
  return block !== undefined && isJsonObject(block)
    ? block
    : NO_CLIMATES;
};

/**
 * Finds the table a climate the map names answers the sky by (ClimateCurves.climateFor): none for a map naming none,
 * and none for a name the config does not know, so that map simply follows the sky, as it does in the game after the
 * plugin warns of it. A climate the config holds as anything but a table has no opinion either, as the plugin finds
 * nothing to read in it.
 * @param {string | null} name The climate the map names, or null for none.
 * @param {ClimateTables} climates The config's climates.
 * @returns {JsonObject | null} The climate's table, or null when there is none to apply.
 */
const climateFor = (name: string | null, climates: ClimateTables): JsonObject | null =>
{
  if (name === null)
  {
    return null;
  }

  const climate = entryOf(climates, name);
  return climate !== undefined && isJsonObject(climate)
    ? climate
    : null;
};

/**
 * Reads one entry out of a climate's table (ClimateCurves.lookUp): what the table says for a sky's condition, or for a
 * strength, or nothing when it has no such table or says nothing for that key. What it says is a strength's name, read
 * as the property name it is looked up by, as J-Weather then looks it up among a look's strengths.
 * @param {JsonValue | undefined} table The table, byType or byIntensity, or undefined when the climate declared none.
 * @param {string} key The condition or the strength looked up.
 * @returns {string | null} The strength the table names, or null when it has nothing to say.
 */
const lookUp = (table: JsonValue | undefined, key: string): string | null =>
{
  if (table === undefined || isJsonObject(table) === false)
  {
    return null;
  }

  const found = entryOf(table, key);
  return found === undefined || found === null
    ? null
    : String(found);
};

/**
 * Bends the sky's strength through the climate a map names, as J-Weather-Time bends it (ClimateCurves.apply) for a map
 * naming a look of its own; a map naming none follows the sky as it is, climate or not. Under a roof, or with no sky
 * driven, the strength stands as J-Weather gave it. Otherwise a climate the config knows answers by the sky's condition
 * first, since how clear the sky is is no amount, then by the strength, then by its own default, and with nothing to
 * say about any of those, the sky's strength stands.
 * @param {WeatherDeclaration} declaration What the map's note says.
 * @param {SkyWeather | null} sky What the sky is doing, or null when nothing drives one.
 * @param {string} skyIntensity The strength J-Weather arrived at for the map's look.
 * @param {ClimateTables} climates The config's climates.
 * @returns {string} The strength the map's look runs at.
 */
const climateIntensity = (declaration: WeatherDeclaration, sky: SkyWeather | null, skyIntensity: string, climates: ClimateTables): string =>
{
  // under a roof there is no sky to answer, and with none driven there is nothing to answer.
  if (declaration.hasSky === false || sky === null)
  {
    return skyIntensity;
  }

  const climate = climateFor(declaration.climate, climates);
  if (climate === null)
  {
    return skyIntensity;
  }

  const byType = lookUp(climate['byType'], sky.type);
  if (byType !== null)
  {
    return byType;
  }

  const byIntensity = lookUp(climate['byIntensity'], skyIntensity);
  if (byIntensity !== null)
  {
    return byIntensity;
  }

  // a climate silent about this sky falls back to its own default, or failing that to the sky's strength.
  const fallback = climate['default'];
  return fallback === undefined
    ? skyIntensity
    : String(fallback);
};

export { climateFor, climateIntensity, climatesFrom, NO_CLIMATES };
export type { ClimateTables };
