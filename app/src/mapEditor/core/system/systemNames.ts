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
 * What changing a maximum came to: the step it recorded (null when there were that many already), or why it was
 * refused, in words for the author. A refused change changes nothing.
 */
type MaximumOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null }
  | { readonly ok: false; readonly message: string };

/**
 * What saving the names came to: written, or nothing to write (saved is false), or held back, with the reason in words
 * for the author.
 */
type NamesSaveOutcome =
  | { readonly ok: true; readonly saved: boolean }
  | { readonly ok: false; readonly message: string };

/**
 * What the author reads when the names wait for them to choose between this window's renames and changes made
 * elsewhere: the same wait the workspace's Save all and an event window's save report for a map.
 */
const NAMES_CONFLICT_MESSAGE = 'The names were not saved: they are waiting for a choice about changes made elsewhere.';

/**
 * What one switch or variable is called in a step's name, by its list.
 */
const LIST_NOUNS: Readonly<Record<RmmzNameList, string>> = {
  switches: 'switch',
  variables: 'variable',
};

/**
 * What one switch or variable is called at the start of a sentence, by its list.
 */
const LIST_TITLES: Readonly<Record<RmmzNameList, string>> = {
  switches: 'Switch',
  variables: 'Variable',
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
 * Finds the last switch or variable a list names: the lowest its maximum can go without a name being lost.
 * @param {readonly string[]} names The list's names, by id.
 * @returns {number} Its id, or 0 when the list names none.
 */
const lastNamedId = (names: readonly string[]): number =>
{
  // the empty first slot is no id, so the search stops short of it.
  for (let id = names.length - 1; id >= 1; id--)
  {
    if (names[id] !== '')
    {
      return id;
    }
  }

  return 0;
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
 * and variable names: raising it adds unnamed ones at the end, and lowering it takes the last ones away. The maximum is
 * kept within what the list allows.
 *
 * Lowering it never takes a name with it. Once saved, a name taken away is gone from the game for good, while the
 * events reading that switch or variable go on reading it by number, so a maximum below the last one named is refused,
 * naming it: the names above the new maximum are cleared first, each a rename of its own, and then nothing is lost
 * unseen.
 * @param {DocumentHub} hub The window's documents; it must hold the system document.
 * @param {RmmzNameList} list Which list.
 * @param {number} maximum How many there should be.
 * @returns {MaximumOutcome} The step (null when there were that many already), or why the maximum cannot go so low.
 */
const setMaximum = (hub: DocumentHub, list: RmmzNameList, maximum: number): MaximumOutcome =>
{
  const names = systemDocumentOf(hub).names(list);
  const current = maximumOf(names);
  const next = clampMaximum(maximum);

  // a name past the new maximum would go with it.
  const named = lastNamedId(names);
  if (next < named)
  {
    const message = `${LIST_TITLES[list]} ${named} is still named "${names[named]}", so the ${list} cannot go below ${named}. `
      + 'Clear the names above the new maximum first.';
    return { ok: false, message };
  }

  const step = hub.edit(`Change the ${LIST_NOUNS[list]} maximum to ${next}`, [ SYSTEM_HISTORY_KEY ], transaction =>
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
  return { ok: true, step };
};

/**
 * Saves the switch and variable names. Names with nothing unsaved are left alone. Names flagged in conflict (System.json
 * changed on disk, or another window's copy went another way, while they held unsaved renames) are held back exactly as
 * the workspace's Save all holds a map back: writing them would put this copy's names over the other one's before the
 * author has chosen between them, and once written they would read as saved, so nothing would be left to warn them.
 * @param {DocumentHub} hub The window's documents; it must hold the system document.
 * @returns {Promise<NamesSaveOutcome>} Settles once the file is written, or at once when there is nothing to write or
 * the save is held back; rejects when the write itself fails.
 */
const saveNames = async (hub: DocumentHub): Promise<NamesSaveOutcome> =>
{
  if (hub.isDirty(SYSTEM_KEY) === false)
  {
    return { ok: true, saved: false };
  }

  if (hub.isConflicted(SYSTEM_KEY))
  {
    return { ok: false, message: NAMES_CONFLICT_MESSAGE };
  }

  await hub.save(SYSTEM_KEY);
  return { ok: true, saved: true };
};

export {
  clampMaximum,
  GREATEST_MAXIMUM,
  lastNamedId,
  LEAST_MAXIMUM,
  maximumOf,
  NAMES_CONFLICT_MESSAGE,
  nameRows,
  renameEntry,
  saveNames,
  setMaximum,
  systemDocumentOf,
};
export type { MaximumOutcome, NameRow, NamesSaveOutcome };
