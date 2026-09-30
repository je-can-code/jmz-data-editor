import { describe, expect, it } from 'vitest';
import {
  a2Column,
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
} from '../../../../src/mapEditor/core/tiles/tileIds.ts';

/*
 * The tile id layout.
 *
 * Every other tile service reads a map through these few functions, so they owe their callers exactly RMMZ's
 * numbering: the sheet boundaries of `Tilemap.TILE_ID_*`, 48 ids per autotile kind, and the kind groups the engine
 * and MZ's editor treat differently (waterfalls, open water, ocean overlays, roofs, wall tops and wall faces). A
 * boundary off by one here would silently move a whole sheet into the wrong layering or shape rule, so every
 * boundary is checked from both sides.
 */
describe('tile sheets', () =>
{
  it('names the sheet on each side of every boundary', () =>
  {
    // Arrange: the last id of each sheet and the first id of the next.
    const ids = [ 0, 1, 255, 256, 767, 768, 1023, 1024, 1535, 1536, 2047, 2048, 2815, 2816, 4351, 4352, 5887, 5888, 8191, 8192 ];

    // Act.
    const sheets = ids.map(tileSheet);

    // Assert.
    expect(sheets)
      .toEqual([ 'none', 'B', 'B', 'C', 'D', 'E', 'E', 'none', 'none', 'A5', 'A5', 'A1', 'A1', 'A2', 'A2', 'A3', 'A3', 'A4', 'A4', 'none' ]);
  });

  it('counts the empty tile as an upper tile but not the first A5 tile', () =>
  {
    // Arrange: the empty tile, the last E tile, and the first A5 tile.
    const ids = [ 0, 1023, 1536 ];

    // Act.
    const upper = ids.map(isUpperTile);

    // Assert.
    expect(upper)
      .toEqual([ true, true, false ]);
  });

  it('tells A5 from the ids on either side of it', () =>
  {
    // Arrange.
    const ids = [ 1535, 1536, 2047, 2048 ];

    // Act.
    const a5 = ids.map(isA5Tile);

    // Assert.
    expect(a5)
      .toEqual([ false, true, true, false ]);
  });
});

describe('autotile ids', () =>
{
  it('splits an id into its kind and shape, and builds it back', () =>
  {
    // Arrange: kind 36, shape 20.
    const tileId = TileId.A1 + 36 * 48 + 20;

    // Act.
    const kind = autotileKind(tileId);
    const shape = autotileShape(tileId);
    const rebuilt = makeAutotileId(kind, shape);

    // Assert.
    expect([ kind, shape, rebuilt ])
      .toEqual([ 36, 20, tileId ]);
  });

  it('answers -1 for the kind and shape of an id that is not an autotile', () =>
  {
    // Arrange: the last A5 tile, next to the first autotile.
    const ids = [ 2047, 2048 ];

    // Act.
    const answers = ids.map(id => [ isAutotile(id), autotileKind(id), autotileShape(id) ]);

    // Assert.
    expect(answers)
      .toEqual([ [ false, -1, -1 ], [ true, 0, 0 ] ]);
  });
});

describe('kind groups', () =>
{
  it('places the sheet boundaries between kinds 15 and 16, 47 and 48, 79 and 80, and after 127', () =>
  {
    // Arrange.
    const kinds = [ 15, 16, 47, 48, 79, 80, 127, 128 ];

    // Act.
    const groups = kinds.map(kind => [ isA1Kind(kind), isA2Kind(kind), isA3Kind(kind), isA4Kind(kind) ]);

    // Assert.
    expect(groups)
      .toEqual([
        [ true, false, false, false ],
        [ false, true, false, false ],
        [ false, true, false, false ],
        [ false, false, true, false ],
        [ false, false, true, false ],
        [ false, false, false, true ],
        [ false, false, false, true ],
        [ false, false, false, false ],
      ]);
  });

  it('splits A1 into open water, ocean overlays and waterfalls', () =>
  {
    // Arrange: every A1 kind.
    const kinds = Array.from({ length: 16 }, (_, kind) => kind);

    // Act.
    const water = kinds.filter(isWaterKind);
    const overlays = kinds.filter(isOceanOverlayKind);
    const waterfalls = kinds.filter(isWaterfallKind);

    // Assert.
    expect([ water, overlays, waterfalls ])
      .toEqual([ [ 0, 4, 6, 8, 10, 12, 14 ], [ 1, 2, 3 ], [ 5, 7, 9, 11, 13, 15 ] ]);
  });

  it('keeps an A2 kind with an odd number out of the waterfalls', () =>
  {
    // Arrange: kind 17 is odd but belongs to A2.
    const kind = 17;

    // Act.
    const waterfall = isWaterfallKind(kind);
    const water = isWaterKind(16);

    // Assert.
    expect([ waterfall, water ])
      .toEqual([ false, false ]);
  });

  it('finds the A2 column, left half and right half alike', () =>
  {
    // Arrange: the first kind of each half of the first row, and the last A2 kind.
    const kinds = [ 16, 19, 20, 23, 47, 48 ];

    // Act.
    const columns = kinds.map(a2Column);

    // Assert.
    expect(columns)
      .toEqual([ 0, 3, 4, 7, 7, -1 ]);
  });

  it('alternates roof and building wall rows on A3', () =>
  {
    // Arrange: the last roof kind of the first row, the first wall kind, and the next row's first roof.
    const kinds = [ 55, 56, 63, 64 ];

    // Act.
    const answers = kinds.map(kind => [ isRoofKind(kind), isWallSideKind(kind) ]);

    // Assert.
    expect(answers)
      .toEqual([ [ true, false ], [ false, true ], [ false, true ], [ true, false ] ]);
  });

  it('alternates wall top and wall side rows on A4', () =>
  {
    // Arrange: the last wall top of the first row, the first wall side, and the next row's first wall top.
    const kinds = [ 87, 88, 95, 96 ];

    // Act.
    const answers = kinds.map(kind => [ isWallTopKind(kind), isWallSideKind(kind) ]);

    // Assert.
    expect(answers)
      .toEqual([ [ true, false ], [ false, true ], [ false, true ], [ true, false ] ]);
  });

  it('draws water, ground and wall tops with the floor table, and nothing else', () =>
  {
    // Arrange: ocean, a waterfall, deep sea, a ground kind, a roof, a building wall, a wall top and a wall side.
    const kinds = [ 0, 5, 1, 40, 48, 56, 80, 88 ];

    // Act.
    const floors = kinds.map(isFloorTypeKind);

    // Assert.
    expect(floors)
      .toEqual([ true, false, true, true, false, false, true, false ]);
  });
});
