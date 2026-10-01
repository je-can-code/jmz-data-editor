import { describe, expect, it } from 'vitest';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import type { LayerChoice, Shaping } from '../../../../src/mapEditor/core/tiles/layering.ts';
import { cellIndex, type CellChange, type TileGrid } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { regionBrush, SHADOW_BRUSH, singleTileBrush, tileBrush } from '../../../../src/mapEditor/core/tools/brush.ts';
import {
  fillCells,
  hasShadow,
  pickBrush,
  planBrush,
  planErase,
  planFill,
  planShadowQuarters,
  planSwap,
  shadowQuarterAt,
  type PaintContext,
} from '../../../../src/mapEditor/core/tools/paintPlan.ts';
import { blankGrid, cellOf, fill, kindTile, put, type TestGrid } from '../tiles/support/tileGridBuilder.ts';
import { layeringWith, stackAt } from './support/paintFixtures.ts';

/*
 * What each painting tool writes.
 *
 * These services decide every cell a tool changes, and they are what makes the tools trustworthy: tiles always go
 * through the layering engine and the autotile refresh (so ground replaces ground and keeps what lies over it, and
 * autotiles fit their neighbours), a region brush writes only the region layer, and the shadow pen only the quarters
 * it crossed. Shift writes exactly and reshapes nothing. Under automatic layering the eraser does what B's empty tile
 * does in MZ's auto mode: it clears the B to E tiles on layers 3 and 4, and keeps the ground, the decorations and any A
 * tile laid up there by hand, so wiping an object off the map never takes the ground from under it; under manual
 * layering, or with the override held, it clears exactly the chosen layer. A fill spreads over exactly the area
 * clicked, a ground fill passing under what lies over the ground; a swap replaces every copy of the tile clicked and
 * nothing like it; and the eyedropper picks tiles exactly as stored. None of them writes the map: each answers with
 * the cells to change.
 *
 * Every rule is pinned with a near miss: a neighbour that must not be reshaped, a cell outside the area that must
 * not be filled, a kind like the one swapped that must be left.
 */
const GRASS = 16;
const DIRT = 18;
const TALL_GRASS = 20;
const CLIFF_CORNER = TileId.A5 + 122;
const ROCK = TileId.A5 + 97;
const TREE = 10;
const BUSH = 11;

/**
 * Builds what a stroke paints with.
 * @param {LayerChoice} choice The layer choice.
 * @param {Shaping} shaping Whether autotiles are shaped.
 * @param {number[]} marked The plain tiles marked to go on top.
 * @returns {PaintContext} The context.
 */
const contextWith = (choice: LayerChoice = 'auto', shaping: Shaping = 'auto', marked: number[] = []): PaintContext =>
{
  return { layering: layeringWith(marked), choice, shaping };
};

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

