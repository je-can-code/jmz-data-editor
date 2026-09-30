import type { MapCell, ScreenPoint } from '../renderer/camera.ts';
import { clickSelection, type SelectModifiers } from './selectionRules.ts';

/**
 * How far the pointer may drift, in CSS pixels, while the left button is held and still count as a click. Beyond it,
 * a press on an event becomes a drag and a press on the ground becomes a box.
 */
const DRAG_SLOP = 4;

/**
 * Where a left-button press landed: the point in the view, the tile under it (which may lie off the map, since a box
 * can start beside it), the event there, if any, and the selection modifiers held.
 */
type GesturePress = {
  readonly point: ScreenPoint;
  readonly cell: MapCell;
  readonly eventId: number | null;
  readonly modifiers: SelectModifiers;
};

/**
 * What one step of a left-button gesture asks the map view to do.
 *
 * - {@code none}: nothing.
 * - {@code select}: make these events the selection, now.
 * - {@code drag}: show the selection being dragged, shifted by some tiles.
 * - {@code drop}: move the selection by some tiles.
 * - {@code box}: show a box from one tile to another, and what it would select: the selection when the press started
 *   ({@code before}), changed as the modifiers say by the events inside.
 * - {@code boxed}: select what that box holds, the same way.
 * - {@code cancel}: forget any drag or box on show.
 */
type GestureStep =
  | { readonly kind: 'none' }
  | { readonly kind: 'select'; readonly eventIds: readonly number[] }
  | { readonly kind: 'drag'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'drop'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'box' | 'boxed'; readonly from: MapCell; readonly to: MapCell; readonly before: readonly number[]; readonly modifiers: SelectModifiers }
  | { readonly kind: 'cancel' };

/**
 * Where a gesture stands between a press and its release.
 *
 * - {@code idle}: no press.
 * - {@code clicked}: a press that changed the selection with Shift or Ctrl, which never drags.
 * - {@code event}: a plain press on an event, which drags once the pointer moves far enough.
 * - {@code dragging}: dragging the selection.
 * - {@code ground}: a press on the ground, or beside the map, which draws a box once the pointer moves far enough.
 * - {@code boxing}: drawing a box.
 */
type GestureState = 'idle' | 'clicked' | 'event' | 'dragging' | 'ground' | 'boxing';

/**
 * Nothing to do.
 */
const NONE: GestureStep = { kind: 'none' };

/**
 * Tells the left button's gestures on a map apart, and says what each step asks for, without touching the map or the
 * selection itself.
 *
 * - A plain press on an event selects it alone, unless it was already selected, which keeps the whole selection so it
 *   can be dragged together. Released without moving, that press selects the event alone after all.
 * - Moving past the slop after a plain press on an event drags the selection; the drop moves it.
 * - A press with Shift adds the event to the selection and one with Ctrl toggles it; neither drags.
 * - A press on the ground, or beside the map, draws a box once the pointer moves; the release selects what the box
 *   holds. Released without moving, a plain press there selects nothing, and one with a modifier changes nothing.
 * - Cancelling (Esc, or the pointer lost) drops a drag or a box without moving or selecting anything.
 */
class EventGesture
{
  #state: GestureState = 'idle';

  #press: GesturePress | null = null;

  #before: readonly number[] = [];

  #shrinkOnRelease = false;

  #last: MapCell = { x: 0, y: 0 };

  /**
   * Whether a press is in progress.
   * @returns {boolean} True between a press and its release.
   */
  get isActive(): boolean
  {
    return this.#state !== 'idle';
  }

  /**
   * Whether the selection is being dragged or a box drawn.
   * @returns {boolean} True once a press has moved past the slop.
   */
  get isMoving(): boolean
  {
    return this.#state === 'dragging' || this.#state === 'boxing';
  }

