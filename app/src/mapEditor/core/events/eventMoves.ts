import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { EventEditOutcome } from './eventEdits.ts';
import {
  blockedCells,
  boundsOf,
  eventCellsOf,
  eventsPhrase,
  isOnMap,
  shiftWithinMap,
  type EventMap,
} from './eventPlacement.ts';

/**
 * One event moving: from the cell it stands on to the cell it lands on.
 */
type EventMove = {
  readonly id: number;
  readonly from: MapCell;
  readonly to: MapCell;
};

/**
 * What moving some events by a shift would do: every event's move, or why the group cannot go there.
 *
 * - {@code edge}: an event would leave the map.
 * - {@code blocked}: an event would land on a tile another event holds; {@code blocked} names those tiles.
 */
type MovePlan =
  | { readonly ok: true; readonly moves: readonly EventMove[] }
  | { readonly ok: false; readonly reason: 'edge' | 'blocked'; readonly message: string; readonly blocked: readonly MapCell[] };

/**
 * Works out moving a group of events by a shift, all together, keeping their places relative to each other. The group
 * cannot leave the map, and no event may land on a tile held by an event outside the group: MZ never stacks two events
 * on one tile, and none of the shipped maps do. Tiles the group itself leaves are free to land on.
 * @param {EventMap} map The map.
 * @param {readonly number[]} eventIds The events; ids the map does not hold are passed over.
 * @param {number} dx The shift across, in tiles.
 * @param {number} dy The shift down, in tiles.
 * @returns {MovePlan} The moves, or why the group cannot go there.
 */
const planEventMove = (map: EventMap, eventIds: readonly number[], dx: number, dy: number): MovePlan =>
{
  const cells = eventCellsOf(map, eventIds);
  const moves = cells.map(({ id, x, y }) => ({ id, from: { x, y }, to: { x: x + dx, y: y + dy } }));
  if (moves.some(move => isOnMap(move.to, map) === false))
  {
    return { ok: false, reason: 'edge', message: 'The map ends there.', blocked: [] };
  }

  const blocked = blockedCells(map, moves.map(move => move.to), new Set(cells.map(cell => cell.id)));
  if (blocked.length > 0)
  {
    return { ok: false, reason: 'blocked', message: 'Another event is in the way.', blocked };
  }

  return { ok: true, moves };
};

/**
 * Shortens a drag's shift so the dragged group stops at the map's edge instead of going over it, each way on its own,
 * so a group dragged into a wall slides along it.
 * @param {EventMap} map The map.
 * @param {readonly number[]} eventIds The dragged events.
 * @param {number} dx The shift across the pointer asks for, in tiles.
 * @param {number} dy The shift down the pointer asks for, in tiles.
 * @returns {{ dx: number, dy: number }} The shift that keeps every dragged event on the map.
 */
const dragShift = (map: EventMap, eventIds: readonly number[], dx: number, dy: number): { dx: number; dy: number } =>
{
  const bounds = boundsOf(eventCellsOf(map, eventIds));
  return bounds === null
    ? { dx, dy }
    : shiftWithinMap(bounds, dx, dy, map);
};

/**
 * Moves a group of events by a shift as one step in the map's history: a drag dropped, or an arrow key nudging the
 * selection one tile. A shift of nothing records nothing, and a move {@link planEventMove} refuses changes nothing.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The events.
 * @param {number} dx The shift across, in tiles.
 * @param {number} dy The shift down, in tiles.
 * @returns {EventEditOutcome} The step and the moved events, or why they could not move.
 */
const moveEvents = (hub: DocumentHub, mapId: number, eventIds: readonly number[], dx: number, dy: number): EventEditOutcome =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  const plan = planEventMove(map, eventIds, dx, dy);
  if (plan.ok === false)
  {
    return { ok: false, message: plan.message };
  }

  const moved = plan.moves.map(move => move.id);
  if ((dx === 0 && dy === 0) || moved.length === 0)
  {
    return { ok: true, step: null, eventIds: moved };
  }

  const step = hub.edit(`Move ${eventsPhrase(moved.length)}`, [ mapHistoryKey(mapId) ], tx =>
  {
    // a patch that changes nothing is left out, so a shift along one axis writes only that axis.
    plan.moves.forEach(({ id, to }) =>
    {
      tx.set(key, [ 'events', id, 'x' ], to.x);
      tx.set(key, [ 'events', id, 'y' ], to.y);
    });
  });

  return { ok: true, step, eventIds: moved };
};

export { dragShift, moveEvents, planEventMove };
export type { EventMove, MovePlan };
