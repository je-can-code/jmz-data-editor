/**
 * The first tile id of each tileset sheet, exactly as RMMZ's {@code Tilemap} numbers them. B to E are the upper
 * sheets (256 ids each), A5 holds plain lower tiles, and A1 to A4 hold autotiles, whose ids run in blocks of 48
 * per kind so that {@code id = A1 + kind * 48 + shape}.
 */
const TileId = {
  B: 0,
  C: 256,
  D: 512,
  E: 768,
  A5: 1536,
  A1: 2048,
  A2: 2816,
  A3: 4352,
  A4: 5888,
  MAX: 8192,
} as const;

/**
 * How many ids each autotile kind owns: one per shape, though only the floor kinds use all 48.
 */
const AUTOTILE_SHAPE_COUNT = 48;

/**
 * The sheet a tile id comes from, or {@code 'none'} for the empty tile and anything outside the sheets.
 */
type TileSheet = 'none' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'B' | 'C' | 'D' | 'E';

/**
 * Reports whether a tile id is an autotile (A1 to A4).
 * @param {number} tileId The tile id.
 * @returns {boolean} True for ids from A1 up to the last A4 id.
 */
const isAutotile = (tileId: number): boolean =>
{
  return tileId >= TileId.A1 && tileId < TileId.MAX;
};

/**
 * Finds the autotile kind of a tile id. Kinds 0 to 15 are A1, 16 to 47 A2, 48 to 79 A3 and 80 to 127 A4.
 * @param {number} tileId An autotile id.
 * @returns {number} The kind, or -1 when the id is not an autotile.
 */
const autotileKind = (tileId: number): number =>
{
  return isAutotile(tileId)
    ? Math.floor((tileId - TileId.A1) / AUTOTILE_SHAPE_COUNT)
    : -1;
};

/**
 * Finds the shape of an autotile id: which of its kind's patterns it draws.
 * @param {number} tileId An autotile id.
 * @returns {number} The shape, 0 to 47, or -1 when the id is not an autotile.
 */
const autotileShape = (tileId: number): number =>
{
  return isAutotile(tileId)
    ? (tileId - TileId.A1) % AUTOTILE_SHAPE_COUNT
    : -1;
};

/**
 * Builds the tile id of one shape of an autotile kind.
 * @param {number} kind The autotile kind.
 * @param {number} shape The shape.
 * @returns {number} The tile id.
 */
const makeAutotileId = (kind: number, shape: number): number =>
{
  return TileId.A1 + kind * AUTOTILE_SHAPE_COUNT + shape;
};

/**
 * Names the sheet a tile id comes from.
 * @param {number} tileId The tile id.
 * @returns {TileSheet} The sheet, or {@code 'none'} for 0 and ids no sheet holds.
 */
const tileSheet = (tileId: number): TileSheet =>
{
  // the empty tile, and the gap between E and A5, belong to no sheet.
  if (tileId <= 0 || tileId >= TileId.MAX || (tileId >= TileId.E + 256 && tileId < TileId.A5))
  {
    return 'none';
  }

  // the upper sheets, 256 ids each.
  if (tileId < TileId.A5)
  {
    const upper: TileSheet[] = [ 'B', 'C', 'D', 'E' ];
    return upper[Math.floor(tileId / 256)];
  }

  // the lower sheets, in id order.
  if (tileId < TileId.A1)
  {
    return 'A5';
  }

  if (tileId < TileId.A2)
  {
    return 'A1';
  }

  if (tileId < TileId.A3)
  {
    return 'A2';
  }

  return tileId < TileId.A4
    ? 'A3'
    : 'A4';
};

/**
 * Reports whether a tile id comes from one of the upper sheets, B to E. The empty tile counts, since it is B's
 * first tile.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for ids 0 to 1023.
 */
const isUpperTile = (tileId: number): boolean =>
{
  return tileId >= TileId.B && tileId < TileId.E + 256;
};

/**
 * Reports whether a tile id comes from A5, the sheet of plain lower tiles.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A5 ids.
 */
const isA5Tile = (tileId: number): boolean =>
{
  return tileId >= TileId.A5 && tileId < TileId.A1;
};

