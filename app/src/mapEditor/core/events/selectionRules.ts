import type { MapCell, MapSize } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import type { EventMap } from './eventPlacement.ts';

/**
 * How a click or a box changes what was selected: Shift adds to it, and Ctrl (Cmd on a Mac) toggles, taking out what
 * was in and adding what was not. With neither, the click or box replaces it. Holding both toggles.
 */
type SelectModifiers = {
  readonly add: boolean;
  readonly toggle: boolean;
};

/**
 * No modifier held: a click or a box replaces the selection.
 */
const REPLACE: SelectModifiers = { add: false, toggle: false };

/**
 * Reads the selection modifiers off a pointer or key event.
 * @param {{ shiftKey: boolean, ctrlKey: boolean, metaKey: boolean }} event The event.
 * @returns {SelectModifiers} The modifiers.
 */
const modifiersOf = (event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean }): SelectModifiers =>
{
  return { add: event.shiftKey, toggle: event.ctrlKey || event.metaKey };
};

/**
 * Works out the selection after a click.
 *
 * - On an event, a plain click selects that event alone, Shift adds it, and Ctrl toggles it.
 * - On empty ground, a plain click selects nothing, and a click held with Shift or Ctrl leaves the selection alone, so a
 *   slip of the hand while adding never throws away what was picked.
 * @param {readonly number[]} current What is selected now, in the order it was picked.
 * @param {number | null} eventId The event clicked, or null for empty ground.
 * @param {SelectModifiers} modifiers The modifiers held.
 * @returns {number[]} The new selection, in the order it was picked; the clicked event last when it was added.
 */
const clickSelection = (current: readonly number[], eventId: number | null, modifiers: SelectModifiers): number[] =>
{
  const kept = [ ...current ];
  if (eventId === null)
  {
    return modifiers.add || modifiers.toggle
      ? kept
      : [];
  }

  if (modifiers.toggle)
  {
    return kept.includes(eventId)
      ? kept.filter(id => id !== eventId)
      : [ ...kept, eventId ];
  }

  if (modifiers.add)
  {
    return kept.includes(eventId)
      ? kept
      : [ ...kept, eventId ];
  }

  return [ eventId ];
};

/**
 * Works out the selection after a box is dragged around some events: a plain box selects exactly what it holds, Shift
 * adds what it holds, and Ctrl toggles each event it holds.
 * @param {readonly number[]} current What was selected when the box started, in the order it was picked.
 * @param {readonly number[]} boxed The events inside the box, in id order.
 * @param {SelectModifiers} modifiers The modifiers held when the box started.
 * @returns {number[]} The new selection: what stays of the old in its order, then what the box added in id order.
 */
const boxSelection = (current: readonly number[], boxed: readonly number[], modifiers: SelectModifiers): number[] =>
{
  const inBox = new Set(boxed);
  if (modifiers.toggle)
  {
    const before = new Set(current);
    return [ ...current.filter(id => inBox.has(id) === false), ...boxed.filter(id => before.has(id) === false) ];
  }

  if (modifiers.add)
  {
    const before = new Set(current);
    return [ ...current, ...boxed.filter(id => before.has(id) === false) ];
  }

  return [ ...boxed ];
};

/**
 * Finds the cells a box covers, from the cell where it started to the cell under the pointer, both included and
 * either way round, cut down to the map. A box may start or end off the map, which is how one is drawn around a map
 * with no empty ground to start on.
 * @param {MapCell} from The cell where the box started, which may lie off the map.
 * @param {MapCell} to The cell under the pointer, which may lie off the map.
 * @param {MapSize} size The map's size.
 * @returns {CellRect | null} The cells on the map inside the box, or null when the box misses the map.
 */
const boxCells = (from: MapCell, to: MapCell, size: MapSize): CellRect | null =>
{
  const left = Math.max(0, Math.min(from.x, to.x));
  const top = Math.max(0, Math.min(from.y, to.y));
  const right = Math.min(size.width - 1, Math.max(from.x, to.x));
  const bottom = Math.min(size.height - 1, Math.max(from.y, to.y));
  if (left > right || top > bottom)
  {
    return null;
  }

  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
};

/**
 * Lists the events standing inside a rectangle of cells.
 * @param {EventMap} map The map.
 * @param {CellRect | null} rect The cells, or null for none.
 * @returns {number[]} The events inside, in id order.
 */
const eventsInCells = (map: EventMap, rect: CellRect | null): number[] =>
{
  if (rect === null)
  {
    return [];
  }

  return map.eventIds().filter(id =>
  {
    const event = map.event(id);
    return event !== null
      && event.x >= rect.x && event.x < rect.x + rect.width
      && event.y >= rect.y && event.y < rect.y + rect.height;
  });
};

export { boxCells, boxSelection, clickSelection, eventsInCells, modifiersOf, REPLACE };
export type { SelectModifiers };
