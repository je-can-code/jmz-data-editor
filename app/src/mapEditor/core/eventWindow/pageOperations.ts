import { deleteEvents } from '../events/eventEdits.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { createEventPage } from '../model/eventModel.ts';
import { cloneJson, isJsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import { isEventPage } from './pageShapes.ts';
import {
  locateEvent,
  locatePage,
  pagePath,
  pagesPath,
  pageWords,
  recordEventStep,
  targetDocument,
  type EventWindowTarget,
  type PageOutcome,
} from './eventWindowTarget.ts';

/**
 * The mark every page clipboard carries, so a paste knows the text on the system clipboard is pages copied from an
 * event window, in this window or any other, and not whatever else was copied last.
 */
const PAGE_CLIPBOARD_MARKER = 'jmz-map-editor/pages';

/**
 * The shape of the page clipboard this editor writes and reads.
 */
const PAGE_CLIPBOARD_VERSION = 1;

/**
 * Pages copied to the system clipboard, as JSON text: the marker, the shape's version, and full copies of the pages,
 * exactly as the map file holds them. The system clipboard carries them across events, maps and windows.
 */
type PageClipboard = {
  readonly marker: typeof PAGE_CLIPBOARD_MARKER;
  readonly version: typeof PAGE_CLIPBOARD_VERSION;
  readonly pages: readonly RmmzEventPage[];
};

/**
 * What the author reads when deleting would leave an event with no page at all, which MZ never writes.
 */
const LAST_PAGE_MESSAGE = 'An event keeps at least one page.';

/**
 * Copies pages for the clipboard: full copies, in the order asked for.
 * @param {RmmzMapEvent} event The event.
 * @param {readonly number[]} pageIndexes The pages, by place; places the event does not have are passed over.
 * @returns {PageClipboard | null} The clipboard, or null when there is nothing to copy.
 */
const copyPages = (event: RmmzMapEvent, pageIndexes: readonly number[]): PageClipboard | null =>
{
  const pages = pageIndexes
    .map(index => event.pages[index])
    .filter((page): page is RmmzEventPage => page !== undefined)
    .map(page => cloneJson(page));

  return pages.length === 0
    ? null
    : { marker: PAGE_CLIPBOARD_MARKER, version: PAGE_CLIPBOARD_VERSION, pages };
};

/**
 * Writes a page clipboard as the text that goes on the system clipboard.
 * @param {PageClipboard} clipboard The clipboard.
 * @returns {string} The JSON text.
 */
const encodePageClipboard = (clipboard: PageClipboard): string =>
{
  return JSON.stringify(clipboard);
};

/**
 * Parses text as JSON, or answers null for anything that is not.
 * @param {string} text The text.
 * @returns {JsonValue | null} The value.
 */
const parseJson = (text: string): JsonValue | null =>
{
  try
  {
    return JSON.parse(text) as JsonValue;
  }
  catch
  {
    return null;
  }
};

/**
 * Reads the text on the system clipboard as copied pages. Anything else, such as commands or a line of text, reads as
 * nothing, and so does a clipboard holding a page that is not whole, so a paste can never put a broken page on an
 * event.
 * @param {string} text The clipboard's text.
 * @returns {PageClipboard | null} The copied pages, or null when the text is not a page clipboard.
 */
const decodePageClipboard = (text: string): PageClipboard | null =>
{
  const value = parseJson(text);
  if (isJsonObject(value) === false || value['marker'] !== PAGE_CLIPBOARD_MARKER || value['version'] !== PAGE_CLIPBOARD_VERSION)
  {
    return null;
  }

  const { pages } = value;
  return Array.isArray(pages) && pages.length > 0 && pages.every(isEventPage)
    ? { marker: PAGE_CLIPBOARD_MARKER, version: PAGE_CLIPBOARD_VERSION, pages: pages as unknown as RmmzEventPage[] }
    : null;
};

/**
 * Puts pages into the event right after a page, as one step in the event's own history.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} after The page they follow, or -1 to put them first; past the last page, they go last.
 * @param {readonly RmmzEventPage[]} pages The pages, in order.
 * @param {string} label What the history panel calls the step.
 * @returns {PageOutcome} The step, with the first new page to show, or why nothing changed.
 */
const insertPages = (
  hub: DocumentHub,
  target: EventWindowTarget,
  after: number,
  pages: readonly RmmzEventPage[],
  label: string,
): PageOutcome =>
{
  const found = locateEvent(hub, target);
  if (found.ok === false)
  {
    return found;
  }

  const place = Math.min(Math.max(after + 1, 0), found.event.pages.length);
  const step = recordEventStep(hub, target, label, transaction =>
  {
    transaction.splice(targetDocument(target), pagesPath(target), place, 0, pages as unknown as JsonValue[]);
  });
  return { ok: true, step, page: place };
};

/**
 * Adds a fresh page after a page, with the values MZ gives a new one: no conditions, no picture, fixed in place, below
 * characters, started by the action button, and no commands.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} after The page it follows, or -1 to put it first.
 * @returns {PageOutcome} The step, with the new page to show, or why nothing changed.
 */
const addPage = (hub: DocumentHub, target: EventWindowTarget, after: number): PageOutcome =>
{
  return insertPages(hub, target, after, [ createEventPage() ], 'Add page');
};

/**
 * Pastes copied pages after a page, as one step. The copies are exact, conditions and commands included, wherever they
 * were copied from.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} after The page they follow, or -1 to put them first.
 * @param {PageClipboard} clipboard The copied pages.
 * @returns {PageOutcome} The step, with the first pasted page to show, or why nothing changed.
 */
const pastePages = (hub: DocumentHub, target: EventWindowTarget, after: number, clipboard: PageClipboard): PageOutcome =>
{
  const label = clipboard.pages.length === 1
    ? 'Paste page'
    : `Paste ${clipboard.pages.length} pages`;
  return insertPages(hub, target, after, clipboard.pages, label);
};

/**
 * Puts a copy of a page right after it, as one step.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page to copy.
 * @returns {PageOutcome} The step, with the copy to show, or why nothing changed.
 */
const duplicatePage = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number): PageOutcome =>
{
  const found = locatePage(hub, target, pageIndex);
  return found.ok
    ? insertPages(hub, target, pageIndex, [ found.page ], `Duplicate ${pageWords(pageIndex)}`)
    : found;
};

