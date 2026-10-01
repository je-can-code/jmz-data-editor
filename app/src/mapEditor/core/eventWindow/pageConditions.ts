import type { CommandFieldKind } from '../commands/catalogTypes.ts';
import type { NameLookup } from '../commands/sentence.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import type { RmmzEventConditions } from '../model/rmmzTypes.ts';
import {
  locatePage,
  pagePath,
  pageWords,
  recordEventStep,
  targetDocument,
  type EditRefusal,
  type EventWindowTarget,
  type PageOutcome,
} from './eventWindowTarget.ts';

/**
 * The six things a page can wait for before it is the one that runs, in the order MZ lists them: two switches, a
 * variable at or above a value, one of the event's self switches, an item in the inventory, and an actor in the party.
 */
type ConditionKind = 'switch1' | 'switch2' | 'variable' | 'selfSwitch' | 'item' | 'actor';

/**
 * The conditions that name a switch, a variable or a database row by id.
 */
type IdConditionKind = Exclude<ConditionKind, 'selfSwitch'>;

/**
 * The letters of an event's self switches.
 */
type SelfSwitchLetter = 'A' | 'B' | 'C' | 'D';

/**
 * One condition as the event window shows it: whether the page waits for it, and what it waits for. A condition the
 * page does not wait for keeps its values, as MZ keeps them, so turning it back on finds them where they were.
 */
type PageConditionRow =
  | { readonly kind: 'switch1' | 'switch2' | 'item' | 'actor'; readonly enabled: boolean; readonly id: number }
  | { readonly kind: 'variable'; readonly enabled: boolean; readonly id: number; readonly value: number }
  | { readonly kind: 'selfSwitch'; readonly enabled: boolean; readonly letter: string };

/**
 * One change the author makes to a condition: turning it on or off, picking its switch, variable or row, setting the
 * value a variable must reach, or picking the self switch.
 */
type ConditionChange =
  | { readonly kind: ConditionKind; readonly part: 'enabled'; readonly value: boolean }
  | { readonly kind: IdConditionKind; readonly part: 'id'; readonly value: number }
  | { readonly kind: 'variable'; readonly part: 'value'; readonly value: number }
  | { readonly kind: 'selfSwitch'; readonly part: 'letter'; readonly value: string };

/**
 * The one field of a page's conditions a change writes, and the value it writes there.
 */
type ConditionWrite = {
  readonly ok: true;
  readonly field: keyof RmmzEventConditions;
  readonly value: boolean | number | string;
};

/**
 * Where each condition keeps its parts among a page's conditions, exactly as the map file spells them.
 */
const CONDITION_FIELDS: Readonly<Record<ConditionKind, {
  readonly enabled: keyof RmmzEventConditions;
  readonly id?: keyof RmmzEventConditions;
  readonly value?: keyof RmmzEventConditions;
  readonly letter?: keyof RmmzEventConditions;
}>> = {
  switch1: { enabled: 'switch1Valid', id: 'switch1Id' },
  switch2: { enabled: 'switch2Valid', id: 'switch2Id' },
  variable: { enabled: 'variableValid', id: 'variableId', value: 'variableValue' },
  selfSwitch: { enabled: 'selfSwitchValid', letter: 'selfSwitchCh' },
  item: { enabled: 'itemValid', id: 'itemId' },
  actor: { enabled: 'actorValid', id: 'actorId' },
};

/**
 * Every condition, in the order MZ lists them.
 */
const CONDITION_KINDS: readonly ConditionKind[] = [ 'switch1', 'switch2', 'variable', 'selfSwitch', 'item', 'actor' ];

/**
 * The self switch letters, in order.
 */
const SELF_SWITCH_LETTERS: readonly SelfSwitchLetter[] = [ 'A', 'B', 'C', 'D' ];

/**
 * The widest value a variable condition can wait for, either way: the same bound MZ puts on a variable's constants.
 */
const VARIABLE_VALUE_LIMIT = 99_999_999;

/**
 * What each condition is called in the history panel and in a page's summary.
 */
const CONDITION_NOUNS: Readonly<Record<ConditionKind, string>> = {
  switch1: 'switch condition',
  switch2: 'second switch condition',
  variable: 'variable condition',
  selfSwitch: 'self switch condition',
  item: 'item condition',
  actor: 'actor condition',
};

/**
 * Which database list names the id each id condition holds.
 */
const ID_KINDS: Readonly<Record<IdConditionKind, CommandFieldKind>> = {
  switch1: 'switch',
  switch2: 'switch',
  variable: 'variable',
  item: 'item',
  actor: 'actor',
};

/**
 * What the author reads when they ask a condition for something it cannot hold.
 */
const REFUSALS = {
  id: 'Pick one from the list.',
  value: `A variable condition waits for a whole number between -${VARIABLE_VALUE_LIMIT.toLocaleString('en-US')} and ${VARIABLE_VALUE_LIMIT.toLocaleString('en-US')}.`,
  letter: 'A self switch is A, B, C or D.',
} as const;

/**
 * Reads a page's conditions as the event window shows them: one row per condition, in MZ's order.
 * @param {RmmzEventConditions} conditions The page's conditions.
 * @returns {PageConditionRow[]} The rows.
 */
const readPageConditions = (conditions: RmmzEventConditions): PageConditionRow[] =>
{
  return CONDITION_KINDS.map((kind): PageConditionRow =>
  {
    const enabled = conditions[CONDITION_FIELDS[kind].enabled] === true;
    switch (kind)
    {
      case 'variable':
        return { kind, enabled, id: conditions.variableId, value: conditions.variableValue };
      case 'selfSwitch':
        return { kind, enabled, letter: conditions.selfSwitchCh };
      default:
        return { kind, enabled, id: conditions[CONDITION_FIELDS[kind].id as keyof RmmzEventConditions] as number };
    }
  });
};

