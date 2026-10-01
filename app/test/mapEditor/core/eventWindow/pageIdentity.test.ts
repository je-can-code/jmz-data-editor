import { describe, expect, it, vi } from 'vitest';
import { EVENT_GONE_MESSAGE, PAGE_GONE_MESSAGE, readTargetEvent } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { editPageItself, pageKey, placeOfShownPage, shownPageAt } from '../../../../src/mapEditor/core/eventWindow/pageIdentity.ts';
import { addPage, copyPages, deletePage, pastePages } from '../../../../src/mapEditor/core/eventWindow/pageOperations.ts';
import { setPageOption } from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { cloneJson, jsonEquals } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { eventWindowHub, heldEvent, markedPage, TARGET } from '../../support/eventWindowFixtures.ts';

/*
 * An event window follows the page it shows, and every edit it makes to a page, by the page itself rather than by its
 * place. The map document keeps each page as one object for as long as the page lasts, so the object names the page
 * however pages are added, removed or moved in front of it, from this window or another; a place does not, and a page
 * added in front of the one shown (a chest's second page, from the map's quick panel) would otherwise put its
 * neighbour in its stead and hand it whatever was half typed. The contract:
 *
 * - the page shown is found wherever it has moved, and never mistaken for a copy equal to it in every value; once it
 *   has gone, the page now holding its last place is shown instead;
 * - an edit lands on its page at the place the page holds when the edit lands, and an edit to a page or an event that
 *   has gone is refused without running;
 * - a page keeps its name for as long as it lasts, and a copy, however equal, has a name of its own.
 *
 * The fixture's event 2 holds pages marked 1, 2 and 3.
 */
