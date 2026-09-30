import { describe, expect, it } from 'vitest';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { autoLayerOf, fieldBaseTile, isASheetTile, isSameTile, tileRole, unshapedTile } from '../../../../src/mapEditor/core/tiles/tileRoles.ts';

/*
 * Tile roles.
 *
 * Automatic layering and the goes-on-top pre-fill both start from one question: where would MZ's auto mode put this
 * tile? The answer must match S5's hand test in MZ and MZ's help exactly (A2 decorations and ocean overlays on
 * layer 2, a Field tileset's paired base columns too, every other A tile on layer 1, B to E stacked above), since a
 * wrong role sends a tile to the wrong layer on every stroke and marks the wrong tiles in every tileset.
 */
describe('tileRole', () =>
{
  it('sorts each sheet into the role MZ gives it', () =>
  {
    // Arrange: the empty tile, a B tile, an A5 tile, ocean, deep sea, a waterfall, an A2 base kind, an A2
    // decoration, a roof, a wall top and a wall side.
    const tiles = [ 0, 5, TileId.A5, makeAutotileId(0, 0), makeAutotileId(1, 7), makeAutotileId(5, 0), makeAutotileId(16, 0),
      makeAutotileId(20, 3), makeAutotileId(48, 0), makeAutotileId(80, 0), makeAutotileId(88, 0) ];

    // Act.
    const roles = tiles.map(tileId => tileRole(tileId, TilesetMode.area));

    // Assert.
    expect(roles)
      .toEqual([ 'clearUpper', 'upper', 'ground', 'ground', 'oceanOverlay', 'ground', 'ground', 'overlay', 'ground', 'ground', 'ground' ]);
  });

  it('makes the second and fourth base columns overlays on a Field tileset only, never the first or third', () =>
  {
    // Arrange: the four base columns of the first A2 row.
    const kinds = [ 16, 17, 18, 19 ];

    // Act.
    const field = kinds.map(kind => tileRole(makeAutotileId(kind, 0), TilesetMode.field));
    const area = kinds.map(kind => tileRole(makeAutotileId(kind, 0), TilesetMode.area));

    // Assert.
    expect([ field, area ])
      .toEqual([ [ 'ground', 'overlay', 'ground', 'overlay' ], [ 'ground', 'ground', 'ground', 'ground' ] ]);
  });
});

describe('autoLayerOf', () =>
{
  it('answers layer 1 (0) for the ground and layer 2 (1) for overlays', () =>
  {
    // Arrange: an A5 tile, an A2 decoration, and deep sea.
    const tiles = [ TileId.A5 + 9, makeAutotileId(23, 0), makeAutotileId(3, 0) ];

    // Act.
    const layers = tiles.map(tileId => autoLayerOf(tileId, TilesetMode.area));

    // Assert.
    expect(layers)
      .toEqual([ 0, 1, 1 ]);
  });
});

describe('tile helpers', () =>
{
  it('counts A1 to A5 as A-sheet tiles, and none of B to E', () =>
  {
    // Arrange: the last E tile, the first A5 tile and the first autotile.
    const tiles = [ 1023, TileId.A5, TileId.A1 ];

    // Act.
    const aSheet = tiles.map(isASheetTile);

    // Assert.
    expect(aSheet)
      .toEqual([ false, true, true ]);
  });

  it('treats two shapes of one kind as the same tile, but not a neighbouring kind or id', () =>
  {
    // Arrange.
    const pairs: [ number, number ][] = [ [ makeAutotileId(16, 0), makeAutotileId(16, 40) ], [ makeAutotileId(16, 0), makeAutotileId(17, 0) ], [ 5, 5 ], [ 5, 6 ] ];

    // Act.
    const same = pairs.map(([ a, b ]) => isSameTile(a, b));

    // Assert.
    expect(same)
      .toEqual([ true, false, true, false ]);
  });

  it('writes autotiles in shape 0 and plain tiles as they are', () =>
  {
    // Arrange.
    const tiles = [ makeAutotileId(40, 33), TileId.A5 + 4 ];

    // Act.
    const written = tiles.map(unshapedTile);

    // Assert.
    expect(written)
      .toEqual([ makeAutotileId(40, 0), TileId.A5 + 4 ]);
  });

  it('pairs a Field tileset\'s paired kind with the kind before it', () =>
  {
    // Arrange: the fourth base column of the second row.
    const tileId = makeAutotileId(27, 12);

    // Act.
    const base = fieldBaseTile(tileId);

    // Assert.
    expect(base)
      .toBe(makeAutotileId(26, 0));
  });
});
