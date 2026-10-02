import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import { withReshapes } from '../tiles/autotileRefresh.ts';
import {
  paintStroke,
  swapTiles,
  type LayerChoice,
  type PaintedStroke,
  type Shaping,
  type TilePlacement,
  type TilesetLayering,
} from '../tiles/layering.ts';
import { cellIndex, gridReader, TILE_LAYERS, type CellChange, type TileGrid, type TileLayerIndex, type TileReader } from '../tiles/tileGrid.ts';
import { isMarkedTile } from '../tiles/tilesetMarks.ts';
import { isSameTile, tileRole } from '../tiles/tileRoles.ts';
import { brushValueAt, type Brush, type BrushKind } from './brush.ts';
import { clipRect } from './geometry.ts';
import { floodCells } from './floodFill.ts';

/**
 * The layer shadows live on in a map's tile data.
 */
const SHADOW_LAYER = 4;

/**
 * The layer region ids live on.
 */
const REGION_LAYER = 5;

/**
 * Every quarter of a tile shadowed: the four low bits of the shadow layer, one per quarter.
 */
const ALL_QUARTERS = 0b1111;

/**
 * B's first tile, the empty one: what a cleared layer holds, and what MZ's auto mode clears layers 3 and 4 with.
 */
const EMPTY_TILE = 0;

/**
 * Everything a tool paints with that stays fixed for a whole stroke.
 */
type PaintContext = {
  /**
   * The tileset's mode and its "goes on top" marks.
   */
  readonly layering: TilesetLayering;

  /**
   * Automatic layering, or the one layer to paint: the layer strip's choice, or the held override's layer.
   */
  readonly choice: LayerChoice;

  /**
   * Whether autotiles are shaped to fit, or written exactly as the brush holds them (Shift held).
   */
  readonly shaping: Shaping;
};

/**
 * One quarter of one tile, which is what the shadow pen marks: the tile's column and row, and the quarter, numbered as
 * the shadow layer's bits are, 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
 */
type ShadowQuarter = {
  readonly x: number;
  readonly y: number;
  readonly quarter: number;
};

/**
 * Reports whether a cell lies on a map.
 * @param {TileGrid} grid The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {boolean} True when it is on the map.
 */
const isOnMap = (grid: TileGrid, x: number, y: number): boolean =>
{
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
};

/**
 * Collects writes to one layer of some cells, leaving out cells beyond the map and cells already holding the value.
 * @param {TileGrid} grid The map.
 * @param {readonly MapCell[]} cells The cells.
 * @param {number} z The layer.
 * @param {(cell: MapCell) => number} valueOf The value each cell gets.
 * @returns {CellChange[]} The changes, in index order.
 */
const writeLayer = (grid: TileGrid, cells: readonly MapCell[], z: number, valueOf: (cell: MapCell) => number): CellChange[] =>
{
  const writes = new Map<number, number>();
  cells.forEach(cell =>
  {
    if (isOnMap(grid, cell.x, cell.y) === false)
    {
      return;
    }

    const index = cellIndex(grid.width, grid.height, cell.x, cell.y, z);
    const value = valueOf(cell);
    if (grid.cells[index] !== value)
    {
      writes.set(index, value);
    }
  });

  return [ ...writes ].sort((a, b) => a[0] - b[0]);
};

/**
 * Turns the cells a tool reached into tile placements: each cell gets the brush's tile for it, the brush's pattern
 * repeating from its origin.
 * @param {Brush} brush The tiles brush.
 * @param {readonly MapCell[]} cells The cells.
 * @param {MapCell} origin Where the brush's pattern starts.
 * @returns {TilePlacement[]} The placements.
 */
const placementsFor = (brush: Brush, cells: readonly MapCell[], origin: MapCell): TilePlacement[] =>
{
  return cells.map(({ x, y }) => ({ x, y, tileId: brushValueAt(brush, x, y, origin) }));
};

