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
 * A plan that changes nothing: the tile finds no room in the cell.
 */
const NO_ROOM: PlacementPlan = { landing: -1, writes: [] };

/**
 * Reports whether a tile above the ground layer is one automatic layering never deletes: an A-sheet tile laid over
 * the ground by hand or by a "goes on top" mark. Only a decoration auto mode itself lays on layer 2 (an A2
 * decoration, a Field tileset's paired column, an ocean overlay) may be replaced, and only while it is unmarked, the
 * way MZ replaces one decoration with another. B to E tiles are never laid over; the stack handles them.
 * @param {number} tileId The tile on the layer.
 * @param {number} z The layer it is on, 1 to 3.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {boolean} True when automatic layering must keep the tile.
 */
const isLaidOver = (tileId: number, z: number, layering: TilesetLayering): boolean =>
{
  if (isASheetTile(tileId) === false)
  {
    return false;
  }

  // auto mode never puts an A tile on layer 3 or 4, so one there was laid by hand or by a mark.
  if (z !== 1)
  {
    return true;
  }

  return isMarkedTile(layering.marks, tileId) || tileRole(tileId, layering.mode) === 'ground';
};

/**
 * Plans a B to E tile: a two-slot stack on layers 3 and 4, newest on top, as MZ does it. Painting the tile already
 * on top changes nothing, and a third tile drops the oldest. Choices this editor makes where MZ says nothing: a free
 * top slot is filled without pushing anything down, and the stack never deletes an A tile laid on layers 3 or 4
 * (see {@link isLaidOver}). It never pushes a tile down over one on layer 3, replacing the top instead, so painting a
 * tree never deletes a cliff corner; one on layer 4 moves down to layer 3 when pushed; and with A tiles on both, the
 * B to E tile finds no room.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The B to E tile.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {PlacementPlan} The plan.
 */
const planUpperTile = (reader: TileReader, x: number, y: number, tileId: number, layering: TilesetLayering): PlacementPlan =>
{
  const top = reader.tileAt(x, y, 3);
  const below = reader.tileAt(x, y, 2);
  if (top === tileId)
  {
    return { landing: 3, writes: [] };
  }

  if (top === 0)
  {
    return { landing: 3, writes: [ [ 3, tileId ] ] };
  }

  // an A tile on layer 3 is never pushed over: replace the top, unless the top is one too.
  if (isLaidOver(below, 2, layering))
  {
    return isLaidOver(top, 3, layering)
      ? NO_ROOM
      : { landing: 3, writes: [ [ 3, tileId ] ] };
  }

  return { landing: 3, writes: [ [ 2, top ], [ 3, tileId ] ] };
};

/**
 * Plans a tile marked to go on top: on the ground layer when the cell has nothing on layers 1 and 2, otherwise on
 * the lowest free layer above what is there, layer 2 and then layer 3, so it always lies over whatever it is painted
 * on. A cell that already holds the tile keeps it where it is. When nothing above is free the tile replaces a B to
 * E tile on layer 3, the highest a marked tile goes; if layer 3 holds an A tile laid there, it finds no room.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The marked tile.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {PlacementPlan} The plan.
 */
const planMarkedTile = (reader: TileReader, x: number, y: number, tileId: number, layering: TilesetLayering): PlacementPlan =>
{
  const already = TILE_LAYERS.find(z => isSameTile(reader.tileAt(x, y, z), tileId));
  if (already !== undefined)
  {
    return { landing: already, writes: [] };
  }

  // start above the highest of layers 1 and 2 that holds anything.
  let lowest = 0;
  if (reader.tileAt(x, y, 1) !== 0)
  {
    lowest = 2;
  }
  else if (reader.tileAt(x, y, 0) !== 0)
  {
    lowest = 1;
  }

  const free = ([ 0, 1, 2 ] as const).find(z => z >= lowest && reader.tileAt(x, y, z) === 0);
  if (free !== undefined)
  {
    return { landing: free, writes: [ [ free, unshapedTile(tileId) ] ] };
  }

  return isLaidOver(reader.tileAt(x, y, 2), 2, layering)
    ? NO_ROOM
    : { landing: 2, writes: [ [ 2, unshapedTile(tileId) ] ] };
};

/**
 * Plans a decoration auto mode lays over the ground: an A2 decoration, a Field tileset's paired base column (with
 * the column before it filled in on layer 1), or deep sea and the ocean decorations (with the ocean filled in on
 * layer 1). It takes layer 2, replacing a decoration there as MZ does; a tile laid over the ground there is kept
 * and the decoration lies over it on layer 3 instead, or finds no room when layer 3 is taken too.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The decoration.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {PlacementPlan} The plan.
 */
const planDecoration = (reader: TileReader, x: number, y: number, tileId: number, layering: TilesetLayering): PlacementPlan =>
{
  const tile = unshapedTile(tileId);
  const companions: LayerWrite[] = [];
  if (tileRole(tileId, layering.mode) === 'oceanOverlay')
  {
    companions.push([ 0, makeAutotileId(OCEAN_KIND, 0) ]);
  }
  else if (isFieldPairedKind(autotileKind(tileId), layering.mode))
  {
    companions.push([ 0, fieldBaseTile(tileId) ]);
  }

  if (isLaidOver(reader.tileAt(x, y, 1), 1, layering) === false)
  {
    return { landing: 1, writes: [ ...companions, [ 1, tile ] ] };
  }

  return reader.tileAt(x, y, 2) === 0
    ? { landing: 2, writes: [ ...companions, [ 2, tile ] ] }
    : NO_ROOM;
};

/**
 * Plans B's empty tile, which is how MZ clears layers 3 and 4. It clears the B to E tiles there and keeps any A tile
 * laid there, which it could otherwise delete without anyone meaning to.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {PlacementPlan} The plan.
 */
const planClearUpper = (reader: TileReader, x: number, y: number, layering: TilesetLayering): PlacementPlan =>
{
  const cleared = ([ 2, 3 ] as const).filter(z => isLaidOver(reader.tileAt(x, y, z), z, layering) === false);
  return { landing: -1, writes: cleared.map(z => [ z, 0 ] as const) };
};

/**
 * Plans the ground: layer 1, leaving what is above it as it is, so repainting the ground under an overlay or a tree
 * keeps them, unlike MZ, which wipes every layer above.
 * @param {number} tileId The ground tile.
 * @returns {PlacementPlan} The plan.
 */
const planGround = (tileId: number): PlacementPlan =>
{
  return { landing: 0, writes: [ [ 0, unshapedTile(tileId) ] ] };
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
    return planClearUpper(reader, x, y, layering);
  }

  if (role === 'upper')
  {
    return planUpperTile(reader, x, y, tileId, layering);
  }

  if (isMarkedTile(layering.marks, tileId))
  {
    return planMarkedTile(reader, x, y, tileId, layering);
  }

  return role === 'ground'
    ? planGround(tileId)
    : planDecoration(reader, x, y, tileId, layering);
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