describe('planBrush', () =>
{
  it('paints tiles through the layering engine: ground replaces ground and keeps the tree above it', () =>
  {
    // Arrange: grass under a tree in the left cell, grass alone in the right.
    const grid = fill(blankGrid(2, 1), 0, 0, 1, 0, 0, kindTile(GRASS));
    put(grid, 0, 0, 3, TREE);

    // Act: dirt painted on the left cell only.
    const after = applied(grid, planBrush(grid, singleTileBrush(kindTile(DIRT)), [ { x: 0, y: 0 } ], { x: 0, y: 0 }, contextWith()));

    // Assert: the tree stays; the grass beside it is untouched but for its shape.
    expect([ stackAt(after, 0, 0), stackAt(after, 1, 0) ])
      .toEqual([ [ 'k18', 0, 0, TREE ], [ 'k16', 0, 0, 0 ] ]);
  });

  it('repeats a brush of several tiles from its origin over every cell reached', () =>
  {
    // Arrange: a 2x1 brush of a tree and a bush, and an empty 3x1 map.
    const grid = blankGrid(3, 1);
    const brush = tileBrush([ TREE, BUSH ], 2, 1);

    // Act: all three cells, the pattern starting at the first.
    const after = applied(grid, planBrush(grid, brush, [ { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 } ], { x: 0, y: 0 }, contextWith()));

    // Assert.
    expect([ cellOf(after, 0, 0, 3), cellOf(after, 1, 0, 3), cellOf(after, 2, 0, 3) ])
      .toEqual([ TREE, BUSH, TREE ]);
  });

  it('writes the exact shape with Shift held and leaves the neighbour\'s shape alone', () =>
  {
    // Arrange: grass drawn by hand in shape 5 on the left.
    const grid = put(blankGrid(2, 1), 0, 0, 0, makeAutotileId(GRASS, 5));
    const brush = singleTileBrush(makeAutotileId(GRASS, 9));

    // Act: the same brush painted on the right, with Shift and without.
    const exact = planBrush(grid, brush, [ { x: 1, y: 0 } ], { x: 1, y: 0 }, contextWith('auto', 'exact'));
    const shaped = planBrush(grid, brush, [ { x: 1, y: 0 } ], { x: 1, y: 0 }, contextWith());

    // Assert: exactly the one cell in shape 9; shaping joins both cells instead.
    expect([ exact, shaped ])
      .toEqual([ [ [ 1, makeAutotileId(GRASS, 9) ] ], [ [ 0, makeAutotileId(GRASS, 0) ], [ 1, makeAutotileId(GRASS, 0) ] ] ]);
  });

  it('writes region ids to the region layer alone, skipping cells that already hold one and cells off the map', () =>
  {
    // Arrange: grass everywhere, region 7 already on the middle cell.
    const grid = fill(blankGrid(3, 1), 0, 0, 2, 0, 0, kindTile(GRASS));
    put(grid, 1, 0, 5, 7);

    // Act.
    const changes = planBrush(grid, regionBrush(7), [ { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 } ], { x: 0, y: 0 }, contextWith());

    // Assert: the left cell's region, and nothing else.
    expect(changes)
      .toEqual([ [ cellIndex(3, 1, 0, 0, 5), 7 ] ]);
  });

  it('shadows every quarter of each cell with a shadows brush, keeping any bit above the quarters', () =>
  {
    // Arrange: the left cell already shadowed at its top-left, with a stray high bit; the right cell bare.
    const grid = put(blankGrid(2, 1), 0, 0, 4, 0b1_0000_0001);

    // Act.
    const after = applied(grid, planBrush(grid, SHADOW_BRUSH, [ { x: 0, y: 0 }, { x: 1, y: 0 } ], { x: 0, y: 0 }, contextWith()));

    // Assert.
    expect([ cellOf(after, 0, 0, 4), cellOf(after, 1, 0, 4) ])
      .toEqual([ 0b1_0000_1111, 0b1111 ]);
  });
});

