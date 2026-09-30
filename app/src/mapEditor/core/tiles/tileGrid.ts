/**
 * A map's tile data as the tile services read it: its size, and its six layers flattened into one array indexed
 * {@code (z * height + y) * width + x}, four tile layers then shadows then regions. The map document satisfies it
 * as it stands, through its {@code width}, {@code height} and {@code cells}.
 */
type TileGrid = {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint16Array;
};

/**
 * One cell to change: its flat index in the six-layer array, and the value to write there. A list of these is
 * exactly what the map document's {@code tilesPatch} takes, so a caller turns a service's answer into one undoable
 * patch without translating it.
 */
type CellChange = readonly [ index: number, value: number ];

/**
 * One of the four tile layers, bottom to top: the same numbers as the map document's {@code tiles1} to
 * {@code tiles4}. The editor shows them to people as layers 1 to 4.
 */
type TileLayerIndex = 0 | 1 | 2 | 3;

/**
 * How many of a map's six layers hold tiles.
 */
const TILE_LAYER_COUNT = 4;

/**
 * The tile layers, bottom to top, for loops that visit every one.
 */
const TILE_LAYERS: readonly TileLayerIndex[] = [ 0, 1, 2, 3 ];

/**
 * What the autotile rules read from a map: its size, and the tile on any layer of any cell. Reading outside the
 * map answers 0; the rules ask {@link isInside} first wherever the edge of the map means something.
 */
type TileReader = {
  readonly width: number;
  readonly height: number;
  tileAt(x: number, y: number, z: number): number;
};

/**
 * Finds where a cell sits in the flattened six-layer array.
 * @param {number} width The map's width in tiles.
 * @param {number} height The map's height in tiles.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} z The layer, 0 to 5.
 * @returns {number} The flat index.
 */
const cellIndex = (width: number, height: number, x: number, y: number, z: number): number =>
{
  return (z * height + y) * width + x;
};

/**
 * Reports whether a position lies on the map.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {boolean} True when the position is inside the map.
 */
const isInside = (reader: TileReader, x: number, y: number): boolean =>
{
  return x >= 0 && y >= 0 && x < reader.width && y < reader.height;
};

/**
 * Reads a grid as it stands, straight from its array. The oracle and any other bulk reader use this, since it
 * allocates nothing per lookup.
 * @param {TileGrid} grid The map's tile data.
 * @returns {TileReader} A reader over the same array.
 */
const gridReader = (grid: TileGrid): TileReader =>
{
  const { width, height, cells } = grid;
  return {
    width,
    height,
    tileAt: (x: number, y: number, z: number): number =>
    {
      // outside the map there is nothing to read.
      if (x < 0 || y < 0 || x >= width || y >= height)
      {
        return 0;
      }

      return cells[(z * height + y) * width + x];
    },
  };
};

/**
 * A map's tile data with changes staged on top of it, so a stroke can place every tile first and then shape every
 * autotile against the finished result. The grid underneath is never written; {@link changes} reports what would
 * have to change to reach the draft.
 */
class TileDraft implements TileReader
{
  readonly width: number;

  readonly height: number;

  #cells: Uint16Array;

  #staged = new Map<number, number>();

  /**
   * @param {TileGrid} grid The map's tile data as it stands.
   */
  constructor(grid: TileGrid)
  {
    this.width = grid.width;
    this.height = grid.height;
    this.#cells = grid.cells;
  }

  /**
   * Reads a cell as the draft has it.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {number} z The layer, 0 to 5.
   * @returns {number} The staged value when there is one, the grid's value otherwise, and 0 outside the map.
   */
  tileAt(x: number, y: number, z: number): number
  {
    // outside the map there is nothing to read.
    if (x < 0 || y < 0 || x >= this.width || y >= this.height)
    {
      return 0;
    }

    const index = cellIndex(this.width, this.height, x, y, z);
    return this.#staged.get(index) ?? this.#cells[index];
  }

  /**
   * Stages a new value for a cell. Writing outside the map is ignored, so a brush hanging over the edge simply
   * paints the part that lands on it.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {number} z The layer, 0 to 5.
   * @param {number} value The tile id, shadow bits or region id to write.
   */
  setTile(x: number, y: number, z: number, value: number): void
  {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height)
    {
      return;
    }

    this.#staged.set(cellIndex(this.width, this.height, x, y, z), value);
  }

  /**
   * Lists the cells whose staged value differs from the grid, in index order.
   * @returns {CellChange[]} The changes; empty when the draft matches the grid.
   */
  changes(): CellChange[]
  {
    const changes: CellChange[] = [];
    this.#staged.forEach((value, index) =>
    {
      // a cell staged back to what it already held is no change at all.
      if (this.#cells[index] !== value)
      {
        changes.push([ index, value ]);
      }
    });

    return changes.sort((a, b) => a[0] - b[0]);
  }
}

export { cellIndex, gridReader, isInside, TILE_LAYER_COUNT, TILE_LAYERS, TileDraft };
export type { CellChange, TileGrid, TileLayerIndex, TileReader };