/**
 * Paints tiles through the layering engine and the autotile refresh, reporting where each landed as well as what
 * changes; the ghost preview reads the landings, a stroke the changes.
 * @param {TileGrid} grid The map as it stands.
 * @param {Brush} brush A tiles brush.
 * @param {readonly MapCell[]} cells The cells to paint.
 * @param {MapCell} origin Where the brush's pattern starts.
 * @param {PaintContext} context The layering, layer choice and shaping.
 * @returns {PaintedStroke} The changes and landings.
 */
const paintBrushTiles = (grid: TileGrid, brush: Brush, cells: readonly MapCell[], origin: MapCell, context: PaintContext): PaintedStroke =>
{
  return paintStroke(grid, placementsFor(brush, cells, origin), context.layering, context.choice, context.shaping);
};

/**
 * Plans what a brush paints on some cells: tiles go through the layering engine and the autotile refresh, so each
 * lands on the layer auto mode (or the chosen layer) gives it and takes the shape its neighbours call for; region ids
 * go on the region layer; and a shadows brush shadows every quarter of each cell, which is what the rectangle,
 * ellipse and fill do with it (the pen marks single quarters, see {@link planShadowQuarters}).
 * @param {TileGrid} grid The map as it stands.
 * @param {Brush} brush The brush.
 * @param {readonly MapCell[]} cells The cells the tool reached; any beyond the map are skipped.
 * @param {MapCell} origin Where the brush's pattern starts.
 * @param {PaintContext} context The layering, layer choice and shaping.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const planBrush = (grid: TileGrid, brush: Brush, cells: readonly MapCell[], origin: MapCell, context: PaintContext): CellChange[] =>
{
  switch (brush.kind)
  {
    case 'tiles':
      return paintBrushTiles(grid, brush, cells, origin, context).changes;
    case 'regions':
      return writeLayer(grid, cells, REGION_LAYER, cell => brushValueAt(brush, cell.x, cell.y, origin));
    case 'shadows':
      return writeLayer(grid, cells, SHADOW_LAYER, cell => grid.cells[cellIndex(grid.width, grid.height, cell.x, cell.y, SHADOW_LAYER)] | ALL_QUARTERS);
  }
};

/**
 * Plans what the eraser clears from some cells, by what the brush paints: tiles, the region id, or every shadow.
 *
 * Tiles under automatic layering go as B's empty tile takes them in MZ's auto mode, through the layering engine's own
 * rule for it: the B to E tiles on layers 3 and 4 are cleared, and the ground, the decorations on layer 2 and any A tile
 * laid up on layers 3 and 4 by hand all stay, so wiping an object off the map never takes the ground or a hand-laid
 * tile with it. Under manual layering, or with the override held, the chosen layer alone is cleared, whatever is on it,
 * with the autotiles around it reshaped unless Shift is held.
 * @param {TileGrid} grid The map as it stands.
 * @param {BrushKind} kind What the brush paints, which is what the eraser clears.
 * @param {readonly MapCell[]} cells The cells the eraser reached; any beyond the map are skipped.
 * @param {PaintContext} context The layering, layer choice and shaping.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const planErase = (grid: TileGrid, kind: BrushKind, cells: readonly MapCell[], context: PaintContext): CellChange[] =>
{
  if (kind === 'regions')
  {
    return writeLayer(grid, cells, REGION_LAYER, () => 0);
  }

  if (kind === 'shadows')
  {
    return writeLayer(grid, cells, SHADOW_LAYER, cell => grid.cells[cellIndex(grid.width, grid.height, cell.x, cell.y, SHADOW_LAYER)] & ~ALL_QUARTERS);
  }

  // automatic layering erases with B's empty tile, which the layering engine already clears layers 3 and 4 with.
  const { choice, layering, shaping } = context;
  if (choice === 'auto')
  {
    const placements = cells.map(({ x, y }) => ({ x, y, tileId: EMPTY_TILE }));
    return paintStroke(grid, placements, layering, 'auto', shaping).changes;
  }

  const writes = writeLayer(grid, cells, choice, () => EMPTY_TILE);
  return shaping === 'auto'
    ? withReshapes(grid, writes, layering.mode)
    : writes;
};

/**
 * Finds the quarter of a tile under a point of the map, for the shadow pen.
 * @param {number} worldX The point, across, in world pixels.
 * @param {number} worldY The point, down.
 * @param {number} tileSize The tile size in world pixels.
 * @returns {ShadowQuarter} The tile and the quarter.
 */
