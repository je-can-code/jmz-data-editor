import { cloneJson, isJsonObject, jsonEquals, type JsonValue } from '../model/json.ts';
import { readAt } from '../model/patches.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import type { CommandCatalogEntry, CommandField, CommandParamPath } from './catalogTypes.ts';
import { isFieldVisible, type FieldValues } from './commandFields.ts';

/**
 * A command and the lines continuing it: what one row edits as a whole.
 */
type CommandDraft = {
  readonly command: RmmzEventCommand;
  readonly continuation: readonly RmmzEventCommand[];
};

/**
 * Where each entry of a list field came from when the field changed: the entry's place before the change, or null
 * for one just added. Removing the first of three texts gives {@code [1, 2]}; adding one gives {@code [0, 1, 2,
 * null]}. A block whose branches follow such a list (Show Choices' branches follow its choices) needs it, since the
 * texts alone cannot say whether a choice was removed or two were renamed.
 */
type ListOrigins = readonly (number | null)[];

/**
 * Reads the text one line holds at a path, as text.
 * @param {RmmzEventCommand} line The line.
 * @param {CommandParamPath} path Where its text sits in its parameters.
 * @returns {string} The text; empty when absent.
 */
const lineText = (line: RmmzEventCommand, path: CommandParamPath): string =>
{
  const value = readAt(line.parameters, path);
  return typeof value === 'string'
    ? value
    : String(value ?? '');
};

/**
 * Reads a field's value out of a command and its lines: the joined lines for a field spanning them, the value at
 * its path otherwise.
 * @param {CommandDraft} draft The command and its lines.
 * @param {CommandField} field The field.
 * @returns {JsonValue | undefined} The value, or undefined when the command lacks it.
 */
const readFieldValue = (draft: CommandDraft, field: CommandField): JsonValue | undefined =>
{
  const { command, continuation } = draft;
  switch (field.lines)
  {
    case 'continuation':
      return continuation.map(line => lineText(line, field.param)).join('\n');
    case 'first-and-continuation':
      return [ command, ...continuation ].map(line => lineText(line, field.param)).join('\n');
    default:
      return readAt(command.parameters, field.param);
  }
};

/**
 * Reads every field of an entry out of a command and its lines.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {CommandDraft} draft The command and its lines.
 * @returns {FieldValues} The values, by field key.
 */
const formValues = (entry: CommandCatalogEntry, draft: CommandDraft): FieldValues =>
{
  return Object.fromEntries(entry.fields.map(field => [ field.key, readFieldValue(draft, field) ]));
};

/**
 * Turns a value into what a field keeps: itself, or text for fields stored as text (plugin arguments), where
 * structured values are kept as their JSON the way MZ keeps them.
 * @param {CommandField} field The field.
 * @param {JsonValue} value The value.
 * @returns {JsonValue} What to store.
 */
const storedValue = (field: CommandField, value: JsonValue): JsonValue =>
{
  if (field.storage !== 'string' || typeof value === 'string')
  {
    return value;
  }

  return typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value);
};

/**
 * Makes an empty container for the next step of a path: a list for an index, an object for a key.
 * @param {number | string} segment The next step.
 * @returns {JsonValue} The container.
 */
const containerFor = (segment: number | string): JsonValue =>
{
  return typeof segment === 'number'
    ? []
    : {};
};

/**
 * Writes one step of a path into a container, in place, filling any gap in a list with nulls so it never holds
 * holes.
 * @param {JsonValue} container The list or object.
 * @param {number | string} segment Where to write.
 * @param {JsonValue} value What to write.
 */
const writeStep = (container: JsonValue, segment: number | string, value: JsonValue): void =>
{
  if (Array.isArray(container) && typeof segment === 'number')
  {
    while (container.length < segment)
    {
      container.push(null);
    }

    container[segment] = value;
    return;
  }

  if (isJsonObject(container) && typeof segment === 'string')
  {
    container[segment] = value;
    return;
  }

  throw new Error(`cannot write step ${String(segment)} into ${JSON.stringify(container)}`);
};

/**
 * Copies a command's parameters with one value written at a path, building any container the path passes
 * through that the parameters lack.
 * @param {readonly JsonValue[]} parameters The parameters; never changed.
 * @param {CommandParamPath} path Where to write; never empty.
 * @param {JsonValue} value What to write.
 * @returns {JsonValue[]} The new parameters.
 */
const writeParameter = (parameters: readonly JsonValue[], path: CommandParamPath, value: JsonValue): JsonValue[] =>
{
  if (path.length === 0)
  {
    throw new Error('a field needs a parameter to live in');
  }

  const copy = cloneJson([ ...parameters ]);
  let container: JsonValue = copy;
  path.slice(0, -1).forEach((segment, position) =>
  {
    const next = readAt(container, [ segment ]);
    const child = next !== undefined && next !== null && typeof next === 'object'
      ? next
      : containerFor(path[position + 1]);
    writeStep(container, segment, child);
    container = child;
  });
  writeStep(container, path[path.length - 1], cloneJson(value));
  return copy;
};

