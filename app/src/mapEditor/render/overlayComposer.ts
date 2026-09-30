import { NO_OVERLAY_STATE, type CellRect, type GhostTile, type OverlayState, type WorldRect } from '../core/renderer/MapRenderer.ts';

/**
 * Where a composed overlay goes: the renderer.
 */
type OverlaySink = {
  setOverlayState(state: OverlayState): void;
};

/**
 * Compares two rectangles by value.
 * @param {CellRect | WorldRect | null} a One rectangle.
 * @param {CellRect | WorldRect | null} b The other.
 * @returns {boolean} True when both are missing, or both cover the same place.
 */
const sameRect = (a: CellRect | WorldRect | null, b: CellRect | WorldRect | null): boolean =>
{
  if (a === null || b === null)
  {
    return a === b;
  }

  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
};

/**
 * Compares two lists of ghost tiles by value.
 * @param {readonly GhostTile[]} a One list.
 * @param {readonly GhostTile[]} b The other.
 * @returns {boolean} True when they show the same tiles in the same places.
 */
const sameGhosts = (a: readonly GhostTile[], b: readonly GhostTile[]): boolean =>
{
  if (a === b)
  {
    return true;
  }

  return a.length === b.length && a.every((ghost, index) =>
  {
    const other = b[index];
    return ghost.x === other.x && ghost.y === other.y && ghost.layer === other.layer && ghost.tileId === other.tileId;
  });
};

/**
 * Compares two overlay states field by field, by value, so the renderer is only told of a real change.
 * @param {OverlayState} a One state.
 * @param {OverlayState} b The other.
 * @returns {boolean} True when they show the same.
 */
const sameOverlay = (a: OverlayState, b: OverlayState): boolean =>
{
  return sameRect(a.hover, b.hover)
    && (a.hoverLabel ?? null) === (b.hoverLabel ?? null)
    && sameRect(a.selectedCells, b.selectedCells)
    && sameRect(a.selectionBox, b.selectionBox)
    && sameGhosts(a.ghostTiles, b.ghostTiles)
    && (a.selectedEvents === b.selectedEvents || (a.selectedEvents.length === b.selectedEvents.length && a.selectedEvents.every((id, index) => id === b.selectedEvents[index])))
    && a.ghostEvents === b.ghostEvents;
};

/**
 * Puts together the overlay a map view shows from the parts different owners hand it: the picked event's selection,
 * the painting tools' cursor, ghosts and selected area, and whatever comes later. Each owner updates its own fields,
 * and the renderer hears only when the whole actually changes, so a pointer moving inside one cell redraws nothing.
 */
class OverlayComposer
{
  #sink: OverlaySink;

  #state: OverlayState = NO_OVERLAY_STATE;

  #told = false;

  /**
   * @param {OverlaySink} sink The renderer.
   */
  constructor(sink: OverlaySink)
  {
    this.#sink = sink;
  }

  /**
   * The overlay as it stands.
   * @returns {OverlayState} The state.
   */
  get state(): OverlayState
  {
    return this.#state;
  }

  /**
   * Changes some fields and tells the renderer when that changes what shows. The first update is always told, so the
   * renderer's state is known to match from then on.
   * @param {Partial<OverlayState>} part The fields to change.
   */
  update(part: Partial<OverlayState>): void
  {
    const next = { ...this.#state, ...part };
    if (this.#told && sameOverlay(this.#state, next))
    {
      return;
    }

    this.#told = true;
    this.#state = next;
    this.#sink.setOverlayState(next);
  }
}

export { OverlayComposer, sameOverlay };
export type { OverlaySink };
