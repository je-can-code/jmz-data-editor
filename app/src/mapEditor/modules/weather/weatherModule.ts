import type { ConfigRead, LiveNotice, ModuleNotice, OnDemandConfig, PluginModule } from '../../core/modules/PluginModule.ts';
import type { WeatherFrame } from '../../core/renderer/weatherLayer.ts';
import { WeatherOnDemand } from './weatherOnDemand.ts';
import { weatherConfigFrom } from './weatherConfig.ts';
import { resolveWeather } from './weatherResolver.ts';
import { WEATHER_SETTINGS_ID, WEATHER_SKY, weatherSettingsSource } from './weatherSettings.ts';
import { weatherDeclarationOf } from './weatherTags.ts';

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
 * @param {ConfigRead} read The config as the server served it, or null and why not.
 * @returns {ModuleNotice | null} The notice, or null when the config serves.
 */
const weatherConfigNotice = (read: ConfigRead): ModuleNotice | null =>
{
  if (read.content === null)
  {
    const why = read.problem === null
      ? 'It was not read.'
      : `It could not be read: ${read.problem}.`;
    return { id: WEATHER_CONFIG_NOTICE_ID, title: NO_WEATHER_UNTIL_FIXED, detail: `${why} ${CLEARS_ONCE_FIXED}` };
  }

  if (weatherConfigFrom(read.content) !== null)
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
 * What the module says of its config over every map view: nothing until a map with weather has had it read, then why
 * it cannot be drawn from, for as long as it cannot, and nothing for a config that serves.
 * @param {OnDemandConfig} config J-Weather's config.
 * @returns {LiveNotice} What is said of it.
 */
const weatherConfigNoticeOf = (config: OnDemandConfig): LiveNotice => ({
  id: WEATHER_CONFIG_NOTICE_ID,
  current: () =>
  {
    const read = config.current();
    return read === undefined ? null : weatherConfigNotice(read);
  },
  subscribe: listener => config.subscribe(listener),
});

/**
 * Says whether J-Weather draws anything on a frame's map: a look its note names, or the sky's look on an outdoor map
 * naming none, read from the note and the sky alone. A look the config does not know counts too, since only the config
 * can say so, and reading the config is exactly what a map without weather never pays for.
 * @param {WeatherFrame} frame The map and the sky.
 * @returns {boolean} True when the map has weather.
 */
const drawsWeatherOn = (frame: WeatherFrame): boolean =>
{
  const declaration = weatherDeclarationOf(frame.document.property('note'));
  return resolveWeather(declaration, frame.sky) !== null;
};

/**
 * What the editor knows of J-Weather: a map's own weather, from the look its note names, drawn into the weather layer as
 * the game draws it, its particles moved exactly as the plugin moves them and drawn with the project's own pictures,
 * sizes, colours, strengths and blends from config.weather.json. It sits where the game draws its weather, coloured by
 * the screen's tone and beneath the lighting's dark, and the view's Weather switch shows and hides it. A map opting out,
 * or naming no look, draws nothing, as it does in the game with nothing driving a sky; a look the map names runs at its
 * middle strength until something drives one.
 *
 * Weather costs a map without any nothing: the code that draws is loaded only the first time a map has weather, and the
 * config is read only once something needs it, a map with weather to draw it or Map Properties' Weather section to list
 * the looks, never as the module switches on. A config that then turns out not to serve is said over every map view.
 *
 * Map Properties gains a Weather section: the look the map shows, chosen from those the config lists, and whether it
 * opts out of weather altogether, each written into the map's note in place. J-Weather reads whether a map has a sky
 * too, which the module says, so the sky setting shows in Map Properties while J-Weather is on: in this section while no
 * module said so first, and otherwise in that one's, worded for both. J-Weather-Time cannot run without J-Weather, so
 * nothing here asks whether it is on.
 */
const weatherModule: PluginModule = {
  id: 'weather',
  title: 'J-Weather',
  plugins: [ WEATHER_PLUGIN ],
  onDemandConfigs: [ WEATHER_CONFIG ],
  register: (contributions, context) =>
  {
    const config = context.onDemandConfig(WEATHER_CONFIG);
    contributions.liveNotice(weatherConfigNoticeOf(config));
    contributions.weatherLayer({
      id: MAP_WEATHER_ID,
      title: 'Weather',
      drawsOn: drawsWeatherOn,
      create: stage => new WeatherOnDemand(stage, config),
    });

    // J-Weather keeps the sky's weather off a map with no sky, so whether a map has one is set while it is on.
    contributions.skyReader(WEATHER_SKY);
    contributions.mapProperties({
      id: WEATHER_SETTINGS_ID,
      title: 'Weather',
      source: weatherSettingsSource(config, context.skyReaders),
      config,
    });
  },
};

export { MAP_WEATHER_ID, WEATHER_CONFIG, WEATHER_CONFIG_NOTICE_ID, WEATHER_PLUGIN, weatherConfigNotice, weatherModule };