/**
 * Builds the lines holding some text, one per line of it: reusing each existing line in turn (so any key MZ put on
 * it survives) and making new ones as needed.
 * @param {readonly string[]} texts The lines of text.
 * @param {readonly RmmzEventCommand[]} existing The lines there now.
 * @param {CommandParamPath} path Where the text sits in each line's parameters.
 * @param {RmmzEventCommand} head The command the lines continue, for their indent.
 * @param {number | undefined} code The continuation code.
 * @returns {RmmzEventCommand[]} The lines.
 */
const textLines = (
  texts: readonly string[],
  existing: readonly RmmzEventCommand[],
  path: CommandParamPath,
  head: RmmzEventCommand,
  code: number | undefined,
): RmmzEventCommand[] =>
{
  return texts.map((text, position) =>
  {
    const line = existing[position];
    if (line !== undefined)
    {
      return { ...line, parameters: writeParameter(line.parameters, path, text) };
    }

    if (code === undefined)
    {
      throw new Error(`code ${head.code} has no continuation lines to hold more text`);
    }

    return { code, indent: head.indent, parameters: writeParameter([], path, text) };
  });
};

/**
 * Writes a field's value into a command and its lines. Writing the value already there changes nothing and hands
 * back the same draft; otherwise only the field's own parameter (or its lines) changes, and every other key of the
 * command, {@code collapsed} included, is kept.
 * @param {CommandDraft} draft The command and its lines.
 * @param {CommandField} field The field.
 * @param {JsonValue} value The new value.
 * @param {number | undefined} continuationCode The code of the command's continuation lines, for text that grows.
 * @returns {CommandDraft} The command and its lines, as written.
 */
const writeFieldValue = (
  draft: CommandDraft,
  field: CommandField,
  value: JsonValue,
  continuationCode?: number,
): CommandDraft =>
{
  // text spanning lines is compared as the joined text; anything else as it would be stored.
  const stored = field.lines === undefined
    ? storedValue(field, value)
    : value;
  if (jsonEquals(readFieldValue(draft, field), stored))
  {
    return draft;
  }

  const { command, continuation } = draft;
  const text = String(value ?? '');
  switch (field.lines)
  {
    case 'continuation':
    {
      // an empty text is no lines at all, which is how MZ writes a message with nothing in it.
      const texts = text === '' ? [] : text.split('\n');
      return { command, continuation: textLines(texts, continuation, field.param, command, continuationCode) };
    }
    case 'first-and-continuation':
    {
      const [ first, ...rest ] = text.split('\n');
      return {
        command: { ...command, parameters: writeParameter(command.parameters, field.param, first) },
        continuation: textLines(rest, continuation, field.param, command, continuationCode),
      };
    }
    default:
      return { command: { ...command, parameters: writeParameter(command.parameters, field.param, stored) }, continuation };
  }
};

/**
 * Starts every field that a change just brought into view at its default, since whatever its parameter held
 * belonged to the field shown there before (a transfer switched to variables finds a map id where a variable id
 * should be). A default can bring further fields into view (game data switched on shows its kind, and the kind's
 * default shows an item), so it repeats until nothing new shows; each field is started at most once.
 * @param {readonly CommandField[]} fields The fields.
 * @param {FieldValues} before The values before the change.
 * @param {CommandDraft} draft The command after the change.
 * @param {(draft: CommandDraft) => FieldValues} read Reads the values of a draft.
 * @param {string} changed The field that was changed, which keeps its new value.
 * @param {number | undefined} continuationCode The continuation code, for text fields.
 * @returns {CommandDraft} The command with the newly shown fields at their defaults.
 */
const defaultNewlyVisible = (
  fields: readonly CommandField[],
  before: FieldValues,
  draft: CommandDraft,
  read: (each: CommandDraft) => FieldValues,
  changed: string,
  continuationCode: number | undefined,
): CommandDraft =>
{
  const started = new Set<string>([ changed ]);
  let current = draft;
  for (;;)
  {
    const after = read(current);
    const shown = fields
      .filter(field => started.has(field.key) === false && field.default !== undefined)
      .filter(field => isFieldVisible(field, before) === false && isFieldVisible(field, after));
    if (shown.length === 0)
    {
      return current;
    }

    shown.forEach(field => started.add(field.key));
    current = shown.reduce((each, field) => writeFieldValue(each, field, field.default as JsonValue, continuationCode), current);
  }
};

/**
 * Finds a field by key.
 * @param {readonly CommandField[]} fields The fields.
 * @param {string} key The key.
 * @param {string} entryId The entry, for the error.
 * @returns {CommandField} The field.
 */
