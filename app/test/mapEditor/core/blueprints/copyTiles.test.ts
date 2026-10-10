import { describe, expect, it } from 'vitest';
import {
  blueprintCellChanges,
  followedTile,
  followTiles,
  sameCellTile,
  type BlueprintCellChange,
} from '../../../../src/mapEditor/core/blueprints/copyTiles.ts';
import type { StampTiles } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { withReshapes } from '../../../../src/mapEditor/core/tiles/autotileRefresh.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { blankGrid, fill, kindTile, put } from '../tiles/support/tileGridBuilder.ts';

/*
 * A copy's tiles follow its blueprint's too, and a tile is a choice: when a blueprint's cell changes, a copy's cell still
 * holding what the blueprint held follows it to the new value, and a cell painted over since stays. Autotiles compare by
 * kind, since a copy's neighbours are its own and shape its edges their own way, so a cell of the old kind follows
 * whatever its shape, a cell of another kind stays, and a change of shape alone is no change to follow. Every other tile,
 * and every shadow and region, compares exactly.
 *
 * On a copy's map, the cells that follow are written, a cell past the map's edge is passed over, and the autotiles around
 * the cells that followed are refreshed exactly as a painter's stroke refreshes them: the cells that followed take the
 * shapes their new neighbours call for, and any other tile is reshaped only when what its neighbours call for changed, so
 * a shape drawn by hand elsewhere survives. Shadows and regions follow too, and reshape nothing.
 */