/**
 * Takes a page off the event, as one step; the page after it slides into its place. The last page an event has is
 * refused, since MZ never writes an event with none.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {string} verb What the history panel calls the step: "Delete", or "Cut" when the page went to the clipboard.
 * @returns {PageOutcome} The step, with the page now in its place (or the one before it, for the last page) to show,
 * or why nothing changed.
 */
const deletePage = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, verb = 'Delete'): PageOutcome =>
{
  const found = locatePage(hub, target, pageIndex);
  if (found.ok === false)
  {
    return found;
  }

  const { length } = found.event.pages;
  if (length === 1)
  {
    return { ok: false, message: LAST_PAGE_MESSAGE };
  }

  const step = recordEventStep(hub, target, `${verb} ${pageWords(pageIndex)}`, transaction =>
  {
    transaction.splice(targetDocument(target), pagesPath(target), pageIndex, 1, []);
  });
  return { ok: true, step, page: Math.min(pageIndex, length - 2) };
};

/**
 * Reports whether "Delete page" takes the whole event rather than one page: on an event's last page it does, since an
 * event left with no page is one MZ never writes.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True when the event has one page left.
 */
const deletesTheEvent = (event: RmmzMapEvent): boolean =>
{
  return event.pages.length === 1;
};

/**
 * "Delete page": takes the page off the event as a step in the event's own history, or, on the event's last page, takes
 * the whole event off its map. Taking the event off is exactly what deleting it on the map does, one step in the map's
 * history rather than the event's, which one undo on the map brings back whole.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @returns {PageOutcome} The step, with the page now in its place to show, or why nothing changed.
 */
const deletePageOrEvent = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number): PageOutcome =>
{
  const found = locatePage(hub, target, pageIndex);
  if (found.ok === false)
  {
    return found;
  }

  if (deletesTheEvent(found.event) === false)
  {
    return deletePage(hub, target, pageIndex);
  }

  const outcome = deleteEvents(hub, target.mapId, [ target.eventId ]);
  return outcome.ok
    ? { ok: true, step: outcome.step, page: 0 }
    : outcome;
};

/**
 * Puts a page back the way a new one starts, as one step: what MZ's Clear Event Page does.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @returns {PageOutcome} The step (null when the page was already fresh), with the same page to show, or why nothing
 * changed.
 */
const clearPage = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number): PageOutcome =>
{
  const found = locatePage(hub, target, pageIndex);
  if (found.ok === false)
  {
    return found;
  }

  const step = recordEventStep(hub, target, `Clear ${pageWords(pageIndex)}`, transaction =>
  {
    transaction.set(targetDocument(target), pagePath(target, pageIndex), createEventPage() as unknown as JsonValue);
  });
  return { ok: true, step, page: pageIndex };
};

/**
 * Moves a page to another place among the event's pages, as one step; the pages between shift over to make room.
 * Nothing in an event names its pages by place (conditions, comments and commands all live on the page itself), so a
 * move changes only the order the game checks them in, the last page whose conditions hold being the one that runs.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} from The page's place now.
 * @param {number} to The place it ends at, among the pages as they will stand; kept within the event.
 * @returns {PageOutcome} The step (null when it stays put), with the page's new place to show, or why nothing changed.
 */
const movePage = (hub: DocumentHub, target: EventWindowTarget, from: number, to: number): PageOutcome =>
{
  const found = locatePage(hub, target, from);
  if (found.ok === false)
  {
    return found;
  }

  const place = Math.min(Math.max(to, 0), found.event.pages.length - 1);
  if (place === from)
  {
    return { ok: true, step: null, page: from };
  }

  // out of the list first, then back in at its place among the rest, as one step.
  const moved = cloneJson(found.page) as unknown as JsonValue;
  const step = recordEventStep(hub, target, `Move ${pageWords(from)}`, transaction =>
  {
    const key = targetDocument(target);
    transaction.splice(key, pagesPath(target), from, 1, []);
    transaction.splice(key, pagesPath(target), place, 0, [ moved ]);
  });
  return { ok: true, step, page: place };
};

export {
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
};
export type { PageClipboard };
