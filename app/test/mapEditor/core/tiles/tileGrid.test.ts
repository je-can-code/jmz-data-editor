import { describe, expect, it } from 'vitest';
import { cellIndex, gridReader, isInside, TileDraft } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { blankGrid, cellOf, put } from './support/tileGridBuilder.ts';

/*
 * The grid seam.
 *
 * The tile services read a map through the same six-layer array the map document keeps, indexed
 * (z * height + y) * width + x, and answer with [index, value] pairs the document turns straight into a tiles patch.
 * A draft stages a stroke's writes so every autotile can be shaped against the finished stroke, and it must never
 * write the grid underneath: the document only changes through patches, or nothing can undo it.
 */
describe('cellIndex', () =>
{
  it('lays the cells out layer by layer, row by row, as the map document does', () =>
  {
    // Arrange: a 4x3 map.
    const [ width, height ] = [ 4, 3 ];

    // Act.
    const indices = [ cellIndex(width, height, 0, 0, 0), cellIndex(width, height, 3, 0, 0), cellIndex(width, height, 0, 1, 0), cellIndex(width, height, 1, 2, 5) ];

    // Assert.
    expect(indices)
      .toEqual([ 0, 3, 4, 69 ]);
  });
});

describe('gridReader', () =>
{
  it('reads a cell on any layer, and 0 beyond the map', () =>
  {
    // Arrange.
    const grid = put(blankGrid(2, 2), 1, 1, 3, 77);
    const reader = gridReader(grid);

    // Act.
    const values = [ reader.tileAt(1, 1, 3), reader.tileAt(1, 1, 2), reader.tileAt(2, 1, 3), reader.tileAt(-1, 0, 0) ];

    // Assert.
    expect(values)
      .toEqual([ 77, 0, 0, 0 ]);
  });

  it('knows where the map ends', () =>
  {
    // Arrange.
    const reader = gridReader(blankGrid(2, 3));

    // Act.
    const inside = [ isInside(reader, 1, 2), isInside(reader, 2, 2), isInside(reader, 1, 3), isInside(reader, -1, 0) ];

    // Assert.
    expect(inside)
      .toEqual([ true, false, false, false ]);
  });
});

describe('TileDraft', () =>
{
  it('reads the grid until a cell is staged, then the staged value', () =>
  {
    // Arrange.
    const grid = put(put(blankGrid(2, 1), 0, 0, 0, 5), 1, 0, 0, 6);
    const draft = new TileDraft(grid);

    // Act.
    draft.setTile(0, 0, 0, 9);

    // Assert: the staged cell reads 9, its untouched neighbour still reads the grid, and the grid is unchanged.
    expect([ draft.tileAt(0, 0, 0), draft.tileAt(1, 0, 0), cellOf(grid, 0, 0, 0) ])
      .toEqual([ 9, 6, 5 ]);
  });

  it('ignores writes beyond the map and reads 0 there', () =>
  {
    // Arrange.
    const draft = new TileDraft(blankGrid(2, 2));

    // Act.
    draft.setTile(2, 0, 0, 9);

    // Assert.
    expect([ draft.tileAt(2, 0, 0), draft.changes() ])
      .toEqual([ 0, [] ]);
  });

  it('lists only the cells that end up different, in index order', () =>
  {
    // Arrange: cell (0,0) holds 5.
    const draft = new TileDraft(put(blankGrid(2, 2), 0, 0, 0, 5));

    // Act: stage (1,1), then (0,1), then (0,0) back to what it already holds.
    draft.setTile(1, 1, 0, 3);
    draft.setTile(0, 1, 0, 4);
    draft.setTile(0, 0, 0, 5);

    // Assert.
    expect(draft.changes())
      .toEqual([ [ 2, 4 ], [ 3, 3 ] ]);
  });
});
