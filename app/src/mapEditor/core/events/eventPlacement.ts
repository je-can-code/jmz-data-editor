import type { MapDocument } from '../model/MapDocument.ts';
import type { MapCell, MapSize } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';

/**
 * What the event services read from a map: its size and its events. A {@link MapDocument} is one, and so is anything
 * a test builds with the same four members.
 */
type EventMap = Pick<MapDocument, 'width' | 'height' | 'eventIds' | 'event'>;

/**
 * One event's place on its map.
 */
type EventCell = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
};

/**
 * Finds where some events stand, skipping any id the map does not hold.
 * @param {EventMap} map The map.
 * @param {readonly number[]} eventIds The events, in any order.
 * @returns {EventCell[]} The events it holds and their cells, in the order asked.
 */
const eventCellsOf = (map: EventMap, eventIds: readonly number[]): EventCell[] =>
{
  const cells: EventCell[] = [];
  [ ...new Set(eventIds) ].forEach(id =>
  {
    const event = map.event(id);
    if (event !== null)
    {
      cells.push({ id, x: event.x, y: event.y });
    }
  });

  return cells;
};

/**
 * Finds the smallest rectangle of cells holding every cell given.
 * @param {readonly MapCell[]} cells The cells.
 * @returns {CellRect | null} The rectangle, or null for no cells.
 */
const boundsOf = (cells: readonly MapCell[]): CellRect | null =>
{
  if (cells.length === 0)
  {
    return null;
  }

  const xs = cells.map(cell => cell.x);
  const ys = cells.map(cell => cell.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left + 1, height: Math.max(...ys) - top + 1 };
};

/**
 * Reports whether a cell lies on a map.
 * @param {MapCell} cell The cell.
 * @param {MapSize} size The map's size.
 * @returns {boolean} True on the map.
 */
const isOnMap = (cell: MapCell, size: MapSize): boolean =>
{
  return cell.x >= 0 && cell.y >= 0 && cell.x < size.width && cell.y < size.height;
};

/**
 * Shortens a shift of a group of cells so the whole group stays on the map: the group stops at the map's edge instead
 * of going over it, each way on its own, so a drag along a wall still slides along it.
 * @param {CellRect} bounds The group's bounds, on the map.
 * @param {number} dx The shift across, in cells.
 * @param {number} dy The shift down, in cells.
 * @param {MapSize} size The map's size.
 * @returns {{ dx: number, dy: number }} The shift that keeps the group on the map.
 */
const shiftWithinMap = (bounds: CellRect, dx: number, dy: number, size: MapSize): { dx: number; dy: number } =>
{
  const clamp = (shift: number, start: number, length: number, limit: number): number =>
  {
    // adding zero turns the negative zero a group at the left or top edge would get into a plain zero.
    return Math.min(limit - (start + length), Math.max(-start, shift)) + 0;
  };

  return {
    dx: clamp(dx, bounds.x, bounds.width, size.width),
    dy: clamp(dy, bounds.y, bounds.height, size.height),
  };
};

/**
 * Finds the cells some events would land on that other events already hold. An event that is itself moving, or being
 * replaced, never blocks a cell: a group shifted one cell lands partly on cells it leaves.
 * @param {EventMap} map The map.
 * @param {readonly MapCell[]} targets Where the events would land.
 * @param {ReadonlySet<number>} moving The events leaving their cells, which block nothing.
 * @returns {MapCell[]} The blocked cells, each once, in the order of the targets.
 */
const blockedCells = (map: EventMap, targets: readonly MapCell[], moving: ReadonlySet<number>): MapCell[] =>
{
  // the cells every standing event holds, keyed by their place in the map.
  const held = new Set<number>();
  map.eventIds().forEach(id =>
  {
    const event = map.event(id);
    if (event !== null && moving.has(id) === false)
    {
      held.add(event.y * map.width + event.x);
    }
  });

  const blocked = new Map<number, MapCell>();
  targets.forEach(cell =>
  {
    const key = cell.y * map.width + cell.x;
    if (held.has(key) && blocked.has(key) === false)
    {
      blocked.set(key, { x: cell.x, y: cell.y });
    }
  });

  return [ ...blocked.values() ];
};

/**
 * Finds ids for new events: the lowest empty slots first, then new slots past the end of the list. Slot 0 is never
 * used, and no id the map already holds is ever handed out.
 * @param {EventMap} map The map.
 * @param {number} count How many ids are needed.
 * @returns {number[]} The ids, lowest first.
 */
const freeEventIds = (map: EventMap, count: number): number[] =>
{
  const taken = new Set(map.eventIds());
  const ids: number[] = [];
  for (let id = 1; ids.length < count; id++)
  {
    if (taken.has(id) === false)
    {
      ids.push(id);
    }
  }

  return ids;
};

/**
 * Words how many events an action touches, for the history panel and for messages: "event" for one, "3 events" for
 * more.
 * @param {number} count How many.
 * @returns {string} The words.
 */
const eventsPhrase = (count: number): string =>
{
  return count === 1
    ? 'event'
    : `${count} events`;
};

export { blockedCells, boundsOf, eventCellsOf, eventsPhrase, freeEventIds, isOnMap, shiftWithinMap };
export type { EventCell, EventMap };
