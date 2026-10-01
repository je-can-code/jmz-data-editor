import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import {
  boxCells,
  boxSelection,
  clickSelection,
  eventsInCells,
  modifiersOf,
  REPLACE,
} from '../../../../src/mapEditor/core/events/selectionRules.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';

/*
 * Selecting events on a map follows one set of rules, whether by click or by box: with no modifier the new pick
 * replaces the old, Shift adds to it, and Ctrl (Cmd on a Mac) toggles. A click on empty ground clears the selection,
 * except with a modifier held, when it leaves it alone so a slip never throws picks away. A box covers every tile from
 * where it started to where the pointer is, either way round, and may start beside the map, since some maps (Map361)
 * have no empty ground to start one on; only the events on the tiles it covers are selected, never one a tile beyond
 * it. Orders matter, because the last event picked is the one a panel shows first.
 */
describe('selectionRules', () =>
{
  describe('modifiersOf', () =>
  {
    it('reads Shift as adding, and Ctrl or Cmd as toggling', () =>
    {
      // Arrange.
      const presses = [
        { shiftKey: true, ctrlKey: false, metaKey: false },
        { shiftKey: false, ctrlKey: true, metaKey: false },
        { shiftKey: false, ctrlKey: false, metaKey: true },
        { shiftKey: false, ctrlKey: false, metaKey: false },
      ];

      // Act.
      const read = presses.map(modifiersOf);

      // Assert.
      expect(read)
        .toStrictEqual([
          { add: true, toggle: false },
          { add: false, toggle: true },
          { add: false, toggle: true },
          REPLACE,
        ]);
    });
  });

  describe('clickSelection', () =>
  {
    it('selects the clicked event alone with no modifier, dropping the rest', () =>
    {
      // Arrange: 4 and 2 are selected.

      // Act.
      const next = clickSelection([ 4, 2 ], 7, REPLACE);

      // Assert.
      expect(next)
        .toStrictEqual([ 7 ]);
    });

    it('adds the clicked event with Shift, last, and keeps it once when it was already in', () =>
    {
      // Arrange.
      const add = { add: true, toggle: false };

      // Act.
      const added = clickSelection([ 4, 2 ], 7, add);
      const again = clickSelection([ 4, 2 ], 4, add);

      // Assert.
      expect([ added, again ])
        .toStrictEqual([ [ 4, 2, 7 ], [ 4, 2 ] ]);
    });

    it('toggles the clicked event with Ctrl: out when it was in, in when it was out, the others untouched', () =>
    {
      // Arrange.
      const toggle = { add: false, toggle: true };

      // Act.
      const out = clickSelection([ 4, 2, 9 ], 2, toggle);
      const into = clickSelection([ 4, 9 ], 2, toggle);

      // Assert.
      expect([ out, into ])
        .toStrictEqual([ [ 4, 9 ], [ 4, 9, 2 ] ]);
    });

    it('toggles rather than adds when Shift and Ctrl are both held', () =>
    {
      // Arrange.
      const both = { add: true, toggle: true };

      // Act.
      const next = clickSelection([ 4, 2 ], 2, both);

      // Assert.
      expect(next)
        .toStrictEqual([ 4 ]);
    });

    it('clears the selection on empty ground with no modifier, and keeps it with one held', () =>
    {
      // Arrange.
      const current = [ 4, 2 ];

      // Act.
      const plain = clickSelection(current, null, REPLACE);
      const shifted = clickSelection(current, null, { add: true, toggle: false });
      const toggled = clickSelection(current, null, { add: false, toggle: true });

      // Assert.
      expect([ plain, shifted, toggled ])
        .toStrictEqual([ [], [ 4, 2 ], [ 4, 2 ] ]);
    });
  });

  describe('boxSelection', () =>
  {
    it('selects exactly what the box holds with no modifier', () =>
    {
      // Arrange: 4 was selected, and the box holds 2 and 7.

      // Act.
      const next = boxSelection([ 4 ], [ 2, 7 ], REPLACE);

      // Assert.
      expect(next)
        .toStrictEqual([ 2, 7 ]);
    });

    it('adds what the box holds with Shift, after what was selected, each once', () =>
    {
      // Arrange.
      const add = { add: true, toggle: false };

      // Act.
      const next = boxSelection([ 4, 2 ], [ 2, 7 ], add);

      // Assert.
      expect(next)
        .toStrictEqual([ 4, 2, 7 ]);
    });

    it('toggles each boxed event with Ctrl, keeping the unboxed ones', () =>
    {
      // Arrange: 2 was in and is boxed, 7 was out and is boxed, 4 was in and is not boxed.
      const toggle = { add: false, toggle: true };

      // Act.
      const next = boxSelection([ 4, 2 ], [ 2, 7 ], toggle);

      // Assert.
      expect(next)
        .toStrictEqual([ 4, 7 ]);
    });
  });

  describe('boxCells', () =>
  {
    const size = { width: 10, height: 8 };

    it('covers every tile between the two, both included, whichever way the box was drawn', () =>
    {
      // Arrange: the same box drawn down-right and up-left.

      // Act.
      const downRight = boxCells({ x: 2, y: 1 }, { x: 4, y: 3 }, size);
      const upLeft = boxCells({ x: 4, y: 3 }, { x: 2, y: 1 }, size);

      // Assert.
      expect([ downRight, upLeft ])
        .toStrictEqual([ { x: 2, y: 1, width: 3, height: 3 }, { x: 2, y: 1, width: 3, height: 3 } ]);
    });

    it('cuts a box started beside the map down to the map', () =>
    {
      // Arrange: from above and left of the map to beyond its bottom-right corner.

      // Act.
      const rect = boxCells({ x: -3, y: -2 }, { x: 14, y: 9 }, size);

      // Assert.
      expect(rect)
        .toStrictEqual({ x: 0, y: 0, width: 10, height: 8 });
    });

    it('covers nothing when the box misses the map', () =>
    {
      // Arrange: a box wholly right of the map.

      // Act.
      const rect = boxCells({ x: 11, y: 1 }, { x: 13, y: 3 }, size);

      // Assert.
      expect(rect)
        .toBeNull();
    });
  });

  describe('eventsInCells', () =>
  {
    // events 1 and 3 inside a 2x2 box at 1, 1; event 2 one tile right of it and event 4 one tile below it.
    const map = MapDocument.fromJson('map:1', mapWithEvents(6, 6, [ null, [ 1, 1 ], [ 3, 1 ], [ 2, 2 ], [ 1, 3 ] ]));

    it('lists the events on the tiles a box covers, in id order, and none a tile beyond it', () =>
    {
      // Arrange: the box covers 1, 1 to 2, 2.

      // Act.
      const inside = eventsInCells(map, { x: 1, y: 1, width: 2, height: 2 });

      // Assert.
      expect(inside)
        .toStrictEqual([ 1, 3 ]);
    });

    it('lists nothing for no box', () =>
    {
      // Arrange: nothing to set up; the box missed the map.

      // Act.
      const inside = eventsInCells(map, null);

      // Assert.
      expect(inside)
        .toStrictEqual([]);
    });
  });
});