describe('pageIdentity', () =>
{
  /**
   * Reads the edited event's pages, live, as the document holds them.
   * @param {DocumentHub} hub The hub.
   * @returns {RmmzEventPage[]} The pages themselves.
   */
  const livePages = (hub: DocumentHub): RmmzEventPage[] => (readTargetEvent(hub, TARGET) as RmmzMapEvent).pages;

  describe('placeOfShownPage', () =>
  {
    it('finds the page shown wherever a page put in front of it moved it, never a copy left in its old place', () =>
    {
      // Arrange: page 2 shown, then a copy of it pasted in front of it.
      const hub = eventWindowHub();
      const shown = shownPageAt(hub, TARGET, 1);
      pastePages(hub, TARGET, 0, copyPages(readTargetEvent(hub, TARGET) as RmmzMapEvent, [ 1 ])!);

      // Act.
      const place = placeOfShownPage(livePages(hub), shown);

      // Assert: the copy standing in its old place is equal to it in every value, and still not it.
      expect([ place, jsonEquals(livePages(hub)[1], livePages(hub)[2]) ])
        .toStrictEqual([ 2, true ]);
    });

    it('shows the page now in its last place once the page itself has gone', () =>
    {
      // Arrange: page 2 shown, then deleted.
      const hub = eventWindowHub();
      const shown = shownPageAt(hub, TARGET, 1);
      deletePage(hub, TARGET, 1);

      // Act.
      const place = placeOfShownPage(livePages(hub), shown);

      // Assert: page 3 slid into its place.
      expect([ place, livePages(hub)[place] ])
        .toStrictEqual([ 1, markedPage(3) ]);
    });

    it('shows the last page once the page has gone and the event has grown shorter than its last place', () =>
    {
      // Arrange: page 3 shown, then deleted.
      const hub = eventWindowHub();
      const shown = shownPageAt(hub, TARGET, 2);
      deletePage(hub, TARGET, 2);

      // Act.
      const place = placeOfShownPage(livePages(hub), shown);

      // Assert.
      expect(place)
        .toBe(1);
    });

    it('shows the place asked for, kept within the pages, when no page has been seen yet', () =>
    {
      // Arrange: three pages.
      const pages = livePages(eventWindowHub());

      // Act.
      const places = [ 1, -3, 7 ].map(place => placeOfShownPage(pages, { page: null, place }));

      // Assert.
      expect(places)
        .toStrictEqual([ 1, 0, 2 ]);
    });
  });

  describe('shownPageAt', () =>
  {
    it('holds the page itself at a place, and no page where the event or the place has none', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const shown = [ shownPageAt(hub, TARGET, 2), shownPageAt(hub, TARGET, 5), shownPageAt(hub, { mapId: 1, eventId: 4 }, 0) ];

      // Assert: the first is the very object the document holds.
      expect([ shown[0].page === livePages(hub)[2], shown[0].place, shown.slice(1) ])
        .toStrictEqual([ true, 2, [ { page: null, place: 5 }, { page: null, place: 0 } ] ]);
    });
  });

  describe('editPageItself', () =>
  {
    it('runs the edit at the place its page holds when the edit lands, after a page was added in front of it', () =>
    {
      // Arrange: page 2 in hand, then a fresh page added first.
      const hub = eventWindowHub();
      const [ , page ] = livePages(hub);
      addPage(hub, TARGET, -1);

      // Act.
      const outcome = editPageItself(hub, TARGET, page, at => setPageOption(hub, TARGET, at, 'through', true));

      // Assert: page 2, now third, took the edit; its neighbours did not.
      expect([ outcome.ok && outcome.page, heldEvent(hub).pages ])
        .toStrictEqual([ 2, [ createEventPage(), markedPage(1), { ...markedPage(2), through: true }, markedPage(3) ] ]);
    });

    it('refuses a page that has gone from the event, never running the edit', () =>
    {
      // Arrange: page 2 in hand, then deleted.
      const hub = eventWindowHub();
      const [ , page ] = livePages(hub);
      deletePage(hub, TARGET, 1);
      const edit = vi.fn(() => ({ ok: true as const, step: null, page: 0 }));

      // Act.
      const outcome = editPageItself(hub, TARGET, page, edit);

      // Assert.
      expect([ outcome, edit.mock.calls.length, heldEvent(hub).pages ])
        .toStrictEqual([ { ok: false, message: PAGE_GONE_MESSAGE }, 0, [ markedPage(1), markedPage(3) ] ]);
    });

    it('refuses a page whose event has gone from the map, never running the edit', () =>
    {
      // Arrange: page 1 in hand, then the event deleted on the map.
      const hub = eventWindowHub();
      const [ page ] = livePages(hub);
      hub.edit('Delete event', [ mapHistoryKey(1) ], transaction => transaction.set('map:1', [ 'events', 2 ], null));
      const edit = vi.fn(() => ({ ok: true as const, step: null, page: 0 }));

      // Act.
      const outcome = editPageItself(hub, TARGET, page, edit);

      // Assert.
      expect([ outcome, edit.mock.calls.length ])
        .toStrictEqual([ { ok: false, message: EVENT_GONE_MESSAGE }, 0 ]);
    });
  });

  describe('pageKey', () =>
  {
    it('names a page the same for as long as it lasts, through edits to it and pages added in front of it', () =>
    {
      // Arrange: page 2's name, before anything changes.
      const hub = eventWindowHub();
      const before = pageKey(livePages(hub)[1]);

      // Act: page 2 edited, then a page added first.
      setPageOption(hub, TARGET, 1, 'through', true);
      addPage(hub, TARGET, -1);

      // Assert: and page 1 has a name of its own.
      expect([ pageKey(livePages(hub)[2]), pageKey(livePages(hub)[1]) === before ])
        .toStrictEqual([ before, false ]);
    });

    it('names a copy apart from its page, however equal', () =>
    {
      // Arrange.
      const [ page ] = livePages(eventWindowHub());
      const copy = cloneJson(page);

      // Act.
      const names = [ pageKey(page), pageKey(copy) ];

      // Assert.
      expect([ names[0] === names[1], jsonEquals(page, copy) ])
        .toStrictEqual([ false, true ]);
    });
  });
});
