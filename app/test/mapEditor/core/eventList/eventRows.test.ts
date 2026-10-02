import { describe, expect, it } from 'vitest';
import {
  changesEventList,
  DEFAULT_SORT,
  eventCountLabel,
  eventRowsFor,
  filterEventRows,
  kindCounts,
  nextSort,
  selectRowRange,
  sortEventRows,
  steppedRowId,
  toggleRowSelection,
  type EventRow,
  type RowKind,
} from '../../../../src/mapEditor/core/eventList/eventRows.ts';
import type { DocumentChange } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * The events list is how an author learns how busy a map is ("150 events, 120 of them enemies") and finds an event
 * without hunting the map for it, so each row must say what the map would: its id (its slot in the map's list), name,
 * tile, the kind that claims it and the symbol that kind names, the trigger of the page the map shows, how many pages it
 * has, and the symbol its marker shows. Sorting by any column settles ties by id, so the order never shuffles between
 * two sorts; names sort as they read, digits by value; positions sort down the map, then across; the events no kind
 * claims come after every kind's. A search keeps the rows matching every one of its words in any case, across id,
 * name, kind and trigger. The counts over the list put the most numerous kind first, each with its kind's symbol, the
 * unclaimed counted as one more, and the line over the list says how many of the map's events show.
 *
 * Only a change that can alter the rows rebuilds them: an edit to the events, a file swapped in or a resize, never a
 * brush stroke or another setting of the map. The list's own selection follows the rest of the editor's: Shift selects
 * the rows from the last one clicked in the order shown, Ctrl adds or takes out one, and the arrows step from the event
 * picked last, stopping at either end.
 */
describe('eventRows', () =>
{
  /**
   * The kinds the rows here are claimed by.
   */
  const BATTLER: RowKind = { id: 'jabs.battler', title: 'Battler', marker: 'battler' };
  const TRANSFER: RowKind = { id: 'core.transfer', title: 'Transfer', marker: 'transfer' };

  /**
   * Builds a row as the list would hold it, with the fields a test cares about.
   * @param {Partial<EventRow> & { id: number }} fields The fields.
   * @returns {EventRow} The row.
   */
  const row = (fields: Partial<EventRow> & { id: number }): EventRow =>
  {
    return {
      name: `EV${fields.id}`,
      x: 0,
      y: 0,
      kindId: null,
      kindTitle: '',
      kindMarker: null,
      trigger: 0,
      triggerLabel: 'Action button',
      pageCount: 1,
      marker: 'action-button',
      ...fields,
    };
  };

  /**
   * Lists the ids of some rows, in order.
   * @param {readonly EventRow[]} rows The rows.
   * @returns {number[]} The ids.
   */
  const idsOf = (rows: readonly EventRow[]): number[] => rows.map(each => each.id);

  describe('eventRowsFor', () =>
  {
    it('builds a row per event by its slot, skipping empty slots, with its kind, first trigger, pages and symbol', () =>
    {
      // Arrange: slot 1 empty; slot 2 a battler with two pages, on parallel first; slot 3 nobody's, on autorun; slot 4
      // holding an event whose own id disagrees with its slot, which the slot wins.
      const battler: RmmzMapEvent = { ...createMapEvent(2, 4, 7), name: 'slime', pages: [ { ...createEventPage(), trigger: 4 }, createEventPage() ] };
      const plain: RmmzMapEvent = { ...createMapEvent(3, 1, 2), pages: [ { ...createEventPage(), trigger: 3 } ] };
      const misplaced: RmmzMapEvent = createMapEvent(9, 0, 5);

      // Act.
      const rows = eventRowsFor([ null, null, battler, plain, misplaced ], event => (event.name === 'slime' ? BATTLER : null));

      // Assert.
      expect(rows)
        .toStrictEqual([
          {
            id: 2,
            name: 'slime',
            x: 4,
            y: 7,
            kindId: 'jabs.battler',
            kindTitle: 'Battler',
            kindMarker: 'battler',
            trigger: 4,
            triggerLabel: 'Parallel',
            pageCount: 2,
            marker: 'battler',
          },
          { id: 3, name: 'EV003', x: 1, y: 2, kindId: null, kindTitle: '', kindMarker: null, trigger: 3, triggerLabel: 'Autorun', pageCount: 1, marker: 'autorun' },
          { id: 4, name: 'EV009', x: 0, y: 5, kindId: null, kindTitle: '', kindMarker: null, trigger: 0, triggerLabel: 'Action button', pageCount: 1, marker: 'action-button' },
        ]);
    });

    it('gives an event claimed by a kind naming no symbol its trigger\'s marker and no kind symbol', () =>
    {
      // Arrange: a player-touch event claimed by a kind with nothing of its own to show.
      const plate: RmmzMapEvent = { ...createMapEvent(1, 0, 0), pages: [ { ...createEventPage(), trigger: 1 } ] };

      // Act.
      const [ only ] = eventRowsFor([ null, plate ], () => ({ id: 'core.plate', title: 'Plate' }));

      // Assert.
      expect([ only.kindTitle, only.kindMarker, only.marker ])
        .toStrictEqual([ 'Plate', null, 'player-touch' ]);
    });

    it('reads an event with no pages as a fresh page would start, on the action button, with no pages to count', () =>
    {
      // Arrange.
      const bare: RmmzMapEvent = { ...createMapEvent(1, 0, 0), pages: [] };

      // Act.
      const [ only ] = eventRowsFor([ null, bare ], () => null);

      // Assert.
      expect([ only.trigger, only.triggerLabel, only.pageCount, only.marker ])
        .toStrictEqual([ 0, 'Action button', 0, 'action-button' ]);
    });
  });

  describe('sortEventRows', () =>
  {
    it('sorts by id either way', () =>
    {
      // Arrange.
      const rows = [ row({ id: 3 }), row({ id: 1 }), row({ id: 2 }) ];

      // Act.
      const sorted = [ sortEventRows(rows, { key: 'id', direction: 'ascending' }), sortEventRows(rows, { key: 'id', direction: 'descending' }) ];

      // Assert: and the rows handed in keep their order.
      expect([ ...sorted.map(idsOf), idsOf(rows) ])
        .toStrictEqual([ [ 1, 2, 3 ], [ 3, 2, 1 ], [ 3, 1, 2 ] ]);
    });

    it('sorts names as they read, ignoring case and taking digits by value, ties by id either way', () =>
    {
      // Arrange: "slime 10" after "slime 2"; "Bat" with "bat" settled by id.
      const rows = [ row({ id: 1, name: 'slime 10' }), row({ id: 2, name: 'slime 2' }), row({ id: 3, name: 'bat' }), row({ id: 4, name: 'Bat' }) ];

      // Act.
      const sorted = [ sortEventRows(rows, { key: 'name', direction: 'ascending' }), sortEventRows(rows, { key: 'name', direction: 'descending' }) ];

      // Assert: the tie stays in id order whichever way the names run.
      expect(sorted.map(idsOf))
        .toStrictEqual([ [ 3, 4, 2, 1 ], [ 1, 2, 3, 4 ] ]);
    });

    it('sorts positions down the map a row at a time, then across', () =>
    {
      // Arrange: on row 2 at column 1, on row 1 at column 5, on row 2 at column 0, and on row 1 at column 5 again.
      const rows = [ row({ id: 1, x: 1, y: 2 }), row({ id: 2, x: 5, y: 1 }), row({ id: 3, x: 0, y: 2 }), row({ id: 4, x: 5, y: 1 }) ];

      // Act.
      const sorted = sortEventRows(rows, { key: 'position', direction: 'ascending' });

      // Assert.
      expect(idsOf(sorted))
        .toStrictEqual([ 2, 4, 3, 1 ]);
    });

    it('sorts kinds by title with the unclaimed after every kind, and before them sorted the other way', () =>
    {
      // Arrange: nobody's, a transfer, a battler, nobody's again.
      const rows = [
        row({ id: 1 }),
        row({ id: 2, kindId: TRANSFER.id, kindTitle: TRANSFER.title }),
        row({ id: 3, kindId: BATTLER.id, kindTitle: BATTLER.title }),
        row({ id: 4 }),
      ];

      // Act.
      const sorted = [ sortEventRows(rows, { key: 'kind', direction: 'ascending' }), sortEventRows(rows, { key: 'kind', direction: 'descending' }) ];

      // Assert.
      expect(sorted.map(idsOf))
        .toStrictEqual([ [ 3, 2, 1, 4 ], [ 1, 4, 2, 3 ] ]);
    });

    it('sorts triggers in MZ\'s order and page counts by number', () =>
    {
      // Arrange: parallel with one page, the action button with three, autorun with two, the action button with one.
      const rows = [
        row({ id: 1, trigger: 4, pageCount: 1 }),
        row({ id: 2, trigger: 0, pageCount: 3 }),
        row({ id: 3, trigger: 3, pageCount: 2 }),
        row({ id: 4, trigger: 0, pageCount: 1 }),
      ];

      // Act.
      const sorted = [ sortEventRows(rows, { key: 'trigger', direction: 'ascending' }), sortEventRows(rows, { key: 'pages', direction: 'descending' }) ];

      // Assert.
      expect(sorted.map(idsOf))
        .toStrictEqual([ [ 2, 4, 3, 1 ], [ 2, 3, 1, 4 ] ]);
    });
  });

  describe('nextSort', () =>
  {
    it('flips the way of the column already sorted, and sorts another column ascending', () =>
    {
      // Arrange: the list as it starts, by id ascending.

      // Act.
      const flipped = nextSort(DEFAULT_SORT, 'id');
      const back = nextSort(flipped, 'id');
      const other = nextSort(flipped, 'kind');

      // Assert.
      expect([ flipped, back, other ])
        .toStrictEqual([
          { key: 'id', direction: 'descending' },
          { key: 'id', direction: 'ascending' },
          { key: 'kind', direction: 'ascending' },
        ]);
    });
  });

  describe('filterEventRows', () =>
  {
    const rows = [
      row({ id: 1, name: 'Slime Pit' }),
      row({ id: 2, name: 'slime', kindId: BATTLER.id, kindTitle: BATTLER.title }),
      row({ id: 3, name: 'door', kindId: TRANSFER.id, kindTitle: TRANSFER.title, triggerLabel: 'Player touch' }),
      row({ id: 12, name: 'cutscene', triggerLabel: 'Autorun' }),
    ];

    it('keeps the rows matching every word in any case, across name, kind and trigger', () =>
    {
      // Arrange: a name in other case; a kind and a name together; a trigger; words from two fields of one row.
      const queries = [ 'SLIME', 'battler slime', 'autorun', 'touch door' ];

      // Act.
      const kept = queries.map(query => idsOf(filterEventRows(rows, query)));

      // Assert: the pit is no battler, so only the slime matches both words.
      expect(kept)
        .toStrictEqual([ [ 1, 2 ], [ 2 ], [ 12 ], [ 3 ] ]);
    });

    it('matches ids as text, so a digit finds every id holding it', () =>
    {
      // Arrange.
      const query = '2';

      // Act.
      const kept = filterEventRows(rows, query);

      // Assert.
      expect(idsOf(kept))
        .toStrictEqual([ 2, 12 ]);
    });

    it('keeps every row for an empty search, and none when nothing matches', () =>
    {
      // Arrange: nothing typed, spaces alone, and a word no row holds.
      const queries = [ '', '   ', 'dragon' ];

      // Act.
      const kept = queries.map(query => filterEventRows(rows, query));

      // Assert: the empty searches hand back the very rows.
      expect([ kept[0] === rows, kept[1] === rows, kept[2] ])
        .toStrictEqual([ true, true, [] ]);
    });
  });

  describe('kindCounts', () =>
  {
    it('counts each kind with its symbol, the most numerous first, the unclaimed together as one more, ties by name', () =>
    {
      // Arrange: three battlers, two nobody's, two transfers.
      const battler = { kindId: BATTLER.id, kindTitle: BATTLER.title, kindMarker: 'battler' as const };
      const transfer = { kindId: TRANSFER.id, kindTitle: TRANSFER.title, kindMarker: 'transfer' as const };
      const rows = [
        row({ id: 1, ...battler }),
        row({ id: 2 }),
        row({ id: 3, ...transfer }),
        row({ id: 4, ...battler }),
        row({ id: 5, ...transfer }),
        row({ id: 6 }),
        row({ id: 7, ...battler }),
      ];

      // Act.
      const counts = kindCounts(rows);

      // Assert: "Other" and "Transfer" tie on two, in name order.
      expect(counts)
        .toStrictEqual([
          { kindId: 'jabs.battler', title: 'Battler', count: 3, marker: 'battler' },
          { kindId: null, title: 'Other', count: 2, marker: null },
          { kindId: 'core.transfer', title: 'Transfer', count: 2, marker: 'transfer' },
        ]);
    });

    it('counts nothing for a map with no events', () =>
    {
      // Arrange: no rows.

      // Act.
      const counts = kindCounts([]);

      // Assert.
      expect(counts)
        .toStrictEqual([]);
    });
  });

  describe('eventCountLabel', () =>
  {
    it('says how many events there are, one alone, or how many of them a search kept', () =>
    {
      // Arrange: six hundred shown, one shown, none on the map, and twelve of six hundred.
      const counts: [ number, number ][] = [ [ 600, 600 ], [ 1, 1 ], [ 0, 0 ], [ 600, 12 ] ];

      // Act.
      const labels = counts.map(([ total, shown ]) => eventCountLabel(total, shown));

      // Assert.
      expect(labels)
        .toStrictEqual([ '600 events', '1 event', '0 events', '12 of 600 events' ]);
    });
  });

  describe('changesEventList', () =>
  {
    /**
     * Builds a change patching a map document.
     * @param {DocumentChange['kind']} kind Whether it patched the map or swapped its file.
     * @param {object} patch The patch, for a patched change.
     * @returns {DocumentChange} The change.
     */
    const change = (kind: DocumentChange['kind'], patch?: object): DocumentChange =>
    {
      return (kind === 'replaced'
        ? { kind, key: 'map:1', revision: 2 }
        : { kind, key: 'map:1', revision: 2, patch }) as DocumentChange;
    };

    it('rebuilds the list for an edit to the events, a swapped file or a resize', () =>
    {
      // Arrange: an event moved, an event added to the list, the file swapped, and the map resized.
      const changes = [
        change('patched', { kind: 'set', path: [ 'events', 4, 'x' ], before: 1, after: 2 }),
        change('patched', { kind: 'splice', path: [ 'events' ], index: 9, removed: [], inserted: [ null ] }),
        change('replaced'),
        change('patched', { kind: 'resize', before: {}, after: {} }),
      ];

      // Act.
      const rebuilt = changes.map(changesEventList);

      // Assert.
      expect(rebuilt)
        .toStrictEqual([ true, true, true, true ]);
    });

    it('leaves the list alone for painted tiles and the map\'s other settings', () =>
    {
      // Arrange: a brush stroke, and the map's display name.
      const changes = [
        change('patched', { kind: 'tiles', indices: [ 3 ], before: [ 0 ], after: [ 2816 ] }),
        change('patched', { kind: 'set', path: [ 'displayName' ], before: '', after: 'Harbour' }),
      ];

      // Act.
      const rebuilt = changes.map(changesEventList);

      // Assert.
      expect(rebuilt)
        .toStrictEqual([ false, false ]);
    });
  });

  describe('selectRowRange', () =>
  {
    const rows = [ row({ id: 9 }), row({ id: 2 }), row({ id: 7 }), row({ id: 4 }) ];

    it('selects every row from the anchor to the row clicked, either way, in the order shown', () =>
    {
      // Arrange: down from the second row to the fourth, then up from the fourth to the first.
      const ranges: [ number, number ][] = [ [ 2, 4 ], [ 4, 9 ] ];

      // Act.
      const selected = ranges.map(([ anchor, target ]) => selectRowRange(rows, anchor, target));

      // Assert.
      expect(selected)
        .toStrictEqual([ [ 2, 7, 4 ], [ 9, 2, 7, 4 ] ]);
    });

    it('selects the row clicked alone without an anchor, or with one the search hides, and nothing for a row not shown', () =>
    {
      // Arrange: no anchor; an anchor no row shows; a target no row shows.
      const asks: [ number | null, number ][] = [ [ null, 7 ], [ 5, 7 ], [ 2, 5 ] ];

      // Act.
      const selected = asks.map(([ anchor, target ]) => selectRowRange(rows, anchor, target));

      // Assert.
      expect(selected)
        .toStrictEqual([ [ 7 ], [ 7 ], [] ]);
    });
  });

  describe('toggleRowSelection', () =>
  {
    it('adds an event not selected at the end, and takes out one already selected, keeping the rest in order', () =>
    {
      // Arrange: three selected.
      const selected = [ 4, 1, 6 ];

      // Act.
      const toggled = [ toggleRowSelection(selected, 9), toggleRowSelection(selected, 1) ];

      // Assert: and the list handed in is untouched.
      expect([ ...toggled, selected ])
        .toStrictEqual([ [ 4, 1, 6, 9 ], [ 4, 6 ], [ 4, 1, 6 ] ]);
    });
  });

  describe('steppedRowId', () =>
  {
    const rows = [ row({ id: 9 }), row({ id: 2 }), row({ id: 7 }) ];

    it('steps down and up from the event picked last, in the order shown', () =>
    {
      // Arrange: 9 then 2 picked, so 2 is where the arrows start.
      const selected = [ 9, 2 ];

      // Act.
      const steps = [ steppedRowId(rows, selected, 1), steppedRowId(rows, selected, -1) ];

      // Assert.
      expect(steps)
        .toStrictEqual([ 7, 9 ]);
    });

    it('stops at either end of the list', () =>
    {
      // Arrange: the last row picked, then the first.
      const atEnds: [ number[], 1 | -1 ][] = [ [ [ 7 ], 1 ], [ [ 9 ], -1 ] ];

      // Act.
      const steps = atEnds.map(([ selected, step ]) => steppedRowId(rows, selected, step));

      // Assert.
      expect(steps)
        .toStrictEqual([ 7, 9 ]);
    });

    it('starts from the top going down and the bottom going up when nothing shown is selected', () =>
    {
      // Arrange: nothing selected, and an event the search hides.
      const asks: [ number[], 1 | -1 ][] = [ [ [], 1 ], [ [], -1 ], [ [ 5 ], 1 ] ];

      // Act.
      const steps = asks.map(([ selected, step ]) => steppedRowId(rows, selected, step));

      // Assert.
      expect(steps)
        .toStrictEqual([ 9, 7, 9 ]);
    });

    it('finds nothing in an empty list', () =>
    {
      // Arrange: no rows.

      // Act.
      const step = steppedRowId([], [ 3 ], 1);

      // Assert.
      expect(step)
        .toBeNull();
    });
  });
});
