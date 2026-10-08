import type { JsonValue } from '../../core/model/json.ts';
import type { ModuleNotice, PluginModule } from '../../core/modules/PluginModule.ts';
import { MapWeather } from './mapWeather.ts';
import { weatherConfigFrom } from './weatherPresets.ts';

/**
 * J-Weather's file name, as js/plugins.js lists it.
 */
const WEATHER_PLUGIN = 'J-Weather';

/**
 * The name the server serves J-Weather's config under, from {@code data/config.weather.json}.
 */
const WEATHER_CONFIG = 'weather';

/**
 * The id of the map's weather J-Weather's module draws into the weather layer.
 */
const MAP_WEATHER_ID = 'weather.map';

/**
 * The id of the notice J-Weather's module shows while its config cannot be drawn from.
 */
const WEATHER_CONFIG_NOTICE_ID = 'weather.config';

/**
 * What the notice says first: what the failure means on the map, and the file to fix.
 */
const NO_WEATHER_UNTIL_FIXED = 'No weather is drawn until data/config.weather.json is fixed.';

/**
 * What the notice says last: the config is read again whenever the file changes on disk, so fixing it clears this.
 */
const CLEARS_ONCE_FIXED = 'This clears as soon as the file is fixed.';

/**
 * Says what is wrong when the config cannot be drawn from, so a map shown without its weather is never mistaken for one
 * that has none: the file could not be read (it is missing, is not JSON, or holds a block the strict read refuses), in
 * the server's words, or it holds no motions or no looks, which J-Weather could not start from either. Nothing is said
 * of a config that serves.
 * @param {JsonValue | null} config The config as the server served it, or null when it could not be read.
 * @param {string | undefined} problem Why it could not be read, or undefined when nothing said why.
 * @returns {ModuleNotice | null} The notice, or null when the config serves.
 */
const weatherConfigNotice = (config: JsonValue | null, problem: string | undefined): ModuleNotice | null =>
{
  if (config === null)
  {
    const why = problem === undefined
      ? 'It was not read.'
      : `It could not be read: ${problem}.`;
    return { id: WEATHER_CONFIG_NOTICE_ID, title: NO_WEATHER_UNTIL_FIXED, detail: `${why} ${CLEARS_ONCE_FIXED}` };
  }

  if (weatherConfigFrom(config) !== null)
  {
    return null;
  }

  return {
    id: WEATHER_CONFIG_NOTICE_ID,
    title: NO_WEATHER_UNTIL_FIXED,
    detail: `It needs its motions and its presets, each a table by name. ${CLEARS_ONCE_FIXED}`,
  };
};

/**
 * What the editor knows of J-Weather: a map's own weather, from the look its note names, drawn into the weather layer as
 * the game draws it, its particles moved exactly as the plugin moves them and drawn with the project's own pictures,
 * sizes, colours, strengths and blends from config.weather.json. It sits where the game draws its weather, coloured by
 * the screen's tone and beneath the lighting's dark, and the view's Weather switch shows and hides it. A map opting out,
 * or naming no look, draws nothing, as it does in the game with nothing driving a sky; a look the map names runs at its
 * middle strength until something drives one. A config that cannot be drawn from is said over every map view.
 */
const weatherModule: PluginModule = {
  id: 'weather',
  title: 'J-Weather',
  plugins: [ WEATHER_PLUGIN ],
  configs: [ WEATHER_CONFIG ],
  register: (contributions, context) =>
  {
    // the registry hands over every config the module names, null for one the project lacks, with why it lacks it.
    const served = context.configs.get(WEATHER_CONFIG) ?? null;
    const notice = weatherConfigNotice(served, context.configProblems.get(WEATHER_CONFIG));
    if (notice !== null)
    {
      contributions.notice(notice);
    }

    const config = weatherConfigFrom(served);
    contributions.weatherLayer({
      id: MAP_WEATHER_ID,
      title: 'Weather',
      create: stage => new MapWeather(stage, config),
    });
  },
};

export { MAP_WEATHER_ID, WEATHER_CONFIG, WEATHER_CONFIG_NOTICE_ID, WEATHER_PLUGIN, weatherConfigNotice, weatherModule };