describe('planErase', () =>
{
  /**
   * Builds a 2x1 map: on the left grass, tall grass, a tree and a bush over a shadow and region 3; on the right grass
   * alone, joined to the left.
   * @returns {TestGrid} The map.
   */
  const stacked = (): TestGrid =>
  {
    const grid = fill(blankGrid(2, 1), 0, 0, 1, 0, 0, makeAutotileId(GRASS, 0));
    put(grid, 0, 0, 1, kindTile(TALL_GRASS));
    put(grid, 0, 0, 2, TREE);
    put(grid, 0, 0, 3, BUSH);
    put(grid, 0, 0, 4, 0b0011);
    return put(grid, 0, 0, 5, 3);
  };

  it('clears the B to E tiles on layers 3 and 4 under automatic layering, keeping the ground, the decoration, the shadow and the region', () =>
  {
    // Arrange.
    const grid = stacked();

    // Act.
    const changes = planErase(grid, 'tiles', [ { x: 0, y: 0 } ], contextWith());
    const after = applied(grid, changes);

    // Assert: only the tree and the bush go; the grass, the tall grass, the shadow, the region and the grass beside
    // them stay exactly as they were.
    expect([ changes, stackAt(after, 0, 0), cellOf(after, 0, 0, 4), cellOf(after, 0, 0, 5) ])
      .toEqual([ [ [ cellIndex(2, 1, 0, 0, 2), 0 ], [ cellIndex(2, 1, 0, 0, 3), 0 ] ], [ 'k16', 'k20', 0, 0 ], 0b0011, 3 ]);
  });

  it('keeps an A tile laid on layer 3 by hand when erasing automatically, while the tree above it goes', () =>
  {
    // Arrange: grass, the cliff corner laid on layer 3, and a tree on layer 4.
    const grid = put(put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 2, CLIFF_CORNER), 0, 0, 3, TREE);

    // Act.
    const after = applied(grid, planErase(grid, 'tiles', [ { x: 0, y: 0 } ], contextWith()));

    // Assert.
    expect(stackAt(after, 0, 0))
      .toEqual([ 'k16', 0, CLIFF_CORNER, 0 ]);
  });

  it('clears only the chosen layer under manual layering', () =>
  {
    // Arrange.
    const grid = stacked();

    // Act: layer 3 chosen.
    const after = applied(grid, planErase(grid, 'tiles', [ { x: 0, y: 0 } ], contextWith(2)));

    // Assert.
    expect(stackAt(after, 0, 0))
      .toEqual([ 'k16', 'k20', 0, BUSH ]);
  });

  it('reshapes the neighbour of an autotile it clears, and leaves the neighbour\'s shape alone with Shift held', () =>
  {
    // Arrange.
    const grid = stacked();

    // Act: layer 1 chosen and cleared from the left cell, without Shift and with it.
    const shaped = planErase(grid, 'tiles', [ { x: 0, y: 0 } ], contextWith(0)).map(([ index ]) => index);
    const exact = planErase(grid, 'tiles', [ { x: 0, y: 0 } ], contextWith(0, 'exact')).map(([ index ]) => index);

    // Assert: the left cell's ground both times; the grass beside it shows its new edge only without Shift.
    expect([ shaped, exact ])
      .toEqual([ [ 0, 1 ], [ 0 ] ]);
  });

  it('clears the region for a regions brush and the quarters for a shadows brush, leaving the tiles', () =>
  {
    // Arrange: a stray high bit in the shadow, which clearing the quarters must keep.
    const grid = put(stacked(), 0, 0, 4, 0b1_0000_0011);

    // Act.
    const regions = applied(grid, planErase(grid, 'regions', [ { x: 0, y: 0 } ], contextWith()));
    const shadows = applied(grid, planErase(grid, 'shadows', [ { x: 0, y: 0 } ], contextWith()));

    // Assert.
    expect([ cellOf(regions, 0, 0, 5), stackAt(regions, 0, 0), cellOf(shadows, 0, 0, 4), stackAt(shadows, 0, 0) ])
      .toEqual([ 0, [ 'k16', 'k20', TREE, BUSH ], 0b1_0000_0000, [ 'k16', 'k20', TREE, BUSH ] ]);
  });
});

describe('shadowQuarterAt and hasShadow', () =>
{
  it('finds each quarter of a tile by where the point falls in it', () =>
  {
    // Arrange: points in the four quarters of tile 1, 2 at 48 pixels a tile.
    const points = [ [ 50, 100 ], [ 90, 100 ], [ 50, 130 ], [ 90, 130 ] ];

    // Act.
    const quarters = points.map(([ x, y ]) => shadowQuarterAt(x, y, 48));

    // Assert.
    expect(quarters)
      .toEqual([ { x: 1, y: 2, quarter: 0 }, { x: 1, y: 2, quarter: 1 }, { x: 1, y: 2, quarter: 2 }, { x: 1, y: 2, quarter: 3 } ]);
  });

  it('reads a quarter\'s shadow bit, and no shadow off the map', () =>
  {
    // Arrange: tile 0, 0 shadowed at its top-right only.
    const grid = put(blankGrid(1, 1), 0, 0, 4, 0b0010);

    // Act.
    const shadowed = [ 0, 1, 2, 3 ].map(quarter => hasShadow(grid, { x: 0, y: 0, quarter }));
    const offMap = hasShadow(grid, { x: 1, y: 0, quarter: 1 });

    // Assert.
    expect([ shadowed, offMap ])
      .toEqual([ [ false, true, false, false ], false ]);
  });
});

