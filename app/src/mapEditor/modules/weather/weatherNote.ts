import { keepsOtherMeta, noteLines, OTHER_TAGS_MISREAD, withLineAdded, withSpanRemoved } from '../../core/properties/noteText.ts';
import { NO_WEATHER_TAG, suppressesWeather, WEATHER_TAG, weatherPresetOf } from './weatherTags.ts';

/**
 * One weather tag as a note writes it, as J-Weather's pattern finds it on a line: where it starts and ends in the note,
 * and the look it names, as written. The name always ends the tag, right before its closing bracket.
 */
type WeatherTagSpan = {
  readonly start: number;
  readonly end: number;
  readonly preset: string;
};

/**
 * A map's weather as its settings show it, read from the note as J-Weather reads it on arrival.
 */
type MapWeather = {
  /**
   * The look the game reads, exactly as written, or null for a note naming none.
   */
  readonly preset: string | null;

  /**
   * Whether the note opts out of weather, which outranks any look it names.
   */
  readonly suppressed: boolean;

  /**
   * How many looks the note names, read or not: the game reads only the first on the last line naming any.
   */
  readonly tags: number;
};

/**
 * What a written note must give when J-Weather reads it back: the look, or null for none, and whether it opts out.
 */
type MeantWeather = {
  readonly preset: string | null;
  readonly suppressed: boolean;
};

/**
 * Every weather tag on a line, rather than the first alone, which is all the game reads of a line.
 */
const WEATHER_TAGS = new RegExp(WEATHER_TAG.source, 'gi');

/**
 * Every opt-out in a note: any one of them opts the map out, so each must go for the map to have weather again.
 */
const NO_WEATHER_TAGS = new RegExp(NO_WEATHER_TAG.source, 'gi');

/**
 * The opt-out as a note writes it, as J-Weather's own examples write it.
 */
const NO_WEATHER_LINE = '<noWeather>';

/**
 * Why a change was refused when the note it would write reads back as some other weather, or as none.
 */
const WEATHER_MISREAD = 'the game would not read this map\'s weather back as written';

/**
 * Finds every weather tag in a note, line by line as the game cuts it, each with where it sits and the look it names.
 * @param {string} note The map's note.
 * @returns {WeatherTagSpan[][]} The tags, a list per line, in order; a line naming no look has an empty list.
 */
const weatherTagsByLine = (note: string): WeatherTagSpan[][] =>
{
  return noteLines(note).map(line => [ ...line.text.matchAll(WEATHER_TAGS) ].map(found =>
  {
    const [ tag, preset ] = found;
    const start = line.start + found.index;
    return { start, end: start + tag.length, preset };
  }));
};

/**
 * Finds the weather tag the game reads, as RPGManager#getStringFromNoteByRegex finds it for J-Weather: the first on a
 * line, from the last line holding any. It is the tag {@link weatherPresetOf} reads, with where it sits.
 * @param {string} note The map's note.
 * @returns {WeatherTagSpan | null} The tag, or null when the note names no look.
 */
const gameWeatherTagIn = (note: string): WeatherTagSpan | null =>
{
  const lines = weatherTagsByLine(note).filter(tags => tags.length > 0);
  const last = lines[lines.length - 1];
  return last === undefined
    ? null
    : last[0];
};

/**
 * Reads a map's weather from its note for the map's weather settings: the look the game reads, whether the note opts
 * out, and how many looks it names.
 * @param {string} note The map's note.
 * @returns {MapWeather} The weather.
 */
const readMapWeather = (note: string): MapWeather =>
{
  return {
    preset: weatherPresetOf(note),
    suppressed: suppressesWeather(note),
    tags: weatherTagsByLine(note).flat().length,
  };
};

/**
 * Reports whether a name in a note's metadata is a weather tag's, in whatever case it is written: the only names a
 * change to the look writes, adds or takes away.
 * @param {string} key The name.
 * @returns {boolean} True for the weather tag's name.
 */
const isWeatherName = (key: string): boolean =>
{
  return key.toLowerCase() === 'weather';
};

/**
 * Reports whether a name in a note's metadata is the opt-out's, in whatever case it is written: the only names opting a
 * map out or back in adds or takes away.
 * @param {string} key The name.
 * @returns {boolean} True for the opt-out's name.
 */
const isNoWeatherName = (key: string): boolean =>
{
  return key.toLowerCase() === 'noweather';
};

