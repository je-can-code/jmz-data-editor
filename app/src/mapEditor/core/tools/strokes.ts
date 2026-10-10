import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { Transaction } from '../history/Transaction.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellChange } from '../tiles/tileGrid.ts';
import { cellsInRect, cellsOnLine } from './geometry.ts';
import type { ShadowQuarter } from './paintPlan.ts';

/**
 * The offset that keeps a cell's key positive for cells a little beyond the map's top-left, where a brush can hang.
 */
const KEY_OFFSET = 32_768;

/**
 * Turns a position into a number unique to it, for remembering where a stroke has been.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {number} The key.
 */
const positionKey = (x: number, y: number): number =>
{
  return (y + KEY_OFFSET) * 65_536 + (x + KEY_OFFSET);
};

/**
 * Follows a freehand tool (the pen, the eraser) as it is dragged, and answers with the cells each move newly covers.
 * The pointer's path is joined cell to cell, so a fast drag leaves no gaps; the brush's footprint, top-left corner on
 * the cell under the pointer, is laid at every step; and a cell already covered in this stroke is never covered
 * again, so every cell gets painted once, however often the stroke crosses it.
 */
class FreehandTrail
{
  #width: number;

  #height: number;

  #last: MapCell | null = null;

  #covered = new Set<number>();

  /**
   * @param {number} width The footprint's width in cells.
   * @param {number} height The footprint's height in cells.
   */
  constructor(width: number, height: number)
  {
    this.#width = width;
    this.#height = height;
  }

  /**
   * Moves the tool to a cell.
   * @param {MapCell} cell The cell under the pointer.
   * @returns {MapCell[]} The cells covered for the first time, in the order the path reached them.
   */
  moveTo(cell: MapCell): MapCell[]
  {
    const path = this.#last === null
      ? [ cell ]
      : cellsOnLine(this.#last, cell).slice(1);
    this.#last = cell;

    const fresh: MapCell[] = [];
    path.forEach(step =>
    {
      cellsInRect({ x: step.x, y: step.y, width: this.#width, height: this.#height }).forEach(covered =>
      {
        const key = positionKey(covered.x, covered.y);
        if (this.#covered.has(key) === false)
        {
          this.#covered.add(key);
          fresh.push(covered);
        }
      });
    });

    return fresh;
  }
}

/**
 * Follows the shadow pen as it is dragged, in quarters of a tile, and answers with the quarters each move newly
 * crosses: the path is joined quarter to quarter, and a quarter already crossed in this stroke is never crossed again.
 */
class QuarterTrail
{
  #last: { column: number; row: number } | null = null;

  #crossed = new Set<number>();

  /**
   * Moves the pen to a quarter.
   * @param {ShadowQuarter} quarter The quarter under the pointer.
   * @returns {ShadowQuarter[]} The quarters crossed for the first time.
   */
  moveTo(quarter: ShadowQuarter): ShadowQuarter[]
  {
    // quarters form a grid twice as fine as the tiles, which the path is walked across.
    const here = { column: quarter.x * 2 + (quarter.quarter % 2), row: quarter.y * 2 + Math.floor(quarter.quarter / 2) };
    const path = this.#last === null
      ? [ { x: here.column, y: here.row } ]
      : cellsOnLine({ x: this.#last.column, y: this.#last.row }, { x: here.column, y: here.row }).slice(1);
    this.#last = here;

    const fresh: ShadowQuarter[] = [];
    path.forEach(({ x: column, y: row }) =>
    {
      const key = positionKey(column, row);
      if (this.#crossed.has(key) === false)
      {
        this.#crossed.add(key);
        const x = Math.floor(column / 2);
        const y = Math.floor(row / 2);
        fresh.push({ x, y, quarter: (row - y * 2) * 2 + (column - x * 2) });
      }
    });

    return fresh;
  }
}

/**
 * One stroke's edit of one map: every change it makes, from the first cell to the last, lands in a single named step
 * of the map's history, so one undo takes the whole stroke back. Changes show on the map as they are made. The step
 * opens with the first change, so a stroke that changes nothing leaves nothing in the history.
 */
class PaintStroke
{
  #hub: DocumentHub;

  #map: MapDocument;

  #label: string;

  #transaction: Transaction | null = null;

  #finished = false;

  /**
   * @param {DocumentHub} hub The window's documents and histories.
   * @param {MapDocument} map The map being painted.
   * @param {string} label What the history panel calls the step.
   */
  constructor(hub: DocumentHub, map: MapDocument, label: string)
  {
    this.#hub = hub;
    this.#map = map;
    this.#label = label;
  }

  /**
   * The map being painted.
   * @returns {MapDocument} The map.
   */
  get map(): MapDocument
  {
    return this.#map;
  }

  /**
   * Whether the stroke can still paint.
   * @returns {boolean} False once committed or cancelled.
   */
  get isOpen(): boolean
  {
    return this.#finished === false;
  }

  /**
   * Makes some changes now, as part of the stroke's step.
   * @param {readonly CellChange[]} changes The cells to change; none changes nothing.
   */
  apply(changes: readonly CellChange[]): void
  {
    if (changes.length === 0 || this.#finished)
    {
      return;
    }

    this.#transaction ??= this.#hub.begin(this.#label, [ mapHistoryKey(this.#map.mapId) ]);
    this.#transaction.tiles(this.#map.key, changes);
  }

  /**
   * Ends the stroke, recording everything it changed as one step.
   * @returns {HistoryStep | null} The step, or null when the stroke changed nothing or had already ended.
   */
  commit(): HistoryStep | null
  {
    if (this.#finished)
    {
      return null;
    }

    this.#finished = true;
    return this.#transaction?.commit() ?? null;
  }

  /**
   * Ends the stroke by taking back everything it changed, leaving nothing in the history.
   */
  cancel(): void
  {
    if (this.#finished)
    {
      return;
    }

    this.#finished = true;
    this.#transaction?.cancel();
  }
}

/**
 * Makes an edit that happens all at once, the fill, a shape, a swap or a move, as one named step of the map's history.
 * @param {DocumentHub} hub The window's documents and histories.
 * @param {MapDocument} map The map.
 * @param {string} label What the history panel calls the step.
 * @param {readonly CellChange[]} changes The cells to change.
 * @param {(transaction: Transaction) => void} alongside Anything else the same step changes with the tiles, such as the
 * record of the placements a moved piece of the map carries; nothing, left out.
 * @returns {HistoryStep | null} The step, or null when nothing changes.
 */
const applyTileEdit = (
  hub: DocumentHub,
  map: MapDocument,
  label: string,
  changes: readonly CellChange[],
  alongside: (transaction: Transaction) => void = () => undefined,
): HistoryStep | null =>
{
  if (changes.length === 0)
  {
    return null;
  }

  return hub.edit(label, [ mapHistoryKey(map.mapId) ], transaction =>
  {
    transaction.tiles(map.key, changes);
    alongside(transaction);
  });
};

export { applyTileEdit, FreehandTrail, PaintStroke, positionKey, QuarterTrail };
