import { MARKER_STYLES, markerSymbolFor, triggerMarker, type EventMarkerSymbol, type MarkedKind } from '../eventKinds/eventMarkers.ts';
import type { DocumentChange } from '../model/EditorDocument.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';

/**
 * The kind an event list row names: its id and title, and the symbol it shows, as the window's kinds carry them.
 */
type RowKind = MarkedKind & {
  readonly id: string;
  readonly title: string;
};

/**
 * One event as the events list shows it: its id, name and tile, the kind that claims it, the trigger of the page the map
 * shows, how many pages it has, and the symbol its marker shows on the map.
 */
type EventRow = {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;

  /**
   * The kind's id, or null when no kind claims the event.
   */
  readonly kindId: string | null;

  /**
   * The kind's title, or empty when no kind claims the event.
   */
  readonly kindTitle: string;

  /**
   * The symbol the kind names for itself, or null when no kind claims the event or the kind names none.
   */
  readonly kindMarker: EventMarkerSymbol | null;
  readonly trigger: number;
  readonly triggerLabel: string;
  readonly pageCount: number;
  readonly marker: EventMarkerSymbol;
};

/**
 * The columns the list sorts by.
 */
type EventSortKey = 'id' | 'name' | 'position' | 'kind' | 'trigger' | 'pages';

/**
 * Which way a column sorts.
 */
type SortDirection = 'ascending' | 'descending';

/**
 * How the list is sorted: by one column, one way.
 */
type EventSort = {
  readonly key: EventSortKey;
  readonly direction: SortDirection;
};

/**
 * How many events of one kind a map holds, for the line of counts over the list.
 */
type KindCount = {
  /**
   * The kind's id, or null for the events no kind claims.
   */
  readonly kindId: string | null;
  readonly title: string;
  readonly count: number;

  /**
   * The symbol the kind names for itself, or null for the events no kind claims and a kind naming none, whose events
   * each show their own trigger.
   */
  readonly marker: EventMarkerSymbol | null;
};

/**
 * What the list is sorted by until the author picks a column: id order, as MZ lists events.
 */
const DEFAULT_SORT: EventSort = { key: 'id', direction: 'ascending' };

/**
 * What the counts call the events no kind claims.
 */
const UNCLAIMED_TITLE = 'Other';

/**
 * Compares names as an author reads them: letters without regard to case, and runs of digits by their value, so
 * "slime 2" comes before "slime 10".
 */
const NAME_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Compares two rows by a column, ascending, before ties are settled by id.
 */
const PRIMARY_ORDER: Readonly<Record<EventSortKey, (left: EventRow, right: EventRow) => number>> = {
  id: (left, right) => left.id - right.id,
  name: (left, right) => NAME_ORDER.compare(left.name, right.name),

  // reading order: down the map a row at a time, then across it.
  position: (left, right) => left.y - right.y || left.x - right.x,

  // the events no kind claims come after every kind's.
  kind: (left, right) =>
  {
    if (left.kindId === null || right.kindId === null)
    {
      return Number(left.kindId === null) - Number(right.kindId === null);
    }

    return NAME_ORDER.compare(left.kindTitle, right.kindTitle);
  },

  // MZ's own order: action button, player touch, event touch, autorun, parallel.
  trigger: (left, right) => left.trigger - right.trigger,
  pages: (left, right) => left.pageCount - right.pageCount,
};

/**
 * Builds one event's row.
 * @param {number} id The event's id: its slot in the map's list.
 * @param {RmmzMapEvent} event The event.
 * @param {RowKind | null} kind The kind that claims it, or null when none does.
 * @returns {EventRow} The row.
 */
const eventRowFor = (id: number, event: RmmzMapEvent, kind: RowKind | null): EventRow =>
{
  const [ page ] = event.pages;
  const trigger = page === undefined ? 0 : page.trigger;
  return {
    id,
    name: event.name,
    x: event.x,
    y: event.y,
    kindId: kind === null ? null : kind.id,
    kindTitle: kind === null ? '' : kind.title,
    kindMarker: kind === null ? null : kind.marker ?? null,
    trigger,
    triggerLabel: MARKER_STYLES[triggerMarker(trigger)].label,
    pageCount: event.pages.length,
    marker: markerSymbolFor(event, kind),
  };
};

/**
 * Builds a row for every event on a map, in id order.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's event list, by slot, empty slots null.
 * @param {(event: RmmzMapEvent) => RowKind | null} kindOf Finds the kind that claims an event, or null when none does.
 * @returns {EventRow[]} The rows.
 */
const eventRowsFor = (events: readonly (RmmzMapEvent | null)[], kindOf: (event: RmmzMapEvent) => RowKind | null): EventRow[] =>
{
  return events.flatMap((event, id) => (event === null ? [] : [ eventRowFor(id, event, kindOf(event)) ]));
};

/**
 * Sorts rows by a column, one way, settling ties by id so the order never shifts between two sorts of the same rows.
 * @param {readonly EventRow[]} rows The rows.
 * @param {EventSort} sort The column and the way.
 * @returns {EventRow[]} A sorted copy.
 */
const sortEventRows = (rows: readonly EventRow[], sort: EventSort): EventRow[] =>
{
  const primary = PRIMARY_ORDER[sort.key];
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return [ ...rows ].sort((left, right) => sign * primary(left, right) || left.id - right.id);
};

/**
 * Works out the sort a click on a column's heading asks for: the same column flips its way, another column sorts
 * ascending.
 * @param {EventSort} current The sort now.
 * @param {EventSortKey} key The column clicked.
 * @returns {EventSort} The new sort.
 */
