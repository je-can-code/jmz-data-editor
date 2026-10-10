import { noteTextPlan } from '../blueprints/copyActions.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { eventHistoryKey, type HistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { Transaction } from '../history/Transaction.ts';
import { mapDocumentKey, type MapDocumentKey } from '../model/documentKeys.ts';
import type { PatchPath } from '../model/patches.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';

/**
 * The one event an event window edits: which map it is on, and its id there.
 */
type EventWindowTarget = {
  readonly mapId: number;
  readonly eventId: number;
};

/**
 * Why an edit from the event window changed nothing, in words for the author.
 */
type EditRefusal = {
  readonly ok: false;
  readonly message: string;
};

/**
 * What an edit from the event window came to: the step it recorded in the event's own history (null when the value
 * was already there), or why it was refused. A refused edit changes nothing.
 */
type EditOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null }
  | EditRefusal;

/**
 * What a page edit came to: as {@link EditOutcome}, plus the page the window should show afterwards, which is the new
 * page after an add or a paste, the neighbour after a delete, and the page's new place after a move.
 */
type PageOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null; readonly page: number }
  | EditRefusal;

/**
 * The event an edit is about, found live, or why the edit is refused.
 */
type LocatedEvent =
  | { readonly ok: true; readonly event: RmmzMapEvent }
  | EditRefusal;

/**
 * One page of the event an edit is about, found live, or why the edit is refused.
 */
type LocatedPage =
  | { readonly ok: true; readonly event: RmmzMapEvent; readonly page: RmmzEventPage }
  | EditRefusal;

/**
 * What the author reads when the event they are editing has gone from the map, deleted in another window, say.
 */
const EVENT_GONE_MESSAGE = 'This event is no longer on the map.';

/**
 * What the author reads when the page they are editing has gone from the event.
 */
const PAGE_GONE_MESSAGE = 'That page is no longer on this event.';

/**
 * Names the document an event window's edits land in: the map the event lives on.
 * @param {EventWindowTarget} target The event.
 * @returns {MapDocumentKey} The map's document key.
 */
const targetDocument = (target: EventWindowTarget): MapDocumentKey =>
{
  return mapDocumentKey(target.mapId);
};

/**
 * Names the history an event window records in: the event's own, so undo in the window never reaches the map's
 * painting or another event's edits.
 * @param {EventWindowTarget} target The event.
 * @returns {HistoryKey} The history key.
 */
const targetHistory = (target: EventWindowTarget): HistoryKey =>
{
  return eventHistoryKey(target.mapId, target.eventId);
};

/**
 * Names where the event sits inside its map's document.
 * @param {EventWindowTarget} target The event.
 * @returns {PatchPath} The path, such as {@code ['events', 5]}.
 */
const eventPath = (target: EventWindowTarget): PatchPath =>
{
  return [ 'events', target.eventId ];
};

/**
 * Names where the event's page list sits inside its map's document.
 * @param {EventWindowTarget} target The event.
 * @returns {PatchPath} The path, such as {@code ['events', 5, 'pages']}.
 */
const pagesPath = (target: EventWindowTarget): PatchPath =>
{
  return [ ...eventPath(target), 'pages' ];
};

/**
 * Names where one of the event's pages sits inside its map's document.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page's place in the event, from 0.
 * @returns {PatchPath} The path, such as {@code ['events', 5, 'pages', 0]}.
 */
const pagePath = (target: EventWindowTarget, pageIndex: number): PatchPath =>
{
  return [ ...pagesPath(target), pageIndex ];
};

/**
 * Names where one page's command list sits inside its map's document, which is what the command list edits.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page's place in the event, from 0.
 * @returns {PatchPath} The path, such as {@code ['events', 5, 'pages', 0, 'list']}.
 */
const pageListPath = (target: EventWindowTarget, pageIndex: number): PatchPath =>
{
  return [ ...pagePath(target, pageIndex), 'list' ];
};

/**
 * Reads the event a window edits, live, as the window's copy of the map holds it now.
 * @param {DocumentHub} hub The window's documents.
 * @param {EventWindowTarget} target The event.
 * @returns {RmmzMapEvent | null} The event, or null when its map is not held or its slot is empty.
 */
const readTargetEvent = (hub: DocumentHub, target: EventWindowTarget): RmmzMapEvent | null =>
{
  const key = targetDocument(target);
  return hub.has(key)
    ? hub.map(key).event(target.eventId)
    : null;
};

