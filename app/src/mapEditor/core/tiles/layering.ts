import { reshapeAround, type CellPosition } from './autotileRefresh.ts';
import { isInside, TILE_LAYERS, TileDraft, type CellChange, type TileGrid, type TileLayerIndex, type TileReader } from './tileGrid.ts';
import { autotileKind, makeAutotileId } from './tileIds.ts';
import { isMarkedTile, type TilesetMarks } from './tilesetMarks.ts';
import { fieldBaseTile, isASheetTile, isFieldPairedKind, isSameTile, OCEAN_KIND, tileRole, unshapedTile } from './tileRoles.ts';

/**
 * Where a stroke lays its tiles: {@code 'auto'} for automatic layering, or one tile layer (0 to 3, shown to people
 * as layers 1 to 4) for manual layering, which paints exactly that layer and nothing else.
 */
type LayerChoice = 'auto' | TileLayerIndex;

/**
 * What automatic layering needs to know about the map's tileset.
 */
type TilesetLayering = {
  /**
   * The tileset's mode, from {@code Tilesets.json}.
   */
  readonly mode: number;

  /**
   * The tiles marked to go on top.
   */
  readonly marks: TilesetMarks;
};

/**
 * One tile to paint at one cell. An autotile may be given in any shape; its neighbours decide the shape it gets.
 */
type TilePlacement = {
  readonly x: number;
  readonly y: number;
  readonly tileId: number;
};

/**
 * One layer of one cell to write.
 */
type LayerWrite = readonly [ z: TileLayerIndex, tileId: number ];

/**
 * Where one tile lands in one cell, and what that takes.
 */
type PlacementPlan = {
  /**
   * The layer the painted tile ends up on, or -1 when it lands nowhere (B's empty tile only clears).
   */
  readonly landing: TileLayerIndex | -1;

  /**
   * The layers to write, before any autotile is shaped. Empty when the cell already holds the tile where it goes.
   */
  readonly writes: readonly LayerWrite[];
};

/**
 * Plans a B to E tile: a two-slot stack on layers 3 and 4, newest on top, as MZ does it. Painting the tile already
 * on top changes nothing, and a third tile drops the oldest. Two choices this editor makes where MZ says nothing: a
 * free top slot is filled without pushing anything down, and the stack never pushes a B to E tile down over an
 * A-sheet tile on layer 3 (one layered there by hand or by a "goes on top" mark); the new tile replaces the top
 * instead, so painting a tree never deletes a cliff corner.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The B to E tile.
 * @returns {PlacementPlan} The plan.
 */
const planUpperTile = (reader: TileReader, x: number, y: number, tileId: number): PlacementPlan =>
{
  const top = reader.tileAt(x, y, 3);
  const below = reader.tileAt(x, y, 2);
  if (top === tileId)
  {
    return { landing: 3, writes: [] };
  }

  if (top === 0 || isASheetTile(below))
  {
    return { landing: 3, writes: [ [ 3, tileId ] ] };
  }

  return { landing: 3, writes: [ [ 2, top ], [ 3, tileId ] ] };
};

/**
 * Plans a tile marked to go on top: on the ground layer when the cell has no ground, otherwise on the lowest free
 * layer above it, layer 2 and then layer 3. A cell that already holds the tile keeps it where it is. When layers 2
 * and 3 are both taken the tile replaces layer 3, the highest a marked tile goes, so what it covers stays beneath
 * it and the B to E tile on layer 4, if any, stays above.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The marked tile.
 * @returns {PlacementPlan} The plan.
 */
const planMarkedTile = (reader: TileReader, x: number, y: number, tileId: number): PlacementPlan =>
{
  const already = TILE_LAYERS.find(z => isSameTile(reader.tileAt(x, y, z), tileId));
  if (already !== undefined)
  {
    return { landing: already, writes: [] };
  }

  const free = ([ 0, 1, 2 ] as const).find(z => reader.tileAt(x, y, z) === 0) ?? 2;
  return { landing: free, writes: [ [ free, unshapedTile(tileId) ] ] };
};

/**
 * Plans an A-sheet tile that is not marked, by the layer MZ's auto mode gives it. The ground goes on layer 1 and,
 * unlike MZ, which wipes every layer above, leaves layers 2 to 4 as they are, so repainting the ground under an
 * overlay or a tree keeps them. The A2 decorations go on layer 2 over whatever ground is there; on a Field tileset
 * a paired base column lays the column before it on layer 1 as well. Deep sea and the ocean decorations go on
 * layer 2 with the ocean filled in on layer 1.
 * @param {number} tileId The tile.
 * @param {number} mode The tileset's mode.
 * @returns {PlacementPlan} The plan.
 */
const planGroundOrOverlay = (tileId: number, mode: number): PlacementPlan =>
{
  const tile = unshapedTile(tileId);
  switch (tileRole(tileId, mode))
  {
    case 'oceanOverlay':
      return { landing: 1, writes: [ [ 0, makeAutotileId(OCEAN_KIND, 0) ], [ 1, tile ] ] };
    case 'overlay':
      return isFieldPairedKind(autotileKind(tileId), mode)
        ? { landing: 1, writes: [ [ 0, fieldBaseTile(tileId) ], [ 1, tile ] ] }
        : { landing: 1, writes: [ [ 1, tile ] ] };
    default:
      return { landing: 0, writes: [ [ 0, tile ] ] };
  }
};

