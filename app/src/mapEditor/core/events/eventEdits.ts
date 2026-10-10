import { blueprintLinkOf } from '../blueprints/blueprintLink.ts';
import { BLUEPRINT_EVENTS_ADDED, BLUEPRINT_EVENTS_REMOVED } from '../blueprints/blueprintShape.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { isBlueprintMapId, mapDocumentKey } from '../model/documentKeys.ts';
import { createMapEvent } from '../model/eventModel.ts';
import { cloneJson } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import {
  blockedCells,
  boundsOf,
  eventCellsOf,
  eventsPhrase,
  isOnMap,
  newEventIds,
  shiftWithinMap,
  type EventMap,
} from './eventPlacement.ts';
import { rewireGroupReferences } from './eventReferences.ts';

/**
 * What an edit to a map's events came to: the step it recorded (null when there was nothing to change) and the events
 * to select afterwards, or why it was refused, in words for the author. A refused edit changes nothing.
 */
type EventEditOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null; readonly eventIds: readonly number[] }
  | { readonly ok: false; readonly message: string };

/**
 * Places a new event on an empty tile, as one step in the map's history. It takes the id just past the end of the
 * list, never an empty slot a delete left, since whatever still names that id (a self switch in a save, a command in
 * another event) would otherwise reach the new event; and it starts with one fresh page. A tile holding an event
 * already, or a spot off the map, is refused: MZ never stacks two events on one tile, and none of the shipped maps do.
 * So is any new event in a blueprint opened as a map, whose events are fixed (see blueprintShape).
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {MapCell} cell Where the event goes.
 * @returns {EventEditOutcome} The step and the new event, or why it was refused.
 */
const createEvent = (hub: DocumentHub, mapId: number, cell: MapCell): EventEditOutcome =>
{
  if (isBlueprintMapId(mapId))
  {
    return { ok: false, message: BLUEPRINT_EVENTS_ADDED };
  }

  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  if (isOnMap(cell, map) === false)
  {
    return { ok: false, message: 'That spot is off the map.' };
  }

  if (blockedCells(map, [ cell ], new Set()).length > 0)
  {
    return { ok: false, message: 'Another event already stands there.' };
  }

  const [ id ] = newEventIds(map, 1);
  const step = hub.edit('New event', [ mapHistoryKey(mapId) ], tx =>
  {
    tx.apply(key, map.placeEventPatch(createMapEvent(id, cell.x, cell.y)));
  });

  return { ok: true, step, eventIds: [ id ] };
};

/**
 * Removes events from a map as one step in its history, which one undo brings back whole. Each emptied slot stays in
 * the list, as MZ leaves it. Ids the map does not hold are passed over, and removing nothing records nothing. Removing
 * any from a blueprint opened as a map is refused, since its events are fixed (see blueprintShape).
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The events.
 * @param {string} verb What the history panel calls the step: "Delete", or "Cut" when the events went to the clipboard.
 * @returns {EventEditOutcome} The step, with nothing left to select, or why it was refused.
 */
const deleteEvents = (hub: DocumentHub, mapId: number, eventIds: readonly number[], verb = 'Delete'): EventEditOutcome =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  const held = eventCellsOf(map, eventIds);
  if (held.length === 0)
  {
    return { ok: true, step: null, eventIds: [] };
  }

  if (isBlueprintMapId(mapId))
  {
    return { ok: false, message: BLUEPRINT_EVENTS_REMOVED };
  }

  const step = hub.edit(`${verb} ${eventsPhrase(held.length)}`, [ mapHistoryKey(mapId) ], tx =>
  {
    held.forEach(({ id }) => tx.apply(key, map.removeEventPatch(id)));
  });

  return { ok: true, step, eventIds: [] };
};

/**
 * Where a duplicate tries to go, in order: one tile right of the originals, then below, left and above, whichever the
 * whole group fits first.
 */
const DUPLICATE_SHIFTS: readonly MapCell[] = [ { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 } ];

