import { describe, expect, it } from 'vitest';
import { dragShift, moveEvents, planEventMove } from '../../../../src/mapEditor/core/events/eventMoves.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { hubWithMaps, mapFileOf, mapWithEvents, spotsOf } from '../../support/eventFixtures.ts';

/*
 * Events move as a group, dragged or nudged a tile at a time with the arrow keys, keeping their places relative to
 * each other, and every move is one step in the map's history that one undo takes back. A group never leaves the map,
 * and never lands an event on a tile held by an event outside the group, since MZ never stacks events and none of the
 * shipped maps do; tiles the group is leaving are free to land on. A refused move changes nothing and says why. A drag
 * pushed into the map's edge slides along it rather than refusing. Events not in the group never move, and neither
 * does anything on another map.
 *
 * The fixture is a 5x4 map: event 1 at 0, 0, event 2 at 1, 0, event 3 at 4, 3, and event 4 at 2, 2.
 */
describe('eventMoves', () =>
{
  /**
   * Builds the fixture map's file.
   * @returns {ReturnType<typeof mapWithEvents>} The file.
   */
  const fixture = () => mapWithEvents(5, 4, [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 3 ], [ 2, 2 ] ]);

  describe('planEventMove', () =>
  {
    const map = MapDocument.fromJson('map:1', fixture());

    it('moves every event of the group by the shift', () =>
    {
      // Arrange: events 1 and 2 go one down.

      // Act.
      const plan = planEventMove(map, [ 1, 2 ], 0, 1);

      // Assert.
      expect(plan)
        .toStrictEqual({
          ok: true,
          moves: [
            { id: 1, from: { x: 0, y: 0 }, to: { x: 0, y: 1 } },
            { id: 2, from: { x: 1, y: 0 }, to: { x: 1, y: 1 } },
          ],
        });
    });

    it('lets a group land on the tiles it leaves', () =>
    {
      // Arrange: event 1 lands where event 2 stood, and event 2 moves on.

      // Act.
      const plan = planEventMove(map, [ 1, 2 ], 1, 0);

      // Assert.
      expect(plan.ok)
        .toBe(true);
    });

    it('refuses to land an event on a tile an event outside the group holds, naming the tile', () =>
    {
      // Arrange: event 1 alone onto event 2's tile.

      // Act.
      const plan = planEventMove(map, [ 1 ], 1, 0);

      // Assert.
      expect(plan)
        .toStrictEqual({ ok: false, reason: 'blocked', message: 'Another event is in the way.', blocked: [ { x: 1, y: 0 } ] });
    });

    it('refuses to take any event of the group off the map', () =>
    {
      // Arrange: event 3 stands in the bottom-right corner.

      // Act.
      const plan = planEventMove(map, [ 4, 3 ], 1, 0);

      // Assert.
      expect(plan)
        .toStrictEqual({ ok: false, reason: 'edge', message: 'The map ends there.', blocked: [] });
    });
  });

  describe('dragShift', () =>
  {
    const map = MapDocument.fromJson('map:1', fixture());

    it('stops a dragged group at the map\'s edge, each way on its own', () =>
    {
      // Arrange: events 1 and 4 span 0, 0 to 2, 2, dragged far left and a little down.

      // Act.
      const shift = dragShift(map, [ 1, 4 ], -3, 1);

      // Assert.
      expect(shift)
        .toStrictEqual({ dx: 0, dy: 1 });
    });

    it('keeps the pointer\'s shift for a group the map does not hold', () =>
    {
      // Arrange: slot 7 is beyond the list.

      // Act.
      const shift = dragShift(map, [ 7 ], -3, 1);

      // Assert.
      expect(shift)
        .toStrictEqual({ dx: -3, dy: 1 });
    });
  });

  describe('moveEvents', () =>
  {
    it('moves a group as one named step that one undo takes back, leaving the other events and maps alone', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: fixture(), 2: fixture() });

      // Act.
      const outcome = moveEvents(hub, 1, [ 1, 2 ], 0, 1);
      const moved = spotsOf(mapFileOf(hub, 1));
      const other = spotsOf(mapFileOf(hub, 2));
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.eventIds, moved, other, mapFileOf(hub, 1) ])
        .toStrictEqual([
          'Move 2 events',
          [ 1, 2 ],
          [ null, [ 0, 1 ], [ 1, 1 ], [ 4, 3 ], [ 2, 2 ] ],
          [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 3 ], [ 2, 2 ] ],
          fixture(),
        ]);
    });

    it('nudges one event a tile, naming the step for one event, and writes only the axis that changed', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const outcome = moveEvents(hub, 1, [ 4 ], -1, 0);

      // Assert.
      const step = outcome.ok ? outcome.step : null;
      expect([ step?.label, step?.entries.map(entry => entry.patch.kind === 'set' && entry.patch.path), spotsOf(mapFileOf(hub, 1))[4] ])
        .toStrictEqual([ 'Move event', [ [ 'events', 4, 'x' ] ], [ 1, 2 ] ]);
    });

    it('records nothing for a shift of nothing', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const outcome = moveEvents(hub, 1, [ 1 ], 0, 0);

      // Assert.
      expect([ outcome, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ { ok: true, step: null, eventIds: [ 1 ] }, 0 ]);
    });

    it('changes nothing and says why when the move is refused', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const outcome = moveEvents(hub, 1, [ 1 ], 1, 0);

      // Assert.
      expect([ outcome, mapFileOf(hub, 1), hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ { ok: false, message: 'Another event is in the way.' }, fixture(), 0 ]);
    });
  });
});