/**
 * Reports whether a kind is an A1 (animated water) kind.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for kinds 0 to 15.
 */
const isA1Kind = (kind: number): boolean =>
{
  return kind >= 0 && kind < 16;
};

/**
 * Reports whether a kind is an A2 (ground) kind.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for kinds 16 to 47.
 */
const isA2Kind = (kind: number): boolean =>
{
  return kind >= 16 && kind < 48;
};

/**
 * Reports whether a kind is an A3 (building) kind.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for kinds 48 to 79.
 */
const isA3Kind = (kind: number): boolean =>
{
  return kind >= 48 && kind < 80;
};

/**
 * Reports whether a kind is an A4 (wall) kind.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for kinds 80 to 127.
 */
const isA4Kind = (kind: number): boolean =>
{
  return kind >= 80 && kind < 128;
};

/**
 * Reports whether a kind is a waterfall: the odd A1 kinds from 5 up (MZ's block E), which pour down and join only
 * sideways.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for kinds 5, 7, 9, 11, 13 and 15.
 */
const isWaterfallKind = (kind: number): boolean =>
{
  return kind >= 4 && kind < 16 && kind % 2 === 1;
};

/**
 * Reports whether a kind is open water: the ocean (kind 0, MZ's block A) or one of the plain water kinds (the even
 * kinds from 4 up, block D). These are the A1 kinds MZ never draws a boundary between.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for kinds 0, 4, 6, 8, 10, 12 and 14.
 */
const isWaterKind = (kind: number): boolean =>
{
  return kind === 0 || (kind >= 4 && kind < 16 && kind % 2 === 0);
};

/**
 * Reports whether a kind is one MZ lays over the ocean: deep sea (kind 1, block B) and the two ocean decorations
 * (kinds 2 and 3, block C). Painting one fills the ocean in beneath it.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for kinds 1, 2 and 3.
 */
const isOceanOverlayKind = (kind: number): boolean =>
{
  return kind >= 1 && kind <= 3;
};

/**
 * Finds a kind's column on the A2 sheet, 0 to 7. Columns 0 to 3 are the base ground (the left half) and 4 to 7
 * the decorations laid over it (the right half).
 * @param {number} kind An A2 kind.
 * @returns {number} The column, or -1 for any other kind.
 */
const a2Column = (kind: number): number =>
{
  return isA2Kind(kind)
    ? (kind - 16) % 8
    : -1;
};

/**
 * Reports whether a kind is a roof: an A3 kind on one of the sheet's even rows.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for roof kinds.
 */
const isRoofKind = (kind: number): boolean =>
{
  return isA3Kind(kind) && kind % 16 < 8;
};

/**
 * Reports whether a kind is a wall top (a ceiling seen from above): an A4 kind on one of the sheet's even rows.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for wall top kinds.
 */
const isWallTopKind = (kind: number): boolean =>
{
  return isA4Kind(kind) && kind % 16 < 8;
};

/**
 * Reports whether a kind is a wall face: an A3 building wall or an A4 wall side, on one of the odd rows.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for wall face kinds.
 */
const isWallSideKind = (kind: number): boolean =>
{
  return (isA3Kind(kind) || isA4Kind(kind)) && kind % 16 >= 8;
};

/**
 * Reports whether a kind draws with the 47-shape floor table: A1 water (every kind but the waterfalls), all of A2,
 * and the A4 wall tops. The rest draw with the 16-shape wall table, and waterfalls with their own 4 shapes.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for floor-type kinds.
 */
const isFloorTypeKind = (kind: number): boolean =>
{
  return (isA1Kind(kind) && isWaterfallKind(kind) === false) || isA2Kind(kind) || isWallTopKind(kind);
};

export {
  a2Column,
  AUTOTILE_SHAPE_COUNT,
  autotileKind,
  autotileShape,
  isA1Kind,
  isA2Kind,
  isA3Kind,
  isA4Kind,
  isA5Tile,
  isAutotile,
  isFloorTypeKind,
  isOceanOverlayKind,
  isRoofKind,
  isUpperTile,
  isWallSideKind,
  isWallTopKind,
  isWaterfallKind,
  isWaterKind,
  makeAutotileId,
  TileId,
  tileSheet,
};
export type { TileSheet };