const shadowQuarterAt = (worldX: number, worldY: number, tileSize: number): ShadowQuarter =>
{
  const half = tileSize / 2;
  const column = Math.floor(worldX / half);
  const row = Math.floor(worldY / half);
  return { x: Math.floor(column / 2), y: Math.floor(row / 2), quarter: (row - Math.floor(row / 2) * 2) * 2 + (column - Math.floor(column / 2) * 2) };
};

/**
 * Reports whether a quarter of a tile is shadowed.
 * @param {TileGrid} grid The map.
 * @param {ShadowQuarter} quarter The quarter.
 * @returns {boolean} True when its shadow bit is set; false beyond the map.
 */
const hasShadow = (grid: TileGrid, quarter: ShadowQuarter): boolean =>
{
  if (isOnMap(grid, quarter.x, quarter.y) === false)
  {
    return false;
  }

  return (grid.cells[cellIndex(grid.width, grid.height, quarter.x, quarter.y, SHADOW_LAYER)] & (1 << quarter.quarter)) !== 0;
};

/**
 * Plans the shadow pen's marks: each quarter shadowed, or cleared, as the whole stroke does. MZ's shadow pen toggles
 * the quarter a stroke starts on, and the rest of the stroke does the same to every quarter it crosses, so the caller
 * decides once, from that first quarter, whether this stroke adds shadows or takes them away. Bits above the four
 * quarters are left as they are.
 * @param {TileGrid} grid The map as it stands.
 * @param {readonly ShadowQuarter[]} quarters The quarters the pen crossed; any beyond the map are skipped.
 * @param {boolean} adding True to shadow them, false to clear them.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const planShadowQuarters = (grid: TileGrid, quarters: readonly ShadowQuarter[], adding: boolean): CellChange[] =>
{
  const bitsByIndex = new Map<number, number>();
  quarters.forEach(({ x, y, quarter }) =>
  {
    if (isOnMap(grid, x, y))
    {
      const index = cellIndex(grid.width, grid.height, x, y, SHADOW_LAYER);
      bitsByIndex.set(index, (bitsByIndex.get(index) ?? 0) | (1 << quarter));
    }
  });

  const changes: CellChange[] = [];
  bitsByIndex.forEach((bits, index) =>
  {
    const before = grid.cells[index];
    const after = adding ? before | bits : before & ~bits;
    if (after !== before)
    {
      changes.push([ index, after ]);
    }
  });

  return changes.sort((a, b) => a[0] - b[0]);
};

/**
 * Builds the test for which cells a fill of tiles spreads over under automatic layering. A ground tile spreads over
 * the ground alone: cells holding the same tile on layer 1, whatever lies over it, since repainting the ground keeps
 * what is above (D5), so a fill can swap a forest floor from under its trees. Anything laid over the ground (a
 * decoration, a tile marked to go on top, a B to E tile, or B's empty tile) spreads over cells that look the same as
 * the start, the same tile on every layer, so it covers the one plain area clicked rather than running under
 * everything else.
 * @param {TileReader} reader The map.
 * @param {MapCell} start Where the fill starts.
 * @param {number} tileId The tile the fill paints at the start.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {(x: number, y: number) => boolean} The test.
 */
const autoFillTest = (reader: TileReader, start: MapCell, tileId: number, layering: TilesetLayering): (x: number, y: number) => boolean =>
{
  const isGround = tileRole(tileId, layering.mode) === 'ground' && isMarkedTile(layering.marks, tileId) === false;
  const layers = isGround
    ? [ 0 ]
    : TILE_LAYERS;
  const startTiles = layers.map(z => reader.tileAt(start.x, start.y, z));
  return (x, y) => layers.every((z, index) => isSameTile(reader.tileAt(x, y, z), startTiles[index]));
};

