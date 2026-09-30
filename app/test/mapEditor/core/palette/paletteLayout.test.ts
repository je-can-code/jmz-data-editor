import { describe, expect, it } from 'vitest';
import {
  cellAt,
  describeTile,
  displayShapeOf,
  displayTileOf,
  idsInRect,
  isTabAvailable,
  layoutPaletteTab,
  locateTile,
  rectBetween,
  sheetOfRow,
} from '../../../../src/mapEditor/core/palette/paletteLayout.ts';
import { autotileKind, isWallSideKind, isWallTopKind, makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';

/*
 * The palette's layout.
 *
 * The palette shows a tileset as MZ does, eight cells to a row: the A tab stacks the A sheets the tileset names, each
 * autotile kind as one ready-made tile rather than its raw block, so the tab reads as A1, A2, A3, then A4 with its
 * ceiling and wall face rows in turn, then A5's plain tiles; each of B to E is a tab of its 256 tiles, left half
 * first; the regions tab holds every region id. A sheet the tileset leaves empty is left out rather than shown blank.
 *
 * Each cell carries two ids: the one a brush made from it paints (an autotile in shape 0, which painting reshapes)
 * and the one it draws. A dragged rectangle becomes the brush's ids row by row, so any slip in the row, column or
 * sheet arithmetic paints the wrong tiles; every test here pins a neighbouring cell or sheet that must not be picked.
 */
const ALL_SHEETS = [ 'A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E' ];
const WORLD_SHEETS = [ 'World_A1', 'World_A2', '', '', '', 'World_B', 'World_C', '', '' ];
const DUNGEON_SHEETS = [ 'Dungeon_A1', 'Dungeon_A2', '', 'Dungeon_A4', 'Dungeon_A5', 'Dungeon_B', 'Dungeon_C', '', '' ];

describe('displayShapeOf', () =>
{
  it('shows water, ground and ceilings as the sample tile their block opens with', () =>
  {
    // Arrange: an A1 water kind, an A2 ground kind and an A4 ceiling.
    const kinds = [ 4, 16, 80 ];

    // Act.
    const shapes = kinds.map(displayShapeOf);

    // Assert.
    expect(shapes)
      .toStrictEqual([ 47, 47, 47 ]);
  });

  it('shows roofs, building walls and wall faces edged all round, and a waterfall with both sides edged', () =>
  {
    // Arrange: an A3 roof and building wall, an A4 wall face beside the ceilings above, and an A1 waterfall.
    const kinds = [ 48, 56, 88, 5 ];

    // Act.
    const shapes = kinds.map(displayShapeOf);

    // Assert.
    expect(shapes)
      .toStrictEqual([ 15, 15, 15, 3 ]);
  });
});

describe('displayTileOf', () =>
{
  it('draws an autotile given in any shape as its kind\'s ready-made tile', () =>
  {
    // Arrange: A2 kind 20 in shape 12, and the A4 wall face kind 88 in shape 0.
    const tiles = [ makeAutotileId(20, 12), makeAutotileId(88, 0) ];

    // Act.
    const drawn = tiles.map(displayTileOf);

    // Assert.
    expect(drawn)
      .toStrictEqual([ makeAutotileId(20, 47), makeAutotileId(88, 15) ]);
  });

  it('draws any other tile as it is', () =>
  {
    // Arrange: an A5 tile and a B tile.
    const tiles = [ TileId.A5 + 11, 5 ];

    // Act.
    const drawn = tiles.map(displayTileOf);

    // Assert.
    expect(drawn)
      .toStrictEqual([ TileId.A5 + 11, 5 ]);
  });
});

describe('isTabAvailable', () =>
{
  it('offers a sheet tab only when the tileset names one of its sheets, and the regions always', () =>
  {
    // Arrange: the world tileset names A1, A2, B and C alone.
    const tabs = [ 'A', 'B', 'C', 'D', 'E', 'R' ] as const;

    // Act.
    const available = tabs.map(tab => isTabAvailable(tab, WORLD_SHEETS));

    // Assert.
    expect(available)
      .toStrictEqual([ true, true, true, false, false, true ]);
  });

  it('offers no A tab to a tileset that names no A sheet', () =>
  {
    // Arrange.
    const upperOnly = [ '', '', '', '', '', 'B', '', '', '' ];

    // Act.
    const available = isTabAvailable('A', upperOnly);

    // Assert.
    expect(available)
      .toBe(false);
  });
});

describe('layoutPaletteTab', () =>
{
  it('stacks all five A sheets as rows of eight: A1, A2, A3, A4 and A5', () =>
  {
    // Arrange: a tileset naming every sheet.

    // Act.
    const layout = layoutPaletteTab('A', ALL_SHEETS);

    // Assert: 2, 4, 4, 6 and 16 rows, each section starting where the last ended.
    expect([ layout.rows, layout.cells.length, layout.sections ])
      .toStrictEqual([ 32, 256, [
        { sheet: 'A1', firstRow: 0, rows: 2 },
        { sheet: 'A2', firstRow: 2, rows: 4 },
        { sheet: 'A3', firstRow: 6, rows: 4 },
        { sheet: 'A4', firstRow: 10, rows: 6 },
        { sheet: 'A5', firstRow: 16, rows: 16 },
      ] ]);
  });

  it('gives each autotile cell its kind in shape 0 to paint and its ready-made tile to draw', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('A', ALL_SHEETS);

    // Act: the first cell (A1 ocean), the one beside it, and the first cell of A2's first row.
    const cells = [ cellAt(layout, 0, 0), cellAt(layout, 1, 0), cellAt(layout, 0, 2) ];

    // Assert.
    expect(cells)
      .toStrictEqual([
        { id: makeAutotileId(0, 0), picture: makeAutotileId(0, 47) },
        { id: makeAutotileId(1, 0), picture: makeAutotileId(1, 47) },
        { id: makeAutotileId(16, 0), picture: makeAutotileId(16, 47) },
      ]);
  });

  it('turns A4\'s rows between ceilings and wall faces, ceilings first', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('A', ALL_SHEETS);

    // Act: what every cell of each of A4's six rows is.
    const rows = [ 10, 11, 12, 13, 14, 15 ].map(row =>
    {
      const kinds = [ 0, 1, 2, 3, 4, 5, 6, 7 ].map(column => autotileKind((cellAt(layout, column, row) as { id: number }).id));
      if (kinds.every(isWallTopKind))
      {
        return 'ceiling';
      }

      return kinds.every(isWallSideKind) ? 'wall face' : 'mixed';
    });

    // Assert.
    expect(rows)
      .toStrictEqual([ 'ceiling', 'wall face', 'ceiling', 'wall face', 'ceiling', 'wall face' ]);
  });

  it('lays A5 out eight to a row in id order, from its first tile to its last', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('A', ALL_SHEETS);

    // Act: A5's first cell, the fourth cell of its second row, and its last cell.
    const cells = [ cellAt(layout, 0, 16), cellAt(layout, 3, 17), cellAt(layout, 7, 31) ];

    // Assert.
    expect(cells)
      .toStrictEqual([
        { id: TileId.A5, picture: TileId.A5 },
        { id: TileId.A5 + 11, picture: TileId.A5 + 11 },
        { id: TileId.A5 + 127, picture: TileId.A5 + 127 },
      ]);
  });

  it('leaves out the A sheets a tileset does not name, closing the gap', () =>
  {
    // Arrange: the dungeon tileset has no A3, so A4 follows A2 straight away.

    // Act.
    const layout = layoutPaletteTab('A', DUNGEON_SHEETS);

    // Assert: A4's first row holds the first ceiling, where A3 would otherwise have been.
    expect([ layout.rows, layout.sections.map(section => section.sheet), cellAt(layout, 0, 6)?.id ])
      .toStrictEqual([ 28, [ 'A1', 'A2', 'A4', 'A5' ], makeAutotileId(80, 0) ]);
  });

  it('shows only A1 and A2 for a world tileset', () =>
  {
    // Arrange.

    // Act.
    const layout = layoutPaletteTab('A', WORLD_SHEETS);

    // Assert: the last cell is A2's last kind.
    expect([ layout.rows, cellAt(layout, 7, 5)?.id ])
      .toStrictEqual([ 6, makeAutotileId(47, 0) ]);
  });

  it('lays out an upper sheet\'s left half, then its right half, in id order', () =>
  {
    // Arrange.

    // Act.
    const layout = layoutPaletteTab('B', ALL_SHEETS);

    // Assert: the right half starts on row 16.
    expect([ layout.rows, cellAt(layout, 0, 0)?.id, cellAt(layout, 7, 15)?.id, cellAt(layout, 0, 16)?.id, cellAt(layout, 7, 31)?.id ])
      .toStrictEqual([ 32, 0, 127, 128, 255 ]);
  });

  it('starts each upper tab at its own sheet\'s ids', () =>
  {
    // Arrange.

    // Act.
    const firsts = [ 'C', 'D', 'E' ].map(tab => cellAt(layoutPaletteTab(tab as 'C' | 'D' | 'E', ALL_SHEETS), 0, 0)?.id);

    // Assert.
    expect(firsts)
      .toStrictEqual([ TileId.C, TileId.D, TileId.E ]);
  });

  it('has no rows for a sheet the tileset leaves empty', () =>
  {
    // Arrange: the world tileset names no D.

    // Act.
    const layout = layoutPaletteTab('D', WORLD_SHEETS);

    // Assert.
    expect([ layout.rows, layout.cells, layout.sections ])
      .toStrictEqual([ 0, [], [] ]);
  });

  it('lays out every region id on the regions tab, 0 first', () =>
  {
    // Arrange.

    // Act.
    const layout = layoutPaletteTab('R', WORLD_SHEETS);

    // Assert.
    expect([ layout.rows, cellAt(layout, 0, 0), cellAt(layout, 1, 0)?.id, cellAt(layout, 7, 31)?.id ])
      .toStrictEqual([ 32, { id: 0, picture: 0 }, 1, 255 ]);
  });
});

