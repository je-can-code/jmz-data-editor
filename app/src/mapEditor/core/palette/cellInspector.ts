/**
 * The cell the stack view shows: the map it is on, and where.
 */
type InspectedCell = {
  readonly mapId: number;
  readonly x: number;
  readonly y: number;
};

/**
 * What the stack view shows: the cell, if any, and whether it is held there.
 */
type InspectorState = {
  /**
   * The cell, or null before the pointer has been over any map.
   */
  readonly cell: InspectedCell | null;

  /**
   * Whether the cell is held, so the pointer passing over other cells leaves it showing.
   */
  readonly held: boolean;
};

/**
 * Hears every change to the inspected cell.
 */
type InspectorListener = (state: InspectorState) => void;

/**
 * Reports whether two cells are the same cell of the same map.
 * @param {InspectedCell | null} left One cell.
 * @param {InspectedCell | null} right The other.
 * @returns {boolean} True when both are null or both name the same cell.
 */
const sameCell = (left: InspectedCell | null, right: InspectedCell | null): boolean =>
{
  if (left === null || right === null)
  {
    return left === right;
  }

  return left.mapId === right.mapId && left.x === right.x && left.y === right.y;
};

/**
 * Which cell the stack view shows. It follows the pointer over any map, and keeps the last cell when the pointer
 * leaves the maps, so the view can be read and used after. Holding a cell (a middle click on it) keeps it showing
 * while the pointer goes on over other cells, until it is let go or another cell is held.
 */
class CellInspector
{
  #state: InspectorState = { cell: null, held: false };

  #listeners = new Set<InspectorListener>();

  /**
   * Reads what the view shows.
   * @returns {InspectorState} The state; replaced, never changed, on every update.
   */
  getState = (): InspectorState =>
  {
    return this.#state;
  };

  /**
   * Follows the pointer onto a cell. While a cell is held, nothing changes.
   * @param {InspectedCell} cell The cell under the pointer.
   */
  hover(cell: InspectedCell): void
  {
    if (this.#state.held === false && sameCell(cell, this.#state.cell) === false)
    {
      this.#update({ cell, held: false });
    }
  }

  /**
   * Holds a cell, or lets it go when it is the one already held: what a middle click on a map does.
   * @param {InspectedCell} cell The cell clicked.
   */
  toggleHold(cell: InspectedCell): void
  {
    if (this.#state.held && sameCell(cell, this.#state.cell))
    {
      this.#update({ cell, held: false });
      return;
    }

    this.#update({ cell, held: true });
  }

  /**
   * Holds whatever cell the view shows, or lets it go.
   * @param {boolean} held Whether to hold it.
   */
  setHeld(held: boolean): void
  {
    const wanted = held && this.#state.cell !== null;
    if (wanted !== this.#state.held)
    {
      this.#update({ ...this.#state, held: wanted });
    }
  }

  /**
   * Forgets the cell when its map goes away, so the view never reads a map the window has let go of.
   * @param {number} mapId The map.
   */
  forgetMap(mapId: number): void
  {
    if (this.#state.cell?.mapId === mapId)
    {
      this.#update({ cell: null, held: false });
    }
  }

  /**
   * Listens for changes.
   * @param {InspectorListener} listener Called with the new state after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: InspectorListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Replaces the state and tells every listener.
   * @param {InspectorState} state The new state.
   */
  #update(state: InspectorState): void
  {
    this.#state = state;
    [ ...this.#listeners ].forEach(listener => listener(state));
  }
}

/**
 * The window's inspector, shared by every map view in the window, torn-out ones included, and the stack view.
 */
const cellInspector = new CellInspector();

export { CellInspector, cellInspector, sameCell };
export type { InspectedCell, InspectorListener, InspectorState };
