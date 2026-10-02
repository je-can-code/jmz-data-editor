import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import type { CommandEditorRegistry } from '../commands/CommandEditorRegistry.ts';
import type { CommandDraft } from '../commands/fieldValues.ts';
import { isJsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';

/**
 * Which editor a row unfolds into.
 *
 * - {@code hand-built}: one registered for the command (Show Text, Conditional Branch and the rest).
 * - {@code generated}: the form its catalog entry's fields generate.
 * - {@code raw}: its parameters as JSON, for a command no entry describes (a plugin whose header was never read).
 * - {@code none}: nothing to set, as for Erase Event.
 */
type RowEditorKind = 'hand-built' | 'generated' | 'raw' | 'none';

/**
 * Chooses the editor a row unfolds into: a hand-built one when registered, else the generated form when the entry
 * has inputs, else the raw JSON when the command holds anything, else nothing. Every command gets one of these, so
 * no row is ever a dead end.
 * @param {CommandEditorRegistry<unknown>} registry The hand-built editors.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {CommandDraft} draft The command and its lines.
 * @returns {RowEditorKind} The editor.
 */
const chooseRowEditor = (registry: CommandEditorRegistry<unknown>, entry: CommandCatalogEntry, draft: CommandDraft): RowEditorKind =>
{
  if (registry.editorFor(entry) !== null)
  {
    return 'hand-built';
  }

  if (entry.fields.length > 0 || (entry.continuationFields ?? []).length > 0)
  {
    return 'generated';
  }

  return draft.command.parameters.length > 0 || draft.continuation.length > 0
    ? 'raw'
    : 'none';
};

/**
 * Writes a command and its lines as the raw editor shows them: the parameters, and each line's parameters.
 * @param {CommandDraft} draft The command and its lines.
 * @returns {string} Indented JSON.
 */
const rawCommandText = (draft: CommandDraft): string =>
{
  return JSON.stringify({ parameters: draft.command.parameters, lines: draft.continuation.map(line => line.parameters) }, null, 2);
};

/**
 * What reading the raw editor's text found: the edited command, or what is wrong with the text.
 */
type RawCommandRead = { readonly ok: true; readonly draft: CommandDraft } | { readonly ok: false; readonly message: string };

/**
 * Parses text as JSON, or answers why it is not.
 * @param {string} text The text.
 * @returns {{ value: JsonValue } | { message: string }} The value, or the problem.
 */
const parseJson = (text: string): { value: JsonValue } | { message: string } =>
{
  try
  {
    return { value: JSON.parse(text) as JsonValue };
  }
  catch (error)
  {
    return { message: `That is not valid JSON: ${(error as Error).message}` };
  }
};

/**
 * Reads the raw editor's text back into the command: its parameters, and one line per list of line parameters,
 * each existing line keeping its code and anything else it carried, new lines taking the continuation code.
 * @param {string} text The edited text.
 * @param {CommandDraft} draft The command as it was.
 * @param {number | undefined} continuationCode The code of the command's lines, for lines added.
 * @returns {RawCommandRead} The edited command, or what is wrong.
 */
const readRawCommandText = (text: string, draft: CommandDraft, continuationCode: number | undefined): RawCommandRead =>
{
  const parsed = parseJson(text);
  if ('message' in parsed)
  {
    return { ok: false, message: parsed.message };
  }

  const { value } = parsed;
  if (isJsonObject(value) === false || Array.isArray(value['parameters']) === false)
  {
    return { ok: false, message: 'Give the parameters as a list under "parameters".' };
  }

  const lines = value['lines'] ?? [];
  if (Array.isArray(lines) === false || lines.every(line => Array.isArray(line)) === false)
  {
    return { ok: false, message: 'Give the lines as a list of parameter lists under "lines".' };
  }

  if (lines.length > draft.continuation.length && continuationCode === undefined)
  {
    return { ok: false, message: 'This command takes no more lines.' };
  }

  const continuation = (lines as JsonValue[][]).map((parameters, position): RmmzEventCommand =>
  {
    const line = draft.continuation[position];
    return line === undefined
      ? { code: continuationCode as number, indent: draft.command.indent, parameters }
      : { ...line, parameters };
  });

  return { ok: true, draft: { command: { ...draft.command, parameters: value['parameters'] }, continuation } };
};

export { chooseRowEditor, rawCommandText, readRawCommandText };
export type { RawCommandRead, RowEditorKind };
