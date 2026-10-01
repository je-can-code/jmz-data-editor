import { reshapeAround, type CellPosition } from './autotileRefresh.ts';
import { autotileTableSize, TilesetMode } from './autotileShapes.ts';
import { isInside, TILE_LAYERS, TileDraft, type CellChange, type TileGrid, type TileLayerIndex, type TileReader } from './tileGrid.ts';
import { autotileKind, autotileShape, isAutotile, makeAutotileId } from './tileIds.ts';
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
 * How a stroke shapes autotiles. {@code auto} is MZ's autotiling: every autotile the stroke paints takes the shape
 * its neighbours call for, and the neighbours are reshaped around it. {@code exact} is MZ's Shift held down: the
 * painted tile is written exactly as the brush holds it, shape and all, and nothing around it is reshaped.
 */
type Shaping = 'auto' | 'exact';

/**
 * Reports whether a tile above the ground layer is one automatic layering keeps out of the way: an A-sheet tile laid
 * over the ground by hand or by a "goes on top" mark. Only a decoration auto mode itself lays on layer 2 (an A2
 * decoration, a Field tileset's paired column, an ocean overlay) is replaced by the next decoration, and only while it
 * is unmarked, the way MZ replaces one decoration with another. B to E tiles are never laid over; the stack handles
 * them. A tile laid over is still replaced when it sits on the very layer a painted tile needs and nothing else is
 * free, since the owner's rule for a contested layer is that it goes to what is being painted.
 * @param {number} tileId The tile on the layer.
 * @param {number} z The layer it is on, 1 to 3.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {boolean} True when automatic layering keeps the tile, short of a contested layer.
 */
const isLaidOver =(tileId: number, z: number, layering: TilesetLayering): boolean =>
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
 * top slot is filled without pushing anything down, and the stack never pushes a tile down over an A tile laid on
 * layer 3 (see {@link isLaidOver}), replacing the top instead, so painting a tree never deletes a cliff corner; an A
 * tile on layer 4 moves down to layer 3 when pushed. With A tiles laid on both, layer 4 is contested, and it goes to
 * the B to E tile being painted.
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

  // an empty top slot is simply filled, and an A tile on layer 3 is never pushed over: the top is replaced.
  if (top === 0 || isLaidOver(below, 2, layering))
  {
    return { landing: 3, writes: [ [ 3, tileId ] ] };
  }

  return { landing: 3, writes: [ [ 2, top ], [ 3, tileId ] ] };
};

/**
 * Plans a tile marked to go on top: on the ground layer when the cell has nothing on layers 1 and 2, otherwise on
 * the lowest free layer above what is there, layer 2 and then layer 3, so it always lies over whatever it is painted
 * on. A cell that already holds the tile keeps it where it is. When nothing above is free, layer 3, the highest a
 * marked tile goes, is contested, and the marked tile takes it from whatever is there.
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

  // the lowest free layer from there, or layer 3 taken over when none is free.
  const free = ([ 0, 1, 2 ] as const).find(z => z >= lowest && reader.tileAt(x, y, z) === 0) ?? 2;
  return { landing: free, writes: [ [ free, unshapedTile(tileId) ] ] };
};

/**
 * Finds the ground auto mode fills in beneath a decoration: the ocean under deep sea and the ocean decorations, and on
 * a Field tileset the base column before a paired one.
 * @param {number} tileId The decoration.
 * @param {number} mode The tileset's mode.
 * @returns {number} The ground tile in shape 0, or 0 when the decoration needs none.
 */
const decorationCompanion = (tileId: number, mode: number): number =>
{
  if (tileRole(tileId, mode) === 'oceanOverlay')
  {
    return makeAutotileId(OCEAN_KIND, 0);
  }

  return isFieldPairedKind(autotileKind(tileId), mode)
    ? fieldBaseTile(tileId)
    : 0;
};