describe('planShadowQuarters', () =>
{
  it('adds the quarters crossed, gathering several in one tile into one change', () =>
  {
    // Arrange: a bare 2x1 map.
    const grid = blankGrid(2, 1);

    // Act: both top quarters of the left tile.
    const changes = planShadowQuarters(grid, [ { x: 0, y: 0, quarter: 0 }, { x: 0, y: 0, quarter: 1 } ], true);

    // Assert.
    expect(changes)
      .toEqual([ [ cellIndex(2, 1, 0, 0, 4), 0b0011 ] ]);
  });

  it('removes the quarters crossed, leaving tiles whose quarters were already clear unchanged', () =>
  {
    // Arrange: the left tile fully shadowed, the right bare.
    const grid = put(blankGrid(2, 1), 0, 0, 4, 0b1111);

    // Act: the left tile's top-left quarter and the right tile's.
    const changes = planShadowQuarters(grid, [ { x: 0, y: 0, quarter: 0 }, { x: 1, y: 0, quarter: 0 } ], false);

    // Assert.
    expect(changes)
      .toEqual([ [ cellIndex(2, 1, 0, 0, 4), 0b1110 ] ]);
  });
});

describe('fillCells and planFill', () =>
{
  /**
   * Builds a 4x2 map: grass across the top row, a tree over the second grass cell, and dirt across the bottom row.
   * @returns {TestGrid} The map.
   */
  const meadow = (): TestGrid =>
  {
    const grid = fill(blankGrid(4, 2), 0, 0, 3, 0, 0, kindTile(GRASS));
    fill(grid, 0, 1, 3, 1, 0, kindTile(DIRT));
    return put(grid, 1, 0, 3, TREE);
  };

  it('spreads a ground fill over the ground alone, under the tree, and not into the dirt beside it', () =>
  {
    // Arrange.
    const grid = meadow();

    // Act.
    const cells = fillCells(grid, singleTileBrush(ROCK), { x: 0, y: 0 }, contextWith()).map(({ x, y }) => `${x},${y}`).sort();

    // Assert.
    expect(cells)
      .toEqual([ '0,0', '1,0', '2,0', '3,0' ]);
  });

  it('spreads anything laid over the ground only over cells that look the same, so it stops at the tree', () =>
  {
    // Arrange.
    const grid = meadow();

    // Act: a bush filled from the first grass cell.
    const cells = fillCells(grid, singleTileBrush(BUSH), { x: 0, y: 0 }, contextWith()).map(({ x, y }) => `${x},${y}`);

    // Assert: the tree's cell holds the fill back from the grass beyond it.
    expect(cells)
      .toEqual([ '0,0' ]);
  });

  it('compares the chosen layer alone under manual layering', () =>
  {
    // Arrange.
    const grid = meadow();

    // Act: layer 4 chosen, filled from an empty top.
    const cells = fillCells(grid, singleTileBrush(BUSH), { x: 0, y: 1 }, contextWith(3)).length;

    // Assert: every cell but the tree's has an empty layer 4.
    expect(cells)
      .toBe(7);
  });

  it('spreads a region fill over one region id', () =>
  {
    // Arrange: region 2 on the left half, region 0 on the right.
    const grid = fill(blankGrid(4, 1), 0, 0, 1, 0, 5, 2);

    // Act.
    const after = applied(grid, planFill(grid, regionBrush(9), { x: 0, y: 0 }, contextWith()));

    // Assert.
    expect([ 0, 1, 2, 3 ].map(x => cellOf(after, x, 0, 5)))
      .toEqual([ 9, 9, 0, 0 ]);
  });

  it('lays a brush of several tiles from the cell clicked, through the layering engine', () =>
  {
    // Arrange: the meadow, filled from its second cell with a pattern of rock and dirt.
    const grid = meadow();
    const brush = tileBrush([ ROCK, kindTile(DIRT) ], 2, 1);

    // Act.
    const after = applied(grid, planFill(grid, brush, { x: 1, y: 0 }, contextWith()));

    // Assert: dirt to the left of the start, rock on it, and the tree kept.
    expect([ stackAt(after, 0, 0), stackAt(after, 1, 0), stackAt(after, 2, 0), stackAt(after, 1, 1) ])
      .toEqual([ [ 'k18', 0, 0, 0 ], [ ROCK, 0, 0, TREE ], [ 'k18', 0, 0, 0 ], [ 'k18', 0, 0, 0 ] ]);
  });
});

