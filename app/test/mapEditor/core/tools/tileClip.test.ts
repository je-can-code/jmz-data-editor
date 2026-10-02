import { describe, expect, it } from 'vitest';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import type { CellChange, TileGrid } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { captureClip, clipGhosts, planPlaceClip } from '../../../../src/mapEditor/core/tools/tileClip.ts';
import { blankGrid, cellOf, fill, put, type TestGrid } from '../tiles/support/tileGridBuilder.ts';

/*
 * Moving and copying a piece of the map.
 *
 * The select tool lifts a rectangle of the map and puts it down elsewhere, and the contract is that it lands whole
 * and exactly: every layer it carries (all six under automatic layering, tiles, shadows and regions alike, or just the
 * chosen layer under manual layering), a move emptying where it came from even when the two overlap. Autotiles are
 * shaped where the piece meets new neighbours, and only there: a shape drawn by hand inside the piece survives the
 * trip whenever its new neighbours call for what its old ones did. With Shift held nothing is reshaped at all.
 */
const GRASS = 16;
const TREE = 10;

/**
 * Applies changes to a copy of a grid, the way the map document would.
 * @param {TileGrid} grid The map before.
 * @param {readonly CellChange[]} changes The changes.
 * @returns {TestGrid} The map after.
 */
const applied = (grid: TileGrid, changes: readonly CellChange[]): TestGrid =>
{
  const cells = Uint16Array.from(grid.cells);
  changes.forEach(([ index, value ]) =>
  {
    cells[index] = value;
  });

  return { width: grid.width, height: grid.height, cells };
};

/**
 * Builds an 8x3 map with a 3x3 block of grass on its left, joined all round in shape 0 except the centre, drawn by
 * hand in shape 5, and a tree, a shadow and region 4 on the block's centre.
 * @returns {TestGrid} The map.
 */
const field = (): TestGrid =>
{
  const grid = fill(blankGrid(8, 3), 0, 0, 2, 2, 0, makeAutotileId(GRASS, 0));
  put(grid, 1, 1, 0, makeAutotileId(GRASS, 5));
  put(grid, 1, 1, 3, TREE);
  put(grid, 1, 1, 4, 0b1001);
  return put(grid, 1, 1, 5, 4);
};

describe('captureClip', () =>
{
  it('carries all six layers under automatic layering, cut to the map', () =>
  {
    // Arrange.
    const grid = field();

    // Act: a rectangle hanging off the top-left corner, reaching the block's centre.
    const clip = captureClip(grid, { x: -1, y: -1, width: 3, height: 3 }, 'auto');

    // Assert: the 2x2 on the map, and the centre's tree, shadow and region among the values.
    expect([ clip?.source, clip?.layers, clip?.values.length, clip?.values.slice(3 * 4, 4 * 4) ])
      .toEqual([ { x: 0, y: 0, width: 2, height: 2 }, [ 0, 1, 2, 3, 4, 5 ], 24, [ 0, 0, 0, TREE ] ]);
  });

  it('carries only the chosen layer under manual layering, and nothing off the map', () =>
  {
    // Arrange.
    const grid = field();

    // Act.
    const clip = captureClip(grid, { x: 1, y: 1, width: 1, height: 1 }, 3);
    const offMap = captureClip(grid, { x: 9, y: 0, width: 1, height: 1 }, 'auto');

    // Assert.
    expect([ clip, offMap ])
      .toEqual([ { source: { x: 1, y: 1, width: 1, height: 1 }, layers: [ 3 ], values: [ TREE ] }, null ]);
  });
});

