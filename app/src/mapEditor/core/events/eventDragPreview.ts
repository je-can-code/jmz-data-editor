import type { RmmzEventImage } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect, GhostEvent } from '../renderer/MapRenderer.ts';
import { boundsOf, eventCellsOf, shiftWithinMap, type EventCell, type EventMap } from './eventPlacement.ts';

/**
 * What a drag shows at one moment: the shift the dragged events would move by, kept on the map, a ghost of each where
 * it would land, the tiles among those that other events hold, and whether a drop there would move anything at all.
 */
type DragFrame = {
  readonly dx: number;
  readonly dy: number;
  readonly ghosts: readonly GhostEvent[];
  readonly blocked: readonly MapCell[];
  readonly ok: boolean;
};

/**
 * The picture a ghost draws for an event with no pages: nothing, leaving only its outlined tile.
 */
const NO_IMAGE: RmmzEventImage = { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 };

/**
 * A drag of some events, worked out once as it starts, so each tile the pointer reaches after that costs only as much
 * as the dragged events do, however many events the map holds (Map361 holds 600, one on every tile).
 *
 * The group keeps its layout and stops at the map's edge each way on its own, sliding along a wall rather than going
 * over it. A tile held by an event outside the group blocks the drop, and one the group leaves never does. The drop
 * itself goes through {@link moveEvents}, which checks the map again as it stands then.
 */
class EventDragPreview
{
  readonly eventIds: readonly number[];

  #cells: readonly EventCell[];

  #looks: readonly { image: RmmzEventImage; priorityType: number }[];

  #bounds: CellRect | null;

  #held: ReadonlySet<number>;

  #size: { width: number; height: number };

  /**
   * @param {EventMap} map The map, as it stands when the drag starts.
   * @param {readonly number[]} eventIds The dragged events; ids the map does not hold are passed over.
   */
  constructor(map: EventMap, eventIds: readonly number[])
  {
    this.#cells = eventCellsOf(map, eventIds);
    this.eventIds = this.#cells.map(cell => cell.id);
    this.#bounds = boundsOf(this.#cells);
    this.#size = { width: map.width, height: map.height };

    // each ghost looks as its event does on the map: its first page's picture and priority.
    this.#looks = this.#cells.map(({ id }) =>
    {
      const page = map.event(id)?.pages[0];
      return page === undefined
        ? { image: NO_IMAGE, priorityType: 0 }
        : { image: page.image, priorityType: page.priorityType };
    });

    // the tiles every event staying put holds, keyed by their place in the map.
    const dragged = new Set(this.eventIds);
    const held = new Set<number>();
    map.eventIds().forEach(id =>
    {
      const event = map.event(id);
      if (event !== null && dragged.has(id) === false)
      {
        held.add(event.y * map.width + event.x);
      }
    });
    this.#held = held;
  }

  /**
   * Works out what the drag shows for a shift the pointer asks for.
   * @param {number} dx The shift across, in tiles, from where the drag started.
   * @param {number} dy The shift down, in tiles.
   * @returns {DragFrame} The shift kept on the map, the ghosts, the blocked tiles, and whether a drop would move.
   */
  at(dx: number, dy: number): DragFrame
  {
    const shift = this.#bounds === null
      ? { dx, dy }
      : shiftWithinMap(this.#bounds, dx, dy, this.#size);
    const ghosts: GhostEvent[] = [];
    const blocked: MapCell[] = [];
    this.#cells.forEach((cell, index) =>
    {
      const x = cell.x + shift.dx;
      const y = cell.y + shift.dy;
      ghosts.push({ x, y, ...this.#looks[index] });
      if (this.#held.has(y * this.#size.width + x))
      {
        blocked.push({ x, y });
      }
    });

    return { dx: shift.dx, dy: shift.dy, ghosts, blocked, ok: blocked.length === 0 };
  }
}

export { EventDragPreview };
export type { DragFrame };