describe('cellAt', () =>
{
  it('finds nothing past the eighth column, past the last row, or before the first', () =>
  {
    // Arrange: the world tileset's A tab, six rows.
    const layout = layoutPaletteTab('A', WORLD_SHEETS);

    // Act.
    const outside = [ cellAt(layout, 8, 0), cellAt(layout, 0, 6), cellAt(layout, -1, 0), cellAt(layout, 0, -1) ];

    // Assert: and the last cell inside is found.
    expect([ outside, cellAt(layout, 7, 5)?.id ])
      .toStrictEqual([ [ null, null, null, null ], makeAutotileId(47, 0) ]);
  });
});

describe('sheetOfRow', () =>
{
  it('names the sheet each row comes from, and nothing past the last', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('A', DUNGEON_SHEETS);

    // Act: A1's last row, A2's first, A4's first, A5's last, and one past it.
    const sheets = [ 1, 2, 6, 27, 28 ].map(row => sheetOfRow(layout, row));

    // Assert.
    expect(sheets)
      .toStrictEqual([ 'A1', 'A2', 'A4', 'A5', '' ]);
  });
});

describe('rectBetween', () =>
{
  it('covers a drag made in any direction', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('B', ALL_SHEETS);

    // Act: dragged up and to the left.
    const rect = rectBetween(layout, { column: 5, row: 3 }, { column: 2, row: 1 });

    // Assert.
    expect(rect)
      .toStrictEqual({ column: 2, row: 1, columns: 4, rows: 3 });
  });

  it('stops at the palette\'s edges when the drag goes past them', () =>
  {
    // Arrange: the world tileset's A tab, six rows.
    const layout = layoutPaletteTab('A', WORLD_SHEETS);

    // Act.
    const rect = rectBetween(layout, { column: 6, row: 4 }, { column: 12, row: 40 });

    // Assert.
    expect(rect)
      .toStrictEqual({ column: 6, row: 4, columns: 2, rows: 2 });
  });

  it('covers nothing on a tab with no rows', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('E', WORLD_SHEETS);

    // Act.
    const rect = rectBetween(layout, { column: 0, row: 0 }, { column: 3, row: 3 });

    // Assert.
    expect(rect)
      .toStrictEqual({ column: 0, row: 0, columns: 0, rows: 0 });
  });
});