describe('planPlaceClip', () =>
{
  it('moves every carried layer, emptying the source, and keeps a hand-drawn shape inside the piece', () =>
  {
    // Arrange: the whole block lifted.
    const grid = field();
    const clip = captureClip(grid, { x: 0, y: 0, width: 3, height: 3 }, 'auto');
    if (clip === null)
    {
      throw new Error('the block should lift');
    }

    // Act: moved four cells right.
    const after = applied(grid, planPlaceClip(grid, clip, { at: { x: 4, y: 0 }, move: true, shaping: 'auto', mode: TilesetMode.area }));

    // Assert: the source empty; the centre kept its hand-drawn shape 5, tree, shadow and region.
    expect([ cellOf(after, 1, 1, 0), cellOf(after, 5, 1, 0), cellOf(after, 5, 1, 3), cellOf(after, 5, 1, 4), cellOf(after, 5, 1, 5) ])
      .toEqual([ 0, makeAutotileId(GRASS, 5), TREE, 0b1001, 4 ]);
  });

  it('reshapes the tiles along the piece\'s edge that meet new neighbours', () =>
  {
    // Arrange: the whole block lifted; its left column joined the map's edge, which counts as joined.
    const grid = field();
    const clip = captureClip(grid, { x: 0, y: 0, width: 3, height: 3 }, 'auto');
    if (clip === null)
    {
      throw new Error('the block should lift');
    }

    // Act.
    const after = applied(grid, planPlaceClip(grid, clip, { at: { x: 4, y: 0 }, move: true, shaping: 'auto', mode: TilesetMode.area }));

    // Assert: the new left column now faces empty cells, so it shows its edge.
    expect(cellOf(after, 4, 1, 0) === makeAutotileId(GRASS, 0))
      .toBe(false);
  });

  it('writes everything exactly as lifted with Shift held, edges included', () =>
  {
    // Arrange.
    const grid = field();
    const clip = captureClip(grid, { x: 0, y: 0, width: 3, height: 3 }, 'auto');
    if (clip === null)
    {
      throw new Error('the block should lift');
    }

    // Act.
    const after = applied(grid, planPlaceClip(grid, clip, { at: { x: 4, y: 0 }, move: true, shaping: 'exact', mode: TilesetMode.area }));

    // Assert.
    expect([ cellOf(after, 4, 1, 0), cellOf(after, 5, 1, 0) ])
      .toEqual([ makeAutotileId(GRASS, 0), makeAutotileId(GRASS, 5) ]);
  });

  it('copies without emptying the source', () =>
  {
    // Arrange: the centre cell's layer 4 alone, under manual layering.
    const grid = field();
    const clip = captureClip(grid, { x: 1, y: 1, width: 1, height: 1 }, 3);
    if (clip === null)
    {
      throw new Error('the tree should lift');
    }

    // Act.
    const after = applied(grid, planPlaceClip(grid, clip, { at: { x: 6, y: 2 }, move: false, shaping: 'auto', mode: TilesetMode.area }));

    // Assert: a tree in both places, and nothing of the ground copied.
    expect([ cellOf(after, 1, 1, 3), cellOf(after, 6, 2, 3), cellOf(after, 6, 2, 0) ])
      .toEqual([ TREE, TREE, 0 ]);
  });

  it('lands a move that overlaps its own source whole, and drops what falls off the map', () =>
  {
    // Arrange: a row of three trees on layer 4 of a 4x1 map.
    const grid = fill(blankGrid(4, 1), 0, 0, 2, 0, 3, TREE);
    put(grid, 0, 0, 3, TREE + 1);
    const clip = captureClip(grid, { x: 0, y: 0, width: 3, height: 1 }, 3);
    if (clip === null)
    {
      throw new Error('the row should lift');
    }

    // Act: moved two cells right, so its last tree falls off the map.
    const after = applied(grid, planPlaceClip(grid, clip, { at: { x: 2, y: 0 }, move: true, shaping: 'auto', mode: TilesetMode.area }));

    // Assert: the first two cells emptied, the row's first two trees landed.
    expect([ 0, 1, 2, 3 ].map(x => cellOf(after, x, 0, 3)))
      .toEqual([ 0, 0, TREE + 1, TREE ]);
  });
});

describe('clipGhosts', () =>
{
  it('shows the tiles carried on the tile layers where they would land, leaving out empty layers and the map\'s outside', () =>
  {
    // Arrange: the block's centre with everything it carries.
    const grid = field();
    const clip = captureClip(grid, { x: 1, y: 1, width: 2, height: 1 }, 'auto');
    if (clip === null)
    {
      throw new Error('the cells should lift');
    }

    // Act: dragged so its right cell hangs off the map.
    const ghosts = clipGhosts(clip, { x: 7, y: 0 }, grid);

    // Assert: the grass and the tree of the left cell; no shadow, no region, nothing past the edge.
    expect(ghosts)
      .toEqual([ { x: 7, y: 0, layer: 0, tileId: makeAutotileId(GRASS, 5) }, { x: 7, y: 0, layer: 3, tileId: TREE } ]);
  });
});
