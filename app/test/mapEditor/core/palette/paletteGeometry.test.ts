import { describe, expect, it } from 'vitest';
import { EMPTY_BRUSH } from '../../../../src/mapEditor/core/palette/paintSelection.ts';
import {
  badgeSize,
  brushForPick,
  brushFromRect,
  cellAtPoint,
  edgeAtPoint,
  flagClickAt,
  isOnBadge,
  paletteCellSize,
} from '../../../../src/mapEditor/core/palette/paletteGeometry.ts';
import { layoutPaletteTab } from '../../../../src/mapEditor/core/palette/paletteLayout.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';

/*
 * Where a click on the palette lands, and the brush a chosen rectangle makes.
 *
 * The palette draws eight cells across whatever width it has, so the cell under the pointer, the corner badge that
 * toggles a tile's "goes on top" mark, and the edge a passability click means are all worked out from the cell size;
 * a slip picks the neighbouring tile, or toggles a mark when a tile was meant to be picked. A rectangle chosen on the
 * regions tab paints regions, on any other tab tiles, and no rectangle paints nothing.
 */
const ALL_SHEETS = [ 'A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E' ];

describe('paletteCellSize', () =>
{
  it('fits eight cells across, never smaller than 16 pixels or larger than the sheets\' 48', () =>
  {
    // Arrange: a narrow panel, a usual one, one exactly wide enough, a wide one, and none at all.
    const widths = [ 100, 300, 384, 900, 0 ];

    // Act.
    const sizes = widths.map(paletteCellSize);

    // Assert.
    expect(sizes)
      .toStrictEqual([ 16, 37, 48, 48, 16 ]);
  });
});

describe('cellAtPoint', () =>
{
  it('finds the cell under a point, and nothing past the last column or row, or before the first', () =>
  {
    // Arrange: the world tileset's A tab has six rows; cells are 30 pixels.
    const layout = layoutPaletteTab('A', [ 'W1', 'W2', '', '', '', 'B', '', '', '' ]);

    // Act.
    const cells = [
      cellAtPoint(layout, 0, 0, 30),
      cellAtPoint(layout, 239, 179, 30),
      cellAtPoint(layout, 240, 10, 30),
      cellAtPoint(layout, 10, 180, 30),
      cellAtPoint(layout, -1, 10, 30),
    ];

    // Assert.
    expect(cells)
      .toStrictEqual([ { column: 0, row: 0 }, { column: 7, row: 5 }, null, null, null ]);
  });
});

describe('isOnBadge', () =>
{
  it('takes the square in a cell\'s top-right corner, in any cell, and nothing outside it', () =>
  {
    // Arrange: 30-pixel cells, whose badge is 10 pixels.
    const size = 30;

    // Act: the badge's own corner in the first cell and in the cell below-right, then just left of it and just below.
    const hits = [ isOnBadge(29, 0, size), isOnBadge(50, 39, size), isOnBadge(19, 0, size), isOnBadge(29, 10, size) ];

    // Assert.
    expect([ badgeSize(size), hits ])
      .toStrictEqual([ 10, [ true, true, false, false ] ]);
  });

  it('never lets the badge shrink below ten pixels, nor stop growing with the cell', () =>
  {
    // Arrange: a small cell and a large one.

    // Act.
    const sizes = [ badgeSize(16), badgeSize(48) ];

    // Assert.
    expect(sizes)
      .toStrictEqual([ 10, 16 ]);
  });
});

describe('edgeAtPoint', () =>
{
  it('reads a click as the way out across the nearest edge of its cell', () =>
  {
    // Arrange: 40-pixel cells; points near each edge of the second cell across.
    const size = 40;

    // Act.
    const edges = [ edgeAtPoint(60, 38, size), edgeAtPoint(41, 20, size), edgeAtPoint(79, 20, size), edgeAtPoint(60, 2, size) ];

    // Assert.
    expect(edges)
      .toStrictEqual([ 'down', 'left', 'right', 'up' ]);
  });

  it('settles a tie by the first way out listed, down before the rest', () =>
  {
    // Arrange: the very middle of a cell, as near every edge.

    // Act.
    const edge = edgeAtPoint(20, 20, 40);

    // Assert.
    expect(edge)
      .toBe('down');
  });
});

describe('flagClickAt', () =>
{
  it('reads a directions click as the way out nearest the point, and a terrain click as counting up or down', () =>
  {
    // Arrange: 40-pixel cells.

    // Act.
    const clicks = [
      flagClickAt('directions', 21, 39, 40, false),
      flagClickAt('terrain', 20, 20, 40, false),
      flagClickAt('terrain', 20, 20, 40, true),
    ];

    // Assert.
    expect(clicks)
      .toStrictEqual([ { mode: 'directions', direction: 'down' }, { mode: 'terrain', delta: 1 }, { mode: 'terrain', delta: -1 } ]);
  });

  it('reads any other click as the mode alone', () =>
  {
    // Arrange.

    // Act.
    const clicks = [ flagClickAt('passage', 5, 5, 40, true), flagClickAt('bush', 5, 5, 40, false) ];

    // Assert.
    expect(clicks)
      .toStrictEqual([ { mode: 'passage' }, { mode: 'bush' } ]);
  });
});

describe('brushFromRect', () =>
{
  it('paints tiles from a sheet tab', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('A', ALL_SHEETS);

    // Act.
    const brush = brushFromRect(layout, { column: 0, row: 2, columns: 2, rows: 1 }, 12);

    // Assert.
    expect(brush)
      .toStrictEqual({ kind: 'tiles', tilesetId: 12, width: 2, height: 1, cells: [ makeAutotileId(16, 0), makeAutotileId(17, 0) ] });
  });

  it('paints regions from the regions tab', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('R', ALL_SHEETS);

    // Act.
    const brush = brushFromRect(layout, { column: 3, row: 1, columns: 1, rows: 1 }, 12);

    // Assert.
    expect(brush)
      .toStrictEqual({ kind: 'regions', tilesetId: 12, width: 1, height: 1, cells: [ 11 ] });
  });

  it('paints nothing when no rectangle is chosen', () =>
  {
    // Arrange.
    const layout = layoutPaletteTab('B', ALL_SHEETS);

    // Act.
    const brush = brushFromRect(layout, null, 12);

    // Assert.
    expect(brush)
      .toBe(EMPTY_BRUSH);
  });
});

describe('brushForPick', () =>
{
  it('reads a pick from the tab it was made on, whatever tab shows now', () =>
  {
    // Arrange: B's first row, second and third cells.

    // Act.
    const brush = brushForPick(ALL_SHEETS, { kind: 'cells', tab: 'B', rect: { column: 1, row: 0, columns: 2, rows: 1 } }, 4);

    // Assert.
    expect(brush)
      .toStrictEqual({ kind: 'tiles', tilesetId: 4, width: 2, height: 1, cells: [ 1, 2 ] });
  });

  it('hands out the shadow pen, and nothing when nothing is picked', () =>
  {
    // Arrange.

    // Act.
    const brushes = [ brushForPick(ALL_SHEETS, { kind: 'shadow' }, 4), brushForPick(ALL_SHEETS, null, 4) ];

    // Assert.
    expect(brushes)
      .toStrictEqual([ { kind: 'shadows', tilesetId: 4, width: 1, height: 1, cells: [] }, EMPTY_BRUSH ]);
  });
});