const nextSort = (current: EventSort, key: EventSortKey): EventSort =>
{
  if (current.key !== key)
  {
    return { key, direction: 'ascending' };
  }

  return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
};

/**
 * Keeps the rows a search matches: every word of it, in any case, found in the row's id, name, kind or trigger, so
 * "battler slime" finds the slimes that fight. An empty search keeps every row.
 * @param {readonly EventRow[]} rows The rows.
 * @param {string} query The search.
 * @returns {readonly EventRow[]} The rows it matches, in their order.
 */
const filterEventRows = (rows: readonly EventRow[], query: string): readonly EventRow[] =>
{
  const words = query.toLowerCase().split(/\s+/u).filter(word => word !== '');
  if (words.length === 0)
  {
    return rows;
  }

  return rows.filter(row =>
  {
    const text = `${row.id} ${row.name} ${row.kindTitle} ${row.triggerLabel}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
};

/**
 * Counts a map's events by kind, the most numerous first, the events no kind claims counted together as one more.
 * @param {readonly EventRow[]} rows The rows.
 * @returns {KindCount[]} The counts; ties in name order.
 */
const kindCounts = (rows: readonly EventRow[]): KindCount[] =>
{
  const counts = new Map<string | null, KindCount>();
  rows.forEach(row =>
  {
    const known = counts.get(row.kindId);
    const title = row.kindId === null ? UNCLAIMED_TITLE : row.kindTitle;
    counts.set(row.kindId, { kindId: row.kindId, title, count: (known?.count ?? 0) + 1, marker: row.kindMarker });
  });

  return [ ...counts.values() ].sort((left, right) => right.count - left.count || NAME_ORDER.compare(left.title, right.title));
};

/**
 * Reports whether a change to a map can change its events list: a file swapped in or a resize, which can take events
 * with it, or any change to the events themselves. Painting tiles or changing the map's other settings never can, so a
 * brush stroke never rebuilds the list.
 * @param {DocumentChange} change The change.
 * @returns {boolean} True when the list must be rebuilt.
 */
const changesEventList = (change: DocumentChange): boolean =>
{
  if (change.kind === 'replaced')
  {
    return true;
  }

  const { patch } = change;
  switch (patch.kind)
  {
    case 'resize':
      return true;
    case 'tiles':
      return false;
    default:
      return patch.path[0] === 'events';
  }
};

/**
 * Selects every row from an anchor to a clicked row, both included, in the order the list shows them: a Shift click.
 * @param {readonly EventRow[]} rows The rows shown.
 * @param {number | null} anchorId The row the selection grew from, or null for none.
 * @param {number} targetId The row clicked.
 * @returns {number[]} The ids selected, in the order shown.
 */
const selectRowRange = (rows: readonly EventRow[], anchorId: number | null, targetId: number): number[] =>
{
  const ids = rows.map(row => row.id);
  const to = ids.indexOf(targetId);
  const from = anchorId === null
    ? -1
    : ids.indexOf(anchorId);
  if (to < 0)
  {
    return [];
  }

  // an anchor the search hides, or none at all, makes the click a plain one.
  if (from < 0)
  {
    return [ targetId ];
  }

  return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
};

/**
 * Adds an event to the selection, or takes it out when it is already in: a Ctrl click.
 * @param {readonly number[]} selected The ids selected now.
 * @param {number} id The row clicked.
 * @returns {number[]} The new selection.
 */
const toggleRowSelection = (selected: readonly number[], id: number): number[] =>
{
  return selected.includes(id)
    ? selected.filter(each => each !== id)
    : [ ...selected, id ];
};

/**
 * Finds the row an arrow key moves to: the one after or before the event picked most recently, in the order the list
 * shows them, stopping at either end. With nothing shown selected, the arrow starts from the top or the bottom.
 * @param {readonly EventRow[]} rows The rows shown.
 * @param {readonly number[]} selected The ids selected, the most recently picked last.
 * @param {1 | -1} step Down the list, or up it.
 * @returns {number | null} The row's id, or null when the list is empty.
 */
const steppedRowId = (rows: readonly EventRow[], selected: readonly number[], step: 1 | -1): number | null =>
{
  if (rows.length === 0)
  {
    return null;
  }

  const current = selected.length === 0
    ? -1
    : rows.findIndex(row => row.id === selected[selected.length - 1]);
  if (current < 0)
  {
    return step === 1 ? rows[0].id : rows[rows.length - 1].id;
  }

  const next = Math.min(rows.length - 1, Math.max(0, current + step));
  return rows[next].id;
};

/**
 * Words how many events the list shows: all of them, or how many of them a search kept.
 * @param {number} total How many the map holds.
 * @param {number} shown How many the list shows.
 * @returns {string} Such as "600 events", "1 event" or "12 of 600 events".
 */
const eventCountLabel = (total: number, shown: number): string =>
{
  if (shown !== total)
  {
    return `${shown} of ${total} events`;
  }

  return total === 1
    ? '1 event'
    : `${total} events`;
};

export {
  changesEventList,
  DEFAULT_SORT,
  eventCountLabel,
  eventRowFor,
  eventRowsFor,
  filterEventRows,
  kindCounts,
  nextSort,
  selectRowRange,
  sortEventRows,
  steppedRowId,
  toggleRowSelection,
  UNCLAIMED_TITLE,
};
export type { EventRow, EventSort, EventSortKey, KindCount, RowKind, SortDirection };