describe('idsInRect', () =>
{
  it('reads a rectangle\'s ids row by row, and none of the cells around it', () =>
  {
    // Arrange: two by two from the second cell of the A tab's first row.
    const layout = layoutPaletteTab('A', ALL_SHEETS);

    // Act.
    const brush = idsInRect(layout, { column: 1, row: 0, columns: 2, rows: 2 });

    // Assert: kinds 1 and 2, then 9 and 10 beneath them; kinds 0, 3, 8 and 11 stay out.
    expect(brush)
      .toStrictEqual({ width: 2, height: 2, ids: [ 1, 2, 9, 10 ].map(kind => makeAutotileId(kind, 0)) });
  });

  it('leaves out the part of a rectangle hanging past the edge', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('B', ALL_SHEETS);

    // Act.
    const brush = idsInRect(layout, { column: 6, row: 31, columns: 4, rows: 3 });

    // Assert.
    expect(brush)
      .toStrictEqual({ width: 2, height: 1, ids: [ 254, 255 ] });
  });

  it('reads nothing from a rectangle with no cells', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('B', ALL_SHEETS);

    // Act.
    const brush = idsInRect(layout, { column: 3, row: 3, columns: 0, rows: 0 });

    // Assert.
    expect(brush)
      .toStrictEqual({ width: 0, height: 0, ids: [] });
  });
});

