/**
 * Where each tileset sheet's tile ids start, as {@code js/rmmz_core.js} numbers them (Tilemap.TILE_ID_*). B, C, D
 * and E take 256 ids each from 0; A5 follows; then the autotile sheets, 48 shapes to a kind.
 */
const TILE_ID_B = 0;
const TILE_ID_A5 = 1536;
const TILE_ID_A1 = 2048;
const TILE_ID_A2 = 2816;
const TILE_ID_A3 = 4352;
const TILE_ID_A4 = 5888;
const TILE_ID_MAX = 8192;

/**
 * The tileset flag bits the drawing and the passability overlay read, from the engine's use of them.
 */
const TileFlag = {
  // the four passage bits, one per direction: down, left, right, up.
  passageDown: 0x01,
  passageLeft: 0x02,
  passageRight: 0x04,
  passageUp: 0x08,
  // a star tile: drawn above characters, and ignored by passability.
  star: 0x10,
  ladder: 0x20,
  bush: 0x40,
  // on an A2 tile, a table: its legs split and its lower edge draws onto the cell beneath.
  counter: 0x80,
  damageFloor: 0x100,
} as const;

/**
 * Reports whether a tile id draws at all, as Tilemap.isVisibleTile.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for any id from 1 up to the last A4 shape.
 */
const isVisibleTile = (tileId: number): boolean =>
{
  return tileId > 0 && tileId < TILE_ID_MAX;
};

/**
 * Reports whether a tile id is an autotile (A1 to A4), as Tilemap.isAutotile.
 * @param {number} tileId The tile id.
 * @returns {boolean} True from the first A1 id on.
 */
const isAutotile = (tileId: number): boolean =>
{
  return tileId >= TILE_ID_A1;
};

/**
 * Names an autotile's kind, as Tilemap.getAutotileKind.
 * @param {number} tileId The autotile id.
 * @returns {number} The kind: 0 to 15 on A1, 16 to 47 on A2, 48 to 79 on A3, 80 to 127 on A4.
 */
const autotileKind = (tileId: number): number =>
{
  return Math.floor((tileId - TILE_ID_A1) / 48);
};

/**
 * Names an autotile's shape, as Tilemap.getAutotileShape.
 * @param {number} tileId The autotile id.
 * @returns {number} The shape, 0 to 47.
 */
const autotileShape = (tileId: number): number =>
{
  return (tileId - TILE_ID_A1) % 48;
};

/**
 * Reports whether a tile id is on the A1 sheet (water, waterfalls and the other animated kinds).
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A1.
 */
const isTileA1 = (tileId: number): boolean =>
{
  return tileId >= TILE_ID_A1 && tileId < TILE_ID_A2;
};

/**
 * Reports whether a tile id is on the A2 sheet (ground, and tables).
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A2.
 */
const isTileA2 = (tileId: number): boolean =>
{
  return tileId >= TILE_ID_A2 && tileId < TILE_ID_A3;
};

/**
 * Reports whether a tile id is on the A3 sheet (roofs and building walls).
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A3.
 */
const isTileA3 = (tileId: number): boolean =>
{
  return tileId >= TILE_ID_A3 && tileId < TILE_ID_A4;
};

/**
 * Reports whether a tile id is on the A4 sheet (wall tops and wall faces).
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A4.
 */
const isTileA4 = (tileId: number): boolean =>
{
  return tileId >= TILE_ID_A4 && tileId < TILE_ID_MAX;
};

/**
 * Reports whether a tile id is on the A5 sheet, which draws like B to E but is its own sheet.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A5.
 */
const isTileA5 = (tileId: number): boolean =>
{
  return tileId >= TILE_ID_A5 && tileId < TILE_ID_A1;
};

/**
 * Reports whether a tile stops a table above from drawing its edge onto it, as Tilemap.isShadowingTile.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A3 and A4 tiles.
 */
const isShadowingTile = (tileId: number): boolean =>
{
  return isTileA3(tileId) || isTileA4(tileId);
};

/**
 * Reports whether a tile draws above characters, which is its star flag (Tilemap#_isHigherTile).
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for a star tile.
 */
const isHigherTile = (flags: ArrayLike<number>, tileId: number): boolean =>
{
  return ((flags[tileId] ?? 0) & TileFlag.star) !== 0;
};

/**
 * Reports whether a tile is a table: an A2 tile with the counter flag (Tilemap#_isTableTile).
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for a table tile.
 */
const isTableTile = (flags: ArrayLike<number>, tileId: number): boolean =>
{
  return isTileA2(tileId) && ((flags[tileId] ?? 0) & TileFlag.counter) !== 0;
};

/**
 * Names the sheet a B to E or A5 tile is cut from, by its place in a tileset's nine sheets (A1, A2, A3, A4, A5, B,
 * C, D, E), as Tilemap#_addNormalTile does.
 * @param {number} tileId The tile id, B to E or A5.
 * @returns {number} The sheet: 4 for A5, 5 to 8 for B to E.
 */
const normalTileSheet = (tileId: number): number =>
{
  return isTileA5(tileId)
    ? 4
    : 5 + Math.floor(tileId / 256);
};

/**
 * Finds a B to E or A5 tile's cell on its sheet, in tile units, as Tilemap#_addNormalTile does: sheets are two
 * columns of eight tiles by sixteen rows.
 * @param {number} tileId The tile id.
 * @returns {{ column: number, row: number }} The cell.
 */
const normalTileCell = (tileId: number): { column: number; row: number } =>
{
  return {
    column: (Math.floor(tileId / 128) % 2) * 8 + (tileId % 8),
    row: Math.floor((tileId % 256) / 8) % 16,
  };
};

export {
  autotileKind,
  autotileShape,
  isAutotile,
  isHigherTile,
  isShadowingTile,
  isTableTile,
  isTileA1,
  isTileA2,
  isTileA3,
  isTileA4,
  isTileA5,
  isVisibleTile,
  normalTileCell,
  normalTileSheet,
  TILE_ID_A1,
  TILE_ID_A2,
  TILE_ID_A3,
  TILE_ID_A4,
  TILE_ID_A5,
  TILE_ID_B,
  TILE_ID_MAX,
  TileFlag,
};