  /**
   * Starts a gesture.
   * @param {GesturePress} press Where the press landed.
   * @param {readonly number[]} selected What is selected on this map now.
   * @returns {GestureStep} What the press itself changes.
   */
  press(press: GesturePress, selected: readonly number[]): GestureStep
  {
    this.#press = press;
    this.#before = [ ...selected ];
    this.#last = press.cell;
    this.#shrinkOnRelease = false;
    const { eventId, modifiers } = press;
    if (eventId === null)
    {
      this.#state = 'ground';
      return NONE;
    }

    if (modifiers.add || modifiers.toggle)
    {
      this.#state = 'clicked';
      return { kind: 'select', eventIds: clickSelection(selected, eventId, modifiers) };
    }

    this.#state = 'event';
    if (selected.includes(eventId))
    {
      this.#shrinkOnRelease = true;
      return NONE;
    }

    return { kind: 'select', eventIds: [ eventId ] };
  }

  /**
   * Follows the pointer while the button is held.
   * @param {ScreenPoint} point Where the pointer is in the view.
   * @param {MapCell} cell The tile under it, which may lie off the map.
   * @returns {GestureStep} A drag or a box when either starts or reaches another tile, nothing otherwise.
   */
  move(point: ScreenPoint, cell: MapCell): GestureStep
  {
    const press = this.#press;
    if (press === null)
    {
      return NONE;
    }

    const beyondSlop = Math.hypot(point.x - press.point.x, point.y - press.point.y) > DRAG_SLOP;
    const newTile = cell.x !== this.#last.x || cell.y !== this.#last.y;
    switch (this.#state)
    {
      case 'event':
        return beyondSlop ? this.#startMoving('dragging', cell) : NONE;
      case 'ground':
        return beyondSlop ? this.#startMoving('boxing', cell) : NONE;
      case 'dragging':
      case 'boxing':
        return newTile ? this.#stepTo(cell) : NONE;
      default:
        return NONE;
    }
  }

  /**
   * Ends a gesture.
   * @param {MapCell} cell The tile under the pointer as the button came up, which may lie off the map.
   * @returns {GestureStep} What the release asks for.
   */
  release(cell: MapCell): GestureStep
  {
    const press = this.#press;
    const state = this.#state;
    const shrink = this.#shrinkOnRelease;
    const before = this.#before;
    this.#reset();
    if (press === null)
    {
      return NONE;
    }

    switch (state)
    {
      case 'dragging':
        return { kind: 'drop', dx: cell.x - press.cell.x, dy: cell.y - press.cell.y };
      case 'boxing':
        return { kind: 'boxed', from: press.cell, to: cell, before, modifiers: press.modifiers };
      case 'event':
        return shrink && press.eventId !== null ? { kind: 'select', eventIds: [ press.eventId ] } : NONE;
      case 'ground':
        return press.modifiers.add || press.modifiers.toggle ? NONE : { kind: 'select', eventIds: [] };
      default:
        return NONE;
    }
  }

  /**
   * Abandons a gesture, as Esc or a lost pointer does.
   * @returns {GestureStep} A cancel when a drag or a box was on show, nothing otherwise.
   */
  cancel(): GestureStep
  {
    const moving = this.isMoving;
    this.#reset();
    return moving ? { kind: 'cancel' } : NONE;
  }

  /**
   * Starts a drag or a box, from the tile where the press landed to the tile under the pointer.
   * @param {'dragging' | 'boxing'} state Which one.
   * @param {MapCell} cell The tile under the pointer.
   * @returns {GestureStep} The first drag or box step.
   */
  #startMoving(state: 'dragging' | 'boxing', cell: MapCell): GestureStep
  {
    this.#state = state;
    return this.#stepTo(cell);
  }

  /**
   * Reports a drag or a box reaching a tile.
   * @param {MapCell} cell The tile under the pointer.
   * @returns {GestureStep} The step.
   */
  #stepTo(cell: MapCell): GestureStep
  {
    const press = this.#press as GesturePress;
    this.#last = cell;
    return this.#state === 'dragging'
      ? { kind: 'drag', dx: cell.x - press.cell.x, dy: cell.y - press.cell.y }
      : { kind: 'box', from: press.cell, to: cell, before: this.#before, modifiers: press.modifiers };
  }

  /**
   * Forgets the press.
   */
  #reset(): void
  {
    this.#state = 'idle';
    this.#press = null;
    this.#shrinkOnRelease = false;
  }
}

export { DRAG_SLOP, EventGesture };
export type { GesturePress, GestureStep };