describe('planSwap', () =>
{
  /**
   * Builds a 3x2 map: grass in the top row (with the paired grass kind beside it as a near miss), a tree and a bush
   * over the bottom row's dirt, and the cliff corner laid over one dirt cell.
   * @returns {TestGrid} The map.
   */
  const village = (): TestGrid =>
  {
    const grid = fill(blankGrid(3, 2), 0, 0, 1, 0, 0, kindTile(GRASS));
    put(grid, 2, 0, 0, kindTile(GRASS + 1));
    fill(grid, 0, 1, 2, 1, 0, kindTile(DIRT));
    put(grid, 0, 1, 3, TREE);
    put(grid, 1, 1, 3, BUSH);
    return put(grid, 2, 1, 1, CLIFF_CORNER);
  };

  it('replaces every copy of the ground clicked with a ground tile, and not the kind beside it', () =>
  {
    // Arrange.
    const grid = village();

    // Act: clicking grass with a rock brush.
    const after = applied(grid, planSwap(grid, singleTileBrush(ROCK), { x: 0, y: 0 }, contextWith()));

    // Assert.
    expect([ cellOf(after, 0, 0, 0), cellOf(after, 1, 0, 0), stackAt(after, 2, 0) ])
      .toEqual([ ROCK, ROCK, [ 'k17', 0, 0, 0 ] ]);
  });

  it('replaces the top of the stack clicked with a B to E tile', () =>
  {
    // Arrange.
    const grid = village();

    // Act: clicking the tree with a bush brush.
    const after = applied(grid, planSwap(grid, singleTileBrush(BUSH), { x: 0, y: 1 }, contextWith()));

    // Assert: the tree became a bush; the bush that was there stays one.
    expect([ cellOf(after, 0, 1, 3), cellOf(after, 1, 1, 3) ])
      .toEqual([ BUSH, BUSH ]);
  });

  it('replaces whatever lies on top of the cell clicked with a marked tile', () =>
  {
    // Arrange.
    const grid = village();

    // Act: clicking the cliff corner with rock marked to go on top.
    const after = applied(grid, planSwap(grid, singleTileBrush(ROCK), { x: 2, y: 1 }, contextWith('auto', 'auto', [ ROCK ])));

    // Assert.
    expect(stackAt(after, 2, 1))
      .toEqual([ 'k18', ROCK, 0, 0 ]);
  });

  it('swaps on the chosen layer alone under manual layering', () =>
  {
    // Arrange: grass on layers 1 and 3 of one cell.
    const grid = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 2, kindTile(GRASS));

    // Act: layer 3 chosen.
    const after = applied(grid, planSwap(grid, singleTileBrush(kindTile(DIRT)), { x: 0, y: 0 }, contextWith(2)));

    // Assert.
    expect(stackAt(after, 0, 0))
      .toEqual([ 'k16', 0, 'k18', 0 ]);
  });

  it('swaps one region id for another across the map', () =>
  {
    // Arrange: regions 4, 4 and 5.
    const grid = put(fill(blankGrid(3, 1), 0, 0, 1, 0, 5, 4), 2, 0, 5, 5);

    // Act.
    const after = applied(grid, planSwap(grid, regionBrush(8), { x: 1, y: 0 }, contextWith()));

    // Assert.
    expect([ 0, 1, 2 ].map(x => cellOf(after, x, 0, 5)))
      .toEqual([ 8, 8, 5 ]);
  });

  it('swaps nothing with a shadows brush, or off the map', () =>
  {
    // Arrange.
    const grid = village();

    // Act.
    const shadows = planSwap(grid, SHADOW_BRUSH, { x: 0, y: 0 }, contextWith());
    const offMap = planSwap(grid, singleTileBrush(ROCK), { x: 5, y: 0 }, contextWith());

    // Assert.
    expect([ shadows, offMap ])
      .toEqual([ [], [] ]);
  });
});

