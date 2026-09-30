import { describe, expect, it } from 'vitest';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { paintTiles, planPlacement, strokeLayerChoice, swapTiles, type LayerChoice, type TilesetLayering } from '../../../../src/mapEditor/core/tiles/layering.ts';
import { gridReader, type CellChange, type TileGrid } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { autotileKind, makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import type { TilesetMarks } from '../../../../src/mapEditor/core/tiles/tilesetMarks.ts';
import { blankGrid, cellOf, fill, kindTile, put, type TestGrid } from './support/tileGridBuilder.ts';

/*
 * The layering engine.
 *
 * Painting decides which of a cell's four layers a tile lands on, and that decides whether it covers the ground or
 * replaces it. The engine owes the painter MZ's automatic rules as S5 confirmed them (ground on layer 1, the A2
 * decorations and ocean overlays on layer 2, B to E tiles stacked two deep on layers 3 and 4, newest on top) with
 * D5's changes on top: a tile marked "goes on top" lays over the ground instead of replacing it, repainting the
 * ground keeps what is above it, manual mode and the one-stroke override paint exactly one layer, and the swap tool
 * replaces a tile everywhere at once. It answers with the cells to change and never writes the map itself.
 *
 * Every rule is pinned with a near miss beside it: a cell that must stay untouched, a kind that must not count as
 * ground, a marked tile next to an unmarked one.
 */
const OCEAN = 0;
const DEEP_SEA = 1;
const LAKE = 4;
const GRASS = 16;
const GRASS_PAIRED = 17;
const DIRT = 18;
const TALL_GRASS = 20;
const FLOWERS = 21;
const CEILING = 80;
const CLIFF_CORNER = TileId.A5 + 122;
const SOLID_ROCK = TileId.A5 + 97;
const TREE = 10;
const BUSH = 11;
const SIGN = 12;

/**
 * Builds a tileset's layering with the given tiles and kinds marked to go on top.
 * @param {number[]} tiles The marked plain tiles.
 * @param {number[]} kinds The marked autotile kinds.
 * @param {number} mode The tileset's mode.
 * @returns {TilesetLayering} The layering.
 */
const layeringWith = (tiles: number[] = [], kinds: number[] = [], mode: number = TilesetMode.area): TilesetLayering =>
{
  const marks: TilesetMarks = { tiles: new Set(tiles), kinds: new Set(kinds) };
  return { mode, marks };
};

/**
 * Applies a list of cell changes to a copy of a grid, the way the map document would.
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
 * Paints one tile at one cell and returns the map after.
 * @param {TileGrid} grid The map before.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} tileId The tile.
 * @param {TilesetLayering} layering The tileset's layering.
 * @param {LayerChoice} choice The layer choice.
 * @returns {TestGrid} The map after.
 */
const paintOne = (grid: TileGrid, x: number, y: number, tileId: number, layering: TilesetLayering = layeringWith(), choice: LayerChoice = 'auto'): TestGrid =>
{
  return applied(grid, paintTiles(grid, [ { x, y, tileId } ], layering, choice));
};

/**
 * Reads the four tile layers of one cell, autotiles by kind (as "k16") so shapes do not clutter the comparison.
 * @param {TileGrid} grid The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {(number | string)[]} The cell's layers, bottom to top.
 */
const stackOf = (grid: TileGrid, x: number, y: number): (number | string)[] =>
{
  return [ 0, 1, 2, 3 ].map((z) =>
  {
    const tileId = cellOf(grid, x, y, z);
    return tileId >= TileId.A1
      ? `k${autotileKind(tileId)}`
      : tileId;
  });
};

describe('automatic layering: the ground', () =>
{
  it('lays a ground tile on layer 1 and leaves the next cell untouched', () =>
  {
    // Arrange: an empty 2x1 map.
    const grid = blankGrid(2, 1);

    // Act.
    const after = paintOne(grid, 0, 0, kindTile(GRASS));

    // Assert.
    expect([ stackOf(after, 0, 0), stackOf(after, 1, 0) ])
      .toEqual([ [ 'k16', 0, 0, 0 ], [ 0, 0, 0, 0 ] ]);
  });

  it('replaces the ground but keeps the overlay and both upper tiles above it', () =>
  {
    // Arrange: grass under tall grass, a tree and a sign.
    const grid = blankGrid(1, 1);
    put(grid, 0, 0, 0, kindTile(GRASS));
    put(grid, 0, 0, 1, kindTile(TALL_GRASS));
    put(grid, 0, 0, 2, TREE);
    put(grid, 0, 0, 3, SIGN);

    // Act: dirt, and then a solid A5 tile, over it.
    const dirt = paintOne(grid, 0, 0, kindTile(DIRT));
    const rock = paintOne(dirt, 0, 0, SOLID_ROCK);

    // Assert: MZ would have wiped layers 2 to 4 both times; here only layer 1 changes.
    expect([ stackOf(dirt, 0, 0), stackOf(rock, 0, 0) ])
      .toEqual([ [ 'k18', 'k20', TREE, SIGN ], [ SOLID_ROCK, 'k20', TREE, SIGN ] ]);
  });

  it('lays a wall top on layer 1 too, replacing the ground', () =>
  {
    // Arrange: grass.
    const grid = put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS));

    // Act.
    const after = paintOne(grid, 0, 0, kindTile(CEILING));

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 'k80', 0, 0, 0 ]);
  });
});