/**
 * Hands on a changed note only when J-Weather reads it back as exactly the weather meant, the look and the opt-out
 * alike, and the engine reads every other tag in it as it did before the change. A tag taken out or added can leave a
 * stray bracket earlier in the note swallowing a tag the change never touched, such as the one saying the map has no
 * sky, and such a change is refused rather than written; so is a look whose tag the game would read as some other look,
 * or as none.
 * @param {string} note The note as it was.
 * @param {string} written The note as it would be written.
 * @param {MeantWeather} meant The weather it must give.
 * @param {(key: string) => boolean} isAbout Whether a name in the metadata is one the change is about.
 * @returns {string} The written note.
 */
const checkedChange = (note: string, written: string, meant: MeantWeather, isAbout: (key: string) => boolean): string =>
{
  if (weatherPresetOf(written) !== meant.preset || suppressesWeather(written) !== meant.suppressed)
  {
    throw new Error(WEATHER_MISREAD);
  }

  if (keepsOtherMeta(note, written, isAbout) === false)
  {
    throw new Error(OTHER_TAGS_MISREAD);
  }

  return written;
};

/**
 * Takes every weather tag out of a note, the last first so each one still sits where it was read. Every one goes, not
 * only the one the game reads: with that one gone, the game would read another instead.
 * @param {string} note The map's note.
 * @returns {string} The note without them.
 */
const withoutWeatherTags = (note: string): string =>
{
  return weatherTagsByLine(note)
    .flat()
    .reduceRight((text, tag) => withSpanRemoved(text, tag.start, tag.end), note);
};

/**
 * Takes every opt-out out of a note, the last first so each one still sits where it was read, since any one left would
 * keep the map out of weather.
 * @param {string} note The map's note.
 * @returns {string} The note without them.
 */
const withoutNoWeatherTags = (note: string): string =>
{
  return [ ...note.matchAll(NO_WEATHER_TAGS) ]
    .reduceRight((text, found) => withSpanRemoved(text, found.index, found.index + found[0].length), note);
};

/**
 * Names the look a map shows by writing its note in place, the look named exactly as given, since J-Weather finds it by
 * name, case and all. A note naming none gains a tag on a line of its own at the end; a note naming one has the name of
 * the tag the game reads written over, and nothing else, the tag's own case and spacing kept; and no look at all takes
 * every weather tag out, each cleanly, since with the one the game reads gone it would read another. Every other
 * character of the note stays as it was, whatever the note says of opting out, and the note is read back as the game
 * reads it before it is handed on, its weather and every other tag in it alike ({@link checkedChange}).
 * @param {string} note The map's note.
 * @param {string | null} preset The look, by name, or null for none.
 * @returns {string} The note, unchanged when the game already reads that look from it.
 */
const withWeatherPreset = (note: string, preset: string | null): string =>
{
  const tag = gameWeatherTagIn(note);
  const named = tag === null ? null : tag.preset;
  if (named === preset)
  {
    return note;
  }

  // the look is the only thing the change is about, so whatever the note says of opting out must read as it did.
  const meant = { preset, suppressed: suppressesWeather(note) };
  if (preset === null)
  {
    return checkedChange(note, withoutWeatherTags(note), meant, isWeatherName);
  }

  if (tag === null)
  {
    return checkedChange(note, withLineAdded(note, `<weather:${preset}>`), meant, isWeatherName);
  }

  // the name ends the tag, so it runs from its length before the closing bracket up to it.
  const close = tag.end - 1;
  const renamed = `${note.slice(0, close - tag.preset.length)}${preset}${note.slice(close)}`;
  return checkedChange(note, renamed, meant, isWeatherName);
};

/**
 * Opts a map out of weather, or back in, by writing its note in place: a map opting out gains the tag on a line of its
 * own at the end of the note, and a map opting back in loses every such tag, each taken out cleanly. Every other
 * character of the note stays as it was, the look it names included, and the note is read back as the game reads it
 * before it is handed on ({@link checkedChange}).
 * @param {string} note The map's note.
 * @param {boolean} suppressed Whether the map is to have no weather at all.
 * @returns {string} The note, unchanged when the map already opts out, or in, as asked.
 */
const withWeatherSuppressed = (note: string, suppressed: boolean): string =>
{
  if (suppressesWeather(note) === suppressed)
  {
    return note;
  }

  const written = suppressed
    ? withLineAdded(note, NO_WEATHER_LINE)
    : withoutNoWeatherTags(note);
  return checkedChange(note, written, { preset: weatherPresetOf(note), suppressed }, isNoWeatherName);
};

export { readMapWeather, WEATHER_MISREAD, withWeatherPreset, withWeatherSuppressed };
export type { MapWeather };
