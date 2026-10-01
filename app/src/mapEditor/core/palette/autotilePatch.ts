import { autotileShapeFor } from '../tiles/autotileShapes.ts';
import { gridReader } from '../tiles/tileGrid.ts';
import { autotileKind, isA3Kind, isA4Kind, isAutotile, isWaterfallKind, makeAutotileId } from '../tiles/tileIds.ts';

/**
 * A small painted patch of tiles: what the palette shows while an autotile kind is hovered, so its edges, corners and
 * insides can be seen at once rather than guessed from one ready-made tile.
 */
type TilePatch = {
  readonly width: number;
  readonly height: number;

  /**
   * One tile id per cell, row by row, each autotile in the shape the map would store for it there; 0 where the patch
   * is empty.
   */
  readonly tiles: readonly number[];
};

/**
 * A patch of a floor kind (water, ground, a ceiling on its own): a blob with outer corners, straight edges, two inner
 * corners and an inside. A ring of empty cells keeps its edges showing, since the edge of a map counts as joined.
 */
const FLOOR_PATTERN: readonly string[] = [
  '.......',
  '.AAA...',
  '.AAAAA.',
  '.AAAAA.',
  '...AAA.',
  '.......',
];

/**
 * A patch of a waterfall, which only looks sideways: a fall three wide, with both edges and a middle, and one standing
 * alone.
 */
const WATERFALL_PATTERN: readonly string[] = [
  '.......',
  '.AAA.A.',
  '.AAA.A.',
  '.AAA.A.',
  '.......',
];

/**
 * A patch of a top and the side that hangs under it: an A4 ceiling above its wall face, or an A3 roof above its
 * building wall, the way the two are painted together.
 */
const TOP_AND_SIDE_PATTERN: readonly string[] = [
  '......',
  '.AAAA.',
  '.AAAA.',
  '.BBBB.',
  '.BBBB.',
  '......',
];

/**
 * Paints a pattern and shapes every autotile in it by the same rules painting uses.
 * @param {readonly string[]} pattern The rows, one character per cell; a letter names a kind in {@code kinds}.
 * @param {Readonly<Record<string, number>>} kinds The kind each letter paints.
 * @param {number} mode The tileset's mode.
 * @returns {TilePatch} The patch.
 */
const paintPattern = (pattern: readonly string[], kinds: Readonly<Record<string, number>>, mode: number): TilePatch =>
{
  const height = pattern.length;
  const width = pattern[0].length;
  const cells = new Uint16Array(width * height * 6);
  pattern.forEach((line, y) =>
  {
    [ ...line ].forEach((mark, x) =>
    {
      const kind = kinds[mark];
      if (kind !== undefined)
      {
        cells[y * width + x] = makeAutotileId(kind, 0);
      }
    });
  });

  // every tile is shaped against the whole painted patch, as a stroke's tiles are.
  const reader = gridReader({ width, height, cells });
  const tiles = Array.from(cells.subarray(0, width * height), (tileId, index) =>
  {
    if (tileId === 0)
    {
      return 0;
    }

    const kind = autotileKind(tileId);
    return makeAutotileId(kind, autotileShapeFor(reader, index % width, Math.floor(index / width), kind, mode));
  });

  return { width, height, tiles };
};

/**
 * Paints the patch that shows an autotile kind: a floor kind as a blob with every kind of edge and corner, a
 * waterfall as a fall and a lone column, and an A3 or A4 kind as its top above its side (a roof above its building
 * wall, a ceiling above its wall face), whichever of the two is hovered. Anything that is not an autotile is its own
 * patch, one cell.
 * @param {number} tileId The tile, in any shape.
 * @param {number} mode The tileset's mode.
 * @returns {TilePatch} The patch.
 */
const autotilePatch = (tileId: number, mode: number): TilePatch =>
{
  if (isAutotile(tileId) === false)
  {
    return { width: 1, height: 1, tiles: [ tileId ] };
  }

  const kind = autotileKind(tileId);
  if (isA3Kind(kind) || isA4Kind(kind))
  {
    // tops sit on a sheet's even rows and their sides on the row beneath, eight kinds on.
    const top = kind % 16 < 8
      ? kind
      : kind - 8;
    return paintPattern(TOP_AND_SIDE_PATTERN, { A: top, B: top + 8 }, mode);
  }

  return isWaterfallKind(kind)
    ? paintPattern(WATERFALL_PATTERN, { A: kind }, mode)
    : paintPattern(FLOOR_PATTERN, { A: kind }, mode);
};

export { autotilePatch };
export type { TilePatch };
