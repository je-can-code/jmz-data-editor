import { describe, expect, it } from 'vitest';
import {
  blockedCells,
  boundsOf,
  eventCellsOf,
  eventsPhrase,
  freeEventIds,
  isOnMap,
  shiftWithinMap,
} from '../../../../src/mapEditor/core/events/eventPlacement.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';

/*
 * Every event edit leans on the same few facts about a map, so they are worked out one way. A group of events is
 * shifted as a block, and stops at the map's edge each way on its own rather than going over it. A tile another event
 * holds blocks a landing, but a tile the group itself is leaving never does, or a group could not shift one tile. New
 * events take the lowest free ids, filling the holes a delete left before growing the list, and never an id the map
 * already uses: a collision there would silently replace an event.
 *
 * The fixture is a 6x4 map: event 1 at 0, 0, event 2 at 1, 0, slot 3 empty, event 4 at 3, 2, slot 5 empty.
 */
describe('eventPlacement', () =>
{
  const map = MapDocument.fromJson('map:1', mapWithEvents(6, 4, [ null, [ 0, 0 ], [ 1, 0 ], null, [ 3, 2 ], null ]));

  describe('eventCellsOf', () =>
  {
    it('finds where the events asked for stand, once each, in the order asked, passing over empty slots', () =>
    {
      // Arrange: 3 is an empty slot and 9 is beyond the list.

      // Act.
      const cells = eventCellsOf(map, [ 4, 3, 1, 4, 9 ]);

      // Assert.
      expect(cells)
        .toStrictEqual([ { id: 4, x: 3, y: 2 }, { id: 1, x: 0, y: 0 } ]);
    });
  });

  describe('boundsOf', () =>
  {
    it('finds the smallest rectangle of tiles holding every cell, and none for no cells', () =>
    {
      // Arrange.
      const cells = [ { x: 3, y: 2 }, { x: 0, y: 0 }, { x: 1, y: 3 } ];

      // Act.
      const bounds = boundsOf(cells);
      const empty = boundsOf([]);

      // Assert.
      expect([ bounds, empty ])
        .toStrictEqual([ { x: 0, y: 0, width: 4, height: 4 }, null ]);
    });
  });

  describe('isOnMap', () =>
  {
    it('holds the map\'s own tiles and nothing a tile past any edge', () =>
    {
      // Arrange: the corners, then one past each edge.
      const cells = [ { x: 0, y: 0 }, { x: 5, y: 3 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 6, y: 0 }, { x: 0, y: 4 } ];

      // Act.
      const onMap = cells.map(cell => isOnMap(cell, map));

      // Assert.
      expect(onMap)
        .toStrictEqual([ true, true, false, false, false, false ]);
    });
  });

  describe('shiftWithinMap', () =>
  {
    it('keeps a shift that stays on the map as it is', () =>
    {
      // Arrange: a 2x1 group at 1, 1.

      // Act.
      const shift = shiftWithinMap({ x: 1, y: 1, width: 2, height: 1 }, 2, 1, map);

      // Assert.
      expect(shift)
        .toStrictEqual({ dx: 2, dy: 1 });
    });

    it('stops the group at each edge on its own, so it slides along a wall', () =>
    {
      // Arrange: the same group pushed far right and up, then far left and down.

      // Act.
      const rightUp = shiftWithinMap({ x: 1, y: 1, width: 2, height: 1 }, 9, -5, map);
      const leftDown = shiftWithinMap({ x: 1, y: 1, width: 2, height: 1 }, -5, 9, map);

      // Assert: the right edge is at 5, so the group's left may reach 4; the bottom is at 3.
      expect([ rightUp, leftDown ])
        .toStrictEqual([ { dx: 3, dy: -1 }, { dx: -1, dy: 2 } ]);
    });

    it('slides a group lying off the map back onto it', () =>
    {
      // Arrange: a group copied from a bigger map, standing past this one's right edge.

      // Act.
      const shift = shiftWithinMap({ x: 7, y: 0, width: 2, height: 1 }, 0, 0, map);

      // Assert.
      expect(shift)
        .toStrictEqual({ dx: -3, dy: 0 });
    });
  });

  describe('blockedCells', () =>
  {
    it('finds the tiles other events hold, but never one an event leaving it holds', () =>
    {
      // Arrange: event 1 moves onto event 2's tile and event 2 moves on; event 4 stays where the third lands.
      const targets = [ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 2 } ];

      // Act.
      const blocked = blockedCells(map, targets, new Set([ 1, 2 ]));

      // Assert.
      expect(blocked)
        .toStrictEqual([ { x: 3, y: 2 } ]);
    });

    it('names a blocked tile once, however many events would land on it', () =>
    {
      // Arrange: two landings on event 4's tile.

      // Act.
      const blocked = blockedCells(map, [ { x: 3, y: 2 }, { x: 3, y: 2 } ], new Set());

      // Assert.
      expect(blocked)
        .toStrictEqual([ { x: 3, y: 2 } ]);
    });
  });

  describe('freeEventIds', () =>
  {
    it('fills the empty slots first, then grows the list, never taking an id in use', () =>
    {
      // Arrange: 3 and 5 are empty slots; 1, 2 and 4 are taken, and the list ends after 5.

      // Act.
      const ids = freeEventIds(map, 4);

      // Assert.
      expect(ids)
        .toStrictEqual([ 3, 5, 6, 7 ]);
    });

    it('hands out nothing when nothing is asked for', () =>
    {
      // Arrange: nothing to set up.

      // Act.
      const ids = freeEventIds(map, 0);

      // Assert.
      expect(ids)
        .toStrictEqual([]);
    });
  });

  describe('eventsPhrase', () =>
  {
    it('words one event and several', () =>
    {
      // Arrange: nothing to set up.

      // Act.
      const phrases = [ eventsPhrase(1), eventsPhrase(3) ];

      // Assert.
      expect(phrases)
        .toStrictEqual([ 'event', '3 events' ]);
    });
  });
});
