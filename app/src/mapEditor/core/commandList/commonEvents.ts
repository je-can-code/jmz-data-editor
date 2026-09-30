import type { FieldOption } from '../commands/catalogTypes.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { commonEventHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { COMMON_EVENTS_KEY } from '../model/documentKeys.ts';
import { isJsonObject, type JsonValue } from '../model/json.ts';
import type { PatchPath } from '../model/patches.ts';

/**
 * How a common event starts: only when called, by itself while its switch is on, or alongside everything else
 * while its switch is on.
 */
const COMMON_EVENT_TRIGGERS: readonly FieldOption[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Autorun' },
  { value: 2, label: 'Parallel' },
];

/**
 * One common event as the list of them shows it.
 */
type CommonEventRow = {
  readonly id: number;
  readonly name: string;
  readonly trigger: number;
  readonly switchId: number;

  /**
   * How many commands it holds, its list's closing end not counted.
   */
  readonly commands: number;
};

/**
 * The parts of a common event its view edits besides its commands.
 */
type CommonEventProperty = 'name' | 'trigger' | 'switchId';

/**
 * What the history panel calls a change to each part.
 */
const PROPERTY_LABELS: Readonly<Record<CommonEventProperty, string>> = {
  name: 'Rename common event',
  trigger: 'Change common event trigger',
  switchId: 'Change common event switch',
};

/**
 * Lists the common events the file holds, in id order, keeping those whose id or name holds the filter.
 * @param {JsonValue | undefined} content The common events document's content.
 * @param {string} filter What was typed to narrow the list; empty keeps everything.
 * @returns {CommonEventRow[]} The rows.
 */
const listCommonEvents = (content: JsonValue | undefined, filter: string): CommonEventRow[] =>
{
  const needle = filter.trim().toLowerCase();
  const rows = Array.isArray(content)
    ? content
    : [];
  return rows.flatMap((row, id): CommonEventRow[] =>
  {
    if (isJsonObject(row) === false || id === 0)
    {
      return [];
    }

    const name = String(row['name'] ?? '');
    const matches = needle === '' || name.toLowerCase().includes(needle) || String(id) === needle;
    const list = Array.isArray(row['list']) ? row['list'] : [];
    return matches
      ? [ { id, name, trigger: Number(row['trigger'] ?? 0), switchId: Number(row['switchId'] ?? 1), commands: Math.max(list.length - 1, 0) } ]
      : [];
  });
};

/**
 * Names where a common event's commands sit in the common events document.
 * @param {number} id The common event's id.
 * @returns {PatchPath} The path to its list.
 */
const commonEventListPath = (id: number): PatchPath =>
{
  return [ id, 'list' ];
};

/**
 * Changes one part of a common event as a named step in that common event's own history.
 * @param {DocumentHub} hub The window's documents; the common events must be held.
 * @param {number} id The common event's id.
 * @param {CommonEventProperty} property The part.
 * @param {string | number} value Its new value.
 * @returns {HistoryStep | null} The step, or null when the value was already there.
 */
const setCommonEventProperty = (hub: DocumentHub, id: number, property: CommonEventProperty, value: string | number): HistoryStep | null =>
{
  return hub.edit(PROPERTY_LABELS[property], [ commonEventHistoryKey(id) ], transaction =>
  {
    transaction.set(COMMON_EVENTS_KEY, [ id, property ], value);
  });
};

export { COMMON_EVENT_TRIGGERS, commonEventListPath, listCommonEvents, setCommonEventProperty };
export type { CommonEventProperty, CommonEventRow };