/**
 * Works out the one field of a page's conditions a change writes, and checks the value can stand there: an id is a
 * whole number from 1, a variable's value a whole number within MZ's bounds, and a self switch one of its four letters.
 * Every other field is left exactly as it is, which is what keeps one condition's edit from reaching another's.
 * @param {ConditionChange} change The change.
 * @returns {ConditionWrite | EditRefusal} The field and its value, or why the change cannot be made.
 */
const encodeConditionChange = (change: ConditionChange): ConditionWrite | EditRefusal =>
{
  const fields = CONDITION_FIELDS[change.kind];
  switch (change.part)
  {
    case 'enabled':
      return { ok: true, field: fields.enabled, value: change.value };
    case 'id':
      return Number.isInteger(change.value) && change.value >= 1
        ? { ok: true, field: fields.id as keyof RmmzEventConditions, value: change.value }
        : { ok: false, message: REFUSALS.id };
    case 'value':
      return Number.isInteger(change.value) && Math.abs(change.value) <= VARIABLE_VALUE_LIMIT
        ? { ok: true, field: 'variableValue', value: change.value }
        : { ok: false, message: REFUSALS.value };
    case 'letter':
      return (SELF_SWITCH_LETTERS as readonly string[]).includes(change.value)
        ? { ok: true, field: 'selfSwitchCh', value: change.value }
        : { ok: false, message: REFUSALS.letter };
  }
};

/**
 * Names a condition change for the history panel: turning a condition on or off reads as such, and anything else as a
 * change to it.
 * @param {ConditionChange} change The change.
 * @param {number} pageIndex The page.
 * @returns {string} Such as "Turn on switch condition (page 2)".
 */
const conditionStepLabel = (change: ConditionChange, pageIndex: number): string =>
{
  const noun = CONDITION_NOUNS[change.kind];
  let verb = 'Change';
  if (change.part === 'enabled')
  {
    verb = change.value ? 'Turn on' : 'Turn off';
  }

  return `${verb} ${noun} (${pageWords(pageIndex)})`;
};

/**
 * Changes one condition of a page, as one step in the event's own history. Exactly one field of the page's conditions
 * is written; a value the condition cannot hold is refused, and nothing changes.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {ConditionChange} change The change.
 * @returns {PageOutcome} The step (null when the value was already there), with the same page to show, or why nothing
 * changed.
 */
const setPageCondition = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, change: ConditionChange): PageOutcome =>
{
  const write = encodeConditionChange(change);
  if (write.ok === false)
  {
    return write;
  }

  const found = locatePage(hub, target, pageIndex);
  if (found.ok === false)
  {
    return found;
  }

  const step = recordEventStep(hub, target, conditionStepLabel(change, pageIndex), transaction =>
  {
    transaction.set(targetDocument(target), [ ...pagePath(target, pageIndex), 'conditions', write.field ], write.value);
  });
  return { ok: true, step, page: pageIndex };
};

/**
 * Writes an id the way MZ shows one, with the row's name when the project has one: switches and variables padded to
 * four digits.
 * @param {CommandFieldKind} kind The kind of id.
 * @param {number} id The id.
 * @param {NameLookup} names Names ids.
 * @returns {string} Such as "#0012 Bridge Lowered" or "#5".
 */
const namedId = (kind: CommandFieldKind, id: number, names: NameLookup): string =>
{
  const number = kind === 'switch' || kind === 'variable'
    ? `#${String(id).padStart(4, '0')}`
    : `#${id}`;
  const name = names(kind, id);
  return name === null || name === ''
    ? number
    : `${number} ${name}`;
};

/**
 * Words one condition the page waits for.
 * @param {PageConditionRow} row The condition, which the page waits for.
 * @param {NameLookup} names Names ids.
 * @returns {string} Such as "Switch #0001 Intro is ON".
 */
const describeCondition = (row: PageConditionRow, names: NameLookup): string =>
{
  switch (row.kind)
  {
    case 'switch1':
    case 'switch2':
      return `Switch ${namedId(ID_KINDS[row.kind], row.id, names)} is ON`;
    case 'variable':
      return `Variable ${namedId('variable', row.id, names)} is ${row.value} or more`;
    case 'selfSwitch':
      return `Self switch ${row.letter} is ON`;
    case 'item':
      return `${namedId('item', row.id, names)} is in the inventory`;
    case 'actor':
      return `${namedId('actor', row.id, names)} is in the party`;
  }
};

/**
 * Words everything a page waits for, for its tab: one line per condition the page waits for, in MZ's order.
 * @param {RmmzEventConditions} conditions The page's conditions.
 * @param {NameLookup} names Names ids; ids read as numbers without a name.
 * @returns {string[]} The lines; empty when the page waits for nothing.
 */
const describePageConditions = (conditions: RmmzEventConditions, names: NameLookup): string[] =>
{
  return readPageConditions(conditions)
    .filter(row => row.enabled)
    .map(row => describeCondition(row, names));
};

export {
  CONDITION_KINDS,
  CONDITION_NOUNS,
  describePageConditions,
  encodeConditionChange,
  ID_KINDS,
  readPageConditions,
  SELF_SWITCH_LETTERS,
  setPageCondition,
  VARIABLE_VALUE_LIMIT,
};
export type { ConditionChange, ConditionKind, ConditionWrite, IdConditionKind, PageConditionRow, SelfSwitchLetter };