describe('automatic layering: overlays', () =>
{
  it('lays an A2 decoration on layer 2 over the ground, and a ground kind on layer 1 beside it', () =>
  {
    // Arrange: grass in both cells.
    const grid = fill(blankGrid(2, 1), 0, 0, 1, 0, 0, kindTile(GRASS));

    // Act: tall grass in the first cell, dirt (a ground kind, which must not count as an overlay) in the second.
    const after = applied(grid, paintTiles(grid, [ { x: 0, y: 0, tileId: kindTile(TALL_GRASS) }, { x: 1, y: 0, tileId: kindTile(DIRT) } ], layeringWith(), 'auto'));

    // Assert.
    expect([ stackOf(after, 0, 0), stackOf(after, 1, 0) ])
      .toEqual([ [ 'k16', 'k20', 0, 0 ], [ 'k18', 0, 0, 0 ] ]);
  });

  it('replaces one decoration with another, since layer 2 holds only one', () =>
  {
    // Arrange: grass under tall grass.
    const grid = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 1, kindTile(TALL_GRASS));

    // Act.
    const after = paintOne(grid, 0, 0, kindTile(FLOWERS));

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 'k16', 'k21', 0, 0 ]);
  });

  it('lays a decoration on layer 2 even with no ground beneath it', () =>
  {
    // Arrange: an empty cell.
    const grid = blankGrid(1, 1);

    // Act.
    const after = paintOne(grid, 0, 0, kindTile(TALL_GRASS));

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 0, 'k20', 0, 0 ]);
  });

  it('lays deep sea on layer 2 and fills the ocean in beneath it, but lays lake water on layer 1', () =>
  {
    // Arrange: grass in both cells.
    const grid = fill(blankGrid(2, 1), 0, 0, 1, 0, 0, kindTile(GRASS));

    // Act.
    const after = applied(grid, paintTiles(grid, [ { x: 0, y: 0, tileId: kindTile(DEEP_SEA) }, { x: 1, y: 0, tileId: kindTile(LAKE) } ], layeringWith(), 'auto'));

    // Assert.
    expect([ stackOf(after, 0, 0), stackOf(after, 1, 0) ])
      .toEqual([ [ `k${OCEAN}`, 'k1', 0, 0 ], [ 'k4', 0, 0, 0 ] ]);
  });

  it('pairs a Field tileset\'s second base column with the first, but not on an Area tileset', () =>
  {
    // Arrange: dirt in both maps' only cell.
    const grid = put(blankGrid(1, 1), 0, 0, 0, kindTile(DIRT));

    // Act.
    const field = paintOne(grid, 0, 0, kindTile(GRASS_PAIRED), layeringWith([], [], TilesetMode.field));
    const area = paintOne(grid, 0, 0, kindTile(GRASS_PAIRED), layeringWith([], [], TilesetMode.area));

    // Assert.
    expect([ stackOf(field, 0, 0), stackOf(area, 0, 0) ])
      .toEqual([ [ 'k16', 'k17', 0, 0 ], [ 'k17', 0, 0, 0 ] ]);
  });
});

