import { describe, expect, it } from 'vitest';
import { cellsToReshape, reshapeAround, withReshapes } from '../../../../src/mapEditor/core/tiles/autotileRefresh.ts';
import { TilesetMode, WallEdge } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { cellIndex, gridReader, TileDraft } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { autotileShape, makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { blankGrid, fill, kindTile, put } from './support/tileGridBuilder.ts';

/*
 * Reshaping after a change.
 *
 * When tiles change, every autotile that reads them must be reshaped, and nothing else. Too little leaves a seam
 * where a coastline or wall edge no longer matches what is beside it; too much quietly redraws tiles somebody drew
 * with Shift held on purpose, far from where they painted. So the area reshaped is each changed cell and its eight
 * neighbours, plus the wall faces hanging below a changed cell and the cells either side of them, since a wall
 * face's side edges depend on where its column's wall starts.
 */
const GRASS = 16;
const DIRT = 17;
const CEILING = 80;
const WALL = 88;

describe('cellsToReshape', () =>
{
  it('takes each changed cell and its eight neighbours, clipped to the map', () =>
  {
    // Arrange: a 4x4 map with a change in its top-left corner.
    const reader = gridReader(blankGrid(4, 4));

    // Act.
    const cells = cellsToReshape(reader, [ [ 0, 0 ] ]);

    // Assert: four cells inside the map; (2, 0), two steps away, is not among them.
    expect(cells)
      .toEqual([ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ]);
  });

  it('follows the wall faces hanging below a changed cell, with the cells either side', () =>
  {
    // Arrange: a wall column two tall under row 0, then floor at row 3 on a 3x5 map.
    const grid = fill(blankGrid(3, 5), 1, 1, 1, 2, 0, kindTile(WALL));

    // Act.
    const cells = cellsToReshape(gridReader(grid), [ [ 1, 0 ] ]);

    // Assert: rows 0 and 1 from the neighbourhood, row 2 from the wall; row 3 holds no wall face and stops the walk.
    expect(cells.filter(([ , y ]) => y >= 2))
      .toEqual([ [ 0, 2 ], [ 1, 2 ], [ 2, 2 ] ]);
  });
});

describe('reshapeAround', () =>
{
  it('reshapes the neighbours of a changed cell but leaves a stale tile further off alone', () =>
  {
    // Arrange: grass across a 4x1 map, the last tile stored in a wrong shape; dirt is staged at (0,0).
    const grid = put(fill(blankGrid(4, 1), 0, 0, 3, 0, 0, kindTile(GRASS)), 3, 0, 0, makeAutotileId(GRASS, 5));
    const draft = new TileDraft(grid);
    draft.setTile(0, 0, 0, kindTile(DIRT));

    // Act.
    reshapeAround(draft, [ [ 0, 0 ] ], TilesetMode.area);

    // Assert: (1,0) now shows its west edge, while (3,0), three cells off, keeps the wrong shape it was drawn with.
    expect([ autotileShape(draft.tileAt(1, 0, 0)), autotileShape(draft.tileAt(3, 0, 0)) ])
      .toEqual([ 16, 5 ]);
  });

  it('leaves a hand-shaped neighbour alone when the change does not alter what it joins', () =>
  {
    // Arrange: grass drawn in a wrong shape at (0,0); a rock is staged at (1,0), which grass never joins anyway.
    const grid = put(blankGrid(2, 1), 0, 0, 0, makeAutotileId(GRASS, 5));
    const draft = new TileDraft(grid);
    draft.setTile(1, 0, 0, 1536);

    // Act.
    reshapeAround(draft, [ [ 1, 0 ] ], TilesetMode.area);

    // Assert: the empty cell before and the rock after both leave the grass's east side open, so it keeps shape 5.
    expect(draft.changes())
      .toEqual([ [ 1, 1536 ] ]);
  });

  it('moves the side edges of every row of a wall when the wall beside it grows taller', () =>
  {
    // Arrange: two wall columns under a ceiling row, both starting at row 1; then column 0 grows up into row 0.
    const grid = blankGrid(2, 4);
    fill(grid, 0, 0, 1, 0, 0, kindTile(CEILING));
    fill(grid, 0, 1, 1, 2, 0, kindTile(WALL));
    const draft = new TileDraft(grid);
    draft.setTile(0, 0, 0, kindTile(WALL));

    // Act.
    reshapeAround(draft, [ [ 0, 0 ] ], TilesetMode.area);

    // Assert: column 1's wall is now the shorter one, so its row 2, two rows below the change, opens toward it.
    expect(autotileShape(draft.tileAt(1, 2, 0)) & WallEdge.left)
      .toBe(WallEdge.left);
  });
});

describe('withReshapes', () =>
{
  it('returns the writes together with the reshapes they cause', () =>
  {
    // Arrange: grass across a 3x1 map; dirt is written into the middle.
    const grid = fill(blankGrid(3, 1), 0, 0, 2, 0, 0, kindTile(GRASS));
    const write = [ cellIndex(3, 1, 1, 0, 0), kindTile(DIRT) ] as const;

    // Act.
    const changes = withReshapes(grid, [ write ], TilesetMode.area);

    // Assert: the grass either side opens toward the dirt, and the dirt joins only the map's edges above and below.
    expect(changes)
      .toEqual([ [ 0, makeAutotileId(GRASS, 24) ], [ 1, makeAutotileId(DIRT, 32) ], [ 2, makeAutotileId(GRASS, 16) ] ]);
  });

  it('writes shadows and regions without reshaping anything', () =>
  {
    // Arrange: a lone grass tile stored in the wrong shape, beside the region cell being written.
    const grid = put(blankGrid(2, 1), 0, 0, 0, makeAutotileId(GRASS, 5));
    const regionWrite = [ cellIndex(2, 1, 1, 0, 5), 7 ] as const;

    // Act.
    const changes = withReshapes(grid, [ regionWrite ], TilesetMode.area);

    // Assert: only the region; the grass keeps its shape.
    expect(changes)
      .toEqual([ regionWrite ]);
  });
});
