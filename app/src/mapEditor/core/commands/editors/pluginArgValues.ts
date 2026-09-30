import { isJsonObject } from '../../model/json.ts';

/**
 * What a plugin argument's {@code @type} means for its form: a list of some type, a struct, or a single value of a
 * simple type ({@code number}, {@code switch}, {@code select} and the rest).
 */
type PluginArgType =
  | { readonly kind: 'list'; readonly item: PluginArgType }
  | { readonly kind: 'struct'; readonly name: string }
  | { readonly kind: 'simple'; readonly name: string };

/**
 * Matches a struct type: {@code struct<Name>}.
 */
const STRUCT_TYPE = /^struct<\s*([^>]+?)\s*>$/u;

/**
 * Reads an argument's {@code @type}. A list's items are read as the type before the brackets, so
 * {@code struct<Reward>[]} is a list of Reward structs and {@code number[][]} a list of lists of numbers.
 * @param {string} type The type, as the header spells it.
 * @returns {PluginArgType} What it means.
 */
const parseArgType = (type: string): PluginArgType =>
{
  const trimmed = type.trim();
  if (trimmed.endsWith('[]'))
  {
    return { kind: 'list', item: parseArgType(trimmed.slice(0, -2)) };
  }

  const struct = STRUCT_TYPE.exec(trimmed);
  return struct === null
    ? { kind: 'simple', name: trimmed === '' ? 'string' : trimmed }
    : { kind: 'struct', name: struct[1] };
};

/**
 * Reads a list argument's stored text: MZ keeps a list as the JSON of an array of texts, one per item, and an
 * empty text for a list never filled in.
 * @param {string} stored The stored text.
 * @returns {string[] | null} The items, or null when the text is not a list.
 */
const decodeList = (stored: string): string[] | null =>
{
  if (stored.trim() === '')
  {
    return [];
  }

  try
  {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.map(item => (typeof item === 'string' ? item : JSON.stringify(item)))
      : null;
  }
  catch
  {
    return null;
  }
};

/**
 * Writes a list argument's items the way MZ stores them.
 * @param {readonly string[]} items The items, each as text.
 * @returns {string} The stored text.
 */
const encodeList = (items: readonly string[]): string =>
{
  return JSON.stringify(items);
};

/**
 * Reads a struct argument's stored text: MZ keeps a struct as the JSON of an object of texts, one per field, and
 * an empty text for a struct never filled in.
 * @param {string} stored The stored text.
 * @returns {Record<string, string> | null} The fields, or null when the text is not a struct.
 */
const decodeStruct = (stored: string): Record<string, string> | null =>
{
  if (stored.trim() === '')
  {
    return {};
  }

  try
  {
    const parsed: unknown = JSON.parse(stored);
    return isJsonObject(parsed)
      ? Object.fromEntries(Object.entries(parsed).map(([ key, value ]) => [ key, typeof value === 'string' ? value : JSON.stringify(value) ]))
      : null;
  }
  catch
  {
    return null;
  }
};

/**
 * Writes a struct argument's fields the way MZ stores them, in the order given.
 * @param {Readonly<Record<string, string>>} fields The fields, each as text.
 * @returns {string} The stored text.
 */
const encodeStruct = (fields: Readonly<Record<string, string>>): string =>
{
  return JSON.stringify(fields);
};

/**
 * Reads a note argument's stored text: MZ keeps a note as the JSON of its text, quotes and escapes included.
 * Text that is not JSON is shown as it is.
 * @param {string} stored The stored text.
 * @returns {string} The note.
 */
const decodeNote = (stored: string): string =>
{
  try
  {
    const parsed: unknown = JSON.parse(stored);
    return typeof parsed === 'string'
      ? parsed
      : stored;
  }
  catch
  {
    return stored;
  }
};

/**
 * Writes a note argument the way MZ stores it.
 * @param {string} note The note.
 * @returns {string} The stored text.
 */
const encodeNote = (note: string): string =>
{
  return JSON.stringify(note);
};

export { decodeList, decodeNote, decodeStruct, encodeList, encodeNote, encodeStruct, parseArgType };
export type { PluginArgType };
