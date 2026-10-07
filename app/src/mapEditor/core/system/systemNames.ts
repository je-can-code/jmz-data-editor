import type { DocumentHub } from '../history/DocumentHub.ts';
import { SYSTEM_HISTORY_KEY } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { SYSTEM_KEY } from '../model/documentKeys.ts';
import type { SystemDocument } from '../model/JsonDocument.ts';
import type { RmmzNameList } from '../model/rmmzTypes.ts';

/**
 * One switch or variable as its list shows it: its id and its name, empty while it has none.
 */
type NameRow = {
  readonly id: number;
  readonly name: string;
};

/**
 * The fewest switches or variables a game can be given: one.
 */
const LEAST_MAXIMUM = 1;

/**
 * The most switches or variables the list lets a game be given, as MZ's own list allows: enough for any game, and a
 * stop against a slip of the keyboard filling the file with thousands of empty names.
 */
const GREATEST_MAXIMUM = 5000;

/**
 * What one switch or variable is called in a step's name, by its list.
 */
const LIST_NOUNS: Readonly<Record<RmmzNameList, string>> = {
  switches: 'switch',
  variables: 'variable',
};

/**
 * Reads the system document a window holds.
 * @param {DocumentHub} hub The window's documents; it must hold the system document.
 * @returns {SystemDocument} The document.
 */
const systemDocumentOf = (hub: DocumentHub): SystemDocument =>
{
  return hub.document(SYSTEM_KEY) as SystemDocument;
};

/**
 * Reads how many switches or variables a game has: the length of the list, less its empty first slot, which is no id.
 * @param {readonly string[]} names The list's names, by id.
 * @returns {number} How many.
 */
const maximumOf = (names: readonly string[]): number =>
{
  return Math.max(names.length - 1, 0);
};

/**
 * Lists one list's switches or variables, every id from 1 up to the maximum, named or not, keeping those a search finds:
 * a whole number finds the id it names, and any text finds every name holding it, whatever its case. An empty search
 * keeps them all.
 * @param {readonly string[]} names The list's names, by id.
 * @param {string} search What was typed to narrow the list.
 * @returns {NameRow[]} The rows, in id order.
 */
const nameRows = (names: readonly string[], search: string): NameRow[] =>
{
  const needle = search.trim().toLowerCase();
  const id = /^\d+$/u.test(needle) ? Number.parseInt(needle, 10) : null;
  const rows = names.slice(1).map((name, index) => ({ id: index + 1, name }));
  return needle === ''
    ? rows
    : rows.filter(row => row.id === id || row.name.toLowerCase().includes(needle));
};

/**
 * Brings a maximum asked for within what the list allows, as a whole number.
 * @param {number} maximum The maximum asked for.
 * @returns {number} The maximum, from {@link LEAST_MAXIMUM} to {@link GREATEST_MAXIMUM}.
 */
const clampMaximum = (maximum: number): number =>
{
  return Math.min(GREATEST_MAXIMUM, Math.max(LEAST_MAXIMUM, Math.round(maximum)));
};

/**
 * Renames one switch or variable, as one step in the history of the switch and variable names.
 * @param {DocumentHub} hub The window's documents; it must hold the system document.
 * @param {RmmzNameList} list Which list.
 * @param {number} id The switch or variable, from 1 up to the list's maximum.
 * @param {string} name Its new name; empty leaves it unnamed.
 * @returns {HistoryStep | null} The step, or null when it already had that name.
 */
const renameEntry = (hub: DocumentHub, list: RmmzNameList, id: number, name: string): HistoryStep | null =>
{
  const names = systemDocumentOf(hub).names(list);
  if (Number.isInteger(id) === false || id < 1 || id >= names.length)
  {
    throw new Error(`there is no ${LIST_NOUNS[list]} ${id}; the ${list} go up to ${maximumOf(names)}`);
  }

  return hub.edit(`Rename ${LIST_NOUNS[list]} ${id}`, [ SYSTEM_HISTORY_KEY ], transaction =>
  {
    transaction.set(SYSTEM_KEY, [ list, id ], name);
  });
};

/**
 * Changes how many switches or variables the game has, as MZ's own list does, as one step in the history of the switch
 * and variable names: raising it adds unnamed ones at the end, and lowering it takes the last ones away, names and all,
 * which undo brings back. The maximum is kept within what the list allows.
 * @param {DocumentHub} hub The window's documents; it must hold the system document.
 * @param {RmmzNameList} list Which list.
 * @param {number} maximum How many there should be.
 * @returns {HistoryStep | null} The step, or null when there were that many already.
 */
const setMaximum = (hub: DocumentHub, list: RmmzNameList, maximum: number): HistoryStep | null =>
{
  const names = systemDocumentOf(hub).names(list);
  const current = maximumOf(names);
  const next = clampMaximum(maximum);
  return hub.edit(`Change the ${LIST_NOUNS[list]} maximum to ${next}`, [ SYSTEM_HISTORY_KEY ], transaction =>
  {
    // the list keeps its empty first slot, so the last id sits at the maximum.
    if (next > current)
    {
      transaction.splice(SYSTEM_KEY, [ list ], names.length, 0, Array.from({ length: next - current }, () => ''));
    }
    else if (next < current)
    {
      transaction.splice(SYSTEM_KEY, [ list ], next + 1, current - next, []);
    }
  });
};

export { clampMaximum, GREATEST_MAXIMUM, LEAST_MAXIMUM, maximumOf, nameRows, renameEntry, setMaximum, systemDocumentOf };
export type { NameRow };
