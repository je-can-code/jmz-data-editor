import type { DocumentHub } from '../history/DocumentHub.ts';
import type { RmmzEventPage } from '../model/rmmzTypes.ts';
import {
  EVENT_GONE_MESSAGE,
  PAGE_GONE_MESSAGE,
  readTargetEvent,
  type EventWindowTarget,
  type PageOutcome,
} from './eventWindowTarget.ts';

/**
 * The page an event window shows, held by the page itself rather than by its place. The map document keeps each page as
 * one object for as long as the page lasts (an edit changes it in place), so the object names the page however pages
 * are added, removed or moved in front of it, from this window or any other. The place is where it stood when last
 * seen, for when the page itself has gone.
 */
type ShownPage = {
  readonly page: RmmzEventPage | null;
  readonly place: number;
};

/**
 * The names handed out so far, by page.
 */
const PAGE_KEYS = new WeakMap<RmmzEventPage, string>();

/**
 * How many names have been handed out, so each new one differs.
 */
let pageKeysHandedOut = 0;

/**
 * Names a page for as long as it lasts, for the window to key what it draws for the page by, so a half-typed value
 * belongs to the page it was typed on and is never handed to another page that comes to stand in the same place. A
 * page replaced by another object (cleared, put back by an undo, or arriving in another window's copy of the map) is a
 * new page as far as its name goes.
 * @param {RmmzEventPage} page The page, as the map document holds it.
 * @returns {string} Its name, such as "page-3".
 */
const pageKey = (page: RmmzEventPage): string =>
{
  const known = PAGE_KEYS.get(page);
  if (known !== undefined)
  {
    return known;
  }

  pageKeysHandedOut += 1;
  const key = `page-${pageKeysHandedOut}`;
  PAGE_KEYS.set(page, key);
  return key;
};

/**
 * Holds the page at a place among the event's pages as they stand now, for the window to show.
 * @param {DocumentHub} hub The window's documents.
 * @param {EventWindowTarget} target The event.
 * @param {number} place The page's place, from 0.
 * @returns {ShownPage} The page there, or no page when the event or the place has none, with the place.
 */
const shownPageAt = (hub: DocumentHub, target: EventWindowTarget, place: number): ShownPage =>
{
  const event = readTargetEvent(hub, target);
  return { page: event?.pages[place] ?? null, place };
};

/**
 * Finds where the page shown stands now: wherever the page itself has moved, or, once it has gone from the event
 * (deleted, cleared into a fresh page, or the whole map replaced by another window's copy), whichever page now holds
 * its last place, or the last page when the event has grown shorter than that.
 * @param {readonly RmmzEventPage[]} pages The event's pages, as they stand now.
 * @param {ShownPage} shown The page shown, and its place when last seen.
 * @returns {number} The place to show.
 */
const placeOfShownPage = (pages: readonly RmmzEventPage[], shown: ShownPage): number =>
{
  const place = shown.page === null
    ? -1
    : pages.indexOf(shown.page);
  return place >= 0
    ? place
    : Math.min(Math.max(shown.place, 0), pages.length - 1);
};

/**
 * Runs an edit on a page wherever that page stands at the moment the edit lands, not where it stood when the window
 * last drew it, so a page another window added or took away in front of it a moment earlier never turns the edit onto
 * its neighbour. A page that has gone from the event is refused, and so is an event that has gone from the map.
 * @param {DocumentHub} hub The window's documents.
 * @param {EventWindowTarget} target The event.
 * @param {RmmzEventPage} page The page, as the map document holds it.
 * @param {(pageIndex: number) => PageOutcome} edit The edit, given the page's place now.
 * @returns {PageOutcome} What the edit came to, or why it was refused.
 */
const editPageItself = (
  hub: DocumentHub,
  target: EventWindowTarget,
  page: RmmzEventPage,
  edit: (pageIndex: number) => PageOutcome,
): PageOutcome =>
{
  const event = readTargetEvent(hub, target);
  if (event === null)
  {
    return { ok: false, message: EVENT_GONE_MESSAGE };
  }

  const place = event.pages.indexOf(page);
  return place < 0
    ? { ok: false, message: PAGE_GONE_MESSAGE }
    : edit(place);
};

export { editPageItself, pageKey, placeOfShownPage, shownPageAt };
export type { ShownPage };
