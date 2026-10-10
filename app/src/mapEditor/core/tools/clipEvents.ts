import { NO_IMAGE } from '../events/eventDragPreview.ts';
import { planEventMove, type EventMove } from '../events/eventMoves.ts';
import { blockedCells, eventCellsOf, isOnMap, newEventIds, type EventCell, type EventMap } from '../events/eventPlacement.ts';
import { rewireGroupReferences } from '../events/eventReferences.ts';
import type { Transaction } from '../history/Transaction.ts';
import { cloneJson } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzEventImage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect, GhostEvent } from '../renderer/MapRenderer.ts';
import { rectContains } from './geometry.ts';

/**
 * What the events an area lifted by the select tool carries come to where the area is put down: each one's move, for a
 * move; each copy, with its fresh id and the cell it lands on, for a copy, and how many fell past the map's edge and were
 * left out; or why they cannot go there, which refuses the whole drop, tiles and all.
 */
type ClipEventsPlan =
  | { readonly ok: true; readonly moves: readonly EventMove[]; readonly copies: readonly RmmzMapEvent[]; readonly leftOut: number }
  | { readonly ok: false; readonly message: string };

/**
 * What the events a lifted area carries show while it is dragged: a ghost of each where it would land, the tiles among
 * those another event holds, and, for a move, whether any would leave the map, which a drop there would refuse.
 */
type ClipEventsFrame = {
  readonly ghosts: readonly GhostEvent[];
  readonly blocked: readonly MapCell[];
  readonly offMap: boolean;
};

/**
 * Why a copy is refused while one of the events it carries would land on a tile another event holds: MZ never stacks two
 * events on one tile.
 */
const EVENT_IN_THE_WAY = 'Another event is in the way.';

/**
 * Lists the events standing on an area, in id order: what an area the select tool lifts carries along with its tiles when
 * it carries every layer, as copying the area into a stamp does (see stamp's captureAreaStamp).
 * @param {EventMap} map The map.
 * @param {CellRect} area The cells lifted.
 * @returns {number[]} The events' ids.
 */
const eventsOnArea = (map: EventMap, area: CellRect): number[] =>
{
  return map.eventIds().filter(eventId =>
  {
    const event = map.event(eventId) as RmmzMapEvent;
    return rectContains(area, event);
  });
};

/**
 * Plans what the events a lifted area carries come to where the area lands, against the map as it stands at the drop.
 * Moved, they keep their ids, their links and everything else, each shifted as the tiles are; one that would leave the
 * map, which would lose it, or land on a tile an event staying put holds, refuses the move (see planEventMove). Copied,
 * each goes down as a new event with a fresh id past the end of the list, its commands naming the others copied naming
 * their copies, and its note as it was, so a copy of a blueprint's event is one more copy of it; one landing past the
 * edge is left out, as the tiles there are, and one landing on any event refuses the copy.
 * @param {EventMap} map The map.
 * @param {readonly number[]} eventIds The events the area carries; ids the map no longer holds are passed over.
 * @param {MapCell} by How far the area goes.
 * @param {boolean} copy True for a copy, false for a move.
 * @returns {ClipEventsPlan} What the events come to, or why they cannot go there.
 */
const planClipEvents = (map: EventMap, eventIds: readonly number[], by: MapCell, copy: boolean): ClipEventsPlan =>
{
  if (copy === false)
  {
    const plan = planEventMove(map, eventIds, by.x, by.y);
    return plan.ok
      ? { ok: true, moves: plan.moves, copies: [], leftOut: 0 }
      : { ok: false, message: plan.message };
  }

  // the originals stay where they stand, so every event blocks a copy, and one landing past the edge is left out.
  const cells = eventCellsOf(map, eventIds);
  const landing = cells.filter(cell => isOnMap({ x: cell.x + by.x, y: cell.y + by.y }, map));
  const targets = landing.map(cell => ({ x: cell.x + by.x, y: cell.y + by.y }));
  if (blockedCells(map, targets, new Set()).length > 0)
  {
    return { ok: false, message: EVENT_IN_THE_WAY };
  }

  // the copies' references to one another follow them to their new ids.
  const ids = newEventIds(map, landing.length);
  const newIds = new Map(landing.map((cell, index) => [ cell.id, ids[index] ]));
  const copies = landing.map((cell, index) => ({
    ...rewireGroupReferences(cloneJson(map.event(cell.id) as RmmzMapEvent), newIds),
    id: ids[index],
    x: targets[index].x,
    y: targets[index].y,
  }));

  return { ok: true, moves: [], copies, leftOut: cells.length - landing.length };
};

