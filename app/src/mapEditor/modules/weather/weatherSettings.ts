import type { QuickOption } from '../../core/eventKinds/quickFields.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { ConfigRead, OnDemandConfig, SkyReader } from '../../core/modules/PluginModule.ts';
import type { MapPropertiesModel, MapPropertiesSource, MapPropertyField } from '../../core/properties/moduleProperties.ts';
import { skySettingFor } from '../lighting/skyTag.ts';
import { weatherConfigFrom } from './weatherConfig.ts';
import { readMapWeather, withWeatherPreset, withWeatherSuppressed, type MapWeather } from './weatherNote.ts';
import { weatherPresetOf } from './weatherTags.ts';

/**
 * The id of the section J-Weather's module adds to Map Properties.
 */
const WEATHER_SETTINGS_ID = 'weather.settings';

/**
 * J-Weather, as a plugin reading whether a map has a sky (MapWeatherResolver.declarationFor): the sky's weather reaches
 * only a map with one, and a look the map names rises and falls with the sky's strength only under one. Both matter only
 * while J-Weather-Time drives that sky, so J-Weather's module says J-Weather reads it only then.
 */
const WEATHER_SKY: SkyReader = {
  id: 'weather.sky',
  follows: 'the weather',
  does: 'The sky\'s weather reaches this map.',
};

/**
 * The value of the choice naming no look, which no look's name can be: a name starts with a letter.
 */
const NO_LOOK = '';

/**
 * The choice naming no look: the map has no weather of its own, and takes the sky's, if anything drives one.
 */
const NO_LOOK_OPTION: QuickOption = { value: NO_LOOK, label: 'None of its own' };

/**
 * What the look setting says under it while the map opts out of weather too, which outranks any look it names.
 */
const OUTRANKED_HINT = 'No weather is ticked, so this never shows.';

/**
 * What the look setting says under it while the project's config holds no looks J-Weather could start from.
 */
const UNLISTED_HINT = 'No looks are listed until data/config.weather.json is fixed.';

/**
 * What the opt-out says under it.
 */
const NO_WEATHER_HINT = 'Keeps all weather off this map, its own and the sky\'s.';

/**
 * Lists the looks a map's tag can name, from J-Weather's config as read, in the order the config holds them, each named
 * exactly as the plugin finds it, case and all: every name the config's looks are kept under that a tag reads back as
 * itself. The config's own notes, such as _comment_faces, are never offered, since no tag can name a word starting with
 * an underscore; nor is anything else a tag cannot spell, which no map could ever show.
 * @param {ConfigRead} read The config as read.
 * @returns {readonly string[] | null} The looks' names, or null for a config J-Weather could not start from.
 */
const weatherLooksIn = (read: ConfigRead): readonly string[] | null =>
{
  const config = weatherConfigFrom(read.content);
  if (config === null)
  {
    return null;
  }

  return Object.keys(config.presets).filter(name => weatherPresetOf(`<weather:${name}>`) === name);
};

/**
 * Says what the look setting shows when the game will not show it as named, if anything: that the map opts out too, which
 * outranks it whatever it names; that the project's config lists no looks at all; or that the config has no look by the
 * name the note gives, which the game then draws nothing for. Nothing is said of a config not yet read, which cannot say.
 * @param {MapWeather} weather The map's weather.
 * @param {ConfigRead | undefined} read J-Weather's config as read, or undefined until it is.
 * @returns {{ hint?: string }} The hint, or none.
 */
const lookHint = (weather: MapWeather, read: ConfigRead | undefined): { hint?: string } =>
{
  const { preset, suppressed } = weather;
  if (suppressed && preset !== null)
  {
    return { hint: OUTRANKED_HINT };
  }

  const looks = read === undefined ? [] : weatherLooksIn(read);
  if (looks === null)
  {
    return { hint: UNLISTED_HINT };
  }

  return read === undefined || preset === null || looks.includes(preset)
    ? {}
    : { hint: `The project has no look named ${preset}, so nothing shows here.` };
};

/**
 * Builds the look setting: no look of its own, or one of the looks the config lists, the look the note names among them
 * as itself even when the config lacks it, so it shows as the game reads it and stays as written until it is changed.
 * @param {string} note The map's note.
 * @param {MapWeather} weather The map's weather.
 * @param {ConfigRead | undefined} read J-Weather's config as read, or undefined until it is.
 * @returns {MapPropertyField} The setting.
 */
const lookField = (note: string, weather: MapWeather, read: ConfigRead | undefined): MapPropertyField =>
{
  const looks = (read === undefined ? null : weatherLooksIn(read)) ?? [];
  const { preset } = weather;
  const listed = preset === null || looks.includes(preset) ? looks : [ ...looks, preset ];
  return {
    key: 'weather.look',
    label: 'Look',
    control: { kind: 'select', options: [ NO_LOOK_OPTION, ...listed.map(name => ({ value: name, label: name })) ] },
    value: preset ?? NO_LOOK,
    step: 'Change weather',
    ...lookHint(weather, read),
    write: value => ({ note: withWeatherPreset(note, value === NO_LOOK ? null : value as string) }),
  };
};

/**
 * Says what the section says above its settings, when there is anything to say: that the note names a look more than
 * once, of which the game reads only one.
 * @param {MapWeather} weather The map's weather.
 * @returns {string | null} The line, or null when there is nothing to say.
 */
const weatherNote = (weather: MapWeather): string | null =>
{
  return weather.tags > 1
    ? `This note names a look ${weather.tags} times; the game reads only the one shown here.`
    : null;
};

/**
 * Builds the settings of a map's weather, as J-Weather reads them from its note on arrival: the look it shows, named
 * from those the project's config lists; whether it opts out of weather altogether; and whether it has a sky, while
 * J-Weather is the first plugin the active modules say reads it ({@link skySettingFor}), as it is while J-Weather-Time
 * drives a sky and J-Lighting-Time is off. Each shows what the game will do, and each change writes the note in place, so
 * every other tag and every other word of it stays as written.
 *
 * The config is read only once the section shows ({@link MapPropertiesSection.config}), never while a map merely opens,
 * so until it arrives the look lists only what the note names.
 * @param {OnDemandConfig} config J-Weather's config, read only once something needs it.
 * @param {() => readonly SkyReader[]} skyReaders Every plugin the active modules say reads the sky, as they stand when
 * asked; the section shows the sky setting while J-Weather is the first of them.
 * @returns {MapPropertiesSource} The section's settings, for each map.
 */
const weatherSettingsSource = (config: OnDemandConfig, skyReaders: () => readonly SkyReader[]): MapPropertiesSource =>
{
  return (map: MapDocument): MapPropertiesModel =>
  {
    const note = map.property('note');
    const weather = readMapWeather(note);
    const fields: MapPropertyField[] = [
      lookField(note, weather, config.current()),
      {
        key: 'weather.none',
        label: 'No weather',
        control: { kind: 'check' },
        value: weather.suppressed,
        step: 'Change weather',
        hint: NO_WEATHER_HINT,
        write: value => ({ note: withWeatherSuppressed(note, value as boolean) }),
      },
      ...skySettingFor(note, WEATHER_SKY, skyReaders()),
    ];
    return { note: weatherNote(weather), fields };
  };
};

export { WEATHER_SETTINGS_ID, WEATHER_SKY, weatherLooksIn, weatherSettingsSource };
