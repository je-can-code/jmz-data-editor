import { jsonEquals, type JsonValue } from '../../core/model/json.ts';
import type { BattlerReading, BattlerSource, BattlerValue } from './battlerReading.ts';
import { TEAMS } from './battlerReading.ts';

/**
 * Where the value the picked battlers fight with comes from, or that they differ in it.
 */
type RowSource = BattlerSource | 'mixed';

/**
 * One row of the battler panel for the picked battlers: the value they fight with, or none when they differ, where it
 * comes from, whether any of their pages sets it (which is when it can be taken out), and a line saying what taking it
 * out would leave, or anything else the author should know about it.
 */
type RowModel<T> = {
  readonly value: T | null;
  readonly mixed: boolean;
  readonly from: RowSource;
  readonly set: boolean;
  readonly note: string | null;
};

/**
 * What each source is called on a row's mark, in an author's words.
 */
const SOURCE_WORDS: Readonly<Record<RowSource, string>> = {
  event: 'This battler',
  enemy: 'Enemy',
  default: 'Default',
  page: 'Page speed',
  inanimate: 'Inanimate',
  mixed: 'Mixed',
};

/**
 * The teams J-ABS knows, by number, as an author knows them.
 */
const TEAM_WORDS: Readonly<Record<number, string>> = {
  [TEAMS.allies]: 'Allies',
  [TEAMS.enemies]: 'Enemies',
  [TEAMS.neutral]: 'Neutral',
};

/**
 * Names a team by its number: one J-ABS knows by its name, any other by its number.
 * @param {number} team The team.
 * @returns {string} Such as "Enemies", or "Team 7".
 */
const teamWords = (team: number): string =>
{
  return TEAM_WORDS[team] ?? `Team ${team}`;
};

/**
 * Words a switch's state.
 * @param {boolean} on Whether it is on.
 * @returns {string} "on" or "off".
 */
const switchWords = (on: boolean): string =>
{
  return on ? 'on' : 'off';
};

/**
 * Words a set of AI traits or roles, each with a capital, or none.
 * @param {readonly string[]} words The set.
 * @returns {string} Such as "Careful, Healer", or "none".
 */
const setWords = (words: readonly string[]): string =>
{
  return words.length === 0
    ? 'none'
    : words.map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(', ');
};

/**
 * Finds the one thing every picked battler holds alike, or that they differ.
 * @param {readonly T[]} values Each battler's.
 * @returns {{ value: T | null, mixed: boolean }} The value they share, or null and mixed when they differ.
 */
const shared = <T>(values: readonly T[]): { value: T | null; mixed: boolean } =>
{
  const [ first ] = values;
  if (first === undefined)
  {
    return { value: null, mixed: false };
  }

  return values.every(value => jsonEquals(value as JsonValue, first as JsonValue))
    ? { value: first, mixed: false }
    : { value: null, mixed: true };
};

/**
 * Says what taking a row's own value out of the page would leave, for battlers whose pages set it: the enemy's value, or
 * J-ABS's default where the enemy sets none, when every picked battler would be left alike.
 * @param {readonly BattlerValue<T>[]} values Each battler's value.
 * @param {(value: T) => string} words Words a value.
 * @param {(value: BattlerValue<T>, index: number) => T} fallbackOf What a battler falls back to, with the page's own
 * value taken out, given the battler's value and its place among the picked.
 * @returns {string | null} The line, or null when the battlers set nothing or would be left differently.
 */
const fallbackNote = <T>(values: readonly BattlerValue<T>[], words: (value: T) => string, fallbackOf: (value: BattlerValue<T>, index: number) => T): string | null =>
{
  const enemies = shared(values.map(value => value.enemy));
  const fallbacks = shared(values.map(fallbackOf));
  if (values.some(value => value.from !== 'event') || fallbacks.mixed || fallbacks.value === null)
  {
    return null;
  }

  return enemies.value === null || enemies.mixed
    ? `Default: ${words(fallbacks.value as T)}`
    : `Enemy: ${words(fallbacks.value as T)}`;
};

/**
 * Builds a row for one of the battler's values: the value the picked battlers fight with, where it comes from, and
 * what taking each one's own out of its page would leave.
 * @param {readonly BattlerValue<T>[]} values Each battler's value.
 * @param {(value: T) => string} words Words a value.
 * @param {(value: BattlerValue<T>, index: number) => T} fallbackOf What a battler falls back to with its page's own value
 * taken out, given the battler's value and its place among the picked.
 * @returns {RowModel<T>} The row.
 */
const rowOf = <T>(values: readonly BattlerValue<T>[], words: (value: T) => string, fallbackOf: (value: BattlerValue<T>, index: number) => T): RowModel<T> =>
{
  const { value, mixed } = shared(values.map(each => each.value));
  const from = shared(values.map(each => each.from));
  return {
    value,
    mixed,
    from: from.mixed || from.value === null ? 'mixed' : from.value,
    set: values.some(each => each.event !== null),
    note: fallbackNote(values, words, fallbackOf),
  };
};

