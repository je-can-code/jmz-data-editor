import { isJsonObject, type JsonValue } from '../../model/json.ts';

/**
 * Says a sound the way MZ lists one: its name, then volume, pitch and pan.
 * @param {JsonValue | undefined} value The sound.
 * @returns {string} Such as "Heal1 (90, 100, 0)", or "None" for no sound.
 */
const audioPhrase = (value: JsonValue | undefined): string =>
{
  if (isJsonObject(value) === false)
  {
    return 'None';
  }

  const { name, volume, pitch, pan } = value;
  const shownName = typeof name === 'string' && name !== ''
    ? name
    : 'None';
  return `${shownName} (${String(volume ?? 90)}, ${String(pitch ?? 100)}, ${String(pan ?? 0)})`;
};

/**
 * Says a number of seconds as minutes and seconds.
 * @param {JsonValue | undefined} value The seconds.
 * @returns {string} Such as "1:05".
 */
const clockPhrase = (value: JsonValue | undefined): string =>
{
  const seconds = typeof value === 'number'
    ? value
    : 0;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * Joins text lines into one line for a row, keeping blank lines out of the way.
 * @param {JsonValue | undefined} value The text, lines joined with newlines.
 * @returns {string} The lines joined with spaces.
 */
const oneLine = (value: JsonValue | undefined): string =>
{
  return String(value ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .join(' ');
};

/**
 * Reads a value as a list of text, for choices.
 * @param {JsonValue | undefined} value The value.
 * @returns {string[]} The texts; empty when the value is not a list.
 */
const textList = (value: JsonValue | undefined): string[] =>
{
  return Array.isArray(value)
    ? value.map(each => String(each ?? ''))
    : [];
};

export { audioPhrase, clockPhrase, oneLine, textList };
