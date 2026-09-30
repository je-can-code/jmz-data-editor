import { describe, expect, it } from 'vitest';
import {
  chunkCells,
  chunkGrid,
  chunkIndexOf,
  chunkRangeFor,
  dirtyChunksForCells,
  isChunkInRange,
} from '../../../src/mapEditor/render/chunkMath.ts';

/*
 * An edit redraws only the chunks it touched, so the chunk math decides both what an edit costs and whether it shows
 * at all: a change left out of the dirty set never reaches the screen. A cell's own chunk always redraws what reads
 * its layer; a change on layer 2 (index 1) also redraws the cell beneath, whose table edge it may have drawn, wrapping
 * to the top row on a map that loops down; the shadow layer redraws tiles but not passability; the region layer only
 * its overlay. Culling shows only the chunks the camera sees.
 */
describe('chunkMath', () =>
{
  describe('chunkGrid, chunkIndexOf and chunkCells', () =>
  {
    it('cuts a map into chunks, the last row and column stopping at the map\'s edge', () =>
    {
      // Arrange: a 40x20 map in 16-cell chunks: three across, two down.
      const grid = chunkGrid(40, 20, 16);

      // Act.
      const answers = [
        [ grid.columns, grid.rows ],
        chunkIndexOf(grid, 15, 0),
        chunkIndexOf(grid, 16, 0),
        chunkIndexOf(grid, 39, 19),
        chunkCells(grid, 0),
        chunkCells(grid, 5),
      ];

      // Assert.
      expect(answers)
        .toStrictEqual([
          [ 3, 2 ],
          0,
          1,
          5,
          { x0: 0, y0: 0, x1: 16, y1: 16 },
          { x0: 32, y0: 16, x1: 40, y1: 20 },
        ]);
    });
  });

  describe('dirtyChunksForCells', () =>
  {
    /**
     * Finds a cell's flat index in a 40x20 map's six layers.
     * @param {number} x The column.
     * @param {number} y The row.
     * @param {number} z The layer.
     * @returns {number} The index.
     */
    const at = (x: number, y: number, z: number): number => (z * 20 + y) * 40 + x;

    it('redraws the tiles and passability of a ground edit\'s own chunk, and nothing else', () =>
    {
      // Arrange: a layer 1 edit on a chunk's bottom row.
      const grid = chunkGrid(40, 20, 16);

      // Act.
      const dirty = dirtyChunksForCells(grid, [ at(3, 15, 0) ], false);

      // Assert.
      expect([ [ ...dirty.tiles ], [ ...dirty.passage ], [ ...dirty.regions ] ])
        .toStrictEqual([ [ 0 ], [ 0 ], [] ]);
    });

    it('also redraws the chunk beneath for a layer 2 edit on a chunk\'s bottom row, where a table\'s edge lands', () =>
    {
      // Arrange: a layer 2 edit on row 15, and one on row 14 whose cell beneath is in the same chunk.
      const grid = chunkGrid(40, 20, 16);

      // Act.
      const dirty = [ dirtyChunksForCells(grid, [ at(3, 15, 1) ], false), dirtyChunksForCells(grid, [ at(3, 14, 1) ], false) ];

      // Assert: row 16 is chunk 3; passability reads only the cell itself.
      expect(dirty.map(each => [ [ ...each.tiles ], [ ...each.passage ] ]))
        .toStrictEqual([ [ [ 0, 3 ], [ 0 ] ], [ [ 0 ], [ 0 ] ] ]);
    });

    it('wraps a bottom-row layer 2 edit onto the top row only on a map that loops down', () =>
    {
      // Arrange: a layer 2 edit on the map's last row.
      const grid = chunkGrid(40, 20, 16);

      // Act.
      const dirty = [ dirtyChunksForCells(grid, [ at(3, 19, 1) ], true), dirtyChunksForCells(grid, [ at(3, 19, 1) ], false) ];

      // Assert.
      expect(dirty.map(each => [ ...each.tiles ]))
        .toStrictEqual([ [ 3, 0 ], [ 3 ] ]);
    });

    it('redraws tiles but not passability for a shadow edit, and only the region overlay for a region edit', () =>
    {
      // Arrange.
      const grid = chunkGrid(40, 20, 16);

      // Act.
      const dirty = [ dirtyChunksForCells(grid, [ at(20, 5, 4) ], false), dirtyChunksForCells(grid, [ at(20, 5, 5) ], false) ];

      // Assert.
      expect(dirty.map(each => [ [ ...each.tiles ], [ ...each.passage ], [ ...each.regions ] ]))
        .toStrictEqual([ [ [ 1 ], [], [] ], [ [], [], [ 1 ] ] ]);
    });
  });

  describe('chunkRangeFor and isChunkInRange', () =>
  {
    it('shows the chunks a view overlaps, clipped to the map', () =>
    {
      // Arrange: 16-cell chunks of 48-pixel tiles are 768 pixels; the view spans x 700 to 1600, y -100 to 500.
      const grid = chunkGrid(40, 20, 16);

      // Act.
      const range = chunkRangeFor(grid, { x: 700, y: -100, width: 900, height: 600 }, 48);
      const shown = [ 0, 1, 2, 3, 4, 5 ].map(index => isChunkInRange(grid, range, index));

      // Assert.
      expect([ range, shown ])
        .toStrictEqual([ { cx0: 0, cy0: 0, cx1: 3, cy1: 1 }, [ true, true, true, false, false, false ] ]);
    });

    it('shows nothing when the view is off the map', () =>
    {
      // Arrange.
      const grid = chunkGrid(40, 20, 16);

      // Act.
      const range = chunkRangeFor(grid, { x: -2000, y: -2000, width: 500, height: 500 }, 48);

      // Assert.
      expect([ 0, 5 ].map(index => isChunkInRange(grid, range, index)))
        .toStrictEqual([ false, false ]);
    });
  });
});