describe('pickBrush', () =>
{
  /**
   * Builds a 2x1 map: grass in shape 5 under a tree on the left, bare dirt in shape 12 on the right, region 6 under
   * the tree.
   * @returns {TestGrid} The map.
   */
  const scene = (): TestGrid =>
  {
    const grid = put(blankGrid(2, 1), 0, 0, 0, makeAutotileId(GRASS, 5));
    put(grid, 0, 0, 3, TREE);
    put(grid, 1, 0, 0, makeAutotileId(DIRT, 12));
    return put(grid, 0, 0, 5, 6);
  };

  it('picks the tile on top of each cell under automatic layering, exactly as stored', () =>
  {
    // Arrange.
    const grid = scene();

    // Act.
    const brush = pickBrush(grid, { x: 0, y: 0, width: 2, height: 1 }, 'tiles', 'auto');

    // Assert: the tree, and the dirt in its very shape.
    expect(brush)
      .toEqual({ kind: 'tiles', width: 2, height: 1, cells: [ TREE, makeAutotileId(DIRT, 12) ] });
  });

  it('picks from the chosen layer under manual layering, keeping the shape', () =>
  {
    // Arrange.
    const grid = scene();

    // Act: layer 1 chosen, the tree's cell alone.
    const brush = pickBrush(grid, { x: 0, y: 0, width: 1, height: 1 }, 'tiles', 0);

    // Assert.
    expect(brush?.cells)
      .toEqual([ makeAutotileId(GRASS, 5) ]);
  });

  it('picks region ids with a regions brush in hand, and cuts the rectangle to the map', () =>
  {
    // Arrange.
    const grid = scene();

    // Act: a rectangle hanging off the left edge.
    const brush = pickBrush(grid, { x: -1, y: 0, width: 3, height: 1 }, 'regions', 'auto');

    // Assert.
    expect(brush)
      .toEqual({ kind: 'regions', width: 2, height: 1, cells: [ 6, 0 ] });
  });

  it('picks nothing off the map', () =>
  {
    // Arrange.
    const grid = scene();

    // Act.
    const brush = pickBrush(grid, { x: 4, y: 4, width: 1, height: 1 }, 'tiles', 'auto');

    // Assert.
    expect(brush)
      .toBeNull();
  });
});

describe('swapping on a Field tileset', () =>
{
  it('uses the tileset\'s mode for the shapes around the swap', () =>
  {
    // Arrange: ocean beside lake water on a Field tileset, where A1 kinds keep their shores.
    const grid = put(put(blankGrid(2, 1), 0, 0, 0, kindTile(0)), 1, 0, 0, kindTile(4));
    const context: PaintContext = { layering: layeringWith([], [], TilesetMode.field), choice: 'auto', shaping: 'auto' };

    // Act: the lake swapped for more lake of another kind, which keeps a shore against the ocean.
    const after = applied(grid, planSwap(grid, singleTileBrush(kindTile(6)), { x: 1, y: 0 }, context));

    // Assert: the new water draws its edge towards the ocean rather than joining it.
    expect(cellOf(after, 1, 0, 0) === makeAutotileId(6, 0))
      .toBe(false);
  });
});