/**
 * Builds the test for which cells a fill spreads over: the same region id for regions, the same shadows for shadows,
 * the same tile on the chosen layer under manual layering, and {@link autoFillTest} under automatic layering. An
 * autotile counts as the same tile whatever its shape.
 * @param {TileReader} reader The map.
 * @param {Brush} brush The brush.
 * @param {MapCell} start Where the fill starts.
 * @param {PaintContext} context The layering and layer choice.
 * @returns {(x: number, y: number) => boolean} The test.
 */
const fillTest = (reader: TileReader, brush: Brush, start: MapCell, context: PaintContext): (x: number, y: number) => boolean =>
{
  if (brush.kind !== 'tiles')
  {
    const z = brush.kind === 'regions' ? REGION_LAYER : SHADOW_LAYER;
    const value = reader.tileAt(start.x, start.y, z);
    return (x, y) => reader.tileAt(x, y, z) === value;
  }

  const { choice } = context;
  if (choice !== 'auto')
  {
    const tile = reader.tileAt(start.x, start.y, choice);
    return (x, y) => isSameTile(reader.tileAt(x, y, choice), tile);
  }

  return autoFillTest(reader, start, brushValueAt(brush, start.x, start.y, start), context.layering);
};

/**
 * Finds the cells a fill from one cell spreads over (see {@link fillTest}).
 * @param {TileGrid} grid The map as it stands.
 * @param {Brush} brush The brush.
 * @param {MapCell} start The cell clicked.
 * @param {PaintContext} context The layering and layer choice.
 * @returns {MapCell[]} The cells; empty when the start is off the map.
 */
const fillCells = (grid: TileGrid, brush: Brush, start: MapCell, context: PaintContext): MapCell[] =>
{
  return floodCells(grid.width, grid.height, start, fillTest(gridReader(grid), brush, start, context));
};

/**
 * Plans a fill: the brush painted over every cell the fill spreads to, its pattern repeating from the cell clicked.
 * @param {TileGrid} grid The map as it stands.
 * @param {Brush} brush The brush.
 * @param {MapCell} start The cell clicked.
 * @param {PaintContext} context The layering, layer choice and shaping.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const planFill = (grid: TileGrid, brush: Brush, start: MapCell, context: PaintContext): CellChange[] =>
{
  return planBrush(grid, brush, fillCells(grid, brush, start, context), start, context);
};

/**
 * Finds the top-most tile of a cell among some layers, searched from the top down.
 * @param {TileReader} reader The map.
 * @param {MapCell} cell The cell.
 * @param {readonly TileLayerIndex[]} layers The layers, bottom to top.
 * @returns {number} The tile, or 0 when every one of those layers is empty.
 */
const topTileAmong = (reader: TileReader, cell: MapCell, layers: readonly TileLayerIndex[]): number =>
{
  for (let index = layers.length - 1; index >= 0; index--)
  {
    const tileId = reader.tileAt(cell.x, cell.y, layers[index]);
    if (tileId !== 0)
    {
      return tileId;
    }
  }

  return 0;
};

/**
 * Finds the tile a swap replaces when the cell under it is clicked with a tile, under automatic layering: the tile the
 * brush's tile would take the place of. A ground tile replaces the ground, a decoration the decoration on layer 2, a
 * B to E tile (or B's empty tile, which removes) the top of the stack on layers 3 and 4, and a tile marked to go on
 * top whatever lies on top of the cell.
 * @param {TileReader} reader The map.
 * @param {MapCell} cell The cell clicked.
 * @param {number} tileId The brush's tile.
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {number} The tile to replace across the map, or 0 when there is none.
 */
const autoSwapSource = (reader: TileReader, cell: MapCell, tileId: number, layering: TilesetLayering): number =>
{
  if (isMarkedTile(layering.marks, tileId))
  {
    return topTileAmong(reader, cell, TILE_LAYERS);
  }

  const role = tileRole(tileId, layering.mode);
  if (role === 'upper' || role === 'clearUpper')
  {
    return topTileAmong(reader, cell, [ 2, 3 ]);
  }

  return role === 'ground'
    ? reader.tileAt(cell.x, cell.y, 0)
    : reader.tileAt(cell.x, cell.y, 1);
};

