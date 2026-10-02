/**
 * How many tiles along each edge of a chunk. Chunks are how an edit redraws only what it touched; 16 keeps every
 * chunk's quad count far below the 16-bit index limit (S6: a whole map in one tilemap corrupts 1,714 cells).
 */
const CHUNK_SIZE = 16;

/**
 * A map cut into square chunks, row by row from the top-left.
 */
type ChunkGrid = {
  readonly width: number;
  readonly height: number;
  readonly chunkSize: number;
  readonly columns: number;
  readonly rows: number;
};

/**
 * The cells one chunk covers: columns {@code x0} up to but not including {@code x1}, and rows likewise.
 */
type ChunkCells = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

/**
 * The chunks an edit dirties, by what each has to redraw: the tiles, the passability overlay (which reads the four
 * tile layers) and the region overlay (which reads the region layer).
 */
type DirtyChunks = {
  readonly tiles: Set<number>;
  readonly passage: Set<number>;
  readonly regions: Set<number>;
};

/**
 * A range of chunks: columns {@code cx0} up to but not including {@code cx1}, and rows likewise. Empty when either
 * end meets the other.
 */
type ChunkRange = {
  readonly cx0: number;
  readonly cy0: number;
  readonly cx1: number;
  readonly cy1: number;
};

/**
 * A rectangle in world pixels.
 */
type WorldRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Cuts a map into chunks.
 * @param {number} width The map's width in tiles.
 * @param {number} height The map's height in tiles.
 * @param {number} chunkSize The chunk's edge in tiles.
 * @returns {ChunkGrid} The grid.
 */
const chunkGrid = (width: number, height: number, chunkSize = CHUNK_SIZE): ChunkGrid =>
{
  return {
    width,
    height,
    chunkSize,
    columns: Math.ceil(width / chunkSize),
    rows: Math.ceil(height / chunkSize),
  };
};

/**
 * Finds the chunk a cell falls in.
 * @param {ChunkGrid} grid The grid.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {number} The chunk's index.
 */
const chunkIndexOf = (grid: ChunkGrid, x: number, y: number): number =>
{
  return Math.floor(y / grid.chunkSize) * grid.columns + Math.floor(x / grid.chunkSize);
};

/**
 * Lists the cells a chunk covers; chunks on the right and bottom edges stop at the map's edge.
 * @param {ChunkGrid} grid The grid.
 * @param {number} index The chunk.
 * @returns {ChunkCells} Its cells.
 */
const chunkCells = (grid: ChunkGrid, index: number): ChunkCells =>
{
  const x0 = (index % grid.columns) * grid.chunkSize;
  const y0 = Math.floor(index / grid.columns) * grid.chunkSize;
  return {
    x0,
    y0,
    x1: Math.min(x0 + grid.chunkSize, grid.width),
    y1: Math.min(y0 + grid.chunkSize, grid.height),
  };
};

/**
 * Works out which chunks a change to some cells dirties. A cell's own chunk always redraws what reads its layer. A
 * change on layer 1 also redraws the cell beneath, because a table there draws its lower edge onto it (and on a map
 * that loops down, the bottom row's tables draw onto the top row).
 * @param {ChunkGrid} grid The grid.
 * @param {readonly number[]} indices The changed cells, as flat indexes into the six layers.
 * @param {boolean} verticalWrap Whether the map loops down.
 * @returns {DirtyChunks} The chunks to redraw, by what they redraw.
 */
const dirtyChunksForCells = (grid: ChunkGrid, indices: readonly number[], verticalWrap: boolean): DirtyChunks =>
{
  const dirty: DirtyChunks = { tiles: new Set(), passage: new Set(), regions: new Set() };
  const layerSize = grid.width * grid.height;
  indices.forEach(index =>
  {
    const z = Math.floor(index / layerSize);
    const cell = index % layerSize;
    const x = cell % grid.width;
    const y = Math.floor(cell / grid.width);
    const chunk = chunkIndexOf(grid, x, y);

    // the region layer draws nothing but its overlay.
    if (z === 5)
    {
      dirty.regions.add(chunk);
      return;
    }

    dirty.tiles.add(chunk);

    // the shadow layer is not a tile, so passability never reads it.
    if (z < 4)
    {
      dirty.passage.add(chunk);
    }

    if (z !== 1)
    {
      return;
    }

    // a table's edge lands on the row beneath, wrapping to the top on a map that loops down.
    const below = rowBeneath(grid, y, verticalWrap);
    if (below >= 0)
    {
      dirty.tiles.add(chunkIndexOf(grid, x, below));
    }
  });

  return dirty;
};

/**
 * Finds the row beneath a row, as the engine reads it for a table's edge.
 * @param {ChunkGrid} grid The grid.
 * @param {number} y The row.
 * @param {boolean} verticalWrap Whether the map loops down.
 * @returns {number} The row beneath, or -1 below the bottom of a map that does not loop.
 */
const rowBeneath = (grid: ChunkGrid, y: number, verticalWrap: boolean): number =>
{
  if (y + 1 < grid.height)
  {
    return y + 1;
  }

  return verticalWrap
    ? 0
    : -1;
};

/**
 * Finds the chunks a rectangle of the world overlaps, so only those draw while the camera looks at it.
 * @param {ChunkGrid} grid The grid.
 * @param {WorldRect} rect The rectangle, in world pixels.
 * @param {number} tileSize The tile size in world pixels.
 * @returns {ChunkRange} The chunks, clipped to the map.
 */
const chunkRangeFor = (grid: ChunkGrid, rect: WorldRect, tileSize: number): ChunkRange =>
{
  const edge = grid.chunkSize * tileSize;
  const clampColumn = (value: number) => Math.min(grid.columns, Math.max(0, value));
  const clampRow = (value: number) => Math.min(grid.rows, Math.max(0, value));
  return {
    cx0: clampColumn(Math.floor(rect.x / edge)),
    cy0: clampRow(Math.floor(rect.y / edge)),
    cx1: clampColumn(Math.ceil((rect.x + rect.width) / edge)),
    cy1: clampRow(Math.ceil((rect.y + rect.height) / edge)),
  };
};

/**
 * Reports whether a chunk lies inside a range.
 * @param {ChunkGrid} grid The grid.
 * @param {ChunkRange} range The range.
 * @param {number} index The chunk.
 * @returns {boolean} True when it is inside.
 */
const isChunkInRange = (grid: ChunkGrid, range: ChunkRange, index: number): boolean =>
{
  const cx = index % grid.columns;
  const cy = Math.floor(index / grid.columns);
  return cx >= range.cx0 && cx < range.cx1 && cy >= range.cy0 && cy < range.cy1;
};

export { CHUNK_SIZE, chunkCells, chunkGrid, chunkIndexOf, chunkRangeFor, dirtyChunksForCells, isChunkInRange };
export type { ChunkCells, ChunkGrid, ChunkRange, DirtyChunks, WorldRect };