describe('automatic layering: B to E tiles', () =>
{
  it('stacks them on layers 4 then 3, newest on top, and drops the oldest for a third', () =>
  {
    // Arrange: grass, which the upper tiles must never touch.
    const grid = put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS));

    // Act.
    const one = paintOne(grid, 0, 0, TREE);
    const two = paintOne(one, 0, 0, BUSH);
    const three = paintOne(two, 0, 0, SIGN);

    // Assert.
    expect([ stackOf(one, 0, 0), stackOf(two, 0, 0), stackOf(three, 0, 0) ])
      .toEqual([ [ 'k16', 0, 0, TREE ], [ 'k16', 0, TREE, BUSH ], [ 'k16', 0, BUSH, SIGN ] ]);
  });

  it('changes nothing when the tile painted is already on top, though a different one would push', () =>
  {
    // Arrange: a tree under a bush.
    const grid = put(put(blankGrid(1, 1), 0, 0, 2, TREE), 0, 0, 3, BUSH);

    // Act.
    const same = paintTiles(grid, [ { x: 0, y: 0, tileId: BUSH } ], layeringWith(), 'auto');
    const different = paintOne(grid, 0, 0, SIGN);

    // Assert.
    expect([ same, stackOf(different, 0, 0) ])
      .toEqual([ [], [ 0, 0, BUSH, SIGN ] ]);
  });

  it('fills a free top slot without pushing layer 3 down', () =>
  {
    // Arrange: a tree on layer 3 with layer 4 empty.
    const grid = put(blankGrid(1, 1), 0, 0, 2, TREE);

    // Act.
    const after = paintOne(grid, 0, 0, BUSH);

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 0, 0, TREE, BUSH ]);
  });

  it('never pushes a B to E tile down over an A tile on layer 3', () =>
  {
    // Arrange: a cliff corner laid on layer 3 under a tree on layer 4.
    const grid = put(put(blankGrid(1, 1), 0, 0, 2, CLIFF_CORNER), 0, 0, 3, TREE);

    // Act.
    const after = paintOne(grid, 0, 0, BUSH);

    // Assert: the bush replaces the tree; the cliff corner stays.
    expect(stackOf(after, 0, 0))
      .toEqual([ 0, 0, CLIFF_CORNER, BUSH ]);
  });

  it('clears both upper layers with B\'s empty tile, and nothing below them', () =>
  {
    // Arrange: grass under tall grass, a tree and a bush.
    const grid = blankGrid(1, 1);
    put(grid, 0, 0, 0, kindTile(GRASS));
    put(grid, 0, 0, 1, kindTile(TALL_GRASS));
    put(grid, 0, 0, 2, TREE);
    put(grid, 0, 0, 3, BUSH);

    // Act.
    const after = paintOne(grid, 0, 0, 0);

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 'k16', 'k20', 0, 0 ]);
  });
});

