import type { CommandField, CommandFieldKind, CommandParamPath, SentenceParts } from '../catalogTypes.ts';
import { CONSTANT_VARIABLE, FIXED_VARIABLE, INCREASE_DECREASE } from './options.ts';

/**
 * Everything a field can carry beyond its key, label, place and kind.
 */
type FieldExtras = Omit<CommandField, 'key' | 'label' | 'param' | 'kind'>;

/**
 * Builds a field.
 * @param {string} key Its name within the entry.
 * @param {string} label What the form calls it.
 * @param {number | CommandParamPath} param The parameter it lives in, or the full path to it.
 * @param {CommandFieldKind} kind What kind of input it is.
 * @param {FieldExtras} extras Anything else: options, a default, bounds, when it shows.
 * @returns {CommandField} The field.
 */
const field = (
  key: string,
  label: string,
  param: number | CommandParamPath,
  kind: CommandFieldKind,
  extras: FieldExtras = {},
): CommandField =>
{
  return {
    key,
    label,
    param: typeof param === 'number' ? [ param ] : param,
    kind,
    ...extras,
  };
};

/**
 * Builds a sound field, whose value is the whole sound: name, volume, pitch and pan.
 * @param {string} key Its name within the entry.
 * @param {string} label What the form calls it.
 * @param {number} param The parameter it lives in.
 * @param {string} folder The audio folder it picks from.
 * @returns {CommandField} The field.
 */
const audioField = (key: string, label: string, param: number, folder: string): CommandField =>
{
  return field(key, label, param, 'audio', { folder, default: { name: '', volume: 90, pitch: 100, pan: 0 } });
};

/**
 * The three fields of an amount MZ adds or takes away: which way, whether it is typed in or read from a variable,
 * and the amount or the variable.
 * @param {number} at The parameter holding the operation; the operand type and amount follow it.
 * @param {string} label What the amount is called.
 * @returns {CommandField[]} The fields: {@code operation}, {@code operandType}, {@code constant}, {@code variable}.
 */
const operandFields = (at: number, label: string): CommandField[] =>
{
  return [
    field('operation', 'Operation', at, 'select', { options: INCREASE_DECREASE, default: 0 }),
    field('operandType', 'Operand', at + 1, 'select', { options: CONSTANT_VARIABLE, default: 0 }),
    field('constant', label, at + 2, 'number', { default: 1, min: 0, visibleWhen: { field: 'operandType', equals: 0 } }),
    field('variable', `${label} from`, at + 2, 'variable', { default: 1, visibleWhen: { field: 'operandType', equals: 1 } }),
  ];
};

/**
 * The fields choosing which actors a command acts on: a fixed actor (or the whole party), or the actor whose id a
 * variable holds.
 * @returns {CommandField[]} The fields: {@code actorType}, {@code actor}, {@code actorVariable}.
 */
const actorTargetFields = (): CommandField[] =>
{
  return [
    field('actorType', 'Actor', 0, 'select', { options: FIXED_VARIABLE, default: 0 }),
    field('actor', 'Actor', 1, 'actor', {
      default: 0,
      options: [ { value: 0, label: 'Entire Party' } ],
      visibleWhen: { field: 'actorType', equals: 0 },
    }),
    field('actorVariable', 'Actor from', 1, 'variable', { default: 1, visibleWhen: { field: 'actorType', equals: 1 } }),
  ];
};

/**
 * Says an amount the way a row reads it: a sign, then the number or the variable it comes from.
 * @param {SentenceParts} parts The command's parts, with {@link operandFields}.
 * @returns {string} Such as "+ 100" or "- Variable #0002 Cost".
 */
const operandPhrase = (parts: SentenceParts): string =>
{
  const sign = parts.value('operation') === 1
    ? '-'
    : '+';
  const amount = parts.value('operandType') === 1
    ? parts.text('variable')
    : parts.text('constant');
  return `${sign} ${amount}`;
};

/**
 * Says which actors a command acts on.
 * @param {SentenceParts} parts The command's parts, with {@link actorTargetFields}.
 * @returns {string} Such as "Entire Party", "#1 Harold" or "the actor in #0005 Hero".
 */
const actorTargetPhrase = (parts: SentenceParts): string =>
{
  return parts.value('actorType') === 1
    ? `the actor in ${parts.text('actorVariable')}`
    : parts.text('actor');
};

/**
 * Says a number of frames.
 * @param {unknown} frames The frames.
 * @returns {string} Such as "30 frames" or "1 frame".
 */
const framesPhrase = (frames: unknown): string =>
{
  return frames === 1
    ? '1 frame'
    : `${String(frames)} frames`;
};

/**
 * Appends a note in parentheses when there is anything to note.
 * @param {string} sentence The sentence.
 * @param {readonly (string | false)[]} notes The notes; false for a note that does not apply.
 * @returns {string} The sentence, with its notes.
 */
const withNotes = (sentence: string, notes: readonly (string | false)[]): string =>
{
  const shown = notes.filter((note): note is string => note !== false && note !== '');
  return shown.length === 0
    ? sentence
    : `${sentence} (${shown.join(', ')})`;
};

export {
  actorTargetFields,
  actorTargetPhrase,
  audioField,
  field,
  framesPhrase,
  operandFields,
  operandPhrase,
  withNotes,
};
export type { FieldExtras };
