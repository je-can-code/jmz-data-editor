import { describe, expect, it } from 'vitest';
import {
  checkPlacement,
  comparedLayers,
  placementProblem,
  sameTile,
  type PlacementGround,
} from '../../../../src/mapEditor/core/blueprints/placementMatch.ts';
import type { CellRect } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { captureClip } from '../../../../src/mapEditor/core/tools/tileClip.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { blankGrid, fill, put } from '../tiles/support/tileGridBuilder.ts';

/*
 * Before anything repaints a placement of a blueprint's tiles, the check says whether the placement still sits where the
 * record says; a placement failing it is never repainted, so a map changed under the record outside the editor is
 * flagged rather than painted over.
 *
 * It owes its callers these rules. The map must be drawn with the blueprint's tileset, and some of the placement must lie
 * on it. Only the part on the map is compared, on the tile layers the blueprint carries (its shadows and regions only
 * when it carries no tile layer), an autotile matching by its kind, since its edges reshape with its neighbours, and
 * every other tile exactly. A cell empty on both sides says nothing; a tile on either side counts. A placement every
 * compared tile of which matches is in place. Otherwise its tiles may have slid: an offset of up to two tiles every way
 * wins when at least three of the tiles it changes read as slid, more than read as in place, and at least half of all it
 * changes. Failing that, a placement is in place while at least half its compared tiles match, and has changed below.
 *
 * The maps here are rows of grass (an A2 kind) with objects (B tiles) on layer 4, drawn with tileset 4 unless said.
 */
const GRASS = 16;
const DIRT = 18;

/**
 * Eight objects, each its own tile, for rows no part of which matches any other.
 */
const ROW = [ 10, 11, 12, 13, 14, 15, 16, 17 ];

/**
 * Builds a map: a row of cells of a width, grass on the ground unless told otherwise, and objects on layer 4.
 * @param {number} width How many cells across.
 * @param {readonly number[]} objects The objects, cell by cell, 0 for none.
 * @param {{ ground?: boolean, tilesetId?: number, height?: number }} options Whether grass covers the ground, the
 * tileset, and how many rows the map has, the objects on the first.
 * @returns {PlacementGround} The map.
 */
const rowMap = (
  width: number,
  objects: readonly number[],
  options: { readonly ground?: boolean; readonly tilesetId?: number; readonly height?: number } = {},
): PlacementGround =>
{
  const { ground = true, tilesetId = 4, height = 1 } = options;
  const grid = blankGrid(width, height);
  if (ground)
  {
    fill(grid, 0, 0, width - 1, height - 1, 0, makeAutotileId(GRASS, 0));
  }

  objects.forEach((tileId, x) => put(grid, x, 0, 3, tileId));
  return { ...grid, tilesetId };
};

/**
 * Saves a piece of a map as a blueprint's stamp, every layer carried.
 * @param {PlacementGround} map The map.
 * @param {CellRect} rect The piece.
 * @returns {Stamp} The stamp.
 */
const pieceOf = (map: PlacementGround, rect: CellRect): Stamp =>
{
  const clip = captureClip(map, rect, 'auto');
  const { layers, values } = clip as NonNullable<typeof clip>;
  return stampOf({ width: rect.width, height: rect.height, tilesetId: map.tilesetId, tiles: { layers, values, calledFor: values.map(() => -1) }, events: [] });
};

describe('comparedLayers', () =>
{
  it('compares the tile layers a blueprint carries, leaving its shadows and regions out', () =>
  {
    // Arrange: every layer, beside one tile layer with the regions.
    const tiles = [ [ 0, 1, 2, 3, 4, 5 ], [ 3, 5 ] ].map(layers => ({ layers, values: [], calledFor: [] }));

    // Act.
    const compared = tiles.map(comparedLayers);

    // Assert.
    expect(compared)
      .toStrictEqual([ [ 0, 1, 2, 3 ], [ 3 ] ]);
  });

  it('compares the shadows and regions of a blueprint carrying no tile layer, so nothing is ever compared on nothing', () =>
  {
    // Arrange.
    const tiles = [ [ 4, 5 ], [ 5 ] ].map(layers => ({ layers, values: [], calledFor: [] }));

    // Act.
    const compared = tiles.map(comparedLayers);

    // Assert.
    expect(compared)
      .toStrictEqual([ [ 4, 5 ], [ 5 ] ]);
  });
});