/**
 * Works out copies of a group of events shifted beside themselves: the group keeps its layout and is slid back onto the
 * map at an edge, and the copies take new ids past the end of the list, in the order given, with their commands naming
 * one another pointed at the copies. A shift that would land a copy on another event, an original included (as a shift
 * slid back onto the originals does), is refused.
 * @param {EventMap} map The map.
 * @param {readonly RmmzMapEvent[]} events The originals, in id order.
 * @param {MapCell} shift How far across and down the copies go.
 * @returns {RmmzMapEvent[] | null} The copies, with their ids and cells, or null when they would land on events.
 */
const planDuplicate = (map: EventMap, events: readonly RmmzMapEvent[], shift: MapCell): RmmzMapEvent[] | null =>
{
  // a group of events on the map always has bounds, inside the map.
  const bounds = boundsOf(events) as CellRect;
  const { dx, dy } = shiftWithinMap(bounds, shift.x, shift.y, map);
  const cells = events.map(event => ({ x: event.x + dx, y: event.y + dy }));
  if (blockedCells(map, cells, new Set()).length > 0)
  {
    return null;
  }

  // the copies' references to one another follow them to their new ids; the originals keep theirs.
  const ids = newEventIds(map, events.length);
  const newIds = new Map(events.map((event, index) => [ event.id, ids[index] ]));
  return events.map((event, index) => ({
    ...rewireGroupReferences(cloneJson(event), newIds),
    id: ids[index],
    x: cells[index].x,
    y: cells[index].y,
  }));
};

/**
 * Duplicates events beside themselves as one step in the map's history: the copies keep the group's layout one tile
 * right of the originals, or below, left or above when the group does not fit there, and take fresh ids; the copies'
 * commands naming each other name the copies, while the originals keep theirs. A duplicate is no copy to the clipboard
 * and no stamp: it places the copies at once and leaves the Stamps panel as it was. A duplicate of a copy of a blueprint
 * is a copy too, its note keeping the link, so on a map that may hold no link a selection holding one is refused whole,
 * as placing a blueprint or a stamp carrying its copies there is. A duplicate in a blueprint opened as a map is refused
 * too, since its events are fixed (see blueprintShape).
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The events.
 * @param {string | null} linkRefusal Why the map may hold no copy of a blueprint, or null when it may.
 * @returns {EventEditOutcome} The step and the copies, which take the selection, or why there was no room, or why
 * copies of a blueprint cannot go there, or why a blueprint takes no new event.
 */
const duplicateEvents = (hub: DocumentHub, mapId: number, eventIds: readonly number[], linkRefusal: string | null): EventEditOutcome =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  const held = eventCellsOf(map, eventIds).map(cell => cell.id).sort((left, right) => left - right);
  if (held.length === 0)
  {
    return { ok: true, step: null, eventIds: [] };
  }

  if (isBlueprintMapId(mapId))
  {
    return { ok: false, message: BLUEPRINT_EVENTS_ADDED };
  }

  // copies of a blueprint stay off a map that may hold no link, however they would get there.
  const originals = held.map(id => map.event(id) as RmmzMapEvent);
  if (linkRefusal !== null && originals.some(event => blueprintLinkOf(event.note) !== null))
  {
    return { ok: false, message: `The selection holds copies of blueprints, which can't go here: ${linkRefusal}.` };
  }

  // the first shift the whole group fits, trying the next only once one is refused.
  for (const shift of DUPLICATE_SHIFTS)
  {
    const copies = planDuplicate(map, originals, shift);
    if (copies !== null)
    {
      const step = hub.edit(`Duplicate ${eventsPhrase(copies.length)}`, [ mapHistoryKey(mapId) ], tx =>
      {
        // each patch is built against the list as the one before left it, since placing past its end grows it.
        copies.forEach(event => tx.apply(key, map.placeEventPatch(event)));
      });

      return { ok: true, step, eventIds: copies.map(event => event.id) };
    }
  }

  return { ok: false, message: 'There is no room beside the selection for a copy.' };
};

export { createEvent, deleteEvents, duplicateEvents };
export type { EventEditOutcome };
