import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import { cloneJson, isJsonObject } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import { deleteEvents, type EventEditOutcome } from './eventEdits.ts';
import {
  blockedCells,
  boundsOf,
  eventCellsOf,
  eventsPhrase,
  freeEventIds,
  shiftWithinMap,
  type EventMap,
} from './eventPlacement.ts';

/**
 * The mark every event clipboard carries, so a paste knows the text on the system clipboard is events copied from the
 * map editor, in this window or any other, and not whatever else was copied last.
 */
const EVENT_CLIPBOARD_MARKER = 'jmz-map-editor/events';

/**
 * The shape of the event clipboard this editor writes and reads.
 */
const EVENT_CLIPBOARD_VERSION = 1;

/**
 * Events copied to the system clipboard, as JSON text: the marker, the shape's version, the map they were copied from,
 * and full copies of the events, exactly as the map file holds them. Their ids and cells are where they stood; a paste
 * gives them fresh ids on the map they land on.
 */
type EventClipboard = {
  readonly marker: typeof EVENT_CLIPBOARD_MARKER;
  readonly version: typeof EVENT_CLIPBOARD_VERSION;
  readonly mapId: number;
  readonly events: readonly RmmzMapEvent[];
};

/**
 * What a paste would do: the events as they would land, with fresh ids and their new cells, or why they cannot land.
 */
type PastePlan =
  | { readonly ok: true; readonly events: readonly RmmzMapEvent[] }
  | { readonly ok: false; readonly message: string };

/**
 * Where a duplicate tries to go, in order: one tile right of the originals, then below, left and above, whichever the
 * whole group fits first.
 */
const DUPLICATE_SHIFTS: readonly MapCell[] = [ { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 } ];

/**
 * Copies events for the clipboard: full copies, in id order, so their order among themselves survives a paste.
 * @param {EventMap} map The map.
 * @param {number} mapId The map's id.
 * @param {readonly number[]} eventIds The events; ids the map does not hold are passed over.
 * @returns {EventClipboard | null} The clipboard, or null when there is nothing to copy.
 */
const copyEvents = (map: EventMap, mapId: number, eventIds: readonly number[]): EventClipboard | null =>
{
  const ids = eventCellsOf(map, eventIds).map(cell => cell.id).sort((left, right) => left - right);
  if (ids.length === 0)
  {
    return null;
  }

  const events = ids.map(id => cloneJson(map.event(id) as RmmzMapEvent));
  return { marker: EVENT_CLIPBOARD_MARKER, version: EVENT_CLIPBOARD_VERSION, mapId, events };
};

/**
 * Writes an event clipboard as the text that goes on the system clipboard.
 * @param {EventClipboard} clipboard The clipboard.
 * @returns {string} The JSON text.
 */
const encodeEventClipboard = (clipboard: EventClipboard): string =>
{
  return JSON.stringify(clipboard);
};

/**
 * Reports whether a value is a whole number at least as large as a floor.
 * @param {unknown} value The value.
 * @param {number} floor The smallest it may be.
 * @returns {boolean} True for such a number.
 */
const isWholeFrom = (value: unknown, floor: number): value is number =>
{
  return typeof value === 'number' && Number.isInteger(value) && value >= floor;
};

/**
 * Reports whether a value has the shape of a map event: an id, a tile, a name, a note and a list of pages.
 * @param {unknown} value The value.
 * @returns {boolean} True when it can be placed on a map as an event.
 */
const isMapEvent = (value: unknown): value is RmmzMapEvent =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { id, x, y, name, note, pages } = value;
  return isWholeFrom(id, 1) && isWholeFrom(x, 0) && isWholeFrom(y, 0)
    && typeof name === 'string' && typeof note === 'string' && Array.isArray(pages);
};

/**
 * Reads the text on the system clipboard as copied events. Anything else, such as a line of dialogue copied from a
 * text box, or events in a shape this editor does not write, reads as nothing, so a paste of it changes nothing.
 * @param {string} text The clipboard's text.
 * @returns {EventClipboard | null} The copied events, or null when the text is not an event clipboard.
 */
const decodeEventClipboard = (text: string): EventClipboard | null =>
{
  let parsed: unknown;
  try
  {
    parsed = JSON.parse(text);
  }
  catch
  {
    return null;
  }

  if (isJsonObject(parsed) === false || parsed['marker'] !== EVENT_CLIPBOARD_MARKER || parsed['version'] !== EVENT_CLIPBOARD_VERSION)
  {
    return null;
  }

  const { mapId, events } = parsed;
  if (isWholeFrom(mapId, 1) === false || Array.isArray(events) === false || events.length === 0 || events.every(isMapEvent) === false)
  {
    return null;
  }

  return { marker: EVENT_CLIPBOARD_MARKER, version: EVENT_CLIPBOARD_VERSION, mapId, events: events as unknown as RmmzMapEvent[] };
};

/**
 * Works out a paste of copied events onto a map. The group keeps its layout: its top-left corner lands on the target
 * tile, or, with no target, every event lands on the tile it was copied from. A group reaching past the map's edge is
 * slid back onto it. The events take the lowest free ids on this map, in the order they were copied, so none takes an
 * id the map already uses. A group larger than the map, or one that would land an event on a tile another event holds,
 * is refused whole.
 * @param {EventMap} map The map to paste onto.
 * @param {EventClipboard} clipboard The copied events.
 * @param {MapCell | null} target The tile the group's top-left corner goes to, or null to paste where they were copied.
 * @returns {PastePlan} The events as they would land, or why they cannot.
 */