describe('copyTiles', () =>
{
  const GRASS = 16;
  const DIRT = 17;
  const SAND = 18;

  /**
   * A tile of the B sheet, which has no shapes.
   * @param {number} index Its place on the sheet.
   * @returns {number} The tile id.
   */
  const upper = (index: number): number => TileId.B + index;

  describe('sameCellTile', () =>
  {
    it('reads two autotiles of one kind on a tile layer as one tile, whatever their shapes, and two kinds as two', () =>
    {
      // Arrange: grass in two shapes, then grass and dirt in one shape.
      const pairs = [ [ makeAutotileId(GRASS, 0), makeAutotileId(GRASS, 46) ], [ makeAutotileId(GRASS, 5), makeAutotileId(DIRT, 5) ] ];

      // Act.
      const read = pairs.map(([ left, right ]) => sameCellTile(left, right, 0));

      // Assert.
      expect(read)
        .toStrictEqual([ true, false ]);
    });

    it('reads any other tile as the same only when it is the very same value', () =>
    {
      // Arrange: two B tiles alike and unlike, two A5 tiles a step apart, an autotile beside an A5 tile, and nothing.
      const pairs = [ [ upper(5), upper(5) ], [ upper(5), upper(6) ], [ TileId.A5, TileId.A5 + 1 ], [ makeAutotileId(GRASS, 0), TileId.A5 ], [ 0, 0 ] ];

      // Act.
      const read = pairs.map(([ left, right ]) => sameCellTile(left, right, 3));

      // Assert.
      expect(read)
        .toStrictEqual([ true, false, false, false, true ]);
    });

    it('compares shadows and regions exactly, whatever the numbers', () =>
    {
      // Arrange: values a tile layer would read as one kind, on the shadow layer; and a region alike and unlike.
      const cells: [ number, number, number ][] = [ [ 2048, 2049, 4 ], [ 3, 3, 5 ], [ 3, 4, 5 ] ];

      // Act.
      const read = cells.map(([ left, right, layer ]) => sameCellTile(left, right, layer));

      // Assert: and the same pair on a tile layer is one tile.
      expect([ read, sameCellTile(2048, 2049, 0) ])
        .toStrictEqual([ [ false, true, false ], true ]);
    });
  });

  describe('followedTile', () =>
  {
    it('follows the blueprint\'s new tile when the copy still holds the old one, an autotile of the old kind in any shape', () =>
    {
      // Arrange: a B tile swapped for another; grass turned to dirt where the copy's grass has another shape.
      const cells: [ number, number, number ][] = [
        [ upper(5), upper(6), upper(5) ],
        [ makeAutotileId(GRASS, 0), makeAutotileId(DIRT, 0), makeAutotileId(GRASS, 46) ],
      ];

      // Act.
      const followed = cells.map(([ before, after, copy ]) => followedTile(before, after, copy, 0));

      // Assert.
      expect(followed)
        .toStrictEqual([ upper(6), makeAutotileId(DIRT, 0) ]);
    });

    it('keeps a cell painted over since, and one already holding the new tile', () =>
    {
      // Arrange: a B tile painted over with a third; grass painted over with sand; a copy already holding the new tile.
      const cells: [ number, number, number ][] = [
        [ upper(5), upper(6), upper(7) ],
        [ makeAutotileId(GRASS, 0), makeAutotileId(DIRT, 0), makeAutotileId(SAND, 0) ],
        [ upper(5), upper(6), upper(6) ],
      ];

      // Act.
      const followed = cells.map(([ before, after, copy ]) => followedTile(before, after, copy, 0));

      // Assert.
      expect(followed)
        .toStrictEqual([ null, null, null ]);
    });

    it('finds no change in a change of shape alone', () =>
    {
      // Arrange: the blueprint's grass reshaped, and the copy's grass in the old shape.
      const before = makeAutotileId(GRASS, 0);

      // Act.
      const followed = followedTile(before, makeAutotileId(GRASS, 46), before, 0);

      // Assert.
      expect(followed)
        .toBeNull();
    });

    it('follows a cell the blueprint emptied, and one it painted where there was nothing, unless the copy painted there', () =>
    {
      // Arrange.
      const cells: [ number, number, number ][] = [ [ upper(5), 0, upper(5) ], [ 0, upper(5), 0 ], [ 0, upper(5), upper(3) ] ];

      // Act.
      const followed = cells.map(([ before, after, copy ]) => followedTile(before, after, copy, 3));

      // Assert.
      expect(followed)
        .toStrictEqual([ 0, upper(5), null ]);
    });

    it('follows a region the copy still holds, and keeps one of its own', () =>
    {
      // Arrange: region 1 turned to 2, the copy holding 1, then 3.
      const copies = [ 1, 3 ];

      // Act.
      const followed = copies.map(copy => followedTile(1, 2, copy, 5));

      // Assert.
      expect(followed)
        .toStrictEqual([ 2, null ]);
    });
  });

  describe('blueprintCellChanges', () =>
  {
    it('lists each value a change touched with where it sits in the blueprint and on which layer', () =>
    {
      // Arrange: a 2 by 2 blueprint carrying layers 0 and 5, one tile and one region changed.
      const before: StampTiles = { layers: [ 0, 5 ], values: [ 1, 2, 3, 4, 0, 0, 0, 7 ], calledFor: [ -1, -1, -1, -1, -1, -1, -1, -1 ] };
      const after: StampTiles = { ...before, values: [ 1, 2, 9, 4, 0, 0, 0, 8 ] };

      // Act.
      const changes = blueprintCellChanges(before, after, { width: 2, height: 2 });

      // Assert.
      expect(changes)
        .toStrictEqual([
          { dx: 0, dy: 1, layer: 0, before: 3, after: 9 },
          { dx: 1, dy: 1, layer: 5, before: 7, after: 8 },
        ]);
    });

    it('refuses tiles carrying other layers, or of another size', () =>
    {
      // Arrange.
      const before: StampTiles = { layers: [ 0 ], values: [ 1, 2, 3, 4 ], calledFor: [ -1, -1, -1, -1 ] };
      const others = [
        { ...before, layers: [ 1 ] },
        { ...before, layers: [ 0, 1 ], values: [ 1, 2, 3, 4, 0, 0, 0, 0 ] },
        { ...before, values: [ 1, 2 ] },
      ];

      // Act.
      const reads = [
        ...others.map(after => () => blueprintCellChanges(before, after, { width: 2, height: 2 })),
        () => blueprintCellChanges(before, before, { width: 3, height: 2 }),
      ];

      // Assert.
      reads.forEach(read => expect(read)
        .toThrow('a blueprint\'s tiles before and after a change carry the same layers at the same size'));
    });
  });

  describe('followTiles', () =>
  {
    it('writes the cells still holding the blueprint\'s old tiles, and keeps the ones painted over since', () =>
    {
      // Arrange: a copy at (2, 1) whose two top cells held B tile 5 on layer 4, the right one painted over with 7.
      const grid = put(put(blankGrid(6, 5), 2, 1, 3, upper(5)), 3, 1, 3, upper(7));
      const changes: BlueprintCellChange[] = [
        { dx: 0, dy: 0, layer: 3, before: upper(5), after: upper(6) },
        { dx: 1, dy: 0, layer: 3, before: upper(5), after: upper(6) },
      ];

      // Act.
      const copied = followTiles(grid, { x: 2, y: 1 }, changes, TilesetMode.area);

      // Assert.
      expect(copied)
        .toStrictEqual({
          writes: [ [ cellIndex(6, 5, 2, 1, 3), upper(6) ] ],
          followed: [ { x: 2, y: 1, layer: 3 } ],
          stayed: [ { x: 3, y: 1, layer: 3 } ],
          refreshed: [ [ 1, 0 ], [ 2, 0 ], [ 3, 0 ], [ 1, 1 ], [ 2, 1 ], [ 3, 1 ], [ 1, 2 ], [ 2, 2 ], [ 3, 2 ] ],
        });
    });

    it('refreshes the autotile edges around a cell that followed exactly as a painter\'s stroke does, and nothing else', () =>
    {
      // Arrange: a field of grass painted onto an empty map, so every cell takes the shape its neighbours call for, one
      // cell far off redrawn by hand, and a copy at (2, 2) whose centre turns from grass to dirt.
      const grid = blankGrid(9, 9);
      const field = fill(blankGrid(9, 9), 0, 0, 8, 8, 0, kindTile(GRASS));
      const painted = withReshapes(grid, Array.from(field.cells.slice(0, 81), (value, index) => [ index, value ] as const), TilesetMode.area);
      painted.forEach(([ index, value ]) =>
      {
        grid.cells[index] = value;
      });
      put(grid, 8, 8, 0, makeAutotileId(GRASS, 33));
      const change: BlueprintCellChange = { dx: 1, dy: 1, layer: 0, before: kindTile(GRASS), after: kindTile(DIRT) };

      // Act.
      const copied = followTiles(grid, { x: 2, y: 2 }, [ change ], TilesetMode.area);

      // Assert: the stroke painting dirt there writes the very same; the hand-drawn cell is not among the writes.
      const stroke = withReshapes(grid, [ [ cellIndex(9, 9, 3, 3, 0), kindTile(DIRT) ] ], TilesetMode.area);
      expect(copied.writes)
        .toStrictEqual(stroke);
      expect([ copied.writes.length > 1, copied.writes.some(([ index ]) => index === cellIndex(9, 9, 8, 8, 0)) ])
        .toStrictEqual([ true, false ]);
      expect(copied.refreshed)
        .toStrictEqual([ [ 2, 2 ], [ 3, 2 ], [ 4, 2 ], [ 2, 3 ], [ 3, 3 ], [ 4, 3 ], [ 2, 4 ], [ 3, 4 ], [ 4, 4 ] ]);
    });

    it('passes over a cell past the map\'s edge', () =>
    {
      // Arrange: a copy at (5, 0) on a map 6 wide, its second column past the edge.
      const grid = put(blankGrid(6, 2), 5, 0, 3, upper(5));
      const changes: BlueprintCellChange[] = [
        { dx: 0, dy: 0, layer: 3, before: upper(5), after: upper(6) },
        { dx: 1, dy: 0, layer: 3, before: 0, after: upper(6) },
      ];

      // Act.
      const copied = followTiles(grid, { x: 5, y: 0 }, changes, TilesetMode.area);

      // Assert.
      expect([ copied.writes, copied.followed, copied.stayed ])
        .toStrictEqual([ [ [ cellIndex(6, 2, 5, 0, 3), upper(6) ] ], [ { x: 5, y: 0, layer: 3 } ], [] ]);
    });

    it('follows shadows and regions without refreshing anything', () =>
    {
      // Arrange: region 1 under the copy's corner turned to 2, and a shadow added.
      const grid = put(blankGrid(4, 4), 1, 1, 5, 1);
      const changes: BlueprintCellChange[] = [
        { dx: 0, dy: 0, layer: 5, before: 1, after: 2 },
        { dx: 1, dy: 0, layer: 4, before: 0, after: 15 },
      ];

      // Act.
      const copied = followTiles(grid, { x: 1, y: 1 }, changes, TilesetMode.area);

      // Assert.
      expect([ copied.writes, copied.refreshed ])
        .toStrictEqual([ [ [ cellIndex(4, 4, 2, 1, 4), 15 ], [ cellIndex(4, 4, 1, 1, 5), 2 ] ], [] ]);
    });

    it('does nothing for a change of shape alone', () =>
    {
      // Arrange: the copy's grass, and the blueprint's reshaped.
      const grid = put(blankGrid(3, 3), 1, 1, 0, kindTile(GRASS));
      const change: BlueprintCellChange = { dx: 0, dy: 0, layer: 0, before: kindTile(GRASS), after: makeAutotileId(GRASS, 5) };

      // Act.
      const copied = followTiles(grid, { x: 1, y: 1 }, [ change ], TilesetMode.area);

      // Assert.
      expect(copied)
        .toStrictEqual({ writes: [], followed: [], stayed: [], refreshed: [] });
    });
  });
});