/**
 * Finds the event an edit is about, refusing one that has gone from the map rather than letting the edit bring it
 * back as a stray.
 * @param {DocumentHub} hub The window's documents.
 * @param {EventWindowTarget} target The event.
 * @returns {LocatedEvent} The event, or why the edit is refused.
 */
const locateEvent = (hub: DocumentHub, target: EventWindowTarget): LocatedEvent =>
{
  const event = readTargetEvent(hub, target);
  return event === null
    ? { ok: false, message: EVENT_GONE_MESSAGE }
    : { ok: true, event };
};

/**
 * Finds one page of the event an edit is about, refusing an event or a page that has gone.
 * @param {DocumentHub} hub The window's documents.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page's place in the event, from 0.
 * @returns {LocatedPage} The event and the page, or why the edit is refused.
 */
const locatePage = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number): LocatedPage =>
{
  const found = locateEvent(hub, target);
  if (found.ok === false)
  {
    return found;
  }

  const page = found.event.pages[pageIndex];
  return page === undefined
    ? { ok: false, message: PAGE_GONE_MESSAGE }
    : { ok: true, event: found.event, page };
};

/**
 * Records one edit as a named step in the event's own history, which is where every edit made in its window goes.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {string} label What the history panel calls the step.
 * @param {(transaction: Transaction) => void} build Adds the patches.
 * @returns {HistoryStep | null} The step, or null when nothing changed.
 */
const recordEventStep = (
  hub: DocumentHub,
  target: EventWindowTarget,
  label: string,
  build: (transaction: Transaction) => void,
): HistoryStep | null =>
{
  return hub.edit(label, [ targetHistory(target) ], build);
};

/**
 * Sets one field of the event's own (its name or its note) as a named step, refusing an event that has gone.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {'name' | 'note'} field The field.
 * @param {string} value Its new value.
 * @param {string} label What the history panel calls the step.
 * @returns {EditOutcome} The step, or why nothing changed.
 */
const setEventField = (hub: DocumentHub, target: EventWindowTarget, field: 'name' | 'note', value: string, label: string): EditOutcome =>
{
  const found = locateEvent(hub, target);
  if (found.ok === false)
  {
    return found;
  }

  const step = recordEventStep(hub, target, label, transaction =>
  {
    transaction.set(targetDocument(target), [ ...eventPath(target), field ], value);
  });
  return { ok: true, step };
};

/**
 * Renames the event, as one step in its own history. The name is free text; MZ itself puts no rule on it.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {string} name The new name.
 * @returns {EditOutcome} The step, or why nothing changed.
 */
const renameEvent = (hub: DocumentHub, target: EventWindowTarget, name: string): EditOutcome =>
{
  return setEventField(hub, target, 'name', name, 'Rename event');
};

/**
 * Changes the event's note as its Note box shows it, as one step in its own history (see copyActions' noteBoxOf). The
 * note belongs to the editor, so what the author typed is written exactly as given, every line and character kept: as
 * the whole note, for most events; and for a copy of a blueprint, whose box shows the note's own text, as that text, its
 * link to its blueprint written after it and never lost. A copy's text holding a link of its own, or one the game would
 * read otherwise with the link after it, is refused, with why.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {string} note The note as the box holds it.
 * @returns {EditOutcome} The step, or why nothing changed.
 */
const setEventNote = (hub: DocumentHub, target: EventWindowTarget, note: string): EditOutcome =>
{
  const found = locateEvent(hub, target);
  if (found.ok === false)
  {
    return found;
  }

  const planned = noteTextPlan(found.event, note);
  return planned.ok
    ? setEventField(hub, target, 'note', planned.event.note, 'Edit event note')
    : planned;
};

/**
 * Words a page's place for the history panel, the way the window's tabs number pages.
 * @param {number} pageIndex The page's place in the event, from 0.
 * @returns {string} Such as "page 2".
 */
const pageWords = (pageIndex: number): string =>
{
  return `page ${pageIndex + 1}`;
};

export {
  EVENT_GONE_MESSAGE,
  eventPath,
  locateEvent,
  locatePage,
  PAGE_GONE_MESSAGE,
  pageListPath,
  pagePath,
  pagesPath,
  pageWords,
  readTargetEvent,
  recordEventStep,
  renameEvent,
  setEventNote,
  targetDocument,
  targetHistory,
};
export type { EditOutcome, EditRefusal, EventWindowTarget, LocatedEvent, LocatedPage, PageOutcome };
