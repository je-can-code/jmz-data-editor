import { describe, expect, it } from 'vitest';
import {
  EVENT_GONE_MESSAGE,
  locateEvent,
  locatePage,
  PAGE_GONE_MESSAGE,
  pageListPath,
  pagePath,
  pagesPath,
  pageWords,
  readTargetEvent,
  renameEvent,
  setEventNote,
  targetDocument,
  targetHistory,
} from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { eventWindowHub, eventWindowMap, expectedMap, heldMap, markedPage, TARGET } from '../../support/eventWindowFixtures.ts';

/*
 * An event window edits one event: it addresses the event, its pages and each page's commands inside the map's
 * document by the file's own paths, records every edit in the event's own history (never the map's, so undo in the
 * window never reaches the map's painting or another event), and refuses an edit to an event or page that has gone,
 * deleted in another window say, rather than bringing it back as a stray. Its name and note are written exactly as
 * given, the note especially, since it belongs to the editor and blueprint links will live there.
 *
 * The fixture map holds events 1, 2 and 3 with the same three pages; event 2 is the one edited, and the others must
 * never change.
 */
describe('eventWindowTarget', () =>
{
  describe('paths and keys', () =>
  {
    it('names the map document, the event\'s own history, and the file\'s own paths to the event, its pages and a page\'s commands', () =>
    {
      // Arrange: the target alone.

      // Act.
      const named = [
        targetDocument(TARGET),
        targetHistory(TARGET),
        pagesPath(TARGET),
        pagePath(TARGET, 1),
        pageListPath(TARGET, 2),
        pageWords(0),
      ];

      // Assert: the history is the event's own, not the map's.
      expect(named)
        .toStrictEqual([ 'map:1', 'event:1:2', [ 'events', 2, 'pages' ], [ 'events', 2, 'pages', 1 ], [ 'events', 2, 'pages', 2, 'list' ], 'page 1' ]);
    });
  });

  describe('readTargetEvent', () =>
  {
    it('reads the event live from the held map', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const event = readTargetEvent(hub, TARGET);

      // Assert.
      expect(event)
        .toStrictEqual(eventWindowMap().events[2]);
    });

    it('reads nothing when the map is not held, or the event\'s slot is empty', () =>
    {
      // Arrange: slot 4 is empty, and map 9 is not held.
      const hub = eventWindowHub();

      // Act.
      const read = [ readTargetEvent(hub, { mapId: 1, eventId: 4 }), readTargetEvent(new DocumentHub({ clientId: 'empty' }), TARGET) ];

      // Assert.
      expect(read)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('locateEvent and locatePage', () =>
  {
    it('finds the event and one of its pages', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const found = locatePage(hub, TARGET, 1);

      // Assert.
      expect([ found.ok, found.ok && found.page ])
        .toStrictEqual([ true, markedPage(2) ]);
    });

    it('refuses an event that has gone, and a page the event does not have', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const refusals = [ locateEvent(hub, { mapId: 1, eventId: 4 }), locatePage(hub, { mapId: 1, eventId: 4 }, 0), locatePage(hub, TARGET, 3) ];

      // Assert.
      expect(refusals)
        .toStrictEqual([
          { ok: false, message: EVENT_GONE_MESSAGE },
          { ok: false, message: EVENT_GONE_MESSAGE },
          { ok: false, message: PAGE_GONE_MESSAGE },
        ]);
    });
  });

  describe('renameEvent', () =>
  {
    it('renames the event alone, as one step in its own history that one undo takes back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = renameEvent(hub, TARGET, 'Gate Guard');
      const renamed = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert: the map's own history recorded nothing, and the neighbours kept their names.
      expect([ outcome.ok && outcome.step?.label, renamed, hub.history(mapHistoryKey(1)).rows.length, heldMap(hub) ])
        .toStrictEqual([
          'Rename event',
          expectedMap(event =>
          {
            event.name = 'Gate Guard';
          }),
          0,
          eventWindowMap(),
        ]);
    });

    it('records nothing when the name is already the event\'s', () =>
    {
      // Arrange: event 2 is named for its id by the fixture.
      const hub = eventWindowHub();
      const { name } = eventWindowMap().events[2]!;

      // Act.
      const outcome = renameEvent(hub, TARGET, name);

      // Assert.
      expect([ outcome, hub.history(targetHistory(TARGET)).rows ])
        .toStrictEqual([ { ok: true, step: null }, [] ]);
    });

    it('refuses an event that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = renameEvent(hub, { mapId: 1, eventId: 4 }, 'Stray');

      // Assert: slot 4 stays empty rather than gaining a stray event.
      expect([ outcome, heldMap(hub) ])
        .toStrictEqual([ { ok: false, message: EVENT_GONE_MESSAGE }, eventWindowMap() ]);
    });
  });

  describe('setEventNote', () =>
  {
    it('writes the note exactly as given, every line kept, as one step that one undo takes back', () =>
    {
      // Arrange: a note with lines, brackets and spacing a careless write would trim.
      const hub = eventWindowHub();
      const note = '  <blueprint:guard>\nsecond line\t';

      // Act.
      const outcome = setEventNote(hub, TARGET, note);
      const noted = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert.
      expect([ outcome.ok && outcome.step?.label, noted, heldMap(hub) ])
        .toStrictEqual([
          'Edit event note',
          expectedMap(event =>
          {
            event.note = note;
          }),
          eventWindowMap(),
        ]);
    });

    it('refuses an event that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = setEventNote(hub, { mapId: 1, eventId: 4 }, 'note');

      // Assert.
      expect([ outcome, heldMap(hub) ])
        .toStrictEqual([ { ok: false, message: EVENT_GONE_MESSAGE }, eventWindowMap() ]);
    });
  });
});