/**
 * Builds a row for one of a battler's numbers, falling back from the page to the enemy and then J-ABS's default.
 * @param {readonly BattlerValue<number>[]} values Each battler's value.
 * @param {number} fallback J-ABS's default.
 * @param {(value: number) => string} words Words a value; its digits by default.
 * @returns {RowModel<number>} The row.
 */
const numberRow = (values: readonly BattlerValue<number>[], fallback: number, words: (value: number) => string = String): RowModel<number> =>
{
  return rowOf(values, words, value => value.enemy ?? fallback);
};

/**
 * Builds the move speed's row: the page's tag, or the page's own speed, which is all taking the tag out leaves.
 * @param {readonly BattlerReading[]} readings Each battler.
 * @param {readonly number[]} pageSpeeds Each battler's page's own speed.
 * @returns {RowModel<number>} The row.
 */
const moveSpeedRow = (readings: readonly BattlerReading[], pageSpeeds: readonly number[]): RowModel<number> =>
{
  const row = rowOf(readings.map(reading => reading.moveSpeed), String, value => value.value);
  const speeds = shared(pageSpeeds);
  const set = readings.every(reading => reading.moveSpeed.event !== null);
  return {
    ...row,
    note: set && speeds.mixed === false && speeds.value !== null ? `Page speed: ${speeds.value}` : null,
  };
};

/**
 * Builds one of the switches being inanimate hides (idling, the HP bar or the name): the page's word, the enemy's, its
 * default, or off while inanimate.
 * @param {readonly BattlerValue<boolean>[]} values Each battler's value.
 * @param {boolean} fallback J-ABS's default.
 * @param {readonly boolean[]} enemyInanimate Whether each battler's enemy is inanimate in the database, which keeps it
 * off too.
 * @returns {RowModel<boolean>} The row.
 */
const hiddenRow = (values: readonly BattlerValue<boolean>[], fallback: boolean, enemyInanimate: readonly boolean[]): RowModel<boolean> =>
{
  // an enemy inanimate in its note says off for its battlers, as plainly as its note saying so outright would.
  const said = values.map((value, index) => ({ ...value, enemy: value.enemy ?? (enemyInanimate[index] ? false : null) }));
  return rowOf(said, switchWords, value => value.enemy ?? fallback);
};

/**
 * Builds the AI traits' row: the page's set, which replaces the enemy's whole, or the enemy's.
 * @param {readonly BattlerReading[]} readings Each battler.
 * @returns {RowModel<readonly string[]>} The row.
 */
const traitsRow = (readings: readonly BattlerReading[]): RowModel<readonly string[]> =>
{
  const row = rowOf(readings.map(reading => reading.aiTraits), setWords, value => value.enemy ?? []);
  return row.note === null
    ? row
    : { ...row, note: `Replaces the enemy's: ${setWords(readings[0].aiTraits.enemy ?? [])}` };
};

/**
 * Builds the AI roles' row: the page's set, or none at all. An enemy whose note names roles is told about, since those
 * never reach a battler on the map, so the author sets them here.
 * @param {readonly BattlerReading[]} readings Each battler.
 * @returns {RowModel<readonly string[]>} The row.
 */
const rolesRow = (readings: readonly BattlerReading[]): RowModel<readonly string[]> =>
{
  const row = rowOf(readings.map(reading => reading.aiRoles), setWords, () => []);
  const enemyRoles = shared(readings.map(reading => reading.aiRoles.enemy ?? []));
  const unset = readings.every(reading => reading.aiRoles.event === null);
  if (unset && enemyRoles.mixed === false && enemyRoles.value !== null && enemyRoles.value.length > 0)
  {
    return { ...row, note: `The enemy's ${setWords(enemyRoles.value)} never reaches its battlers on the map; set roles here.` };
  }

  return { ...row, note: null };
};

/**
 * Builds the team's row: always neutral while inanimate; otherwise the page's team, the enemy's, or the enemies'.
 * @param {readonly BattlerReading[]} readings Each battler.
 * @returns {RowModel<number>} The row.
 */
const teamRow = (readings: readonly BattlerReading[]): RowModel<number> =>
{
  const row = rowOf(readings.map(reading => reading.team), teamWords, value => value.enemy ?? TEAMS.enemies);
  return readings.some(reading => reading.inanimate.value) && row.from !== 'mixed'
    ? { ...row, note: 'Always neutral while inanimate.' }
    : row;
};

/**
 * Words how long a battler stays alerted: its frames, and the seconds they make at 60 frames a second.
 * @param {number} frames The frames.
 * @returns {string} Such as "300 frames (5s)".
 */
const alertWords = (frames: number): string =>
{
  const seconds = Math.round((frames / 60) * 10) / 10;
  return `${frames} frames (${seconds}s)`;
};

export {
  alertWords,
  hiddenRow,
  moveSpeedRow,
  numberRow,
  rolesRow,
  rowOf,
  setWords,
  shared,
  SOURCE_WORDS,
  switchWords,
  TEAM_WORDS,
  teamRow,
  teamWords,
  traitsRow,
};
export type { RowModel, RowSource };