/**
 * Puts a drop's events down inside the open transaction that puts its tiles down: each move as its new cell, each copy as
 * a new event, its patch built against the list as the one before left it.
 * @param {Transaction} tx The open transaction.
 * @param {MapDocument} map The map.
 * @param {Extract<ClipEventsPlan, { ok: true }>} plan What the events come to.
 */
const commitClipEvents = (tx: Transaction, map: MapDocument, plan: Extract<ClipEventsPlan, { ok: true }>): void =>
{
  // a patch that changes nothing is left out, so a shift along one axis writes only that axis.
  plan.moves.forEach(({ id, to }) =>
  {
    tx.set(map.key, [ 'events', id, 'x' ], to.x);
    tx.set(map.key, [ 'events', id, 'y' ], to.y);
  });
  plan.copies.forEach(event => tx.apply(map.key, map.placeEventPatch(event)));
};

/**
 * Words what a drop left out of the events it carried, for the author: those that fell past the map's edge.
 * @param {number} leftOut How many were left out.
 * @returns {string | null} The words, or null when none were.
 */
const leftOutWords = (leftOut: number): string | null =>
{
  if (leftOut === 0)
  {
    return null;
  }

  return leftOut === 1
    ? 'One of the selection\'s events fell past the map\'s edge and was left out.'
    : `${leftOut} of the selection's events fell past the map's edge and were left out.`;
};

/**
 * The events a lifted area carries, worked out once as its drag starts, so each tile the pointer reaches after that costs
 * only as much as those events do, however many events the map holds. Each ghost looks as its event does on the map, by
 * its first page's picture and priority, and names its event, so one drawing no picture shows that event's marker.
 */
class ClipEventsPreview
{
  readonly eventIds: readonly number[];

  #cells: readonly EventCell[];

  #looks: readonly { readonly image: RmmzEventImage; readonly priorityType: number }[];

  /**
   * The tiles held by the events staying put, which block a move, and by every event, which block a copy, keyed by their
   * place in the map.
   */
  #heldByOthers: ReadonlySet<number>;

  #heldByAll: ReadonlySet<number>;

  #size: { readonly width: number; readonly height: number };

  /**
   * @param {EventMap} map The map, as it stands when the drag starts.
   * @param {readonly number[]} eventIds The events the area carries.
   */
  constructor(map: EventMap, eventIds: readonly number[])
  {
    this.#cells = eventCellsOf(map, eventIds);
    this.eventIds = this.#cells.map(cell => cell.id);
    this.#size = { width: map.width, height: map.height };
    this.#looks = this.#cells.map(({ id }) =>
    {
      const page = map.event(id)?.pages[0];
      return page === undefined
        ? { image: NO_IMAGE, priorityType: 0 }
        : { image: page.image, priorityType: page.priorityType };
    });

    const carried = new Set(this.eventIds);
    const others = new Set<number>();
    const all = new Set<number>();
    map.eventIds().forEach(id =>
    {
      const event = map.event(id) as RmmzMapEvent;
      const place = event.y * map.width + event.x;
      all.add(place);
      if (carried.has(id) === false)
      {
        others.add(place);
      }
    });
    this.#heldByOthers = others;
    this.#heldByAll = all;
  }

  /**
   * Works out what the carried events show for a shift of the area.
   * @param {MapCell} by How far the area would go.
   * @param {boolean} copy True for a copy, whose originals stay and block; false for a move.
   * @returns {ClipEventsFrame} The ghosts on the map, the tiles blocked among them, and whether a move would lose one.
   */
  at(by: MapCell, copy: boolean): ClipEventsFrame
  {
    const held = copy ? this.#heldByAll : this.#heldByOthers;
    const ghosts: GhostEvent[] = [];
    const blocked: MapCell[] = [];
    let offMap = false;
    this.#cells.forEach((cell, index) =>
    {
      const x = cell.x + by.x;
      const y = cell.y + by.y;
      if (isOnMap({ x, y }, this.#size) === false)
      {
        offMap = true;
        return;
      }

      ghosts.push({ x, y, eventId: cell.id, ...this.#looks[index] });
      if (held.has(y * this.#size.width + x))
      {
        blocked.push({ x, y });
      }
    });

    return { ghosts, blocked, offMap: offMap && copy === false };
  }
}

export { ClipEventsPreview, commitClipEvents, eventsOnArea, leftOutWords, planClipEvents };
export type { ClipEventsFrame, ClipEventsPlan };
