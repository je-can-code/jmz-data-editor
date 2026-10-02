import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import { createMapEvent } from '../model/eventModel.ts';
import type { MapCell } from '../renderer/camera.ts';
import { blockedCells, eventCellsOf, eventsPhrase, isOnMap, newEventIds } from './eventPlacement.ts';

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
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {MapCell} cell Where the event goes.
 * @returns {EventEditOutcome} The step and the new event, or why it was refused.
 */
const createEvent = (hub: DocumentHub, mapId: number, cell: MapCell): EventEditOutcome =>
{
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
 * the list, as MZ leaves it. Ids the map does not hold are passed over, and removing nothing records nothing.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The events.
 * @param {string} verb What the history panel calls the step: "Delete", or "Cut" when the events went to the clipboard.
 * @returns {EventEditOutcome} The step, with nothing left to select.
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

  const step = hub.edit(`${verb} ${eventsPhrase(held.length)}`, [ mapHistoryKey(mapId) ], tx =>
  {
    held.forEach(({ id }) => tx.apply(key, map.removeEventPatch(id)));
  });

  return { ok: true, step, eventIds: [] };
};

export { createEvent, deleteEvents };
export type { EventEditOutcome };
