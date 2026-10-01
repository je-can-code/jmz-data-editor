import { describe, expect, it } from 'vitest';
import {
  brushFootprint,
  brushValueAt,
  describeBrush,
  fitsTileset,
  regionBrush,
  SHADOW_BRUSH,
  singleTileBrush,
  tileBrush,
} from '../../../../src/mapEditor/core/tools/brush.ts';

/*
 * The brush every painting tool paints with.
 *
 * The palette and the eyedropper hand the tools a brush: a rectangle of values and what they are (tiles, region ids or
 * shadows). The contract the tools depend on is that a brush holds exactly what was picked, refuses anything that is
 * not a tile id or a region id before it can reach a map, and repeats its pattern from wherever a tool started, so a
 * brush of several tiles dragged across the map lays one seamless pattern rather than overlapping stamps, left of its
 * start as well as right. A tiles brush that names its tileset paints only on maps drawn with it, since the same id
 * draws another tileset's picture anywhere else; region ids and shadows paint on any map.
 */
describe('fitsTileset', () =>
{
  it('lets a tiles brush paint only on its own tileset\'s maps, and a region brush or a brush naming none anywhere', () =>
  {
    // Arrange: tiles from tileset 4, tiles naming no tileset, and regions picked on tileset 4's palette.
    const tiles = { ...singleTileBrush(2816), tilesetId: 4 };
    const unnamed = singleTileBrush(2816);
    const regions = { ...regionBrush(3), tilesetId: 4 };

    // Act: each on a map of tileset 4 and on a map of tileset 7.
    const fits = [ tiles, unnamed, regions ].map(brush => [ fitsTileset(brush, 4), fitsTileset(brush, 7) ]);

    // Assert.
    expect(fits)
      .toEqual([ [ true, false ], [ true, true ], [ true, true ] ]);
  });
});

describe('tileBrush', () =>
{
  it('holds the tiles exactly as given, an autotile in any shape', () =>
  {
    // Arrange: grass in shape 5 beside a tree.
    const tiles = [ 2816 + 5, 10 ];

    // Act.
    const brush = tileBrush(tiles, 2, 1);

    // Assert.
    expect(brush)
      .toEqual({ kind: 'tiles', width: 2, height: 1, cells: [ 2821, 10 ] });
  });

  it('refuses a rectangle whose size does not match its tiles', () =>
  {
    // Arrange: three tiles for a rectangle of four.
    const tiles = [ 1, 2, 3 ];

    // Act.
    const build = () => tileBrush(tiles, 2, 2);

    // Assert.
    expect(build)
      .toThrow('a 2x2 brush holds 4 tiles, not 3');
  });

  it('refuses a rectangle with no size', () =>
  {
    // Arrange: nothing at all.
    const tiles: number[] = [];

    // Act.
    const build = () => tileBrush(tiles, 0, 0);

    // Assert.
    expect(build)
      .toThrow('a brush is a whole number of cells across and down, not 0x0');
  });

  it('holds the last tile id and refuses the one past it', () =>
  {
    // Arrange: 8191 is the last A4 id; 8192 is past every sheet.
    const last = 8191;

    // Act.
    const brush = singleTileBrush(last);

    // Assert.
    expect(brush.cells)
      .toEqual([ 8191 ]);
    expect(() => singleTileBrush(last + 1))
      .toThrow('8192 is not a tile id');
  });
});

describe('regionBrush', () =>
{
  it('holds a region id from 0 to 255 and refuses 256', () =>
  {
    // Arrange: nothing to set up; the bounds are the engine's.

    // Act.
    const cleared = regionBrush(0);
    const highest = regionBrush(255);

    // Assert.
    expect([ cleared.cells, highest.cells, highest.kind ])
      .toEqual([ [ 0 ], [ 255 ], 'regions' ]);
    expect(() => regionBrush(256))
      .toThrow('a region is a whole number from 0 to 255, not 256');
  });
});

describe('brushValueAt', () =>
{
  it('repeats a pattern from its origin, right and down, and left and up of it too', () =>
  {
    // Arrange: a 2x2 brush of four different tiles, started at 10, 10.
    const brush = tileBrush([ 1, 2, 3, 4 ], 2, 2);
    const origin = { x: 10, y: 10 };

    // Act: the origin, one right, one down, one right and down, and one left and up of it.
    const values = [ [ 10, 10 ], [ 11, 10 ], [ 10, 11 ], [ 11, 11 ], [ 12, 12 ], [ 9, 9 ] ]
      .map(([ x, y ]) => brushValueAt(brush, x, y, origin));

    // Assert.
    expect(values)
      .toEqual([ 1, 2, 3, 4, 1, 4 ]);
  });

  it('answers 0 for the shadow brush, which holds no values', () =>
  {
    // Arrange.
    const origin = { x: 0, y: 0 };

    // Act.
    const value = brushValueAt(SHADOW_BRUSH, 3, 4, origin);

    // Assert.
    expect(value)
      .toBe(0);
  });
});

describe('brushFootprint', () =>
{
  it('lays the brush with its top-left corner on the cell, as MZ does', () =>
  {
    // Arrange.
    const brush = tileBrush([ 1, 2, 3, 4, 5, 6 ], 3, 2);

    // Act.
    const footprint = brushFootprint(brush, { x: 4, y: 7 });

    // Assert.
    expect(footprint)
      .toEqual({ x: 4, y: 7, width: 3, height: 2 });
  });
});

describe('describeBrush', () =>
{
  it('says what each kind of brush holds, and when nothing is picked', () =>
  {
    // Arrange.
    const brushes = [ null, singleTileBrush(2864), tileBrush([ 1, 2, 3, 4 ], 2, 2), regionBrush(7), SHADOW_BRUSH ];

    // Act.
    const words = brushes.map(describeBrush);

    // Assert.
    expect(words)
      .toEqual([ 'Nothing picked', 'Tile 2864', '2 by 2 tiles', 'Region 7', 'Shadows' ]);
  });
});