describe('goes-on-top marks', () =>
{
  it('lay a marked tile over the ground on layer 2, while an unmarked one beside it replaces the ground', () =>
  {
    // Arrange: grass in both cells; the cliff corner is marked, the solid rock is not.
    const grid = fill(blankGrid(2, 1), 0, 0, 1, 0, 0, kindTile(GRASS));
    const layering = layeringWith([ CLIFF_CORNER ]);

    // Act.
    const after = applied(grid, paintTiles(grid, [ { x: 0, y: 0, tileId: CLIFF_CORNER }, { x: 1, y: 0, tileId: SOLID_ROCK } ], layering, 'auto'));

    // Assert.
    expect([ stackOf(after, 0, 0), stackOf(after, 1, 0) ])
      .toEqual([ [ 'k16', CLIFF_CORNER, 0, 0 ], [ SOLID_ROCK, 0, 0, 0 ] ]);
  });

  it('put a marked tile on the ground layer of a cell with no ground', () =>
  {
    // Arrange: an empty cell, so a parallax shows through.
    const grid = blankGrid(1, 1);

    // Act.
    const after = paintOne(grid, 0, 0, CLIFF_CORNER, layeringWith([ CLIFF_CORNER ]));

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ CLIFF_CORNER, 0, 0, 0 ]);
  });

  it('go on layer 3 when layer 2 is taken, and replace layer 3 when both are', () =>
  {
    // Arrange: grass under tall grass; and the same with a bush on layer 3 as well.
    const taken = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 1, kindTile(TALL_GRASS));
    const full = put({ width: 1, height: 1, cells: Uint16Array.from(taken.cells) }, 0, 0, 2, BUSH);
    const layering = layeringWith([ CLIFF_CORNER ]);

    // Act.
    const second = paintOne(taken, 0, 0, CLIFF_CORNER, layering);
    const third = paintOne(full, 0, 0, CLIFF_CORNER, layering);

    // Assert.
    expect([ stackOf(second, 0, 0), stackOf(third, 0, 0) ])
      .toEqual([ [ 'k16', 'k20', CLIFF_CORNER, 0 ], [ 'k16', 'k20', CLIFF_CORNER, 0 ] ]);
  });

  it('leave a marked tile where it is when it is painted again', () =>
  {
    // Arrange: grass with the cliff corner already on layer 2.
    const grid = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 1, CLIFF_CORNER);

    // Act.
    const changes = paintTiles(grid, [ { x: 0, y: 0, tileId: CLIFF_CORNER } ], layeringWith([ CLIFF_CORNER ]), 'auto');

    // Assert: no second copy on layer 3.
    expect(changes)
      .toEqual([]);
  });

  it('mark an autotile through its kind, so a marked decoration stacks instead of replacing', () =>
  {
    // Arrange: grass under flowers; tall grass is marked.
    const grid = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 1, kindTile(FLOWERS));

    // Act: tall grass given in some shape other than 0.
    const after = paintOne(grid, 0, 0, makeAutotileId(TALL_GRASS, 20), layeringWith([], [ TALL_GRASS ]));

    // Assert: MZ would have replaced the flowers; the mark lays the tall grass above them on layer 3.
    expect(stackOf(after, 0, 0))
      .toEqual([ 'k16', 'k21', 'k20', 0 ]);
  });

  it('never apply to B to E tiles, which always stack', () =>
  {
    // Arrange: grass; the tree's id is listed as a marked plain tile.
    const grid = put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS));

    // Act.
    const after = paintOne(grid, 0, 0, TREE, layeringWith([ TREE ]));

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 'k16', 0, 0, TREE ]);
  });
});

describe('manual layering and the one-stroke override', () =>
{
  it('paints exactly the chosen layer, whatever the tile', () =>
  {
    // Arrange: grass under tall grass.
    const grid = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 1, kindTile(TALL_GRASS));

    // Act: a ground tile on layer 3, and a B tile on layer 1.
    const ground = paintOne(grid, 0, 0, kindTile(DIRT), layeringWith(), 2);
    const upper = paintOne(grid, 0, 0, TREE, layeringWith(), 0);

    // Assert: nothing but the chosen layer changes, the tall grass included.
    expect([ stackOf(ground, 0, 0), stackOf(upper, 0, 0) ])
      .toEqual([ [ 'k16', 'k20', 'k18', 0 ], [ TREE, 'k20', 0, 0 ] ]);
  });

  it('does not fill the ocean in under deep sea painted by hand', () =>
  {
    // Arrange: an empty cell.
    const grid = blankGrid(1, 1);

    // Act.
    const after = paintOne(grid, 0, 0, kindTile(DEEP_SEA), layeringWith(), 1);

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 0, 'k1', 0, 0 ]);
  });

  it('paints one stroke on the override\'s layer while it is held, and the strip\'s choice once released', () =>
  {
    // Arrange: grass, with the strip on auto.
    const grid = put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS));

    // Act: a stroke of dirt with the override held on layer 3, then one with it released.
    const held = paintOne(grid, 0, 0, kindTile(DIRT), layeringWith(), strokeLayerChoice('auto', 2));
    const released = paintOne(grid, 0, 0, kindTile(DIRT), layeringWith(), strokeLayerChoice('auto', 'none'));

    // Assert.
    expect([ stackOf(held, 0, 0), stackOf(released, 0, 0) ])
      .toEqual([ [ 'k16', 0, 'k18', 0 ], [ 'k18', 0, 0, 0 ] ]);
  });

  it('leaves a manual strip choice alone when no override is held', () =>
  {
    // Arrange: the strip set to layer 2.
    const strip: LayerChoice = 1;

    // Act.
    const choice = strokeLayerChoice(strip, 'none');

    // Assert.
    expect(choice)
      .toBe(1);
  });
});