const requireField = (fields: readonly CommandField[], key: string, entryId: string): CommandField =>
{
  const field = fields.find(each => each.key === key);
  if (field === undefined)
  {
    throw new Error(`${entryId} has no field "${key}"`);
  }

  return field;
};

/**
 * Applies one input's change the way a generated form does: writes the value, starts any field the change brought
 * into view at its default, and rebuilds lines that only mirror the command.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {CommandDraft} draft The command and its lines.
 * @param {string} key The field changed.
 * @param {JsonValue} value Its new value.
 * @returns {CommandDraft} The command and its lines, as changed.
 */
const applyFieldChange = (entry: CommandCatalogEntry, draft: CommandDraft, key: string, value: JsonValue): CommandDraft =>
{
  const field = requireField(entry.fields, key, entry.id);
  const read = (each: CommandDraft) => formValues(entry, each);
  const before = read(draft);
  const written = writeFieldValue(draft, field, value, entry.continuation);
  if (written === draft)
  {
    return draft;
  }

  const shown = defaultNewlyVisible(entry.fields, before, written, read, key, entry.continuation);
  return entry.deriveContinuation === undefined
    ? shown
    : { command: shown.command, continuation: entry.deriveContinuation(shown.command) };
};

/**
 * Reads every continuation field of one continuation line.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {RmmzEventCommand} line The line.
 * @returns {FieldValues} The values, by field key.
 */
const lineValues = (entry: CommandCatalogEntry, line: RmmzEventCommand): FieldValues =>
{
  return Object.fromEntries((entry.continuationFields ?? []).map(field => [ field.key, readAt(line.parameters, field.param) ]));
};

/**
 * Applies a change to one input of one continuation line (a shop's further item), the way the head's inputs change.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {CommandDraft} draft The command and its lines.
 * @param {number} row Which line.
 * @param {string} key The field changed.
 * @param {JsonValue} value Its new value.
 * @returns {CommandDraft} The command and its lines, as changed.
 */
const applyLineFieldChange = (
  entry: CommandCatalogEntry,
  draft: CommandDraft,
  row: number,
  key: string,
  value: JsonValue,
): CommandDraft =>
{
  const fields = entry.continuationFields ?? [];
  const field = requireField(fields, key, entry.id);
  const line = draft.continuation[row];
  if (line === undefined)
  {
    throw new Error(`${entry.id} has no line ${row}`);
  }

  // each line edits as a little command of its own.
  const lineDraft: CommandDraft = { command: line, continuation: [] };
  const read = (each: CommandDraft) => lineValues(entry, each.command);
  const before = read(lineDraft);
  const written = writeFieldValue(lineDraft, field, value);
  if (written === lineDraft)
  {
    return draft;
  }

  const shown = defaultNewlyVisible(fields, before, written, read, key, undefined);
  const continuation = draft.continuation.map((each, position) => (position === row ? shown.command : each));
  return { command: draft.command, continuation };
};

/**
 * Builds parameters from fields' defaults, each written where its field lives.
 * @param {readonly CommandField[]} fields The fields.
 * @returns {JsonValue[]} The parameters.
 */
const parametersFromDefaults = (fields: readonly CommandField[]): JsonValue[] =>
{
  return fields
    .filter(field => field.default !== undefined && field.lines === undefined)
    .reduce<JsonValue[]>((parameters, field) => writeParameter(parameters, field.param, storedValue(field, field.default as JsonValue)), []);
};

/**
 * Adds a continuation line at the end, with each continuation field at its default.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {CommandDraft} draft The command and its lines.
 * @returns {CommandDraft} The command with one more line.
 */
const addContinuationLine = (entry: CommandCatalogEntry, draft: CommandDraft): CommandDraft =>
{
  if (entry.continuation === undefined)
  {
    throw new Error(`${entry.id} has no continuation lines`);
  }

  const line: RmmzEventCommand = {
    code: entry.continuation,
    indent: draft.command.indent,
    parameters: parametersFromDefaults(entry.continuationFields ?? []),
  };
  return { command: draft.command, continuation: [ ...draft.continuation, line ] };
};

/**
 * Removes one continuation line.
 * @param {CommandDraft} draft The command and its lines.
 * @param {number} row Which line.
 * @returns {CommandDraft} The command without it.
 */
const removeContinuationLine = (draft: CommandDraft, row: number): CommandDraft =>
{
  return { command: draft.command, continuation: draft.continuation.filter((_, position) => position !== row) };
};

export {
  addContinuationLine,
  applyFieldChange,
  applyLineFieldChange,
  formValues,
  lineValues,
  parametersFromDefaults,
  readFieldValue,
  removeContinuationLine,
  writeFieldValue,
  writeParameter,
};
export type { CommandDraft, ListOrigins };
