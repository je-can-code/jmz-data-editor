import { jsonEquals, type JsonValue } from '../model/json.ts';
import { readAt } from '../model/patches.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import type { CommandCatalogEntry, CommandField, FieldCondition } from './catalogTypes.ts';

/**
 * Every field's value in one command, by field key.
 */
type FieldValues = Readonly<Record<string, JsonValue | undefined>>;

/**
 * Reads a field's value out of a command, where its parameter path points.
 * @param {RmmzEventCommand} command The command.
 * @param {CommandField} field The field.
 * @returns {JsonValue | undefined} The value, or undefined when the command lacks it.
 */
const readField = (command: RmmzEventCommand, field: CommandField): JsonValue | undefined =>
{
  return readAt(command.parameters, field.param);
};

/**
 * Reads every field of an entry out of a command.
 * @param {RmmzEventCommand} command The command.
 * @param {CommandCatalogEntry} entry Its catalog entry.
 * @returns {FieldValues} The values, by field key.
 */
const readFields = (command: RmmzEventCommand, entry: CommandCatalogEntry): FieldValues =>
{
  return Object.fromEntries(entry.fields.map(field => [ field.key, readField(command, field) ]));
};

/**
 * Judges a visibility condition against the fields' values.
 * @param {FieldCondition} condition The condition.
 * @param {FieldValues} values The values.
 * @returns {boolean} True when it holds.
 */
const conditionHolds = (condition: FieldCondition, values: FieldValues): boolean =>
{
  if ('all' in condition)
  {
    return condition.all.every(each => conditionHolds(each, values));
  }

  if ('any' in condition)
  {
    return condition.any.some(each => conditionHolds(each, values));
  }

  if ('not' in condition)
  {
    return conditionHolds(condition.not, values) === false;
  }

  const value = values[condition.field];
  return 'equals' in condition
    ? jsonEquals(value, condition.equals)
    : condition.oneOf.some(option => jsonEquals(value, option));
};

/**
 * Reports whether a field shows, given the other fields' values.
 * @param {CommandField} field The field.
 * @param {FieldValues} values Every field's value.
 * @returns {boolean} True when it shows.
 */
const isFieldVisible = (field: CommandField, values: FieldValues): boolean =>
{
  return field.visibleWhen === undefined || conditionHolds(field.visibleWhen, values);
};

/**
 * Lists the field keys a condition refers to, so an entry can be checked for references to fields it lacks.
 * @param {FieldCondition} condition The condition.
 * @returns {string[]} The keys.
 */
const conditionFields = (condition: FieldCondition): string[] =>
{
  if ('all' in condition)
  {
    return condition.all.flatMap(conditionFields);
  }

  if ('any' in condition)
  {
    return condition.any.flatMap(conditionFields);
  }

  if ('not' in condition)
  {
    return conditionFields(condition.not);
  }

  return [ condition.field ];
};

export { conditionFields, conditionHolds, isFieldVisible, readField, readFields };
export type { FieldValues };
