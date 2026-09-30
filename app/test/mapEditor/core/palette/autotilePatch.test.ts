import { describe, expect, it } from 'vitest';
import { autotilePatch, type TilePatch } from '../../../../src/mapEditor/core/palette/autotilePatch.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { autotileKind, autotileShape, makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';

/*
 * The painted patch the palette shows while an autotile kind is hovered.
 *
 * One ready-made tile says little about how a kind looks once painted, so hovering shows a small patch of it with its
 * edges, outer and inner corners and inside, each cell shaped by the same rules painting uses, so the patch is exactly
 * what the map would hold. An A4 kind shows its ceiling above its wall face whichever of the two is hovered, and an A3
 * kind its roof above its building wall; a waterfall shows a fall three wide and a lone column. Only the kinds the
 * patch paints appear in it, and its border stays empty so its edges show.
 */

/**
 * Reads one cell of a patch.
 * @param {TilePatch} patch The patch.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {number} The tile there.
 */
const at = (patch: TilePatch, x: number, y: number): number => patch.tiles[y * patch.width + x];

/**
 * Lists the kinds a patch paints.
 * @param {TilePatch} patch The patch.
 * @returns {number[]} The kinds, ascending, once each.
 */
const kindsIn = (patch: TilePatch): number[] => [ ...new Set(patch.tiles.filter(tile => tile !== 0).map(autotileKind)) ].sort((a, b) => a - b);

describe('autotilePatch', () =>
{
  it('paints a floor kind as a blob with outer and inner corners, edges and an inside, in one kind alone', () =>
  {
    // Arrange: A2 kind 20.

    // Act.
    const patch = autotilePatch(makeAutotileId(20, 47), TilesetMode.area);

    // Assert: the top-left corner, the inner corner beside the notch, an inside, and the empty border.
    expect([ patch.width, patch.height, kindsIn(patch), autotileShape(at(patch, 1, 1)), autotileShape(at(patch, 3, 2)), autotileShape(at(patch, 2, 2)), at(patch, 0, 0) ])
      .toStrictEqual([ 7, 6, [ 20 ], 34, 2, 0, 0 ]);
  });

  it('paints an A4 ceiling above its wall face, shaped as a map would hold them', () =>
  {
    // Arrange: A4 ceiling kind 80, whose wall face is kind 88.

    // Act.
    const patch = autotilePatch(makeAutotileId(80, 0), TilesetMode.area);

    // Assert: the ceiling's lower-left cell shows its left and bottom edges; the wall face's top-left shows its left
    // and top edges, and its bottom-right its right and bottom edges.
    expect([ kindsIn(patch), autotileKind(at(patch, 1, 2)), autotileShape(at(patch, 1, 2)), autotileKind(at(patch, 1, 3)), autotileShape(at(patch, 1, 3)), autotileShape(at(patch, 4, 4)) ])
      .toStrictEqual([ [ 80, 88 ], 80, 40, 88, 3, 12 ]);
  });

  it('paints the same ceiling and wall face when the wall face is hovered', () =>
  {
    // Arrange.
    const fromCeiling = autotilePatch(makeAutotileId(80, 0), TilesetMode.area);

    // Act.
    const fromWallFace = autotilePatch(makeAutotileId(88, 5), TilesetMode.area);

    // Assert.
    expect(fromWallFace)
      .toStrictEqual(fromCeiling);
  });

  it('paints an A3 roof above its building wall, and no other kind', () =>
  {
    // Arrange: A3 building wall kind 57, whose roof is kind 49.

    // Act.
    const patch = autotilePatch(makeAutotileId(57, 0), TilesetMode.area);

    // Assert: the roof's lower-left cell shows its left and bottom edges.
    expect([ kindsIn(patch), autotileKind(at(patch, 1, 1)), autotileShape(at(patch, 1, 2)), autotileKind(at(patch, 1, 4)) ])
      .toStrictEqual([ [ 49, 57 ], 49, 9, 57 ]);
  });

  it('paints a waterfall three wide, edged on its outer sides, and a lone column edged on both', () =>
  {
    // Arrange: A1 waterfall kind 5.

    // Act.
    const patch = autotilePatch(makeAutotileId(5, 0), TilesetMode.area);

    // Assert.
    expect([ kindsIn(patch), [ 1, 2, 3, 5 ].map(x => autotileShape(at(patch, x, 1))) ])
      .toStrictEqual([ [ 5 ], [ 1, 0, 2, 3 ] ]);
  });

  it('shows anything that is not an autotile as itself, one cell', () =>
  {
    // Arrange.

    // Act.
    const patch = autotilePatch(TileId.A5 + 2, TilesetMode.area);

    // Assert.
    expect(patch)
      .toStrictEqual({ width: 1, height: 1, tiles: [ TileId.A5 + 2 ] });
  });
});
