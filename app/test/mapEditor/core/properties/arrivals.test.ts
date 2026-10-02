import { describe, expect, it } from 'vitest';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventCommand, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  arrivalsFrom,
  describeStranded,
  strandedByResize,
  withLiveArrivals,
  type MapArrival,
} from '../../../../src/mapEditor/core/properties/arrivals.ts';

/*
 * A resize moves a map's tiles but never touches another map, so the transfers landing on it keep naming the old
 * tile numbers. What the resize owes the author is the list of them before it is made: every transfer, on any map,
 * that names outright a tile of the map the resize moves or cuts off, and none whose tile stays where it was. The
 * list is read the way the server reads the maps on disk (a transfer by variables names no map, and a landing
 * repeated on one page counts once), and a map open in this window is read from its live copy in place of the disk's
 * answer, so a transfer placed and not yet saved counts too.
 */
describe('arrivals', () =>
{
  /**
   * Builds a Transfer Player command.
   * @param {number} designation 0 for a map and tile named outright, 1 for variables holding them.
   * @param {number} mapId The map, or the variable holding it.
   * @param {number} x The tile's x, or the variable holding it.
   * @param {number} y The tile's y, or the variable holding it.
   * @returns {RmmzEventCommand} The command.
   */
  const transferTo = (designation: number, mapId: number, x: number, y: number): RmmzEventCommand => ({
    code: 201,
    indent: 0,
    parameters: [ designation, mapId, x, y, 2, 0 ],
  });

  /**
   * Builds an event whose pages run the given commands.
   * @param {number} id The event id.
   * @param {string} name Its name.
   * @param {RmmzEventCommand[][]} pages Each page's commands.
   * @returns {RmmzMapEvent} The event.
   */
  const eventRunning = (id: number, name: string, ...pages: RmmzEventCommand[][]): RmmzMapEvent => ({
    ...createMapEvent(id, 0, 0),
    name,
    pages: pages.map(list => ({ ...createEventPage(), list: [ ...list, { code: 0, indent: 0, parameters: [] } ] })),
  });

  /**
   * Builds an arrival on map 5.
   * @param {Partial<MapArrival>} fields What differs from a door on the town at 1, 0.
   * @returns {MapArrival} The arrival.
   */
  const arrival = (fields: Partial<MapArrival> = {}): MapArrival => ({
    mapId: 2,
    mapName: 'Town',
    eventId: 1,
    eventName: 'Door',
    pageIndex: 0,
    x: 1,
    y: 0,
    ...fields,
  });

  describe('arrivalsFrom', () =>
  {
    it('finds each transfer landing on the map, once per page and landing, and none going elsewhere or by variables', () =>
    {
      // Arrange.
      const events = [
        null,
        eventRunning(1, 'Door', [ transferTo(0, 5, 1, 0), transferTo(0, 5, 1, 0), transferTo(0, 6, 1, 0) ], [ transferTo(0, 5, 1, 0) ]),
        null,
        eventRunning(3, 'Trap', [ transferTo(1, 5, 1, 0), { code: 202, indent: 0, parameters: [ 0, 0, 5, 1, 0 ] }, transferTo(0, 5, 2, 1) ]),
      ];

      // Act.
      const found = arrivalsFrom({ mapId: 2, mapName: 'Town', events }, 5);

      // Assert.
      expect(found)
        .toStrictEqual([
          arrival(),
          arrival({ pageIndex: 1 }),
          arrival({ eventId: 3, eventName: 'Trap', x: 2, y: 1 }),
        ]);
    });
  });

  describe('withLiveArrivals', () =>
  {
    it('reads a map open here from its live copy in place of the disk, ordered by map, event and page', () =>
    {
      // Arrange: the disk knows the town's door and the cave's ladder; the town is open here, where its door moved.
      const disk = [ arrival(), arrival({ mapId: 7, mapName: 'Cave', eventName: 'Ladder' }) ];
      const live = [ arrival({ x: 2, y: 2 }), arrival({ eventId: 4, eventName: 'Hatch' }) ];

      // Act.
      const merged = withLiveArrivals(disk, live, new Set([ 2 ]));

      // Assert.
      expect(merged)
        .toStrictEqual([ arrival({ x: 2, y: 2 }), arrival({ eventId: 4, eventName: 'Hatch' }), arrival({ mapId: 7, mapName: 'Cave', eventName: 'Ladder' }) ]);
    });
  });

  describe('strandedByResize', () =>
  {
    it('lists every transfer whose tile the anchor moves, with where the tile goes', () =>
    {
      // Arrange: the map grows two tiles to the left, pinned at its right edge.
      const arrivals = [ arrival(), arrival({ eventId: 2, x: 0, y: 1 }) ];

      // Act.
      const stranded = strandedByResize(arrivals, { offsetX: 2, offsetY: 0, tiles: { width: 5, height: 2, data: [] } });

      // Assert.
      expect(stranded)
        .toStrictEqual([ { ...arrival(), movedTo: { x: 3, y: 0 } }, { ...arrival({ eventId: 2, x: 0, y: 1 }), movedTo: { x: 2, y: 1 } } ]);
    });

    it('lists a transfer whose tile a shrink cuts off, and none whose tile stays where it was', () =>
    {
      // Arrange: pinned at the top left, the map loses its last column.
      const arrivals = [ arrival({ x: 2, y: 1 }), arrival({ eventId: 2, x: 1, y: 1 }) ];

      // Act.
      const stranded = strandedByResize(arrivals, { offsetX: 0, offsetY: 0, tiles: { width: 2, height: 2, data: [] } });

      // Assert.
      expect(stranded)
        .toStrictEqual([ { ...arrival({ x: 2, y: 1 }), movedTo: null } ]);
    });

    it('lists a transfer whose tile a shift pushes off the far edge as cut off', () =>
    {
      // Arrange: pinned at the bottom, the map loses its top row.
      const arrivals = [ arrival({ x: 1, y: 0 }) ];

      // Act.
      const stranded = strandedByResize(arrivals, { offsetX: 0, offsetY: -1, tiles: { width: 3, height: 1, data: [] } });

      // Assert.
      expect(stranded)
        .toStrictEqual([ { ...arrival({ x: 1, y: 0 }), movedTo: null } ]);
    });
  });

  describe('describeStranded', () =>
  {
    it('names the transfer, its page counted from one, its tile, and what becomes of the tile', () =>
    {
      // Arrange: one moved, one cut off, and one on a map the tree has no name for.
      const lines = [
        { ...arrival({ pageIndex: 1 }), movedTo: { x: 3, y: 0 } },
        { ...arrival(), movedTo: null },
        { ...arrival({ mapId: 9, mapName: '' }), movedTo: { x: 3, y: 0 } },
      ];

      // Act.
      const words = lines.map(describeStranded);

      // Assert.
      expect(words)
        .toStrictEqual([
          'Town, "Door" (page 2) lands on 1, 0; that spot moves to 3, 0.',
          'Town, "Door" (page 1) lands on 1, 0; that spot is cut off.',
          'Map 9, "Door" (page 1) lands on 1, 0; that spot moves to 3, 0.',
        ]);
    });
  });
});
