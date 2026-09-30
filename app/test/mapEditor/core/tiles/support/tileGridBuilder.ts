import type { TileGrid } from '../../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { makeAutotileId } from '../../../../../src/mapEditor/core/tiles/tileIds.ts';

/**
 * A grid the tile tests can write into: the same shape the services read, with its cells open for setup.
 */
type TestGrid = TileGrid & { readonly cells: Uint16Array };

/**
 * Builds an empty map of the given size, all six layers zero.
 * @param {number} width The width in tiles.
 * @param {number} height The height in tiles.
 * @returns {TestGrid} The grid.
 */
const blankGrid = (width: number, height: number): TestGrid =>
{
  return { width, height, cells: new Uint16Array(width * height * 6) };
};

/**
 * Writes one tile into a grid.
 * @param {TestGrid} grid The grid.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} z The layer, 0 to 5.
 * @param {number} tileId The value to write.
 * @returns {TestGrid} The same grid, for chaining.
 */
const put = (grid: TestGrid, x: number, y: number, z: number, tileId: number): TestGrid =>
{
  grid.cells[(z * grid.height + y) * grid.width + x] = tileId;
  return grid;
};

/**
 * Writes one tile into every cell of a rectangle on one layer.
 * @param {TestGrid} grid The grid.
 * @param {number} x0 The left column.
 * @param {number} y0 The top row.
 * @param {number} x1 The right column, included.
 * @param {number} y1 The bottom row, included.
 * @param {number} z The layer.
 * @param {number} tileId The value to write.
 * @returns {TestGrid} The same grid, for chaining.
 */
const fill = (grid: TestGrid, x0: number, y0: number, x1: number, y1: number, z: number, tileId: number): TestGrid =>
{
  for (let y = y0; y <= y1; y++)
  {
    for (let x = x0; x <= x1; x++)
    {
      put(grid, x, y, z, tileId);
    }
  }

  return grid;
};

/**
 * Reads one cell of a grid.
 * @param {TileGrid} grid The grid.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} z The layer.
 * @returns {number} The value there.
 */
const cellOf = (grid: TileGrid, x: number, y: number, z: number): number =>
{
  return grid.cells[(z * grid.height + y) * grid.width + x];
};

/**
 * The tile id of an autotile kind in shape 0, the way a palette hands a kind to the painter.
 * @param {number} kind The autotile kind.
 * @returns {number} The tile id.
 */
const kindTile = (kind: number): number =>
{
  return makeAutotileId(kind, 0);
};

export { blankGrid, cellOf, fill, kindTile, put };
export type { TestGrid };