/**
 * Plans a decoration auto mode lays over the ground: an A2 decoration, a Field tileset's paired base column (with
 * the column before it filled in on layer 1), or deep sea and the ocean decorations (with the ocean filled in on
 * layer 1). It takes layer 2, replacing a decoration there as MZ does; over a tile laid over the ground there, it
 * lies on layer 3 instead, taking that layer from whatever holds it, since a contested layer goes to what is being
 * painted.
 *
 * Filling in the ground beneath treats a tile marked to go on top the way painting the ground does: on a cell with
 * no ground, where a marked tile sits on the ground layer, the marked tile is lifted over the decoration onto layer 3
 * rather than written over, and the ground goes in beneath both. With layer 3 taken, or the decoration itself there,
 * the marked tile has nowhere left to go and the ground being painted replaces it.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The decoration.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {PlacementPlan} The plan.
 */
const planDecoration = (reader: TileReader, x: number, y: number, tileId: number, layering: TilesetLayering): PlacementPlan =>
{
  const landing = isLaidOver(reader.tileAt(x, y, 1), 1, layering)
    ? 2
    : 1;
  const writes: LayerWrite[] = [ [ landing, unshapedTile(tileId) ] ];
  const companion = decorationCompanion(tileId, layering.mode);
  if (companion === 0)
  {
    return { landing, writes };
  }

  // the ground goes in first; a marked tile on a cell with no ground rises over the decoration when layer 3 is free.
  const onGround = reader.tileAt(x, y, 0);
  const lifts = landing === 1 && isMarkedTile(layering.marks, onGround) && reader.tileAt(x, y, 2) === 0;
  return {
    landing,
    writes: lifts
      ? [ [ 0, companion ], ...writes, [ 2, onGround ] ]
      : [ [ 0, companion ], ...writes ],
  };
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
 * Whether painting the ground also clears the decoration on layer 2 above it. This is the one place that choice
 * lives, until the owner decides it. A Field (world-map) tileset clears any decoration, as MZ does, because there
 * layer 2 holds the ground's own companions, a paired base column or deep sea, which belong to the ground being
 * replaced. An Area tileset keeps its decorations, as D5 says, so repainting the ground under tall grass keeps the
 * grass; but it clears deep sea and the ocean decorations, the A1 overlays that only make sense over water, so ocean
 * or grass painted over deep sea does not leave it on top (41 shipped maps hold 8,270 of them on layer 2).
 * @param {number} decoration The tile on layer 2, which is not laid over the ground (see {@link isLaidOver}).
 * @param {number} mode The tileset's mode.
 * @returns {boolean} True when painting the ground clears it.
 */
const groundClearsDecoration = (decoration: number, mode: number): boolean =>
{
  return mode === TilesetMode.field || tileRole(decoration, mode) === 'oceanOverlay';
};

/**
 * Plans the ground: layer 1, leaving layers 3 and 4 as they are, unlike MZ, which wipes every layer above. Layer 2
 * keeps its decoration or loses it by {@link groundClearsDecoration}; a tile laid over the ground there always stays.
 *
 * A marked tile on layer 1, which is where one lands on a cell with no ground (D5), is lifted rather than replaced: it
 * moves to the lowest free layer above, layer 2 and then layer 3, as it would have landed with the ground already
 * there, and the ground goes in beneath it. A decoration this stroke clears leaves layer 2 free for it. When layers 2
 * and 3 are both taken, layer 1 is contested, and by the owner's rule it goes to the ground being painted: the marked
 * tile is replaced.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The ground tile.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {PlacementPlan} The plan.
 */
const planGround = (reader: TileReader, x: number, y: number, tileId: number, layering: TilesetLayering): PlacementPlan =>
{
  const writes: LayerWrite[] = [ [ 0, unshapedTile(tileId) ] ];
  const decoration = reader.tileAt(x, y, 1);
  const clears = decoration !== 0 && isLaidOver(decoration, 1, layering) === false && groundClearsDecoration(decoration, layering.mode);
  if (clears)
  {
    writes.push([ 1, 0 ]);
  }

  // anything but a marked tile on the ground layer is simply replaced.
  const onGround = reader.tileAt(x, y, 0);
  if (isMarkedTile(layering.marks, onGround) === false)
  {
    return { landing: 0, writes };
  }

  // lift the marked tile to the lowest free layer above, counting a decoration cleared just now as free; with none
  // free, the ground takes its place.
  const free = ([ 1, 2 ] as const).find(z => (z === 1 && clears) || reader.tileAt(x, y, z) === 0);
  if (free !== undefined)
  {
    writes.push([ free, onGround ]);
  }

  return { landing: 0, writes };
};

/**
 * Plans where one tile lands in one cell, and what has to be written to put it there.
 *
 * Manual layering writes the chosen layer and nothing else. Automatic layering follows MZ's rules, with D5's
 * changes: B to E tiles stack on layers 3 and 4; B's empty tile clears them; a tile marked to go on top lays over
 * whatever is there instead of replacing it; everything else goes where MZ puts it, except that painting the
 * ground no longer wipes what is above it, and lifts a marked tile off the ground layer instead of replacing it.
 * Where the layer a tile needs is contested, the tile being painted always gets it, so every tile lands somewhere.
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
    return planMarkedTile(reader, x, y, tileId);
  }

  return role === 'ground'
    ? planGround(reader, x, y, tileId, layering)
    : planDecoration(reader, x, y, tileId, layering);
};

/**
 * Turns a plan into the writes that put the tile down exactly as the brush holds it, which is what Shift does in MZ:
 * the landing layer gets the very tile id, shape included, rather than the shape-0 form every other write starts
 * from, and a cell already holding the tile's kind there in another shape takes the exact one. Every other write in
 * the plan (a companion filled in beneath, a marked tile lifted, a decoration cleared) goes ahead as planned.
 * @param {PlacementPlan} plan The plan.
 * @param {number} tileId The tile as the brush holds it.
 * @returns {readonly LayerWrite[]} The writes.
 */
const exactWrites = (plan: PlacementPlan, tileId: number): readonly LayerWrite[] =>
{
  const { landing } = plan;
  if (landing === -1)
  {
    return plan.writes;
  }

  return [ ...plan.writes.filter(([ z ]) => z !== landing), [ landing, tileId ] ];
};

/**
 * Where one painted tile ended up: its cell, the layer it landed on, and the tile there once shaped. The ghost preview
 * draws these before a click, so it shows the layer each tile will land on and the shape it will take.
 */
type TileLanding = {
  readonly x: number;
  readonly y: number;
  readonly layer: TileLayerIndex;
  readonly tileId: number;
};

/**
 * What painting a stroke comes to: the cells to change, and where each painted tile landed.
 */
type PaintedStroke = {
  /**
   * The cells to change, in index order, ready for the map document's tiles patch.
   */
  readonly changes: CellChange[];

  /**
   * Where each tile landed, in stroke order; B's empty tile, which only clears, lands nowhere and is left out.
   */
  readonly landings: TileLanding[];
};

/**
 * Paints tiles as one stroke: places each in turn by {@link planPlacement}, then shapes every autotile the stroke
 * reached against the finished result, and reports where each tile landed. Placements beyond the map are skipped.
 * With exact shaping (Shift held) each tile is written exactly as given and nothing is reshaped, neither the tiles
 * painted nor their neighbours.
 * @param {TileGrid} grid The map's tile data as it stands.
 * @param {readonly TilePlacement[]} placements The tiles to paint, in stroke order.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @param {LayerChoice} choice The layer choice the stroke paints with.
 * @param {Shaping} shaping Whether autotiles are shaped as they are painted; they are unless told otherwise.
 * @returns {PaintedStroke} The cells to change and where each tile landed.
 */
const paintStroke = (
  grid: TileGrid,
  placements: readonly TilePlacement[],
  layering: TilesetLayering,
  choice: LayerChoice,
  shaping: Shaping = 'auto',
): PaintedStroke =>
{
  const draft = new TileDraft(grid);
  const touched: CellPosition[] = [];
  const landed: (readonly [ number, number, TileLayerIndex ])[] = [];
  placements.forEach(({ x, y, tileId }) =>
  {
    if (isInside(draft, x, y) === false)
    {
      return;
    }

    // each placement reads the draft, so a stroke that crosses a cell twice builds on its own first pass.
    const plan = planPlacement(draft, x, y, tileId, layering, choice);
    const writes = shaping === 'exact'
      ? exactWrites(plan, tileId)
      : plan.writes;
    writes.forEach(([ z, value ]) => draft.setTile(x, y, z, value));
    touched.push([ x, y ]);
    if (plan.landing !== -1)
    {
      landed.push([ x, y, plan.landing ]);
    }
  });

  if (shaping === 'auto')
  {
    reshapeAround(draft, touched, layering.mode);
  }

  // read each landing back once every shape is settled, so it shows the shape the tile will really take.
  return {
    changes: draft.changes(),
    landings: landed.map(([ x, y, layer ]) => ({ x, y, layer, tileId: draft.tileAt(x, y, layer) })),
  };
};

/**
 * Paints tiles as one stroke, as {@link paintStroke} does, answering only with the cells to change.
 * @param {TileGrid} grid The map's tile data as it stands.
 * @param {readonly TilePlacement[]} placements The tiles to paint, in stroke order.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @param {LayerChoice} choice The layer choice the stroke paints with.
 * @param {Shaping} shaping Whether autotiles are shaped as they are painted; they are unless told otherwise.
 * @returns {CellChange[]} The cells to change, in index order, ready for the map document's tiles patch.
 */
const paintTiles = (
  grid: TileGrid,
  placements: readonly TilePlacement[],
  layering: TilesetLayering,
  choice: LayerChoice,
  shaping: Shaping = 'auto',
): CellChange[] =>
{
  return paintStroke(grid, placements, layering, choice, shaping).changes;
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
 * Finds what an exact swap writes over one copy of the tile it replaces: the new kind in the copy's own shape when both
 * are autotiles drawn from tables of the same size, so a shape drawn by hand survives the swap, and the new tile as
 * given otherwise.
 * @param {number} copy The copy being replaced.
 * @param {number} toTile The tile replacing it.
 * @returns {number} The tile to write.
 */
const exactReplacement = (copy: number, toTile: number): number =>
{
  if (isAutotile(copy) === false || isAutotile(toTile) === false)
  {
    return toTile;
  }

  const shape = autotileShape(copy);
  return shape < autotileTableSize(autotileKind(toTile))
    ? makeAutotileId(autotileKind(toTile), shape)
    : toTile;
};

/**
 * Replaces one tile with another across the whole map, in place on whichever layer each copy sits, then reshapes
 * every autotile around the cells it changed. An autotile matches by kind, whatever its shape. Swapping a tile for
 * itself, or swapping out the empty tile (which would fill every empty layer of every cell), changes nothing. With
 * exact shaping (Shift held) nothing is reshaped: each copy keeps its own shape where the new kind has one like it.
 * @param {TileGrid} grid The map's tile data as it stands.
 * @param {number} fromTile The tile to replace.
 * @param {number} toTile The tile to put in its place; 0 removes it.
 * @param {number} mode The tileset's mode.
 * @param {readonly TileLayerIndex[]} layers The layers to swap on; every tile layer unless narrowed.
 * @param {Shaping} shaping Whether autotiles are reshaped around the swap; they are unless told otherwise.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const swapTiles = (
  grid: TileGrid,
  fromTile: number,
  toTile: number,
  mode: number,
  layers: readonly TileLayerIndex[] = TILE_LAYERS,
  shaping: Shaping = 'auto',
): CellChange[] =>
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
      matching.forEach(z => draft.setTile(x, y, z, shaping === 'exact' ? exactReplacement(draft.tileAt(x, y, z), toTile) : replacement));
      if (matching.length > 0)
      {
        touched.push([ x, y ]);
      }
    }
  }

  if (shaping === 'auto')
  {
    reshapeAround(draft, touched, mode);
  }

  return draft.changes();
};

export { paintStroke, paintTiles, planPlacement, strokeLayerChoice, swapTiles };
export type { LayerChoice, LayerWrite, PaintedStroke, PlacementPlan, Shaping, TileLanding, TilePlacement, TilesetLayering };
