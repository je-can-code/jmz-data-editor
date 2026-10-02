import { isJsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import type { CommandCatalogEntry, CommandField, CommandFieldKind, SentenceParts } from './catalogTypes.ts';
import { readFieldValue } from './fieldValues.ts';

/**
 * Names database rows for sentences: a switch's name, an actor's name. The event window builds one from
 * {@code System.json} and the database; without one, ids read as numbers.
 */
type NameLookup = (kind: CommandFieldKind, id: number) => string | null;

/**
 * The kinds whose value is an id the lookup can name.
 */
const NAMED_KINDS: ReadonlySet<CommandFieldKind> = new Set([
  'switch', 'variable', 'actor', 'class', 'skill', 'item', 'weapon', 'armor', 'enemy', 'troop', 'state',
  'animation', 'tileset', 'common-event', 'map',
]);

/**
 * Matches a {@code {field}} placeholder in a sentence template.
 */
const PLACEHOLDER = /\{([A-Za-z0-9_-]+)\}/gu;

/**
 * Lists the fields a sentence template names.
 * @param {string} template The template.
 * @returns {string[]} The field keys, in order.
 */
const templateFields = (template: string): string[] =>
{
  return [ ...template.matchAll(PLACEHOLDER) ].map(([ , key ]) => key);
};

/**
 * Reads a stored value as the number it means, for id fields; plugin arguments keep numbers as text.
 * @param {JsonValue | undefined} value The stored value.
 * @returns {number | null} The number, or null when it is not one.
 */
const asNumber = (value: JsonValue | undefined): number | null =>
{
  const number = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value;

  return typeof number === 'number' && Number.isFinite(number)
    ? number
    : null;
};

/**
 * Names a character the way commands address one: below zero the player, zero the event running the command, and
 * anything above an event of the map by id.
 * @param {number} id The character id.
 * @returns {string} Such as "Player", "This Event" or "Event #5".
 */
const characterName = (id: number): string =>
{
  if (id < 0)
  {
    return 'Player';
  }

  return id === 0
    ? 'This Event'
    : `Event #${id}`;
};

/**
 * Writes the value of a field whose kind reads in its own way: a character, a tone or color, a sound.
 * @param {CommandField} field The field.
 * @param {JsonValue | undefined} value Its value.
 * @returns {string | null} The text, or null when the kind has no way of its own.
 */
const formatKindValue = (field: CommandField, value: JsonValue | undefined): string | null =>
{
  // a character reads as who it is: the player, the event running the command, or another event.
  if (field.kind === 'event' && typeof value === 'number')
  {
    return characterName(value);
  }

  // a tone or a color reads as its channels.
  if (field.kind === 'color' && Array.isArray(value))
  {
    return `(${value.map(channel => String(channel)).join(', ')})`;
  }

  // a sound reads as its file name.
  if (field.kind === 'audio' && isJsonObject(value) && typeof value['name'] === 'string')
  {
    return value['name'] === ''
      ? 'None'
      : value['name'];
  }

  return null;
};

/**
 * Writes a field's value the way a row reads it.
 * @param {CommandField} field The field.
 * @param {JsonValue | undefined} value Its value.
 * @param {NameLookup} names Names database rows.
 * @returns {string} The text.
 */
const formatValue = (field: CommandField, value: JsonValue | undefined, names: NameLookup): string =>
{
  // a choice reads as its label.
  const option = field.options?.find(each => String(each.value) === String(value));
  if (option !== undefined)
  {
    return option.label;
  }

  // an id reads as its row's name, padded the way MZ pads switch and variable numbers.
  const id = asNumber(value);
  if (NAMED_KINDS.has(field.kind) && id !== null)
  {
    const name = names(field.kind, id);
    const number = field.kind === 'switch' || field.kind === 'variable'
      ? `#${String(id).padStart(4, '0')}`
      : `#${id}`;
    return name === null || name === ''
      ? number
      : `${number} ${name}`;
  }

  const kindText = formatKindValue(field, value);
  if (kindText !== null)
  {
    return kindText;
  }

  if (typeof value === 'boolean')
  {
    return value
      ? 'On'
      : 'Off';
  }

  if (value === undefined || value === null)
  {
    return '';
  }

  // anything else structured reads as its JSON, so nothing is ever hidden from the row.
  return typeof value === 'object'
    ? JSON.stringify(value)
    : String(value);
};

/**
 * Builds the pieces a sentence is made of for one command.
 * @param {CommandCatalogEntry} entry The command's catalog entry.
 * @param {RmmzEventCommand} command The command.
 * @param {readonly RmmzEventCommand[]} continuation The lines continuing it.
 * @param {NameLookup} names Names database rows.
 * @returns {SentenceParts} The parts.
 */
const sentenceParts = (
  entry: CommandCatalogEntry,
  command: RmmzEventCommand,
  continuation: readonly RmmzEventCommand[],
  names: NameLookup,
): SentenceParts =>
{
  const fieldOf = (key: string): CommandField =>
  {
    const field = entry.fields.find(each => each.key === key);
    if (field === undefined)
    {
      throw new Error(`${entry.id} has no field "${key}"`);
    }

    return field;
  };

  // a field spanning lines reads as its joined lines, so a template can name Show Text's text like any field.
  const draft = { command, continuation };
  return {
    command,
    continuation,
    value: key => readFieldValue(draft, fieldOf(key)),
    text: key => formatValue(fieldOf(key), readFieldValue(draft, fieldOf(key)), names),
  };
};

/**
 * Writes the sentence a command's row reads as.
 * @param {CommandCatalogEntry} entry The command's catalog entry.
 * @param {RmmzEventCommand} command The command.
 * @param {readonly RmmzEventCommand[]} continuation The lines continuing it; empty when it has none.
 * @param {NameLookup} names Names database rows; ids read as numbers without one.
 * @returns {string} The sentence.
 */
const renderSentence = (
  entry: CommandCatalogEntry,
  command: RmmzEventCommand,
  continuation: readonly RmmzEventCommand[] = [],
  names: NameLookup = () => null,
): string =>
{
  const parts = sentenceParts(entry, command, continuation, names);
  if (typeof entry.sentence === 'function')
  {
    return entry.sentence(parts);
  }

  return entry.sentence.replace(PLACEHOLDER, (_match, key: string) => parts.text(key));
};

export { formatValue, renderSentence, templateFields };
export type { NameLookup };
