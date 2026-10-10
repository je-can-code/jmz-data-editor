import type { MapCell } from '../core/renderer/camera.ts';
import { NO_OVERLAY_STATE, type CellRect, type GhostEvent, type GhostTile, type OverlayState, type WorldRect } from '../core/renderer/MapRenderer.ts';

/**
 * Where a composed overlay goes: the renderer.
 */
type OverlaySink = {
  setOverlayState(state: OverlayState): void;
};

/**
 * Who hands a map view part of its overlay: the event tools, or the painting tools.
 */
type OverlayOwner = 'events' | 'tools';

/**
 * The fields each owner decides alone. The event tools show the selected events and the box being drawn around them;
 * the painting tools show the words beside the cursor, the ghost tiles a click would lay and the area the select tool
 * holds. Whatever else an owner hands over is not its to decide and is left out, so the event tools' empty ghost tiles
 * never wipe the painting tools' preview.
 *
 * Three fields both hand over (see {@link OverlayComposer}): the hover; the ghost events, which the event tools show
 * while events are dragged and the stamp while it is in hand; and the tiles those ghosts are refused on.
 */
const OWNED_FIELDS: Readonly<Record<OverlayOwner, readonly (keyof OverlayState)[]>> = {
  events: [ 'selectedEvents', 'selectionBox' ],
  tools: [ 'hoverLabel', 'ghostTiles', 'selectedCells' ],
};

/**
 * What each owner shows of the ghost events: the events themselves, and the tiles they are refused on.
 */
type GhostEventsPart = {
  readonly ghostEvents: readonly GhostEvent[];
  readonly blockedCells: readonly MapCell[];
};

/**
 * No ghost events and no blocked tiles.
 */
const NO_GHOST_EVENTS: GhostEventsPart = { ghostEvents: [], blockedCells: [] };

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
 * Compares two lists of tiles by value; a list left out counts as empty.
 * @param {readonly MapCell[] | undefined} a One list.
 * @param {readonly MapCell[] | undefined} b The other.
 * @returns {boolean} True when they name the same tiles in the same order.
 */
const sameCells = (a: readonly MapCell[] | undefined, b: readonly MapCell[] | undefined): boolean =>
{
  const left = a ?? [];
  const right = b ?? [];
  return left === right || (left.length === right.length && left.every((cell, index) => cell.x === right[index].x && cell.y === right[index].y));
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
    && a.ghostEvents === b.ghostEvents
    && sameCells(a.blockedCells, b.blockedCells);
};

/**
 * Puts together the overlay a map view shows from the parts its two owners hand it: the event tools' selection, box
 * and dragged ghosts, and the painting tools' cursor, words, ghost tiles, selected area and the stamp's ghost events.
 * Each owner decides only its own fields (see {@link OWNED_FIELDS}). Both hand over a hover and ghost events, and only
 * one of them is in hand at a time, the other handing over none, so the painting tools' hover shows when they have one
 * and the event tools' otherwise, and the same for the ghost events with the tiles they are refused on. The renderer
 * hears only when the whole actually changes, so a pointer moving inside one cell redraws nothing.
 */
class OverlayComposer
{
  #sink: OverlaySink;

  #state: OverlayState = NO_OVERLAY_STATE;

  #hovers: Record<OverlayOwner, CellRect | null> = { events: null, tools: null };

  #ghostEvents: Record<OverlayOwner, GhostEventsPart> = { events: NO_GHOST_EVENTS, tools: NO_GHOST_EVENTS };

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
   * Takes an owner's part, keeping only the fields it decides and its hover, and tells the renderer when that changes
   * what shows. The first update is always told, so the renderer's state is known to match from then on.
   * @param {OverlayOwner} owner Who hands the part over.
   * @param {Partial<OverlayState>} part Its fields; any it does not decide are left out.
   */
  update(owner: OverlayOwner, part: Partial<OverlayState>): void
  {
    const owned: Record<string, unknown> = {};
    OWNED_FIELDS[owner].forEach(field =>
    {
      if (field in part)
      {
        owned[field] = part[field];
      }
    });

    if (part.hover !== undefined)
    {
      this.#hovers = { ...this.#hovers, [owner]: part.hover };
    }

    if (part.ghostEvents !== undefined || part.blockedCells !== undefined)
    {
      const current = this.#ghostEvents[owner];
      const ghostEvents = part.ghostEvents ?? current.ghostEvents;
      const blockedCells = part.blockedCells ?? current.blockedCells;
      this.#ghostEvents = { ...this.#ghostEvents, [owner]: { ghostEvents, blockedCells } };
    }

    // the painting tools' hover and ghost events when they show any, the event tools' otherwise.
    const hover = this.#hovers.tools ?? this.#hovers.events;
    const { tools } = this.#ghostEvents;
    const shown = tools.ghostEvents.length > 0 || tools.blockedCells.length > 0 ? tools : this.#ghostEvents.events;
    const next: OverlayState = { ...this.#state, ...(owned as Partial<OverlayState>), hover, ...shown };
    if (this.#told && sameOverlay(this.#state, next))
    {
      return;
    }

    this.#told = true;
    this.#state = next;
    this.#sink.setOverlayState(next);
  }
}

export { OverlayComposer, OWNED_FIELDS, sameOverlay };
export type { OverlayOwner, OverlaySink };