describe('locateTile', () =>
{
  it('finds an autotile in any shape at its kind\'s cell on the A tab', () =>
  {
    // Arrange: A4's first wall face, in shape 9, on the dungeon tileset (no A3).

    // Act.
    const place = locateTile(DUNGEON_SHEETS, makeAutotileId(88, 9));

    // Assert: A4 starts on row 6 there, so its wall faces start on row 7.
    expect(place)
      .toStrictEqual({ tab: 'A', column: 0, row: 7 });
  });

  it('finds A5 and upper tiles at their own cells', () =>
  {
    // Arrange.

    // Act: A5's twelfth tile, B's 131st (in the right half) and C's first.
    const places = [ TileId.A5 + 11, 130, TileId.C ].map(tileId => locateTile(ALL_SHEETS, tileId));

    // Assert.
    expect(places)
      .toStrictEqual([ { tab: 'A', column: 3, row: 17 }, { tab: 'B', column: 2, row: 16 }, { tab: 'C', column: 0, row: 0 } ]);
  });

  it('finds the empty tile at B\'s first cell', () =>
  {
    // Arrange.

    // Act.
    const place = locateTile(ALL_SHEETS, 0);

    // Assert.
    expect(place)
      .toStrictEqual({ tab: 'B', column: 0, row: 0 });
  });

  it('finds nothing for a tile whose sheet the tileset does not name, or an id no sheet holds', () =>
  {
    // Arrange: the world tileset has no A4 and no D.

    // Act.
    const places = [ makeAutotileId(80, 0), TileId.D + 3, 1100 ].map(tileId => locateTile(WORLD_SHEETS, tileId));

    // Assert.
    expect(places)
      .toStrictEqual([ null, null, null ]);
  });
});

describe('describeTile', () =>
{
  it('names autotiles by sheet, what they are, and their number on the sheet', () =>
  {
    // Arrange: A1's ocean, deep sea, an ocean decoration, water and a waterfall; A2 ground and a decoration; an A3
    // roof and building wall; an A4 ceiling and wall face.
    const kinds = [ 0, 1, 2, 4, 5, 16, 36, 48, 56, 80, 88 ];

    // Act.
    const names = kinds.map(kind => describeTile(makeAutotileId(kind, 3)));

    // Assert.
    expect(names)
      .toStrictEqual([
        'A1 ocean 1', 'A1 deep sea 2', 'A1 ocean decoration 3', 'A1 water 5', 'A1 waterfall 6',
        'A2 ground 1', 'A2 decoration 21', 'A3 roof 1', 'A3 building wall 9', 'A4 ceiling 1', 'A4 wall face 9',
      ]);
  });

  it('names plain tiles by sheet and number, and the empty tile and stray ids plainly', () =>
  {
    // Arrange.
    const tiles = [ TileId.A5 + 11, 123, TileId.E, 0, 1100 ];

    // Act.
    const names = tiles.map(describeTile);

    // Assert.
    expect(names)
      .toStrictEqual([ 'A5 tile 12', 'B tile 124', 'E tile 1', 'Empty', 'Tile 1100' ]);
  });
});