/**
 * Plans where one tile lands in one cell, and what has to be written to put it there.
 *
 * Manual layering writes the chosen layer and nothing else. Automatic layering follows MZ's rules, with D5's
 * changes: B to E tiles stack on layers 3 and 4; B's empty tile clears them; a tile marked to go on top lays over
 * whatever is there instead of replacing it; everything else goes where MZ puts it, except that painting the
 * ground no longer wipes what is above it.
 * @param {TileReader} reader The map as it stands, earlier tiles of the same stroke included.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The tile to paint.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @param {LayerChoice} choice The layer choice the stroke paints with.
 * @returns {PlacementPlan} The plan.
 */
const planPlacement = (reader: TileReader, x: number, y: number, tileId: number, layering: TilesetLayering, choice: LayerChoice): PlacementPlan =>
{
  if (choice !== 'auto')
  {
    return { landing: choice, writes: [ [ choice, unshapedTile(tileId) ] ] };
  }

  const role = tileRole(tileId, layering.mode);
  if (role === 'clearUpper')
  {
    return { landing: -1, writes: [ [ 2, 0 ], [ 3, 0 ] ] };
  }

  if (role === 'upper')
  {
    return planUpperTile(reader, x, y, tileId);
  }

  return isMarkedTile(layering.marks, tileId)
    ? planMarkedTile(reader, x, y, tileId)
    : planGroundOrOverlay(tileId, layering.mode);
};

/**
 * Paints tiles as one stroke: places each in turn by {@link planPlacement}, then shapes every autotile the stroke
 * reached against the finished result. Placements beyond the map are skipped.
 * @param {TileGrid} grid The map's tile data as it stands.
 * @param {readonly TilePlacement[]} placements The tiles to paint, in stroke order.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @param {LayerChoice} choice The layer choice the stroke paints with.
 * @returns {CellChange[]} The cells to change, in index order, ready for the map document's tiles patch.
 */
const paintTiles = (grid: TileGrid, placements: readonly TilePlacement[], layering: TilesetLayering, choice: LayerChoice): CellChange[] =>
{
  const draft = new TileDraft(grid);
  const touched: CellPosition[] = [];
  placements.forEach(({ x, y, tileId }) =>
  {
    if (isInside(draft, x, y) === false)
    {
      return;
    }

    // each placement reads the draft, so a stroke that crosses a cell twice builds on its own first pass.
    planPlacement(draft, x, y, tileId, layering, choice).writes.forEach(([ z, value ]) => draft.setTile(x, y, z, value));
    touched.push([ x, y ]);
  });

  reshapeAround(draft, touched, layering.mode);
  return draft.changes();
};

/**
 * Picks the layer choice one stroke paints with: while the override key is held, the layer it was set to, for
 * that stroke only; otherwise the layer strip's choice. Releasing the key needs nothing undone, because the strip
 * never changed.
 * @param {LayerChoice} strip The layer strip's choice.
 * @param {TileLayerIndex | 'none'} override The layer the held override key paints, or 'none' when it is not held.
 * @returns {LayerChoice} The choice for the stroke.
 */
const strokeLayerChoice = (strip: LayerChoice, override: TileLayerIndex | 'none'): LayerChoice =>
{
  return override === 'none'
    ? strip
    : override;
};

/**
 * Replaces one tile with another across the whole map, in place on whichever layer each copy sits, then reshapes
 * every autotile around the cells it changed. An autotile matches by kind, whatever its shape. Swapping a tile for
 * itself, or swapping out the empty tile (which would fill every empty layer of every cell), changes nothing.
 * @param {TileGrid} grid The map's tile data as it stands.
 * @param {number} fromTile The tile to replace.
 * @param {number} toTile The tile to put in its place; 0 removes it.
 * @param {number} mode The tileset's mode.
 * @param {readonly TileLayerIndex[]} layers The layers to swap on; every tile layer unless narrowed.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const swapTiles = (grid: TileGrid, fromTile: number, toTile: number, mode: number, layers: readonly TileLayerIndex[] = TILE_LAYERS): CellChange[] =>
{
  if (fromTile === 0 || isSameTile(fromTile, toTile))
  {
    return [];
  }

  const draft = new TileDraft(grid);
  const replacement = unshapedTile(toTile);
  const touched: CellPosition[] = [];
  for (let y = 0; y < grid.height; y++)
  {
    for (let x = 0; x < grid.width; x++)
    {
      // swap every matching layer of the cell, and remember the cell once if any changed.
      const matching = layers.filter(z => isSameTile(draft.tileAt(x, y, z), fromTile));
      matching.forEach(z => draft.setTile(x, y, z, replacement));
      if (matching.length > 0)
      {
        touched.push([ x, y ]);
      }
    }
  }

  reshapeAround(draft, touched, mode);
  return draft.changes();
};

export { paintTiles, planPlacement, strokeLayerChoice, swapTiles };
export type { LayerChoice, LayerWrite, PlacementPlan, TilePlacement, TilesetLayering };
