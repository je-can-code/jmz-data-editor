import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventCommand, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { ClipEventsPreview, commitClipEvents, eventsOnArea, leftOutWords, planClipEvents } from '../../../../src/mapEditor/core/tools/clipEvents.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';

/*
 * An area the select tool lifts with every layer carries the events standing on it, as copying the area into a stamp does,
 * so moving a placed copy of a blueprint never leaves its battlers behind. Moved, the events keep their ids, their notes
 * (and with them their links) and everything else, shifted as the tiles are; one that would leave the map, which would lose
 * it, or land on an event staying put refuses the whole drop. Copied, each goes down as a new event with a fresh id past
 * the end of the list, its commands naming the others copied naming their copies, and its note as it was, so a copy of a
 * blueprint's event is one more copy of it; one landing past the map's edge is left out, as the tiles there are, and one
 * landing on any event, the originals included, refuses the copy. While the area is dragged, each event shows a ghost where
 * it would land, the tiles another event holds in red.
 *
 * The map is 6 by 4: a guard (event 1) at 1, 1 who shows a balloon over the post and another over the gate, the post
 * (event 2) at 2, 1, and the gate (event 3) at 4, 1, outside the area lifted, which is the guard's and the post's cells.
 */
describe('clipEvents', () =>
{
  /**
   * The area lifted: the guard's and the post's cells.
   */
  const AREA = { x: 1, y: 1, width: 2, height: 1 };

  /**
   * A balloon shown over an event.
   * @param {number} eventId The event.
   * @returns {RmmzEventCommand} The command.
   */
  const balloonOver = (eventId: number): RmmzEventCommand => ({ code: 213, indent: 0, parameters: [ eventId, 1, false ] });

  /**
   * Builds the map in a window of its own.
   * @returns {{ hub: DocumentHub, map: MapDocument }} The window and the map.
   */
  const buildMap = (): { hub: DocumentHub; map: MapDocument } =>
  {
    const file = mapWithEvents(6, 4, [ null, [ 1, 1 ], [ 2, 1 ], [ 4, 1 ] ]);
    const guard = file.events[1] as RmmzMapEvent;
    file.events[1] = { ...guard, name: 'Guard', pages: [ { ...guard.pages[0], list: [ balloonOver(2), balloonOver(3), { code: 0, indent: 0, parameters: [] } ] } ] };
    const hub = new DocumentHub({ clientId: 'window-a' });
    const map = hub.adopt('map:1', file as unknown as JsonValue) as MapDocument;
    return { hub, map };
  };

  describe('eventsOnArea', () =>
  {
    it('lists the events standing on an area, and none beside it', () =>
    {
      // Arrange.
      const { map } = buildMap();

      // Act.
      const carried = [ eventsOnArea(map, AREA), eventsOnArea(map, { x: 0, y: 2, width: 6, height: 2 }) ];

      // Assert: the gate, on the same row past the area, is not carried.
      expect(carried)
        .toStrictEqual([ [ 1, 2 ], [] ]);
    });
  });

  describe('planClipEvents', () =>
  {
    it('moves the events by the shift, keeping their ids', () =>
    {
      // Arrange.
      const { map } = buildMap();

      // Act.
      const plan = planClipEvents(map, [ 1, 2 ], { x: 0, y: 2 }, false);

      // Assert.
      expect(plan)
        .toStrictEqual({
          ok: true,
          moves: [ { id: 1, from: { x: 1, y: 1 }, to: { x: 1, y: 3 } }, { id: 2, from: { x: 2, y: 1 }, to: { x: 2, y: 3 } } ],
          copies: [],
          leftOut: 0,
        });
    });

    it('refuses a move that would take an event off the map, or onto an event staying put, and not one onto a cell the group leaves', () =>
    {
      // Arrange.
      const { map } = buildMap();

      // Act: down past the edge, two right onto the gate, and one right onto the post's own cell.
      const plans = [ planClipEvents(map, [ 1, 2 ], { x: 0, y: 3 }, false), planClipEvents(map, [ 1, 2 ], { x: 2, y: 0 }, false), planClipEvents(map, [ 1, 2 ], { x: 1, y: 0 }, false) ];

      // Assert.
      expect(plans.map(plan => (plan.ok ? plan.moves.map(move => move.to) : plan.message)))
        .toStrictEqual([ 'The map ends there.', 'Another event is in the way.', [ { x: 2, y: 1 }, { x: 3, y: 1 } ] ]);
    });

    it('copies the events with fresh ids past the end of the list, their references to each other following, the rest as they were', () =>
    {
      // Arrange.
      const { map } = buildMap();

      // Act.
      const plan = planClipEvents(map, [ 1, 2 ], { x: 0, y: 2 }, true);

      // Assert: the guard's copy shows its balloon over the post's copy, and still over the gate.
      const copies = plan.ok ? plan.copies : [];
      expect([ copies.map(({ id, x, y, name, note }) => ({ id, x, y, name, note })), copies[0]?.pages[0].list.map(command => command.parameters[0]), plan.ok && plan.leftOut ])
        .toStrictEqual([
          [ { id: 4, x: 1, y: 3, name: 'Guard', note: 'event 1' }, { id: 5, x: 2, y: 3, name: 'EV002', note: 'event 2' } ],
          [ 5, 3, undefined ],
          0,
        ]);
    });

    it('leaves out of a copy an event landing past the map\'s edge, counting it, and refuses one landing on any event', () =>
    {
      // Arrange.
      const { map } = buildMap();

      // Act: three right, the post's copy past the edge; one right, the guard's copy on the post itself.
      const plans = [ planClipEvents(map, [ 1, 2 ], { x: 4, y: 0 }, true), planClipEvents(map, [ 1, 2 ], { x: 1, y: 0 }, true) ];

      // Assert.
      expect(plans.map(plan => (plan.ok ? [ plan.copies.map(copy => [ copy.id, copy.x ]), plan.leftOut ] : plan.message)))
        .toStrictEqual([ [ [ [ 4, 5 ] ], 1 ], 'Another event is in the way.' ]);
    });

    it('has nothing to do with no events carried', () =>
    {
      // Arrange.
      const { map } = buildMap();

      // Act.
      const plans = [ planClipEvents(map, [], { x: 1, y: 0 }, false), planClipEvents(map, [], { x: 1, y: 0 }, true) ];

      // Assert.
      expect(plans)
        .toStrictEqual([ { ok: true, moves: [], copies: [], leftOut: 0 }, { ok: true, moves: [], copies: [], leftOut: 0 } ]);
    });
  });

  describe('commitClipEvents', () =>
  {
    it('puts moves and copies down in an open edit, undone together', () =>
    {
      // Arrange: a move of the guard down two rows, and a copy of the post.
      const { hub, map } = buildMap();
      const moved = planClipEvents(map, [ 1 ], { x: 0, y: 2 }, false);
      const copied = planClipEvents(map, [ 2 ], { x: 0, y: 2 }, true);
      const before = map.toJson();

      // Act.
      hub.edit('Drop', [ mapHistoryKey(1) ], tx =>
      {
        commitClipEvents(tx, map, moved as Extract<typeof moved, { ok: true }>);
        commitClipEvents(tx, map, copied as Extract<typeof copied, { ok: true }>);
      });
      const after = [ map.event(1)?.y, map.event(4)?.x, map.event(4)?.y, map.event(2)?.y ];
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ after, JSON.stringify(map.toJson()) === JSON.stringify(before) ])
        .toStrictEqual([ [ 3, 2, 3, 1 ], true ]);
    });
  });

  describe('leftOutWords', () =>
  {
    it('says how many events a drop left out, and nothing when none were', () =>
    {
      // Arrange: nothing to arrange; the words depend on the count alone.

      // Act.
      const words = [ leftOutWords(0), leftOutWords(1), leftOutWords(3) ];

      // Assert.
      expect(words)
        .toStrictEqual([
          null,
          'One of the selection\'s events fell past the map\'s edge and was left out.',
          '3 of the selection\'s events fell past the map\'s edge and were left out.',
        ]);
    });
  });

  describe('ClipEventsPreview', () =>
  {
    it('shows a ghost of each event where it would land, blocking a move only on events staying put and a copy on any', () =>
    {
      // Arrange.
      const { map } = buildMap();
      const preview = new ClipEventsPreview(map, [ 1, 2 ]);

      // Act: one right, the guard's ghost on the post's cell, which the post leaves when moved and keeps when copied.
      const frames = [ preview.at({ x: 1, y: 0 }, false), preview.at({ x: 1, y: 0 }, true), preview.at({ x: 2, y: 0 }, false) ];

      // Assert.
      expect(frames.map(frame => [ frame.ghosts.map(({ x, y, eventId }) => [ x, y, eventId ]), frame.blocked, frame.offMap ]))
        .toStrictEqual([
          [ [ [ 2, 1, 1 ], [ 3, 1, 2 ] ], [], false ],
          [ [ [ 2, 1, 1 ], [ 3, 1, 2 ] ], [ { x: 2, y: 1 } ], false ],
          [ [ [ 3, 1, 1 ], [ 4, 1, 2 ] ], [ { x: 4, y: 1 } ], false ],
        ]);
    });

    it('says a move would lose an event past the map\'s edge, showing no ghost there, while a copy only leaves it out', () =>
    {
      // Arrange.
      const { map } = buildMap();
      const preview = new ClipEventsPreview(map, [ 1, 2 ]);

      // Act.
      const frames = [ preview.at({ x: 4, y: 0 }, false), preview.at({ x: 4, y: 0 }, true) ];

      // Assert.
      expect(frames.map(frame => [ frame.ghosts.map(({ x }) => x), frame.offMap ]))
        .toStrictEqual([ [ [ 5 ], true ], [ [ 5 ], false ] ]);
    });

    it('draws a ghost for an event with no page as one with no picture', () =>
    {
      // Arrange: the post loses its pages.
      const { map } = buildMap();
      map.apply({ kind: 'set', path: [ 'events', 2, 'pages' ], before: map.event(2)?.pages as unknown as JsonValue, after: [] });
      const preview = new ClipEventsPreview(map, [ 2 ]);

      // Act.
      const [ ghost ] = preview.at({ x: 0, y: 1 }, false).ghosts;

      // Assert.
      expect([ ghost.image.characterName, ghost.image.tileId, ghost.priorityType ])
        .toStrictEqual([ '', 0, 0 ]);
    });
  });
});
