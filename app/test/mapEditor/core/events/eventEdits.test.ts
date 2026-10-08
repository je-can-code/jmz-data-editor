import { describe, expect, it } from 'vitest';
import { createEvent, deleteEvents, duplicateEvents } from '../../../../src/mapEditor/core/events/eventEdits.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { hubWithMaps, mapFileOf, mapWithEvents, spotsOf } from '../../support/eventFixtures.ts';
import { command } from '../../support/eventKindFixtures.ts';

/*
 * Creating, deleting and duplicating events are single steps in the map's history, so one undo takes any of them back
 * exactly. A new event takes the id past the end of the list, never an id in use and never the hole a delete left,
 * which a self switch in a save or a command in another event may still name; it starts as MZ starts one: named for
 * its id, with one fresh page. It goes only on an empty tile of the map, since MZ never stacks events. A delete
 * empties each event's slot and leaves the list its length, as MZ does, passes over ids the map does not hold, and
 * records nothing when there is nothing to remove. Events not deleted stay exactly as they were.
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

  /*
   * A duplicate places copies beside the originals at once, as one step: one tile right, or below, left or above when
   * the group does not fit there, never on an original or any other event, with fresh ids past the end of the list.
   * The copies' commands naming one another name the copies; the originals' own never change.
   *
   * Its fixture is a 6x4 map: event 1 at 1, 1 and event 2 at 2, 1, slot 3 empty, and event 4 at 5, 3.
   */
  describe('duplicateEvents', () =>
  {
    /**
     * Builds the duplicate fixture's file.
     * @returns {ReturnType<typeof mapWithEvents>} The file.
     */
    const source = () => mapWithEvents(6, 4, [ null, [ 1, 1 ], [ 2, 1 ], null, [ 5, 3 ] ]);

    /**
     * Reads the ids, names, notes and tiles of events, which is what tells a copy apart from its original.
     * @param {readonly (RmmzMapEvent | null)[]} events The events.
     * @returns {(string | null)[]} One line per event.
     */
    const described = (events: readonly (RmmzMapEvent | null)[]): (string | null)[] =>
    {
      return events.map(event => (event === null ? null : `${event.id} ${event.name} (${event.note}) at ${event.x},${event.y}`));
    };

    /**
     * Builds the fixture with events that name each other: event 1 moves event 2 and balloons over event 4, and event 2
     * exchanges places with event 1.
     * @returns {ReturnType<typeof mapWithEvents>} The file.
     */
    const linkedSource = () =>
    {
      const file = source();
      const [ , first, second ] = file.events as RmmzMapEvent[];
      first.pages[0].list.unshift(command(205, [ 2, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: true } ]), command(213, [ 4, 1, false ]));
      second.pages[0].list.unshift(command(203, [ 0, 2, 1, 0, 0 ]));
      return file;
    };

    /**
     * Reads the character each of an event's commands names, leaving out the closing command.
     * @param {RmmzMapEvent | null} event The event.
     * @returns {string[]} One line per command, such as "205 -> 2".
     */
    const namedBy = (event: RmmzMapEvent | null): string[] =>
    {
      const list = event === null ? [] : event.pages[0].list.slice(0, -1);
      return list.map(each => `${each.code} -> ${each.code === 203 ? `${String(each.parameters[0])} and ${String(each.parameters[2])}` : String(each.parameters[0])}`);
    };

    it('places a copy one tile right of the original as one step, with a fresh id', () =>
    {
      // Arrange: event 2 has an empty tile to its right.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const outcome = duplicateEvents(hub, 1, [ 2 ]);

      // Assert: the copy takes id 5, past the end, leaving the hole at 3 empty; every original stays where it was.
      const { events } = mapFileOf(hub, 1);
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.eventIds, described(events) ])
        .toStrictEqual([
          'Duplicate event',
          [ 5 ],
          [ null, '1 EV001 (event 1) at 1,1', '2 EV002 (event 2) at 2,1', null, '4 EV004 (event 4) at 5,3', '5 EV002 (event 2) at 3,1' ],
        ]);
    });

    it('never lands a copy on an original: a group whose right is its own second event goes below instead', () =>
    {
      // Arrange: one tile right, event 1's copy would land on event 2, which stays where it is.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const outcome = duplicateEvents(hub, 1, [ 1, 2 ]);

      // Assert.
      const { events } = mapFileOf(hub, 1);
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.eventIds, described(events) ])
        .toStrictEqual([
          'Duplicate 2 events',
          [ 5, 6 ],
          [ null, '1 EV001 (event 1) at 1,1', '2 EV002 (event 2) at 2,1', null, '4 EV004 (event 4) at 5,3', '5 EV001 (event 1) at 1,2', '6 EV002 (event 2) at 2,2' ],
        ]);
    });

    it('points the copies\' commands naming each other at the copies, leaving the originals\' commands as they were', () =>
    {
      // Arrange: events 1 and 2 name each other; their copies go below them, as 5 and 6.
      const hub = hubWithMaps({ 1: linkedSource() });

      // Act.
      duplicateEvents(hub, 1, [ 1, 2 ]);

      // Assert.
      const { events } = mapFileOf(hub, 1);
      expect([ 1, 2, 5, 6 ].map(id => namedBy(events[id])))
        .toStrictEqual([ [ '205 -> 2', '213 -> 4' ], [ '203 -> 0 and 1' ], [ '205 -> 6', '213 -> 4' ], [ '203 -> 0 and 5' ] ]);
    });

    it('tries below, then left, then above when the group has no room to its right', () =>
    {
      // Arrange: event 4 stands in the bottom-right corner, so right and below are off the map.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const outcome = duplicateEvents(hub, 1, [ 4 ]);

      // Assert: the copy stands left of event 4, at 4, 3.
      expect([ outcome.ok && outcome.eventIds, spotsOf(mapFileOf(hub, 1))[5] ])
        .toStrictEqual([ [ 5 ], [ 4, 3 ] ]);
    });

    it('refuses when there is no room on any side, changing nothing', () =>
    {
      // Arrange: a 1x2 map full of events.
      const file = mapWithEvents(1, 2, [ null, [ 0, 0 ], [ 0, 1 ] ]);
      const hub = hubWithMaps({ 1: file });

      // Act.
      const outcome = duplicateEvents(hub, 1, [ 1 ]);

      // Assert.
      expect([ outcome, mapFileOf(hub, 1) ])
        .toStrictEqual([ { ok: false, message: 'There is no room beside the selection for a copy.' }, file ]);
    });

    it('records nothing when no event asked for is held', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const outcome = duplicateEvents(hub, 1, [ 3 ]);

      // Assert.
      expect(outcome)
        .toStrictEqual({ ok: true, step: null, eventIds: [] });
    });

    it('takes the whole duplicate back with one undo', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: source() });
      duplicateEvents(hub, 1, [ 1, 2 ]);

      // Act.
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect(mapFileOf(hub, 1))
        .toStrictEqual(source());
    });
  });
});
