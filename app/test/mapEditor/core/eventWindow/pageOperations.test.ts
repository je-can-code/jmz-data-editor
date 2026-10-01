import { describe, expect, it } from 'vitest';
import { EVENT_GONE_MESSAGE, PAGE_GONE_MESSAGE, targetHistory } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import {
  addPage,
  clearPage,
  copyPages,
  decodePageClipboard,
  deletePage,
  deletePageOrEvent,
  deletesTheEvent,
  duplicatePage,
  encodePageClipboard,
  LAST_PAGE_MESSAGE,
  movePage,
  PAGE_CLIPBOARD_MARKER,
  pastePages,
} from '../../../../src/mapEditor/core/eventWindow/pageOperations.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { eventWindowHub, eventWindowMap, expectedMap, heldEvent, heldMap, markedPage, TARGET } from '../../support/eventWindowFixtures.ts';

/*
 * The event window's page operations: add, copy, paste, duplicate, delete, clear and move. Each change is one step in
 * the event's own history, which one undo takes back exactly, and touches the edited event's page list and nothing
 * else: the neighbouring events, which hold the very same pages, never change. Each answers the page the window should
 * show next (the new page, the neighbour, the page's new place), so the tabs follow the edit.
 *
 * New and pasted pages land right after the page they are put after. Taking the last page an event has off it is
 * refused, since MZ never writes an event with none; "Delete page" on that last page deletes the event from its map
 * instead, as one step in the map's history exactly like a delete on the map, which one undo there brings back. Any edit
 * to a page or an event that has gone is refused. A move changes only
 * the order the game checks pages in. The page clipboard carries exact copies across events, maps and windows, and
 * reads as nothing unless it is a whole page clipboard, so a paste never puts a broken page on an event.
 *
 * The fixture's event 2 holds pages marked 1, 2 and 3; events 1 and 3 hold the same three.
 */