describe('where a tile will land', () =>
{
  it('answers the layer for the ghost preview, and -1 for the empty tile', () =>
  {
    // Arrange: grass under tall grass, with the cliff corner marked.
    const grid = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 1, kindTile(TALL_GRASS));
    const reader = gridReader(grid);
    const layering = layeringWith([ CLIFF_CORNER ]);

    // Act.
    const landings = [ kindTile(DIRT), kindTile(FLOWERS), CLIFF_CORNER, TREE, 0 ]
      .map(tileId => planPlacement(reader, 0, 0, tileId, layering, 'auto').landing);

    // Assert.
    expect(landings)
      .toEqual([ 0, 1, 2, 3, -1 ]);
  });
});

describe('painting and shapes', () =>
{
  it('shapes the painted autotile and its neighbours against the finished stroke', () =>
  {
    // Arrange: grass in the left cell of a 3x1 map.
    const grid = put(blankGrid(3, 1), 0, 0, 0, makeAutotileId(GRASS, 46));

    // Act: a stroke of grass across the other two cells.
    const after = applied(grid, paintTiles(grid, [ { x: 1, y: 0, tileId: kindTile(GRASS) }, { x: 2, y: 0, tileId: kindTile(GRASS) } ], layeringWith(), 'auto'));

    // Assert: one joined strip, the map's edges joining above and below.
    expect([ cellOf(after, 0, 0, 0), cellOf(after, 1, 0, 0), cellOf(after, 2, 0, 0) ])
      .toEqual([ makeAutotileId(GRASS, 0), makeAutotileId(GRASS, 0), makeAutotileId(GRASS, 0) ]);
  });

  it('skips a placement beyond the map', () =>
  {
    // Arrange.
    const grid = blankGrid(1, 1);

    // Act.
    const changes = paintTiles(grid, [ { x: 1, y: 0, tileId: TREE } ], layeringWith(), 'auto');

    // Assert.
    expect(changes)
      .toEqual([]);
  });
});

describe('swapTiles', () =>
{
  it('replaces every copy of a kind on every layer, reshaping around them, and leaves a sibling kind alone', () =>
  {
    // Arrange: grass on layer 1 of two cells and layer 3 of a third; the paired grass kind in the fourth.
    const grid = blankGrid(4, 1);
    put(grid, 0, 0, 0, makeAutotileId(GRASS, 5));
    put(grid, 1, 0, 0, kindTile(GRASS));
    put(grid, 2, 0, 2, kindTile(GRASS));
    put(grid, 3, 0, 0, kindTile(GRASS_PAIRED));

    // Act.
    const after = applied(grid, swapTiles(grid, kindTile(GRASS), kindTile(DIRT), TilesetMode.area));

    // Assert.
    expect([ stackOf(after, 0, 0), stackOf(after, 1, 0), stackOf(after, 2, 0), stackOf(after, 3, 0) ])
      .toEqual([ [ 'k18', 0, 0, 0 ], [ 'k18', 0, 0, 0 ], [ 0, 0, 'k18', 0 ], [ 'k17', 0, 0, 0 ] ]);
  });

  it('can be narrowed to some layers', () =>
  {
    // Arrange: grass on layer 1 and layer 3 of one cell.
    const grid = put(put(blankGrid(1, 1), 0, 0, 0, kindTile(GRASS)), 0, 0, 2, kindTile(GRASS));

    // Act.
    const after = applied(grid, swapTiles(grid, kindTile(GRASS), SOLID_ROCK, TilesetMode.area, [ 2 ]));

    // Assert.
    expect(stackOf(after, 0, 0))
      .toEqual([ 'k16', 0, SOLID_ROCK, 0 ]);
  });

  it('changes nothing when swapping a tile for itself or swapping out the empty tile', () =>
  {
    // Arrange: grass stored in a wrong shape, which a swap for itself must not quietly correct.
    const grid = put(blankGrid(2, 1), 0, 0, 0, makeAutotileId(GRASS, 5));

    // Act.
    const itself = swapTiles(grid, kindTile(GRASS), makeAutotileId(GRASS, 9), TilesetMode.area);
    const empty = swapTiles(grid, 0, TREE, TilesetMode.area);

    // Assert.
    expect([ itself, empty ])
      .toEqual([ [], [] ]);
  });
});
