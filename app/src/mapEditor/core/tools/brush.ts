import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import { TileId } from '../tiles/tileIds.ts';

/**
 * What a brush paints: tiles on the four tile layers, region ids on the region layer, or shadows on the shadow layer.
 */
type BrushKind = 'tiles' | 'regions' | 'shadows';

/**
 * What the tools paint with: a rectangle of values and what they are, handed over by the palette when tiles are picked
 * there, or by the eyedropper when they are picked off the map.
 *
 * A tiles brush holds tile ids exactly as they were picked, an autotile in whatever shape it was picked in: painting
 * shapes it to fit unless Shift is held, when the very tile goes down. A regions brush holds region ids, 0 to 255. A
 * shadows brush holds no values, since the shadow pen marks whichever quarter of a tile the pointer is over.
 */
type Brush = {
  readonly kind: BrushKind;

  /**
   * How many cells across.
   */
  readonly width: number;

  /**
   * How many cells down.
   */
  readonly height: number;

  /**
   * One value per cell, row by row from the top-left: {@code width * height} of them, and none for shadows.
   */
  readonly cells: readonly number[];
};

/**
 * The highest region id the engine reads.
 */
const MAX_REGION_ID = 255;

/**
 * The brush the shadow pen paints with.
 */
const SHADOW_BRUSH: Brush = { kind: 'shadows', width: 1, height: 1, cells: [] };

/**
 * Builds a tiles brush from a rectangle of tile ids.
 * @param {readonly number[]} tileIds The tiles, row by row from the top-left.
 * @param {number} width How many across.
 * @param {number} height How many down.
 * @returns {Brush} The brush.
 */
const tileBrush = (tileIds: readonly number[], width: number, height: number): Brush =>
{
  if (Number.isInteger(width) === false || Number.isInteger(height) === false || width < 1 || height < 1)
  {
    throw new Error(`a brush is a whole number of cells across and down, not ${width}x${height}`);
  }

  if (tileIds.length !== width * height)
  {
    throw new Error(`a ${width}x${height} brush holds ${width * height} tiles, not ${tileIds.length}`);
  }

  const bad = tileIds.find(tileId => Number.isInteger(tileId) === false || tileId < 0 || tileId >= TileId.MAX);
  if (bad !== undefined)
  {
    throw new Error(`${bad} is not a tile id`);
  }

  return { kind: 'tiles', width, height, cells: [ ...tileIds ] };
};

/**
 * Builds a brush of one tile.
 * @param {number} tileId The tile.
 * @returns {Brush} The brush.
 */
const singleTileBrush = (tileId: number): Brush =>
{
  return tileBrush([ tileId ], 1, 1);
};

/**
 * Builds a brush that paints one region id; 0 clears the region.
 * @param {number} regionId The region.
 * @returns {Brush} The brush.
 */
const regionBrush = (regionId: number): Brush =>
{
  if (Number.isInteger(regionId) === false || regionId < 0 || regionId > MAX_REGION_ID)
  {
    throw new Error(`a region is a whole number from 0 to ${MAX_REGION_ID}, not ${regionId}`);
  }

  return { kind: 'regions', width: 1, height: 1, cells: [ regionId ] };
};

/**
 * Reads a whole-number remainder that never goes negative, so a pattern repeats the same way left of its start as
 * right of it.
 * @param {number} value The number.
 * @param {number} size The period.
 * @returns {number} The remainder, 0 up to size.
 */
const wrapIndex = (value: number, size: number): number =>
{
  return ((value % size) + size) % size;
};

/**
 * Reads the value a brush paints on a cell. A brush bigger than one cell repeats its pattern from where the tool
 * started, as MZ does, so dragging it lays one seamless pattern rather than overlapping stamps.
 * @param {Brush} brush The brush.
 * @param {number} x The cell's column.
 * @param {number} y The cell's row.
 * @param {MapCell} origin Where the pattern starts: the cell its top-left corner lands on.
 * @returns {number} The tile id or region id; 0 for a shadows brush.
 */
const brushValueAt = (brush: Brush, x: number, y: number, origin: MapCell): number =>
{
  if (brush.cells.length === 0)
  {
    return 0;
  }

  const column = wrapIndex(x - origin.x, brush.width);
  const row = wrapIndex(y - origin.y, brush.height);
  return brush.cells[row * brush.width + column];
};

/**
 * Finds the cells a brush covers with its top-left corner on a cell, as MZ lays a brush under the pointer.
 * @param {Brush} brush The brush.
 * @param {MapCell} cell The cell under the pointer.
 * @returns {CellRect} The cells it covers, which may hang past the map's edge.
 */
const brushFootprint = (brush: Brush, cell: MapCell): CellRect =>
{
  return { x: cell.x, y: cell.y, width: brush.width, height: brush.height };
};

/**
 * Says what a brush holds, in a few words, for a readout beside the tools.
 * @param {Brush | null} brush The brush, or null when nothing is picked.
 * @returns {string} The words.
 */
const describeBrush = (brush: Brush | null): string =>
{
  if (brush === null)
  {
    return 'Nothing picked';
  }

  if (brush.kind === 'shadows')
  {
    return 'Shadows';
  }

  const noun = brush.kind === 'regions' ? 'Region' : 'Tile';
  return brush.cells.length === 1
    ? `${noun} ${brush.cells[0]}`
    : `${brush.width} by ${brush.height} ${brush.kind === 'regions' ? 'regions' : 'tiles'}`;
};

export { brushFootprint, brushValueAt, describeBrush, MAX_REGION_ID, regionBrush, SHADOW_BRUSH, singleTileBrush, tileBrush };
export type { Brush, BrushKind };
