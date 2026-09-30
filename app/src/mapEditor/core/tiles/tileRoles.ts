import { TilesetMode } from './autotileShapes.ts';
import {
  a2Column,
  autotileKind,
  isA5Tile,
  isAutotile,
  isOceanOverlayKind,
  isUpperTile,
  makeAutotileId,
} from './tileIds.ts';

/**
 * How MZ's auto mode treats a tile, which decides the layers it lands on:
 *
 * - {@code ground}: the A tiles MZ lays on layer 1 (A1 ocean, water and waterfalls, the A2 base columns, A3, A4
 *   and A5);
 * - {@code overlay}: the A2 decorations (the right half of the sheet), which MZ lays on layer 2 over the ground,
 *   and on a Field-mode tileset the second and fourth base columns too, which MZ pairs with the column before them;
 * - {@code oceanOverlay}: A1 deep sea and the two ocean decorations, which MZ lays on layer 2 and fills with ocean
 *   underneath;
 * - {@code upper}: B to E tiles, stacked two deep on layers 3 and 4;
 * - {@code clearUpper}: B's first tile, the empty one, which is how MZ clears layers 3 and 4.
 */
type TileRole = 'ground' | 'overlay' | 'oceanOverlay' | 'upper' | 'clearUpper';

/**
 * The kind of the ocean, which MZ fills in beneath deep sea and the ocean decorations.
 */
const OCEAN_KIND = 0;

/**
 * Reports whether a kind is one a Field-mode tileset pairs with the base column before it: the second and fourth
 * A2 base columns, which MZ draws "1 and 2 overlapping" and "3 and 4 overlapping".
 * @param {number} kind The autotile kind.
 * @param {number} mode The tileset's mode.
 * @returns {boolean} True for the paired columns on a Field-mode tileset.
 */
const isFieldPairedKind = (kind: number, mode: number): boolean =>
{
  const column = a2Column(kind);
  return mode === TilesetMode.field && (column === 1 || column === 3);
};

/**
 * Names how MZ's auto mode treats a tile.
 * @param {number} tileId The tile id; any shape of an autotile kind will do.
 * @param {number} mode The tileset's mode.
 * @returns {TileRole} The role.
 */
const tileRole = (tileId: number, mode: number): TileRole =>
{
  if (tileId === 0)
  {
    return 'clearUpper';
  }

  if (isUpperTile(tileId))
  {
    return 'upper';
  }

  if (isAutotile(tileId) === false)
  {
    return 'ground';
  }

  // among the autotiles, only these three groups leave the ground layer.
  const kind = autotileKind(tileId);
  if (isOceanOverlayKind(kind))
  {
    return 'oceanOverlay';
  }

  return a2Column(kind) >= 4 || isFieldPairedKind(kind, mode)
    ? 'overlay'
    : 'ground';
};

/**
 * Finds the layer MZ's auto mode puts an A-sheet tile on: 0 for the ground, 1 for the overlays.
 * @param {number} tileId An A-sheet tile id (A1 to A5).
 * @param {number} mode The tileset's mode.
 * @returns {number} The tile layer, 0 or 1.
 */
const autoLayerOf = (tileId: number, mode: number): number =>
{
  return tileRole(tileId, mode) === 'ground'
    ? 0
    : 1;
};

/**
 * Reports whether a tile comes from the A sheets (A1 to A5), the only tiles a "goes on top" mark applies to.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A-sheet tiles.
 */
const isASheetTile = (tileId: number): boolean =>
{
  return isA5Tile(tileId) || isAutotile(tileId);
};

/**
 * Reports whether two tile ids are the same tile for painting: the same kind for autotiles, whatever their shapes,
 * and the same id for everything else.
 * @param {number} a One tile id.
 * @param {number} b The other.
 * @returns {boolean} True when they are the same tile.
 */
const isSameTile = (a: number, b: number): boolean =>
{
  if (isAutotile(a) && isAutotile(b))
  {
    return autotileKind(a) === autotileKind(b);
  }

  return a === b;
};

/**
 * The tile id a painter writes for a tile, before its neighbours shape it: autotiles in shape 0, other tiles as
 * they are.
 * @param {number} tileId The tile id.
 * @returns {number} The id to write.
 */
const unshapedTile = (tileId: number): number =>
{
  return isAutotile(tileId)
    ? makeAutotileId(autotileKind(tileId), 0)
    : tileId;
};

/**
 * The base a Field-mode tileset lays under a paired A2 kind: the column before it, on the same row.
 * @param {number} tileId A paired A2 kind's tile id.
 * @returns {number} The base kind's tile id, in shape 0.
 */
const fieldBaseTile = (tileId: number): number =>
{
  return makeAutotileId(autotileKind(tileId) - 1, 0);
};

export { autoLayerOf, fieldBaseTile, isASheetTile, isFieldPairedKind, isSameTile, OCEAN_KIND, tileRole, unshapedTile };
export type { TileRole };
