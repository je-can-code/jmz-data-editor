import { describe, expect, it } from 'vitest';
import { createEvent, deleteEvents } from '../../../../src/mapEditor/core/events/eventEdits.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { hubWithMaps, mapFileOf, mapWithEvents, spotsOf } from '../../support/eventFixtures.ts';

/*
 * Creating and deleting events are single steps in the map's history, so one undo takes either back exactly. A new
 * event takes the id past the end of the list, never an id in use and never the hole a delete left, which a self
 * switch in a save or a command in another event may still name; it starts as MZ starts one: named for its id, with
 * one fresh page. It goes only on an empty tile of the map, since MZ never stacks events. A delete empties each
 * event's slot and leaves the list its length, as MZ does, passes over ids the map does not hold, and records nothing
 * when there is nothing to remove. Events not deleted stay exactly as they were.
 *
 * The fixture is a 4x3 map: event 1 at 0, 0, slot 2 empty, event 3 at 2, 1.
 */
describe('eventEdits', () =>
{
  /**
   * Builds the fixture map's file.
   * @returns {ReturnType<typeof mapWithEvents>} The file.
   */
  const fixture = () => mapWithEvents(4, 3, [ null, [ 0, 0 ], null, [ 2, 1 ] ]);

  describe('createEvent', () =>
  {
    it('places a fresh event past the end of the list as one step, which one undo takes back', () =>
    {
      // Arrange: slot 2 is the hole a delete left, which the new event must not take.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const outcome = createEvent(hub, 1, { x: 3, y: 2 });
      const { events } = mapFileOf(hub, 1);
      hub.undo(mapHistoryKey(1));

      // Assert: slot 2 stays empty; 1 and 3 kept their events.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.eventIds, events[2], events[4], mapFileOf(hub, 1) ])
        .toStrictEqual([
          'New event',
          [ 4 ],
          null,
          { id: 4, name: 'EV004', note: '', pages: [ createEventPage() ], x: 3, y: 2 },
          fixture(),
        ]);
    });

    it('takes the next id again for each new event, leaving the hole empty', () =>
    {
      // Arrange: one event placed already, as id 4.
      const hub = hubWithMaps({ 1: fixture() });
      createEvent(hub, 1, { x: 3, y: 2 });

      // Act.
      const outcome = createEvent(hub, 1, { x: 1, y: 2 });

      // Assert.
      expect([ outcome.ok && outcome.eventIds, spotsOf(mapFileOf(hub, 1)) ])
        .toStrictEqual([ [ 5 ], [ null, [ 0, 0 ], null, [ 2, 1 ], [ 3, 2 ], [ 1, 2 ] ] ]);
    });

    it('never hands out the id of an event deleted earlier', () =>
    {
      // Arrange: event 3, the last in the list, is deleted, leaving its slot empty at the end.
      const hub = hubWithMaps({ 1: fixture() });
      deleteEvents(hub, 1, [ 3 ]);

      // Act.
      const outcome = createEvent(hub, 1, { x: 2, y: 1 });

      // Assert: the new event stands where event 3 stood, yet takes id 4, so nothing naming 3 reaches it.
      expect([ outcome.ok && outcome.eventIds, spotsOf(mapFileOf(hub, 1)) ])
        .toStrictEqual([ [ 4 ], [ null, [ 0, 0 ], null, null, [ 2, 1 ] ] ]);
    });

    it('refuses a tile another event holds, changing nothing', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const outcome = createEvent(hub, 1, { x: 2, y: 1 });

      // Assert.
      expect([ outcome, mapFileOf(hub, 1), hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ { ok: false, message: 'Another event already stands there.' }, fixture(), 0 ]);
    });

    it('refuses a spot off the map, changing nothing', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const outcome = createEvent(hub, 1, { x: 4, y: 0 });

      // Assert.
      expect([ outcome, mapFileOf(hub, 1) ])
        .toStrictEqual([ { ok: false, message: 'That spot is off the map.' }, fixture() ]);
    });
  });

  describe('deleteEvents', () =>
  {
    it('empties each event\'s slot as one step, keeps the list its length, and one undo brings them back', () =>
    {
      // Arrange: a map with a trailing event 4 as well.
      const file = mapWithEvents(4, 3, [ null, [ 0, 0 ], null, [ 2, 1 ], [ 3, 2 ] ]);
      const hub = hubWithMaps({ 1: file });

      // Act.
      const outcome = deleteEvents(hub, 1, [ 1, 4 ]);
      const after = spotsOf(mapFileOf(hub, 1));
      hub.undo(mapHistoryKey(1));

      // Assert: event 3 was never touched.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.eventIds, after, mapFileOf(hub, 1) ])
        .toStrictEqual([ 'Delete 2 events', [], [ null, null, null, [ 2, 1 ], null ], file ]);
    });

    it('names the step for one event, and as a cut when the events went to the clipboard', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const deleted = deleteEvents(hub, 1, [ 1 ]);
      const cut = deleteEvents(hub, 1, [ 3 ], 'Cut');

      // Assert.
      expect([ deleted.ok && deleted.step?.label, cut.ok && cut.step?.label ])
        .toStrictEqual([ 'Delete event', 'Cut event' ]);
    });

    it('passes over ids the map does not hold, and records nothing when none is held', () =>
    {
      // Arrange: slot 2 is empty and 9 is beyond the list.
      const hub = hubWithMaps({ 1: fixture() });

      // Act.
      const outcome = deleteEvents(hub, 1, [ 2, 9 ]);

      // Assert.
      expect([ outcome, mapFileOf(hub, 1), hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ { ok: true, step: null, eventIds: [] }, fixture(), 0 ]);
    });
  });
});
