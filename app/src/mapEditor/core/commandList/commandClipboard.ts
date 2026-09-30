import { isJsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import { END_CODE, readCommandTree, type CommandStructure } from './commandTree.ts';
import { toRelativeIndent } from './listEdits.ts';

/**
 * The marker a clipboard of commands carries, so a paste can tell commands from any other text, and from another
 * program's JSON.
 */
const CLIPBOARD_FORMAT = 'jmz-map-editor/commands';

/**
 * The version of the clipboard's shape.
 */
const CLIPBOARD_VERSION = 1;

/**
 * What reading the clipboard found: commands to paste, or why there are none.
 *
 * - {@code not-commands}: the clipboard holds something else (text, another program's data); a paste ignores it.
 * - {@code broken}: it says it holds commands, but they do not read as whole commands, so nothing is pasted rather
 *   than half a block.
 */
type ClipboardRead =
  | { readonly ok: true; readonly commands: RmmzEventCommand[] }
  | { readonly ok: false; readonly reason: 'not-commands' | 'broken' };

/**
 * Writes commands for the system clipboard: JSON, marked as commands, their indents made relative so they paste at
 * any depth. The system clipboard carries them across maps, windows, and copies of the editor.
 * @param {readonly RmmzEventCommand[]} commands Whole units, in order.
 * @returns {string} The clipboard text.
 */
const writeClipboard = (commands: readonly RmmzEventCommand[]): string =>
{
  return JSON.stringify({ format: CLIPBOARD_FORMAT, version: CLIPBOARD_VERSION, commands: toRelativeIndent(commands) });
};

/**
 * Reports whether a value is shaped like an event command: a whole code and indent, and a parameter list.
 * @param {JsonValue} value The value.
 * @returns {boolean} True when it is one.
 */
const isCommand = (value: JsonValue): boolean =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { code, indent, parameters } = value;
  return Number.isInteger(code)
    && Number.isInteger(indent)
    && (indent as number) >= 0
    && Array.isArray(parameters);
};

/**
 * Parses clipboard text as JSON, or answers null for anything that is not.
 * @param {string} text The text.
 * @returns {JsonValue | null} The value.
 */
const parseJson = (text: string): JsonValue | null =>
{
  try
  {
    return JSON.parse(text) as JsonValue;
  }
  catch
  {
    return null;
  }
};

/**
 * Reads commands off the system clipboard. Only text this editor wrote counts; the commands must be whole units
 * that read as MZ's shapes at the top level (no half block, no stray end), so a paste can never break the list it
 * lands in.
 * @param {string} text The clipboard text.
 * @param {CommandStructure} structure How commands nest.
 * @returns {ClipboardRead} The commands, at relative indents, or why there are none.
 */
const readClipboard = (text: string, structure: CommandStructure): ClipboardRead =>
{
  const value = parseJson(text);
  if (isJsonObject(value) === false || value['format'] !== CLIPBOARD_FORMAT)
  {
    return { ok: false, reason: 'not-commands' };
  }

  const { version, commands } = value;
  if (version !== CLIPBOARD_VERSION || Array.isArray(commands) === false || commands.length === 0 || commands.every(isCommand) === false)
  {
    return { ok: false, reason: 'broken' };
  }

  // read them as a list of their own: whole units at the top level, closed by an end, strays none. An end of their
  // own at the top would close that list early and leave the rest trailing, which counts as a stray too.
  const relative = toRelativeIndent(commands as unknown as RmmzEventCommand[]);
  const closed = [ ...relative, { code: END_CODE, indent: 0, parameters: [] } ];
  return readCommandTree(closed, structure).irregular > 0
    ? { ok: false, reason: 'broken' }
    : { ok: true, commands: relative };
};

export { CLIPBOARD_FORMAT, readClipboard, writeClipboard };
export type { ClipboardRead };
