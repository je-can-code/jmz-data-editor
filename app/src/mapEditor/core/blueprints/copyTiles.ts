import type { MapCell } from '../renderer/camera.ts';
import type { StampTiles } from '../stamps/stamp.ts';
import { cellsToReshape, reshapeAround, type CellPosition } from '../tiles/autotileRefresh.ts';
import { isInside, TILE_LAYER_COUNT, TileDraft, type CellChange, type TileGrid } from '../tiles/tileGrid.ts';
import { autotileKind, isAutotile } from '../tiles/tileIds.ts';

/**
 * One value of a blueprint's tiles that a change touched: where it sits inside the blueprint, on which layer (0 to 3 the
 * tile layers, 4 the shadows, 5 the regions), and what it held before the change and after it.
 */
type BlueprintCellChange = {
  readonly dx: number;
  readonly dy: number;
  readonly layer: number;
  readonly before: number;
  readonly after: number;
};

/**
 * One value of a map's cell, on one of its six layers.
 */
type LayerCell = {
  readonly x: number;
  readonly y: number;
  readonly layer: number;
};

/**
 * What a change to a blueprint's tiles comes to on one placement of it: every cell to write, the cells that followed the
 * blueprint, then each autotile around them reshaped to its new neighbours, ready to go into the map's history as one
 * patch; which cells followed and which stayed, being painted over since; and the cells around the ones that followed
 * whose autotile edges were looked at again.
 */
type CopyTiles = {
  readonly writes: readonly CellChange[];
  readonly followed: readonly LayerCell[];
  readonly stayed: readonly LayerCell[];
  readonly refreshed: readonly CellPosition[];
};

/**
 * Reports whether two values on one layer of a cell are the same tile to a copy of a blueprint. On a tile layer, two
 * autotiles are the same tile when they are of one kind, whatever shape their neighbours give each, since a copy's
 * neighbours are its own and shape its edges their own way; anything else, and every shadow and region, is the same only
 * when it is the very same value.
 * @param {number} left One value.
 * @param {number} right The other.
 * @param {number} layer The layer both sit on, 0 to 5.
 * @returns {boolean} True when they are the same tile.
 */
const sameCellTile = (left: number, right: number, layer: number): boolean =>
{
  if (layer < TILE_LAYER_COUNT && isAutotile(left) && isAutotile(right))
  {
    return autotileKind(left) === autotileKind(right);
  }

  return left === right;
};

/**
 * The tile cell rule: a tile is a choice. When a blueprint's cell changes, a copy's cell still holding what the blueprint
 * held follows it to the new value; a cell painted over since, holding a tile of the copy's own, stays. Autotiles compare
 * by kind, so a change of shape alone is no change at all, and a copy's cell of the old kind follows whatever shape it
 * drew; its new shape is its own neighbours' to give (see {@link followTiles}).
 * @param {number} before The blueprint's value before the change.
 * @param {number} after The blueprint's value after it.
 * @param {number} copy The copy's value in the same cell.
 * @param {number} layer The layer, 0 to 5.
 * @returns {number | null} The value the copy's cell takes, or null when it stays as it is.
 */
const followedTile = (before: number, after: number, copy: number, layer: number): number | null =>
{
  if (sameCellTile(before, after, layer) || sameCellTile(copy, before, layer) === false)
  {
    return null;
  }

  return after;
};

/**
 * Lists every value of a blueprint's tiles a change touched, layer by layer, row by row.
 * @param {StampTiles} before The blueprint's tiles before the change.
 * @param {StampTiles} after Its tiles after it.
 * @param {{ width: number, height: number }} size The blueprint's size, which both share.
 * @returns {BlueprintCellChange[]} The values that differ.
 * @throws {Error} When the two carry other layers, or other sizes, which no copy's cells pair with one by one.
 */
const blueprintCellChanges = (
  before: StampTiles,
  after: StampTiles,
  size: { readonly width: number; readonly height: number },
): BlueprintCellChange[] =>
{
  const { width, height } = size;
  const plane = width * height;
  const sameLayers = before.layers.length === after.layers.length && before.layers.every((layer, index) => layer === after.layers[index]);
  if (sameLayers === false || before.values.length !== plane * before.layers.length || after.values.length !== before.values.length)
  {
    throw new Error('a blueprint\'s tiles before and after a change carry the same layers at the same size');
  }

  return before.values.flatMap((value, index) =>
  {
    const now = after.values[index];
    if (now === value)
    {
      return [];
    }

    // unfold the flat index into the carried layer and the cell inside the blueprint.
    const inLayer = index % plane;
    const layer = before.layers[Math.floor(index / plane)];
    return [ { dx: inLayer % width, dy: Math.floor(inLayer / width), layer, before: value, after: now } ];
  });
};

/**
 * Works out what a change to a blueprint's tiles comes to on one placement of it, a copy's map holding the blueprint with
 * its top-left corner on a cell: each changed cell on the map follows by the tile cell rule (see {@link followedTile}) or
 * stays, a cell past the map's edge is passed over, and then every autotile a cell that followed could reshape is looked
 * at again, each changed cell and its eight neighbours and the wall runs above and below it (see cellsToReshape): a tile
 * that followed takes the shape its new neighbours call for, and any other is reshaped only when what its neighbours call
 * for changed, so a shape drawn by hand anywhere else survives. Shadows and regions follow too, and reshape nothing.
 * @param {TileGrid} grid The copy's map, as it stands.
 * @param {MapCell} at Where the blueprint's top-left corner sits on it.
 * @param {readonly BlueprintCellChange[]} changes What the change touched.
 * @param {number} mode The map's tileset mode, which the autotile shapes read.
 * @returns {CopyTiles} What to write, and what followed, stayed and was looked at again.
 */
const followTiles = (grid: TileGrid, at: MapCell, changes: readonly BlueprintCellChange[], mode: number): CopyTiles =>
{
  const draft = new TileDraft(grid);
  const followed: LayerCell[] = [];
  const stayed: LayerCell[] = [];
  changes.forEach(change =>
  {
    const x = at.x + change.dx;
    const y = at.y + change.dy;
    if (isInside(draft, x, y) === false || sameCellTile(change.before, change.after, change.layer))
    {
      return;
    }

    const value = followedTile(change.before, change.after, draft.tileAt(x, y, change.layer), change.layer);
    if (value === null)
    {
      stayed.push({ x, y, layer: change.layer });
      return;
    }

    draft.setTile(x, y, change.layer, value);
    followed.push({ x, y, layer: change.layer });
  });

  // only the four tile layers are read by autotiles.
  const reshaping: CellPosition[] = followed.filter(cell => cell.layer < TILE_LAYER_COUNT).map(cell => [ cell.x, cell.y ]);
  const refreshed = cellsToReshape(draft, reshaping);
  reshapeAround(draft, reshaping, mode);
  return { writes: draft.changes(), followed, stayed, refreshed };
};

export { blueprintCellChanges, followedTile, followTiles, sameCellTile };
export type { BlueprintCellChange, CopyTiles, LayerCell };