const planPaste = (map: EventMap, clipboard: EventClipboard, target: MapCell | null): PastePlan =>
{
  // a clipboard always holds at least one event, so it always has bounds.
  const { events } = clipboard;
  const bounds = boundsOf(events) as CellRect;
  if (bounds.width > map.width || bounds.height > map.height)
  {
    return { ok: false, message: `The pasted ${eventsPhrase(events.length)} do not fit on this map.` };
  }

  const wanted = target === null
    ? { dx: 0, dy: 0 }
    : { dx: target.x - bounds.x, dy: target.y - bounds.y };
  const { dx, dy } = shiftWithinMap(bounds, wanted.dx, wanted.dy, map);
  const cells = events.map(event => ({ x: event.x + dx, y: event.y + dy }));
  const blocked = new Set(blockedCells(map, cells, new Set()).map(cell => `${cell.x},${cell.y}`));
  const landing = cells.filter(cell => blocked.has(`${cell.x},${cell.y}`)).length;
  if (landing > 0)
  {
    return {
      ok: false,
      message: events.length === 1
        ? 'The pasted event would land on another event.'
        : `${landing} of the ${events.length} pasted events would land on other events.`,
    };
  }

  const ids = freeEventIds(map, events.length);
  const placed = events.map((event, index) => ({ ...cloneJson(event), id: ids[index], x: cells[index].x, y: cells[index].y }));

  return { ok: true, events: placed };
};

/**
 * Places planned events on a map as one step in its history.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly RmmzMapEvent[]} events The events, with their ids and cells.
 * @param {string} verb What the history panel calls the step, before how many events it places.
 * @returns {EventEditOutcome} The step and the placed events.
 */
const placeEvents = (hub: DocumentHub, mapId: number, events: readonly RmmzMapEvent[], verb: string): EventEditOutcome =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  const step = hub.edit(`${verb} ${eventsPhrase(events.length)}`, [ mapHistoryKey(mapId) ], tx =>
  {
    // each patch is built against the list as the one before left it, since placing past its end grows it.
    events.forEach(event => tx.apply(key, map.placeEventPatch(event)));
  });

  return { ok: true, step, eventIds: events.map(event => event.id) };
};

/**
 * Pastes copied events onto a map as one step in its history, as {@link planPaste} works out, from this map or any
 * other, in this window or any other.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map to paste onto.
 * @param {EventClipboard} clipboard The copied events.
 * @param {MapCell | null} target The tile the group's top-left corner goes to, or null to paste where they were copied.
 * @returns {EventEditOutcome} The step and the pasted events, which take the selection, or why they cannot land.
 */
const pasteEvents = (hub: DocumentHub, mapId: number, clipboard: EventClipboard, target: MapCell | null): EventEditOutcome =>
{
  const plan = planPaste(hub.map(mapDocumentKey(mapId)), clipboard, target);
  return plan.ok
    ? placeEvents(hub, mapId, plan.events, 'Paste')
    : { ok: false, message: plan.message };
};

/**
 * Duplicates events beside themselves as one step in the map's history: the copies keep the group's layout one tile
 * right of the originals, or below, left or above when the group does not fit there, and take fresh ids.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The events.
 * @returns {EventEditOutcome} The step and the copies, which take the selection, or why there was no room.
 */
const duplicateEvents = (hub: DocumentHub, mapId: number, eventIds: readonly number[]): EventEditOutcome =>
{
  const map = hub.map(mapDocumentKey(mapId));
  const clipboard = copyEvents(map, mapId, eventIds);
  if (clipboard === null)
  {
    return { ok: true, step: null, eventIds: [] };
  }

  // the first shift the whole group fits: a shift slid back onto the originals lands on them and is refused.
  const bounds = boundsOf(clipboard.events) as CellRect;
  for (const shift of DUPLICATE_SHIFTS)
  {
    const plan = planPaste(map, clipboard, { x: bounds.x + shift.x, y: bounds.y + shift.y });
    if (plan.ok)
    {
      return placeEvents(hub, mapId, plan.events, 'Duplicate');
    }
  }

  return { ok: false, message: 'There is no room beside the selection for a copy.' };
};

/**
 * Cuts events: copies them for the clipboard, then removes them from the map as one step in its history.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The events.
 * @returns {{ clipboard: EventClipboard | null, outcome: EventEditOutcome }} What goes on the clipboard, and the step.
 */
const cutEvents = (hub: DocumentHub, mapId: number, eventIds: readonly number[]): { clipboard: EventClipboard | null; outcome: EventEditOutcome } =>
{
  const clipboard = copyEvents(hub.map(mapDocumentKey(mapId)), mapId, eventIds);
  return { clipboard, outcome: deleteEvents(hub, mapId, eventIds, 'Cut') };
};

export {
  copyEvents,
  cutEvents,
  decodeEventClipboard,
  duplicateEvents,
  encodeEventClipboard,
  EVENT_CLIPBOARD_MARKER,
  EVENT_CLIPBOARD_VERSION,
  pasteEvents,
  planPaste,
};
export type { EventClipboard, PastePlan };
