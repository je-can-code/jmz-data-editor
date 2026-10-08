import { skyFollowsClock } from '../lighting/skyTag.ts';

/**
 * What a map's note says about its weather, as J-Weather reads it on arrival (MapWeatherResolver#declarationFor):
 * whether it opts out of weather altogether, the look it names, if any, and whether the sky can be seen from it.
 */
type WeatherDeclaration = {
  /**
   * True when the note opts out of weather, whatever else it says.
   */
  readonly suppressed: boolean;

  /**
   * The look the note names, exactly as written, or null when it names none.
   */
  readonly preset: string | null;

  /**
   * Whether the sky can be seen from the map: false for one the game keeps from the clock's tint, a cave or an interior.
   */
  readonly hasSky: boolean;
};

/**
 * The weather tag exactly as J-Weather declares it (J.WEATHER.RegExp.Weather): a look's name after the colon and at most
 * one space, starting with a letter and going on in letters, digits, underscores and hyphens, closed at once. Case does
 * not matter to the tag, but the name is looked up as written.
 *
 * <pre>
 * Structure:
 *  <weather:PRESET>
 *
 * Example:
 *  <weather:rain>
 *
 * Translation:
 *  This place is rainy.
 * </pre>
 */
const WEATHER_TAG = /<weather:[ ]?([a-zA-Z][a-zA-Z0-9_-]*)>/i;

/**
 * The opt-out exactly as J-Weather declares it (J.WEATHER.RegExp.NoWeather): the bare tag, any case, nothing inside it.
 *
 * <pre>
 * Structure:
 *  <noWeather>
 *
 * Example:
 *  <noWeather>
 *
 * Translation:
 *  Nothing falls here, whatever the sky is doing.
 * </pre>
 */
const NO_WEATHER_TAG = /<noWeather>/i;

/**
 * How a note is cut into lines, as RPGManager reads a note: any run of line breaks ends a line.
 */
const NOTE_LINES = /[\r\n]+/;

/**
 * Finds the look a map's note names, as RPGManager#getStringFromNoteByRegex finds it for J-Weather: line by line, the
 * first tag on a line, and the last line holding one wins, so a note naming two looks shows the later. A note line need
 * not be the tag alone.
 * @param {string} note The map's note.
 * @returns {string | null} The look's name as written, or null when the note names none.
 */
const weatherPresetOf = (note: string): string | null =>
{
  let preset: string | null = null;
  note.split(NOTE_LINES).forEach(line =>
  {
    const match = WEATHER_TAG.exec(line);
    if (match !== null)
    {
      [ , preset ] = match;
    }
  });

  return preset;
};

/**
 * Reports whether a map's note opts out of weather, as RPGManager#checkForBooleanFromNoteByRegex reads it for J-Weather:
 * any line holding the tag anywhere.
 * @param {string} note The map's note.
 * @returns {boolean} True when the note opts out.
 */
const suppressesWeather = (note: string): boolean =>
{
  return note.split(NOTE_LINES).some(line => NO_WEATHER_TAG.test(line));
};

/**
 * Reads what a map's note says about its weather, as J-Weather does on arrival: the opt-out, the look it names, and
 * whether the sky can be seen from it, which J-Weather reads from the same tag J-Lighting-Time keeps a cave from the
 * clock's tint with.
 * @param {string} note The map's note.
 * @returns {WeatherDeclaration} What the note says.
 */
const weatherDeclarationOf = (note: string): WeatherDeclaration =>
{
  return {
    suppressed: suppressesWeather(note),
    preset: weatherPresetOf(note),
    hasSky: skyFollowsClock(note),
  };
};

export { NO_WEATHER_TAG, suppressesWeather, WEATHER_TAG, weatherDeclarationOf, weatherPresetOf };
export type { WeatherDeclaration };