describe('pageOperations', () =>
{
  /**
   * Sets the edited event's pages in an expected file.
   * @param {number[]} marks The marks of the pages it should hold, in order; 0 for a fresh page.
   * @returns {ReturnType<typeof eventWindowMap>} The expected file.
   */
  const withPages = (marks: number[]) => expectedMap(event =>
  {
    event.pages = marks.map(mark => (mark === 0 ? createEventPage() : markedPage(mark)));
  });

  describe('addPage', () =>
  {
    it('adds a fresh page right after the page asked for, as one step that one undo takes back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = addPage(hub, TARGET, 0);
      const added = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert: the neighbours kept their three pages.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, added, heldMap(hub) ])
        .toStrictEqual([ 'Add page', 1, withPages([ 1, 0, 2, 3 ]), eventWindowMap() ]);
    });

    it('adds after the last page as the last, and before the first when asked to follow none', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const last = addPage(hub, TARGET, 2);
      const first = addPage(hub, TARGET, -1);

      // Assert.
      expect([ last.ok && last.page, first.ok && first.page, heldMap(hub) ])
        .toStrictEqual([ 3, 0, withPages([ 0, 1, 2, 3, 0 ]) ]);
    });

    it('refuses an event that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = addPage(hub, { mapId: 1, eventId: 4 }, 0);

      // Assert.
      expect([ outcome, heldMap(hub) ])
        .toStrictEqual([ { ok: false, message: EVENT_GONE_MESSAGE }, eventWindowMap() ]);
    });
  });

  describe('copyPages', () =>
  {
    it('copies the pages asked for, in that order, as copies the event never shares', () =>
    {
      // Arrange.
      const event = eventWindowMap().events[2] as RmmzMapEvent;

      // Act.
      const clipboard = copyPages(event, [ 2, 0 ]);
      clipboard!.pages[0].trigger = 4;

      // Assert: changing the copy left the event alone.
      expect([ clipboard!.marker, clipboard!.pages.map(page => page.list[0].parameters), event.pages[2] ])
        .toStrictEqual([ PAGE_CLIPBOARD_MARKER, [ [ 'page 3' ], [ 'page 1' ] ], markedPage(3) ]);
    });

    it('passes over places the event does not have, and copies nothing when none is left', () =>
    {
      // Arrange.
      const event = eventWindowMap().events[2] as RmmzMapEvent;

      // Act.
      const copies = [ copyPages(event, [ 5, 1 ])?.pages.length, copyPages(event, [ 5 ]) ];

      // Assert.
      expect(copies)
        .toStrictEqual([ 1, null ]);
    });
  });

  describe('encodePageClipboard and decodePageClipboard', () =>
  {
    it('reads back exactly the pages it wrote', () =>
    {
      // Arrange.
      const clipboard = copyPages(eventWindowMap().events[2] as RmmzMapEvent, [ 0, 1 ])!;

      // Act.
      const read = decodePageClipboard(encodePageClipboard(clipboard));

      // Assert.
      expect(read)
        .toStrictEqual(clipboard);
    });

    it('reads anything else as nothing: text, other clipboards, another version, no pages, or a page that is not whole', () =>
    {
      // Arrange: each a near miss of a page clipboard.
      const page = markedPage(1);
      const clipboard = (pages: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ marker: PAGE_CLIPBOARD_MARKER, version: 1, pages, ...extra });
      const { trigger: _trigger, ...noTrigger } = page;
      const { variableValue: _value, ...conditionsWithoutValue } = page.conditions;
      const texts = [
        'Hello there',
        JSON.stringify({ marker: 'jmz-map-editor/events', version: 1, events: [] }),
        JSON.stringify({ format: 'jmz-map-editor/commands', version: 1, commands: [] }),
        clipboard([ page ], { version: 2 }),
        clipboard([]),
        clipboard({ 0: page }),
        clipboard([ noTrigger ]),
        clipboard([ { ...page, conditions: conditionsWithoutValue } ]),
        clipboard([ { ...page, image: { ...page.image, direction: 'down' } } ]),
        clipboard([ { ...page, list: [ { code: 108, indent: 0, parameters: [ 'unclosed' ] } ] } ]),
        clipboard([ { ...page, list: [ { code: 0, indent: 1, parameters: [] } ] } ]),
        clipboard([ { ...page, list: [ { code: 108, indent: -1, parameters: [] }, { code: 0, indent: 0, parameters: [] } ] } ]),
        clipboard([ { ...page, moveRoute: { ...page.moveRoute, list: [] } } ]),
        clipboard([ { ...page, moveRoute: { ...page.moveRoute, list: [ { code: 1 } ] } } ]),
        clipboard([ { ...page, moveRoute: { ...page.moveRoute, list: [ 'step', { code: 0 } ] } } ]),
        clipboard([ { ...page, walkAnime: 'yes' } ]),
        clipboard([ page, null ]),
      ];

      // Act.
      const read = texts.map(decodePageClipboard);

      // Assert: and the whole page the near misses grew from does read.
      expect([ read, decodePageClipboard(clipboard([ page ]))?.pages ])
        .toStrictEqual([ texts.map(() => null), [ page ] ]);
    });
  });

  describe('pastePages', () =>
  {
    it('pastes exact copies right after the page asked for, as one step that one undo takes back', () =>
    {
      // Arrange: page 3 of the neighbouring event 1, copied.
      const hub = eventWindowHub();
      const clipboard = copyPages(eventWindowMap().events[1] as RmmzMapEvent, [ 2 ])!;

      // Act.
      const outcome = pastePages(hub, TARGET, 0, clipboard);
      const pasted = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, pasted, heldMap(hub) ])
        .toStrictEqual([ 'Paste page', 1, withPages([ 1, 3, 2, 3 ]), eventWindowMap() ]);
    });

    it('pastes several pages in their order, named for how many', () =>
    {
      // Arrange.
      const hub = eventWindowHub();
      const clipboard = copyPages(eventWindowMap().events[2] as RmmzMapEvent, [ 1, 0 ])!;

      // Act.
      const outcome = pastePages(hub, TARGET, 2, clipboard);

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, heldMap(hub) ])
        .toStrictEqual([ 'Paste 2 pages', 3, withPages([ 1, 2, 3, 2, 1 ]) ]);
    });

    it('refuses an event that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();
      const clipboard = copyPages(eventWindowMap().events[2] as RmmzMapEvent, [ 0 ])!;

      // Act.
      const outcome = pastePages(hub, { mapId: 1, eventId: 4 }, 0, clipboard);

      // Assert.
      expect([ outcome, heldMap(hub) ])
        .toStrictEqual([ { ok: false, message: EVENT_GONE_MESSAGE }, eventWindowMap() ]);
    });
  });

  describe('duplicatePage', () =>
  {
    it('puts a copy of the page right after it, as one step', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = duplicatePage(hub, TARGET, 1);

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, heldMap(hub) ])
        .toStrictEqual([ 'Duplicate page 2', 2, withPages([ 1, 2, 2, 3 ]) ]);
    });

    it('refuses a page the event does not have, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = duplicatePage(hub, TARGET, 3);

      // Assert.
      expect([ outcome, heldMap(hub) ])
        .toStrictEqual([ { ok: false, message: PAGE_GONE_MESSAGE }, eventWindowMap() ]);
    });
  });

  describe('deletePage', () =>
  {
    it('takes the page off as one step, shows the page sliding into its place, and one undo brings it back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = deletePage(hub, TARGET, 1);
      const deleted = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, deleted, heldMap(hub) ])
        .toStrictEqual([ 'Delete page 2', 1, withPages([ 1, 3 ]), eventWindowMap() ]);
    });

    it('shows the page before when the last page goes, and names a cut as a cut', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = deletePage(hub, TARGET, 2, 'Cut');

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, heldMap(hub) ])
        .toStrictEqual([ 'Cut page 3', 1, withPages([ 1, 2 ]) ]);
    });

    it('refuses to take an event\'s only page, changing nothing', () =>
    {
      // Arrange: event 2 down to its first page.
      const hub = eventWindowHub();
      deletePage(hub, TARGET, 2);
      deletePage(hub, TARGET, 1);

      // Act.
      const outcome = deletePage(hub, TARGET, 0);

      // Assert.
      expect([ outcome, heldEvent(hub).pages ])
        .toStrictEqual([ { ok: false, message: LAST_PAGE_MESSAGE }, [ markedPage(1) ] ]);
    });

    it('refuses a page or an event that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcomes = [ deletePage(hub, TARGET, 3), deletePage(hub, { mapId: 1, eventId: 4 }, 0) ];

      // Assert.
      expect([ outcomes, heldMap(hub) ])
        .toStrictEqual([ [ { ok: false, message: PAGE_GONE_MESSAGE }, { ok: false, message: EVENT_GONE_MESSAGE } ], eventWindowMap() ]);
    });
  });

  describe('deletesTheEvent', () =>
  {
    it('says "Delete page" takes the event on its last page, and a page while it has others', () =>
    {
      // Arrange: an event of one page, and its near miss of two.
      const one = { ...(eventWindowMap().events[2] as RmmzMapEvent), pages: [ markedPage(1) ] };
      const two = { ...one, pages: [ markedPage(1), markedPage(2) ] };

      // Act.
      const takes = [ deletesTheEvent(one), deletesTheEvent(two) ];

      // Assert.
      expect(takes)
        .toStrictEqual([ true, false ]);
    });
  });

  describe('deletePageOrEvent', () =>
  {
    it('takes a page off an event that has others, as a step in the event\'s own history alone', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = deletePageOrEvent(hub, TARGET, 1);

      // Assert: the map's own history holds nothing.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, heldMap(hub), hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ 'Delete page 2', 1, withPages([ 1, 3 ]), 0 ]);
    });

    it('takes the event off its map on its last page, as one step in the map\'s history that one undo there brings back whole', () =>
    {
      // Arrange: event 2 down to one page.
      const oneMore = () =>
      {
        const file = eventWindowMap();
        (file.events[2] as RmmzMapEvent).pages = [ markedPage(1) ];
        return file;
      };
      const hub = eventWindowHub(oneMore());

      // Act.
      const outcome = deletePageOrEvent(hub, TARGET, 0);
      const deleted = heldMap(hub);
      hub.undo(mapHistoryKey(1));

      // Assert: its neighbours stayed, the event's own history never held the step, and the map's undo put it back.
      expect([
        outcome.ok && outcome.step?.label,
        deleted.events.map(event => (event === null ? null : event.id)),
        hub.history(targetHistory(TARGET)).rows.length,
        heldMap(hub),
      ])
        .toStrictEqual([ 'Delete event', [ null, 1, null, 3, null ], 0, oneMore() ]);
    });

    it('refuses a page or an event that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcomes = [ deletePageOrEvent(hub, TARGET, 3), deletePageOrEvent(hub, { mapId: 1, eventId: 4 }, 0) ];

      // Assert.
      expect([ outcomes, heldMap(hub) ])
        .toStrictEqual([ [ { ok: false, message: PAGE_GONE_MESSAGE }, { ok: false, message: EVENT_GONE_MESSAGE } ], eventWindowMap() ]);
    });
  });

  describe('clearPage', () =>
  {
    it('puts the page back the way a new one starts, as one step that one undo takes back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = clearPage(hub, TARGET, 1);
      const cleared = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, cleared, heldMap(hub) ])
        .toStrictEqual([ 'Clear page 2', 1, withPages([ 1, 0, 3 ]), eventWindowMap() ]);
    });

    it('records nothing for a page that is already fresh', () =>
    {
      // Arrange.
      const hub = eventWindowHub();
      clearPage(hub, TARGET, 0);

      // Act.
      const outcome = clearPage(hub, TARGET, 0);

      // Assert.
      expect([ outcome, hub.history(targetHistory(TARGET)).rows.length ])
        .toStrictEqual([ { ok: true, step: null, page: 0 }, 1 ]);
    });

    it('refuses a page that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = clearPage(hub, TARGET, 5);

      // Assert.
      expect([ outcome, heldMap(hub) ])
        .toStrictEqual([ { ok: false, message: PAGE_GONE_MESSAGE }, eventWindowMap() ]);
    });
  });

  describe('movePage', () =>
  {
    it('moves a page later, the pages between shifting over, as one step that one undo takes back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = movePage(hub, TARGET, 0, 2);
      const moved = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, moved, heldMap(hub) ])
        .toStrictEqual([ 'Move page 1', 2, withPages([ 2, 3, 1 ]), eventWindowMap() ]);
    });

    it('moves a page earlier', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = movePage(hub, TARGET, 2, 1);

      // Assert.
      expect([ outcome.ok && outcome.page, heldMap(hub) ])
        .toStrictEqual([ 1, withPages([ 1, 3, 2 ]) ]);
    });

    it('keeps a move within the event\'s pages', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const late = movePage(hub, TARGET, 0, 9);
      const early = movePage(hub, TARGET, 1, -4);

      // Assert: page 1 went last; then page 3, standing second, went first.
      expect([ late.ok && late.page, early.ok && early.page, heldMap(hub) ])
        .toStrictEqual([ 2, 0, withPages([ 3, 2, 1 ]) ]);
    });

    it('records nothing for a page asked to stay where it is', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = movePage(hub, TARGET, 1, 1);

      // Assert.
      expect([ outcome, hub.history(targetHistory(TARGET)).rows.length ])
        .toStrictEqual([ { ok: true, step: null, page: 1 }, 0 ]);
    });

    it('refuses a page that has gone, changing nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = movePage(hub, TARGET, 3, 0);

      // Assert.
      expect([ outcome, heldMap(hub) ])
        .toStrictEqual([ { ok: false, message: PAGE_GONE_MESSAGE }, eventWindowMap() ]);
    });
  });
});
