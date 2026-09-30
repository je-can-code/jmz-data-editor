import { describe, expect, it } from 'vitest';
import {
  copyEvents,
  cutEvents,
  decodeEventClipboard,
  duplicateEvents,
  encodeEventClipboard,
  EVENT_CLIPBOARD_MARKER,
  pasteEvents,
  planPaste,
  type EventClipboard,
} from '../../../../src/mapEditor/core/events/eventClipboard.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { hubWithMaps, mapFileOf, mapWithEvents, spotsOf } from '../../support/eventFixtures.ts';

/*
 * Events copy through the system clipboard as JSON carrying a marker, so they paste across maps and across windows,
 * and a paste of anything else (a line of dialogue copied from a text box) changes nothing. Copies are whole: every
 * page, command and note, exactly as the map file holds the event. A paste keeps the group's layout, with its
 * top-left corner on the tile asked for (or on the tiles it was copied from, when no tile is), slides back onto the
 * map at an edge, and gives every pasted event a fresh id on the map it lands on: the lowest free ids, holes first,
 * never an id already in use, since a collision would silently replace an event. A paste that would land an event on
 * another is refused whole. Duplicate pastes copies beside the originals; cut copies and then deletes. Each is one
 * step in the map's history.
 *
 * The source fixture is a 6x4 map (map 1): event 1 at 1, 1 and event 2 at 2, 1, slot 3 empty, and event 4 at 5, 3.
 */
