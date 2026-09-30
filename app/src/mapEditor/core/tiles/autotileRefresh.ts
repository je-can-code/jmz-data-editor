import { autotileShapeFor } from './autotileShapes.ts';
import { isInside, TileDraft, type CellChange, type TileGrid, type TileReader } from './tileGrid.ts';
import { autotileKind, isAutotile, isWallSideKind, makeAutotileId } from './tileIds.ts';

/**
 * A cell by its column and row.
 */
type CellPosition = readonly [ x: number, y: number ];

/**
 * Reports whether any tile layer of a cell holds a wall face.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {boolean} True when some layer holds an A3 building wall or A4 wall side.
 */
const holdsWallFace = (reader: TileReader, x: number, y: number): boolean =>
{
  for (let z = 0; z < 4; z++)
  {
    const tileId = reader.tileAt(x, y, z);
    if (isAutotile(tileId) && isWallSideKind(autotileKind(tileId)))
    {
      return true;
    }
  }

  return false;
};

/**
 * Lists every cell whose autotiles a change to the given cells could reshape. That is each changed cell and its
 * eight neighbours, since every shape reads its neighbours; and, because a wall face's sides depend on where its
 * column's wall starts, every wall face hanging below a changed cell, with the cells either side of it.
 * @param {TileReader} reader The map, after the change.
 * @param {Iterable<CellPosition>} changed The cells whose tiles changed.
 * @returns {CellPosition[]} The cells to reshape, each once, inside the map.
 */
const cellsToReshape = (reader: TileReader, changed: Iterable<CellPosition>): CellPosition[] =>
{
  const seen = new Set<number>();
  const cells: CellPosition[] = [];
  const add = (x: number, y: number): void =>
  {
    const key = y * reader.width + x;
    if (isInside(reader, x, y) && seen.has(key) === false)
    {
      seen.add(key);
      cells.push([ x, y ]);
    }
  };

  for (const [ x, y ] of changed)
  {
    // every neighbour reads this cell.
    for (let dy = -1; dy <= 1; dy++)
    {
      for (let dx = -1; dx <= 1; dx++)
      {
        add(x + dx, y + dy);
      }
    }

    // the wall faces below may now start somewhere else, which moves their side edges and their neighbours'.
    for (let row = y + 1; row < reader.height && holdsWallFace(reader, x, row); row++)
    {
      add(x - 1, row);
      add(x, row);
      add(x + 1, row);
    }
  }

  return cells;
};

/**
 * Reshapes, in a draft, every autotile that the given changed cells affected. A tile the stroke placed takes the
 * shape its neighbours call for. Any other tile is reshaped only when the stroke changed what its neighbours call
 * for: it is shaped against the map as it stood and against the draft, and left alone when the two agree, so a
 * shape somebody drew by hand (with Shift held, in MZ) survives every stroke that does not touch its neighbours.
 * @param {TileDraft} draft The map with the new tiles already staged.
 * @param {Iterable<CellPosition>} changed The cells whose tiles changed.
 * @param {number} mode The tileset's mode.
 */
const reshapeAround = (draft: TileDraft, changed: Iterable<CellPosition>, mode: number): void =>
{
  cellsToReshape(draft, changed).forEach(([ x, y ]) =>
  {
    for (let z = 0; z < 4; z++)
    {
      const tileId = draft.tileAt(x, y, z);
      if (isAutotile(tileId) === false)
      {
        continue;
      }

      // shapes read only their neighbours' kinds, never their shapes, so the order cells are reshaped in is free.
      const kind = autotileKind(tileId);
      const after = autotileShapeFor(draft, x, y, kind, mode);
      const placed = draft.hasChanged(x, y, z);
      if (placed === false && autotileShapeFor(draft.base, x, y, kind, mode) === after)
      {
        continue;
      }

      const shaped = makeAutotileId(kind, after);
      if (shaped !== tileId)
      {
        draft.setTile(x, y, z, shaped);
      }
    }
  });
};

/**
 * Completes a set of cell writes with the autotile reshaping they cause, so a caller that places tiles its own way
 * (erasing, pasting a stamp) still leaves every edge and corner right. Writes to the shadow and region layers are
 * passed through without reshaping anything, since no autotile reads them.
 * @param {TileGrid} grid The map's tile data as it stands.
 * @param {readonly CellChange[]} writes The cells to write, as flat index and value.
 * @param {number} mode The tileset's mode.
 * @returns {CellChange[]} Those writes and every reshape they cause, in index order, leaving out cells that end up
 * unchanged.
 */
const withReshapes = (grid: TileGrid, writes: readonly CellChange[], mode: number): CellChange[] =>
{
  const draft = new TileDraft(grid);
  const plane = grid.width * grid.height;
  const changed: CellPosition[] = [];
  writes.forEach(([ index, value ]) =>
  {
    // unfold the flat index into its cell, and stage the write.
    const z = Math.floor(index / plane);
    const y = Math.floor((index % plane) / grid.width);
    const x = index % grid.width;
    draft.setTile(x, y, z, value);

    // only the four tile layers are read by autotiles.
    if (z < 4)
    {
      changed.push([ x, y ]);
    }
  });

  reshapeAround(draft, changed, mode);
  return draft.changes();
};

export { cellsToReshape, reshapeAround, withReshapes };
export type { CellPosition };