describe('sameTile', () =>
{
  it('matches autotiles of one kind whatever their shapes, and never two kinds', () =>
  {
    // Arrange: grass in two shapes, beside grass and dirt in one.
    const pairs = [ [ makeAutotileId(GRASS, 0), makeAutotileId(GRASS, 46) ], [ makeAutotileId(GRASS, 5), makeAutotileId(DIRT, 5) ] ];

    // Act.
    const matches = pairs.map(([ expected, found ]) => sameTile(expected, found));

    // Assert.
    expect(matches)
      .toStrictEqual([ true, false ]);
  });

  it('matches every other tile exactly, and an empty cell only an empty one', () =>
  {
    // Arrange: an object and itself, an object and the next, an empty cell twice, and an empty cell beside an object.
    const pairs = [ [ 10, 10 ], [ 10, 11 ], [ 0, 0 ], [ 0, 10 ] ];

    // Act.
    const matches = pairs.map(([ expected, found ]) => sameTile(expected, found));

    // Assert.
    expect(matches)
      .toStrictEqual([ true, false, true, false ]);
  });
});

describe('checkPlacement', () =>
{
  it('finds a placement every compared tile of which matches in place, its autotiles by kind whatever their edges', () =>
  {
    // Arrange: the blueprint's grass in its own shape; on the map, the same grass reshaped by new neighbours.
    const stamp = pieceOf(rowMap(4, [ 10, 0, 11, 0 ]), { x: 0, y: 0, width: 4, height: 1 });
    const map = rowMap(6, [ 0, 10, 0, 11, 0, 0 ]);
    put(map, 2, 0, 0, makeAutotileId(GRASS, 33));

    // Act.
    const check = checkPlacement(map, { x: 1, y: 0 }, stamp);

    // Assert: four cells of grass and two objects.
    expect(check)
      .toStrictEqual({ kind: 'in-place', matched: 6, compared: 6 });
  });

  it('says the map uses another tileset now, whatever its tiles match', () =>
  {
    // Arrange: the very tiles the blueprint holds, on a map drawn with tileset 9.
    const stamp = pieceOf(rowMap(4, [ 10, 0, 11, 0 ]), { x: 0, y: 0, width: 4, height: 1 });

    // Act.
    const check = checkPlacement(rowMap(4, [ 10, 0, 11, 0 ], { tilesetId: 9 }), { x: 0, y: 0 }, stamp);

    // Assert.
    expect(check)
      .toStrictEqual({ kind: 'other-tileset' });
  });

  it('says a placement no part of which lies on the map any more is off it, past any edge', () =>
  {
    // Arrange: a blueprint two cells wide, on a map four wide.
    const stamp = pieceOf(rowMap(2, [ 10, 11 ]), { x: 0, y: 0, width: 2, height: 1 });
    const map = rowMap(4, [ 10, 11, 0, 0 ]);

    // Act.
    const checks = [ { x: -2, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 1 } ].map(spot => checkPlacement(map, spot, stamp));

    // Assert.
    expect(checks)
      .toStrictEqual([ { kind: 'off-map' }, { kind: 'off-map' }, { kind: 'off-map' } ]);
  });

  it('judges a placement hanging past the map\'s edge by the part still on the map', () =>
  {
    // Arrange: a blueprint of two objects whose left cell lies past the map's left edge.
    const stamp = pieceOf(rowMap(2, [ 10, 11 ]), { x: 0, y: 0, width: 2, height: 1 });

    // Act.
    const check = checkPlacement(rowMap(3, [ 11, 0, 0 ]), { x: -1, y: 0 }, stamp);

    // Assert: one cell of grass and one object compared.
    expect(check)
      .toStrictEqual({ kind: 'in-place', matched: 2, compared: 2 });
  });

  it('compares nothing a cell holds on neither side, so a blueprint of one object is judged by that object', () =>
  {
    // Arrange: a lone object over no ground at all; the map holds it, or holds nothing there.
    const stamp = pieceOf(rowMap(3, [ 0, 10, 0 ], { ground: false }), { x: 0, y: 0, width: 3, height: 1 });

    // Act.
    const checks = [ rowMap(3, [ 0, 10, 0 ], { ground: false }), rowMap(3, [ 0, 0, 0 ], { ground: false }) ]
      .map(map => checkPlacement(map, { x: 0, y: 0 }, stamp));

    // Assert.
    expect(checks)
      .toStrictEqual([ { kind: 'in-place', matched: 1, compared: 1 }, { kind: 'changed', matched: 0, compared: 1 } ]);
  });

  it('counts a tile the map holds where the blueprint holds none against the placement', () =>
  {
    // Arrange: a lone object with an empty cell beside it; the map adds an object there, and then one on layer 3 too.
    const stamp = pieceOf(rowMap(2, [ 10, 0 ], { ground: false }), { x: 0, y: 0, width: 2, height: 1 });
    const one = rowMap(2, [ 10, 12 ], { ground: false });
    const two = rowMap(2, [ 10, 12 ], { ground: false });
    put(two, 1, 0, 2, 13);

    // Act.
    const checks = [ one, two ].map(map => checkPlacement(map, { x: 0, y: 0 }, stamp));

    // Assert.
    expect(checks)
      .toStrictEqual([ { kind: 'in-place', matched: 1, compared: 2 }, { kind: 'changed', matched: 1, compared: 3 } ]);
  });

  it('keeps a placement half of whose tiles match in place, and takes one with fewer for changed', () =>
  {
    // Arrange: eight of one object, which no slide could tell apart, and an empty cell; four of the objects painted over,
    // then another object added in the empty cell too.
    const stamp = pieceOf(rowMap(9, [ 10, 10, 10, 10, 10, 10, 10, 10, 0 ], { ground: false }), { x: 0, y: 0, width: 9, height: 1 });
    const half = rowMap(9, [ 12, 12, 12, 12, 10, 10, 10, 10, 0 ], { ground: false });
    const less = rowMap(9, [ 12, 12, 12, 12, 10, 10, 10, 10, 12 ], { ground: false });

    // Act.
    const checks = [ half, less ].map(map => checkPlacement(map, { x: 0, y: 0 }, stamp));

    // Assert.
    expect(checks)
      .toStrictEqual([ { kind: 'in-place', matched: 4, compared: 8 }, { kind: 'changed', matched: 4, compared: 9 } ]);
  });

  it('finds a placement whose tiles slid a tile right, however much of it is grass that matches anywhere', () =>
  {
    // Arrange: two objects over grass; on the map, both a tile to the right, as when a map is shifted outside the editor.
    const stamp = pieceOf(rowMap(5, [ 0, 10, 11, 0, 0 ]), { x: 0, y: 0, width: 5, height: 1 });

    // Act.
    const check = checkPlacement(rowMap(5, [ 0, 0, 10, 11, 0 ]), { x: 0, y: 0 }, stamp);

    // Assert: five of the eight tiles still match, which alone would keep it in place.
    expect(check)
      .toStrictEqual({ kind: 'shifted', by: { x: 1, y: 0 }, matched: 5, compared: 8 });
  });

  it('takes a lone object nudged a tile for a hand edit, its two tiles too few to move the placement', () =>
  {
    // Arrange: one object over grass, a tile to the right on the map.
    const stamp = pieceOf(rowMap(5, [ 0, 10, 0, 0, 0 ]), { x: 0, y: 0, width: 5, height: 1 });

    // Act.
    const check = checkPlacement(rowMap(5, [ 0, 0, 10, 0, 0 ]), { x: 0, y: 0 }, stamp);

    // Assert.
    expect(check)
      .toStrictEqual({ kind: 'in-place', matched: 5, compared: 7 });
  });

  it('takes a placement for slid only when more of the tiles a slide changes read slid than read in place', () =>
  {
    // Arrange: eight objects over grass; the first four slid a tile right, or only the first three.
    const stamp = pieceOf(rowMap(8, ROW), { x: 0, y: 0, width: 8, height: 1 });
    const four = rowMap(8, [ 0, 10, 11, 12, 13, 15, 16, 17 ]);
    const three = rowMap(8, [ 0, 10, 11, 12, 14, 15, 16, 17 ]);

    // Act.
    const checks = [ four, three ].map(map => checkPlacement(map, { x: 0, y: 0 }, stamp));

    // Assert: three slid against four in place stays put.
    expect(checks)
      .toStrictEqual([ { kind: 'shifted', by: { x: 1, y: 0 }, matched: 11, compared: 16 }, { kind: 'in-place', matched: 12, compared: 16 } ]);
  });

  it('takes a placement for slid only when at least half the tiles a slide changes read slid', () =>
  {
    // Arrange: eight objects over grass; the first four slid a tile right and the rest painted over, or the first three.
    const stamp = pieceOf(rowMap(8, ROW), { x: 0, y: 0, width: 8, height: 1 });
    const four = rowMap(8, [ 0, 10, 11, 12, 13, 20, 20, 20 ]);
    const three = rowMap(8, [ 0, 10, 11, 12, 20, 20, 20, 20 ]);

    // Act.
    const checks = [ four, three ].map(map => checkPlacement(map, { x: 0, y: 0 }, stamp));

    // Assert: three of the seven tiles the slide changes is short of half.
    expect(checks)
      .toStrictEqual([ { kind: 'shifted', by: { x: 1, y: 0 }, matched: 8, compared: 16 }, { kind: 'in-place', matched: 8, compared: 16 } ]);
  });

  it('takes no slide when as many tiles read slid as in place, and a slide when exactly half of all it changes read slid', () =>
  {
    // Arrange: seven objects over grass, so a slide a tile right changes six of them; on one map the first three slid
    // that way and the last three stayed, three each; on the other the first three slid and the last three were painted
    // over, three of the six reading slid.
    const stamp = pieceOf(rowMap(7, ROW.slice(0, 7)), { x: 0, y: 0, width: 7, height: 1 });
    const tied = rowMap(7, [ 0, 10, 11, 12, 14, 15, 16 ]);
    const half = rowMap(7, [ 0, 10, 11, 12, 20, 20, 20 ]);

    // Act.
    const checks = [ tied, half ].map(map => checkPlacement(map, { x: 0, y: 0 }, stamp));

    // Assert.
    expect(checks)
      .toStrictEqual([ { kind: 'in-place', matched: 10, compared: 14 }, { kind: 'shifted', by: { x: 1, y: 0 }, matched: 7, compared: 14 } ]);
  });

  it('looks for a slide two tiles every way and no further', () =>
  {
    // Arrange: eight objects over no ground, slid two tiles left, or three.
    const stamp = pieceOf(rowMap(8, ROW, { ground: false }), { x: 0, y: 0, width: 8, height: 1 });
    const two = rowMap(8, [ ...ROW.slice(2), 0, 0 ], { ground: false });
    const three = rowMap(8, [ ...ROW.slice(3), 0, 0, 0 ], { ground: false });

    // Act.
    const checks = [ two, three ].map(map => checkPlacement(map, { x: 0, y: 0 }, stamp));

    // Assert.
    expect(checks)
      .toStrictEqual([ { kind: 'shifted', by: { x: -2, y: 0 }, matched: 0, compared: 8 }, { kind: 'changed', matched: 0, compared: 8 } ]);
  });

  it('finds a slide down and to the left, comparing one layer of objects where that is all the blueprint carries', () =>
  {
    // Arrange: a blueprint of layer 4 alone, three objects on a diagonal; on the map, each a tile down and to the left.
    const source = rowMap(4, [ 0, 0, 0, 0 ], { ground: false, height: 3 });
    [ [ 1, 0, 10 ], [ 2, 1, 11 ], [ 3, 2, 12 ] ].forEach(([ x, y, tileId ]) => put(source, x, y, 3, tileId));
    const { values } = captureClip(source, { x: 0, y: 0, width: 4, height: 3 }, 3) as NonNullable<ReturnType<typeof captureClip>>;
    const stamp = stampOf({ width: 4, height: 3, tiles: { layers: [ 3 ], values, calledFor: values.map(() => -1) }, events: [] });
    const map = rowMap(4, [ 0, 0, 0, 0 ], { ground: false, height: 3 });
    [ [ 0, 1, 10 ], [ 1, 2, 11 ] ].forEach(([ x, y, tileId ]) => put(map, x, y, 3, tileId));

    // Act.
    const check = checkPlacement(map, { x: 0, y: 0 }, stamp);

    // Assert.
    expect(check)
      .toStrictEqual({ kind: 'shifted', by: { x: -1, y: 1 }, matched: 0, compared: 5 });
  });
});

describe('placementProblem', () =>
{
  it('says nothing of a placement in place, and why every other one is no longer where it was', () =>
  {
    // Arrange: one of each, the slides every way there is to word.
    const checks = [
      { kind: 'in-place', matched: 4, compared: 5 },
      { kind: 'other-tileset' },
      { kind: 'off-map' },
      { kind: 'shifted', by: { x: 1, y: 0 }, matched: 5, compared: 8 },
      { kind: 'shifted', by: { x: 0, y: -2 }, matched: 5, compared: 8 },
      { kind: 'shifted', by: { x: -1, y: 1 }, matched: 5, compared: 8 },
      { kind: 'changed', matched: 3, compared: 20 },
      { kind: 'changed', matched: 0, compared: 1 },
    ] as const;

    // Act.
    const words = checks.map(placementProblem);

    // Assert.
    expect(words)
      .toStrictEqual([
        null,
        'the map uses another tileset now',
        'it lies past the edge of the map',
        'its tiles seem to have moved to the right',
        'its tiles seem to have moved up',
        'its tiles seem to have moved down and to the left',
        'only 3 of the 20 tiles there still match the blueprint',
        'none of the tiles there match the blueprint any more',
      ]);
  });
});