describe('eventClipboard', () =>
{
  /**
   * Builds the source map's file.
   * @returns {ReturnType<typeof mapWithEvents>} The file.
   */
  const source = () => mapWithEvents(6, 4, [ null, [ 1, 1 ], [ 2, 1 ], null, [ 5, 3 ] ]);

  /**
   * Copies events off the source map.
   * @param {readonly number[]} eventIds The events.
   * @returns {EventClipboard} The clipboard.
   */
  const copied = (eventIds: readonly number[]): EventClipboard =>
  {
    return copyEvents(MapDocument.fromJson('map:1', source()), 1, eventIds) as EventClipboard;
  };

  /**
   * Reads the ids, names, notes and tiles of events, which is what tells a copy apart from its original.
   * @param {readonly (RmmzMapEvent | null)[]} events The events.
   * @returns {(string | null)[]} One line per event.
   */
  const described = (events: readonly (RmmzMapEvent | null)[]): (string | null)[] =>
  {
    return events.map(event => (event === null ? null : `${event.id} ${event.name} (${event.note}) at ${event.x},${event.y}`));
  };

  describe('copyEvents', () =>
  {
    it('copies whole events in id order, with the marker and the map they came from, passing over empty slots', () =>
    {
      // Arrange: 3 is an empty slot.
      const map = MapDocument.fromJson('map:1', source());

      // Act.
      const clipboard = copyEvents(map, 1, [ 2, 3, 1 ]);

      // Assert.
      expect(clipboard)
        .toStrictEqual({ marker: EVENT_CLIPBOARD_MARKER, version: 1, mapId: 1, events: [ source().events[1], source().events[2] ] });
    });

    it('copies apart from the map, so changing a copy never changes the map', () =>
    {
      // Arrange.
      const map = MapDocument.fromJson('map:1', source());
      const clipboard = copyEvents(map, 1, [ 1 ]) as EventClipboard;

      // Act.
      (clipboard.events[0] as RmmzMapEvent).name = 'Changed';

      // Assert.
      expect(map.event(1)?.name)
        .toBe('EV001');
    });

    it('copies nothing when no event asked for is held', () =>
    {
      // Arrange.
      const map = MapDocument.fromJson('map:1', source());

      // Act.
      const clipboard = copyEvents(map, 1, [ 3 ]);

      // Assert.
      expect(clipboard)
        .toBeNull();
    });
  });

  describe('decodeEventClipboard', () =>
  {
    it('reads back exactly what was written', () =>
    {
      // Arrange.
      const clipboard = copied([ 1, 4 ]);

      // Act.
      const read = decodeEventClipboard(encodeEventClipboard(clipboard));

      // Assert.
      expect(read)
        .toStrictEqual(clipboard);
    });

    it('reads anything else as nothing: plain text, other JSON, another shape, no events, or a malformed event', () =>
    {
      // Arrange.
      const valid = JSON.parse(encodeEventClipboard(copied([ 1 ]))) as Record<string, unknown>;
      const texts = [
        'Welcome to Nimbus!',
        '{"events":[]}',
        JSON.stringify({ ...valid, marker: 'something-else' }),
        JSON.stringify({ ...valid, version: 2 }),
        JSON.stringify({ ...valid, mapId: 0 }),
        JSON.stringify({ ...valid, events: [] }),
        JSON.stringify({ ...valid, events: [ { id: 1, x: 0, y: 0, name: 'No pages', note: '' } ] }),
        JSON.stringify({ ...valid, events: [ { ...source().events[1], x: -1 } ] }),
        '[1, 2, 3]',
      ];

      // Act.
      const read = texts.map(decodeEventClipboard);

      // Assert.
      expect(read)
        .toStrictEqual(texts.map(() => null));
    });
  });

  describe('planPaste', () =>
  {
    it('lands the group\'s top-left corner on the target, keeping its layout, with the lowest free ids on the map', () =>
    {
      // Arrange: map 2 holds event 1 at 0, 0, a hole at 2 and event 3 at 5, 0; events 1 and 2 were copied from map 1.
      const target = MapDocument.fromJson('map:2', mapWithEvents(6, 4, [ null, [ 0, 0 ], null, [ 5, 0 ] ]));

      // Act.
      const plan = planPaste(target, copied([ 1, 2 ]), { x: 3, y: 2 });

      // Assert: the hole takes the first, the list grows for the second, and ids 1 and 3 stay with their events.
      expect(plan.ok && described(plan.events))
        .toStrictEqual([ '2 EV001 (event 1) at 3,2', '4 EV002 (event 2) at 4,2' ]);
    });

    it('lands every event on the tile it was copied from when no target is given', () =>
    {
      // Arrange: an empty map of the same size.
      const target = MapDocument.fromJson('map:2', mapWithEvents(6, 4, [ null ]));

      // Act.
      const plan = planPaste(target, copied([ 1, 4 ]), null);

      // Assert.
      expect(plan.ok && described(plan.events))
        .toStrictEqual([ '1 EV001 (event 1) at 1,1', '2 EV004 (event 4) at 5,3' ]);
    });

    it('slides a group reaching past the map\'s edge back onto it', () =>
    {
      // Arrange: events 1 and 2 span two tiles across, pasted at the last column of a 4x3 map.
      const target = MapDocument.fromJson('map:2', mapWithEvents(4, 3, [ null ]));

      // Act.
      const plan = planPaste(target, copied([ 1, 2 ]), { x: 3, y: 2 });

      // Assert.
      expect(plan.ok && described(plan.events))
        .toStrictEqual([ '1 EV001 (event 1) at 2,2', '2 EV002 (event 2) at 3,2' ]);
    });

    it('refuses a paste that would land events on others, counting them', () =>
    {
      // Arrange: map 2's event 1 stands where the copied event 2 would land; the copied event 1's tile is free.
      const target = MapDocument.fromJson('map:2', mapWithEvents(6, 4, [ null, [ 4, 2 ] ]));

      // Act.
      const plan = planPaste(target, copied([ 1, 2 ]), { x: 3, y: 2 });

      // Assert.
      expect(plan)
        .toStrictEqual({ ok: false, message: '1 of the 2 pasted events would land on other events.' });
    });

    it('refuses a single event landing on another in words for one event', () =>
    {
      // Arrange.
      const target = MapDocument.fromJson('map:2', mapWithEvents(6, 4, [ null, [ 3, 2 ] ]));

      // Act.
      const plan = planPaste(target, copied([ 1 ]), { x: 3, y: 2 });

      // Assert.
      expect(plan)
        .toStrictEqual({ ok: false, message: 'The pasted event would land on another event.' });
    });

    it('refuses a group wider or taller than the map', () =>
    {
      // Arrange: events 1 and 4 span five tiles across; the map is four wide.
      const target = MapDocument.fromJson('map:2', mapWithEvents(4, 6, [ null ]));

      // Act.
      const plan = planPaste(target, copied([ 1, 4 ]), { x: 0, y: 0 });

      // Assert.
      expect(plan)
        .toStrictEqual({ ok: false, message: 'The pasted 2 events do not fit on this map.' });
    });
  });

  describe('pasteEvents', () =>
  {
    it('pastes onto another map as one step with fresh ids there, leaving the source map alone, and one undo takes it back', () =>
    {
      // Arrange: map 2 already uses id 1.
      const destination = mapWithEvents(6, 4, [ null, [ 0, 0 ] ]);
      const hub = hubWithMaps({ 1: source(), 2: destination });

      // Act.
      const outcome = pasteEvents(hub, 2, copied([ 1, 2 ]), { x: 1, y: 3 });
      const landed = described(mapFileOf(hub, 2).events);
      const untouched = mapFileOf(hub, 1);
      hub.undo(mapHistoryKey(2));

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.eventIds, landed, untouched, mapFileOf(hub, 2) ])
        .toStrictEqual([
          'Paste 2 events',
          [ 2, 3 ],
          [ null, '1 EV001 (event 1) at 0,0', '2 EV001 (event 1) at 1,3', '3 EV002 (event 2) at 2,3' ],
          source(),
          destination,
        ]);
    });

    it('changes nothing and says why when the paste is refused', () =>
    {
      // Arrange: the copied events' own tiles, still held on the map they came from.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const outcome = pasteEvents(hub, 1, copied([ 1 ]), null);

      // Assert.
      expect([ outcome, mapFileOf(hub, 1) ])
        .toStrictEqual([ { ok: false, message: 'The pasted event would land on another event.' }, source() ]);
    });
  });

  describe('duplicateEvents', () =>
  {
    it('places a copy one tile right of the original as one step, with a fresh id', () =>
    {
      // Arrange: event 2 has an empty tile to its right.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const outcome = duplicateEvents(hub, 1, [ 2 ]);

      // Assert: the hole at 3 takes the copy; every original stays where it was.
      const { events } = mapFileOf(hub, 1);
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.eventIds, described(events) ])
        .toStrictEqual([
          'Duplicate event',
          [ 3 ],
          [ null, '1 EV001 (event 1) at 1,1', '2 EV002 (event 2) at 2,1', '3 EV002 (event 2) at 3,1', '4 EV004 (event 4) at 5,3' ],
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
          [ 3, 5 ],
          [ null, '1 EV001 (event 1) at 1,1', '2 EV002 (event 2) at 2,1', '3 EV001 (event 1) at 1,2', '4 EV004 (event 4) at 5,3', '5 EV002 (event 2) at 2,2' ],
        ]);
    });

    it('tries below, then left, then above when the group has no room to its right', () =>
    {
      // Arrange: event 4 stands in the bottom-right corner, so right and below are off the map.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const outcome = duplicateEvents(hub, 1, [ 4 ]);

      // Assert.
      expect([ outcome.ok && outcome.eventIds, spotsOf(mapFileOf(hub, 1))[3] ])
        .toStrictEqual([ [ 3 ], [ 4, 3 ] ]);
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
  });

  describe('cutEvents', () =>
  {
    it('copies the events for the clipboard and removes them as one step, which one undo takes back', () =>
    {
      // Arrange.
      const hub = hubWithMaps({ 1: source() });

      // Act.
      const { clipboard, outcome } = cutEvents(hub, 1, [ 2 ]);
      const after = spotsOf(mapFileOf(hub, 1));
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ clipboard?.events.map(event => event.id), outcome.ok && outcome.step?.label, after, mapFileOf(hub, 1) ])
        .toStrictEqual([ [ 2 ], 'Cut event', [ null, [ 1, 1 ], null, null, [ 5, 3 ] ], source() ]);
    });
  });
});