/**
 * Plans a swap: every copy of the tile clicked, across the whole map, replaced by the brush's tile (its top-left
 * tile, for a brush of several), with the autotiles around them reshaped unless Shift is held. Under automatic
 * layering the tile clicked is the one the brush's tile would replace there (see {@link autoSwapSource}) and copies
 * are swapped on every layer; under manual layering it is the tile on the chosen layer, swapped on that layer alone.
 * A regions brush swaps one region id for another in the same way; a shadows brush has nothing to swap.
 * @param {TileGrid} grid The map as it stands.
 * @param {Brush} brush The brush.
 * @param {MapCell} cell The cell clicked.
 * @param {PaintContext} context The layering, layer choice and shaping.
 * @returns {CellChange[]} The cells to change, in index order; empty when there is nothing to swap.
 */
const planSwap = (grid: TileGrid, brush: Brush, cell: MapCell, context: PaintContext): CellChange[] =>
{
  if (isOnMap(grid, cell.x, cell.y) === false || brush.kind === 'shadows')
  {
    return [];
  }

  const reader = gridReader(grid);
  const [ replacement ] = brush.cells;
  if (brush.kind === 'regions')
  {
    const region = reader.tileAt(cell.x, cell.y, REGION_LAYER);
    const matching: MapCell[] = [];
    for (let y = 0; y < grid.height; y++)
    {
      for (let x = 0; x < grid.width; x++)
      {
        if (reader.tileAt(x, y, REGION_LAYER) === region)
        {
          matching.push({ x, y });
        }
      }
    }

    return writeLayer(grid, matching, REGION_LAYER, () => replacement);
  }

  const { choice, layering, shaping } = context;
  if (choice !== 'auto')
  {
    return swapTiles(grid, reader.tileAt(cell.x, cell.y, choice), replacement, layering.mode, [ choice ], shaping);
  }

  return swapTiles(grid, autoSwapSource(reader, cell, replacement, layering), replacement, layering.mode, TILE_LAYERS, shaping);
};

/**
 * Picks a brush off the map, as MZ's eyedropper does: every tile exactly as stored, an autotile in its very shape, so
 * painting it with Shift held lays down that same shape. Under automatic layering each cell gives the tile on top of
 * it, the one showing; under manual layering, or with the override held, the tile on the chosen layer. With a regions
 * brush in hand it picks region ids instead.
 * @param {TileGrid} grid The map.
 * @param {CellRect} rect The cells to pick from; the part beyond the map is left out.
 * @param {BrushKind} kind What the brush in hand paints: regions pick regions, anything else picks tiles.
 * @param {LayerChoice} choice The layer choice.
 * @returns {Brush | null} The brush, or null when none of the rectangle lies on the map.
 */
const pickBrush = (grid: TileGrid, rect: CellRect, kind: BrushKind, choice: LayerChoice): Brush | null =>
{
  const onMap = clipRect(rect, grid.width, grid.height);
  if (onMap === null)
  {
    return null;
  }

  const reader = gridReader(grid);
  const { x: left, y: top, width, height } = onMap;

  // each cell gives its region, the tile on top of it, or the tile on the chosen layer.
  const valueAt = (x: number, y: number): number =>
  {
    if (kind === 'regions')
    {
      return reader.tileAt(x, y, REGION_LAYER);
    }

    return choice === 'auto'
      ? topTileAmong(reader, { x, y }, TILE_LAYERS)
      : reader.tileAt(x, y, choice);
  };

  const cells: number[] = [];
  for (let y = top; y < top + height; y++)
  {
    for (let x = left; x < left + width; x++)
    {
      cells.push(valueAt(x, y));
    }
  }

  return { kind: kind === 'regions' ? 'regions' : 'tiles', width, height, cells };
};

export {
  ALL_QUARTERS,
  fillCells,
  hasShadow,
  paintBrushTiles,
  pickBrush,
  planBrush,
  planErase,
  planFill,
  planShadowQuarters,
  planSwap,
  REGION_LAYER,
  SHADOW_LAYER,
  shadowQuarterAt,
  topTileAmong,
};
export type { PaintContext, ShadowQuarter };
