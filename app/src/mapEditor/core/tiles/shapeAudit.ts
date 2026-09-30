import { autotileShapeFor } from './autotileShapes.ts';
import { cellIndex, gridReader, type TileGrid } from './tileGrid.ts';
import { autotileKind, autotileShape, isAutotile } from './tileIds.ts';

/**
 * One autotile whose stored shape is not the one its neighbours call for.
 */
type ShapeMismatch = {
  /**
   * The cell's flat index in the six-layer array.
   */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly kind: number;

  /**
   * The shape the map holds.
   */
  readonly stored: number;

  /**
   * The shape the rules work out from the cell's neighbours.
   */
  readonly expected: number;
};

/**
 * What an audit of one map found.
 */
type ShapeAudit = {
  /**
   * How many autotiles were checked, across all four tile layers.
   */
  readonly checked: number;

  /**
   * Every autotile whose shape differs, in index order.
   */
  readonly mismatches: ShapeMismatch[];
};

/**
 * Recomputes the shape of every autotile on a map from its kind and its neighbours, and lists each one that differs
 * from what the map holds. On a map MZ drew and nothing has since disturbed, the list is empty; what it does list is
 * either a tile placed without autotiling (MZ suspends it while Shift is held) or a neighbour changed that way since.
 * @param {TileGrid} grid The map's tile data.
 * @param {number} mode The tileset's mode.
 * @returns {ShapeAudit} The count checked and the mismatches.
 */
const auditShapes = (grid: TileGrid, mode: number): ShapeAudit =>
{
  const reader = gridReader(grid);
  const { width, height } = grid;
  const mismatches: ShapeMismatch[] = [];
  let checked = 0;

  for (let z = 0; z < 4; z++)
  {
    for (let y = 0; y < height; y++)
    {
      for (let x = 0; x < width; x++)
      {
        const tileId = reader.tileAt(x, y, z);
        if (isAutotile(tileId) === false)
        {
          continue;
        }

        // shape the tile afresh and compare it with what the map holds.
        checked += 1;
        const kind = autotileKind(tileId);
        const stored = autotileShape(tileId);
        const expected = autotileShapeFor(reader, x, y, kind, mode);
        if (stored !== expected)
        {
          mismatches.push({ index: cellIndex(width, height, x, y, z), x, y, z, kind, stored, expected });
        }
      }
    }
  }

  return { checked, mismatches };
};

export { auditShapes };
export type { ShapeAudit, ShapeMismatch };
