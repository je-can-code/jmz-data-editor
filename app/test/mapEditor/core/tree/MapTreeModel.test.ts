import { describe, expect, it } from 'vitest';
import { MapTreeModel, TREE_ROOT } from '../../../../src/mapEditor/core/tree/MapTreeModel.ts';
import { buildTreeRows, row } from '../../support/treeFixtures.ts';

/*
 * The tree model is what every tree operation edits, so it owes them the tree exactly as MZ keeps it. Built from
 * MapInfos.json's rows, it shows each map's children in the file's order; edited, a map moves with its whole
 * branch and never into it; and written back, every map's parent comes from where it hangs and its order is one
 * count down the whole tree with no gaps, which is what every shipped MapInfos.json holds. Slots of deleted maps
 * stay null and the file never gets shorter, so no map's id ever moves. Everything a row carries that the tree does
 * not decide (an open branch, a scroll position, the quick flag) survives untouched, and nothing reaches back into
 * the rows it was built from.
 *
 * The fixture has a branch two deep beside a sibling, a second top-level map and a free slot, so "this map" and
 * "every map" are different answers.
 */
describe('MapTreeModel', () =>
{
  describe('reading', () =>
  {
    it('lists each map\'s children in the file\'s order', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const lists = [ tree.children(TREE_ROOT), tree.children(1), tree.children(2), tree.children(3) ];

      // Assert.
      expect(lists)
        .toStrictEqual([ [ 1, 6 ], [ 2, 5 ], [ 3 ], [] ]);
    });

    it('orders by the order numbers rather than by id, and hangs a map with a missing parent from the top', () =>
    {
      // Arrange: map 2 comes first by order, and map 9's parent is not in the tree.
      const rows = [ null, row(1, 'Late', 7, 0), row(2, 'Early', 3, 0), null, null, null, null, null, null, row(9, 'Lost', 5, 4) ];

      // Act.
      const tree = new MapTreeModel(rows);

      // Assert.
      expect([ tree.children(TREE_ROOT), tree.parentOf(9) ])
        .toStrictEqual([ [ 2, 9, 1 ], TREE_ROOT ]);
    });

    it('lists a branch and the whole tree top to bottom', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const answers = [ tree.descendants(1), tree.descendants(5), tree.preorder() ];

      // Assert.
      expect(answers)
        .toStrictEqual([ [ 2, 3, 5 ], [], [ 1, 2, 3, 5, 6 ] ]);
    });

    it('tells a map inside a branch from its neighbour beside it', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const answers = [ tree.isWithin(3, 1), tree.isWithin(1, 1), tree.isWithin(5, 2), tree.isWithin(6, 1) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, true, false, false ]);
    });

    it('narrows a selection to its outermost maps in tree order, ignoring maps not in the tree', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const outermost = [ tree.outermost([ 6, 3, 2, 99 ]), tree.outermost([ 3, 5 ]) ];

      // Assert: the inn travels with its town; the cave and the inn are both outermost.
      expect(outermost)
        .toStrictEqual([ [ 2, 6 ], [ 3, 5 ] ]);
    });

    it('finds the lowest free ids, the empty slot first, then past the end, passing over the ones to skip', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const answers = [ tree.freeIds(1), tree.freeIds(3), tree.freeIds(2, new Set([ 4, 7 ])) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ [ 4 ], [ 4, 7, 8 ], [ 8, 9 ] ]);
    });

    it('hands out copies of rows, and nothing for a map that is not there', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());
      const copy = tree.row(2);

      // Act.
      (copy as { name: string }).name = 'Changed outside';

      // Assert.
      expect([ tree.row(2)?.name, tree.row(4), tree.has(4), tree.has(2) ])
        .toStrictEqual([ 'Town', null, false, true ]);
    });
  });

  describe('editing', () =>
  {
    it('inserts a map at the end, or in front of a sibling, and at the end for a sibling that is not there', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      tree.insert(row(4, 'Well', 0, 0), 1, null);
      tree.insert(row(7, 'Gate', 0, 0), 1, 5);
      tree.insert(row(8, 'Farm', 0, 0), 1, 3);

      // Assert.
      expect(tree.children(1))
        .toStrictEqual([ 2, 7, 5, 4, 8 ]);
    });

    it('refuses an id already in the tree, and a parent that is not', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const attempts = [ () => tree.insert(row(2, 'Twin', 0, 0), 0, null), () => tree.insert(row(4, 'Orphan', 0, 0), 4, null) ];

      // Assert.
      expect(attempts[0])
        .toThrow('map 2 is already in the tree');
      expect(attempts[1])
        .toThrow('map 4 is not in the tree');
    });

    it('moves a map with its whole branch', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      tree.move(2, 6, null);

      // Assert.
      expect([ tree.children(1), tree.children(6), tree.children(2), tree.preorder() ])
        .toStrictEqual([ [ 5 ], [ 2 ], [ 3 ], [ 1, 5, 6, 2, 3 ] ]);
    });

    it('reorders a map among its siblings', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      tree.move(5, 1, 2);

      // Assert.
      expect(tree.children(1))
        .toStrictEqual([ 5, 2 ]);
    });

    it('refuses to move a map inside its own branch, and leaves the tree as it was', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const attempts = [ () => tree.move(1, 3, null), () => tree.move(2, 2, null) ];

      // Assert.
      expect(attempts[0])
        .toThrow('map 1 cannot move inside its own branch');
      expect(attempts[1])
        .toThrow('map 2 cannot move inside its own branch');
      expect(tree.preorder())
        .toStrictEqual([ 1, 2, 3, 5, 6 ]);
    });

    it('removes a map with its branch, and leaves its neighbour', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      const removed = tree.remove(2);

      // Assert.
      expect([ removed, tree.preorder(), tree.has(3), tree.has(5) ])
        .toStrictEqual([ [ 2, 3 ], [ 1, 5, 6 ], false, true ]);
    });

    it('renames only the map asked for', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());

      // Act.
      tree.rename(5, 'Crystal Cave');

      // Assert.
      expect([ tree.row(5)?.name, tree.row(2)?.name ])
        .toStrictEqual([ 'Crystal Cave', 'Town' ]);
    });
  });

  describe('writing rows', () =>
  {
    it('writes back an untouched tree exactly as it came', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const written = new MapTreeModel(rows).toRows();

      // Assert.
      expect(written)
        .toStrictEqual(buildTreeRows());
    });

    it('numbers the whole tree top to bottom with no gaps, whatever numbers the file used', () =>
    {
      // Arrange: orders with gaps, in the right sequence.
      const rows = [ null, row(1, 'A', 10, 0), row(2, 'B', 20, 1), row(3, 'C', 30, 0) ];

      // Act.
      const written = new MapTreeModel(rows).toRows();

      // Assert.
      expect(written.map(each => each?.order ?? null))
        .toStrictEqual([ null, 1, 2, 3 ]);
    });

    it('sets each moved map\'s parent and renumbers everything after a move, keeping every other field', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());
      tree.move(2, 6, null);

      // Act.
      const written = tree.toRows();

      // Assert.
      expect(written)
        .toStrictEqual([
          null,
          row(1, 'World', 1, 0, { expanded: true }),
          row(2, 'Town', 4, 6, { scrollX: 1200.4444444444443 }),
          row(3, 'Inn', 5, 2, { quick: true }),
          null,
          row(5, 'Cave', 2, 1),
          row(6, 'Test', 3, 0),
        ]);
    });

    it('keeps the file its length when maps go, and grows it when a map lands past the end', () =>
    {
      // Arrange.
      const tree = new MapTreeModel(buildTreeRows());
      tree.remove(6);
      tree.insert(row(9, 'Far', 0, 0), TREE_ROOT, null);

      // Act.
      const written = tree.toRows();

      // Assert.
      expect([ written.length, written[6], written[7], written[8], written[9]?.order ])
        .toStrictEqual([ 10, null, null, null, 5 ]);
    });

    it('never shares a row with the rows it was built from', () =>
    {
      // Arrange.
      const rows = buildTreeRows();
      const tree = new MapTreeModel(rows);

      // Act.
      (rows[1] as { name: string }).name = 'Changed after building';
      const written = tree.toRows();
      (written[2] as { name: string }).name = 'Changed after writing';

      // Assert.
      expect([ tree.row(1)?.name, tree.row(2)?.name ])
        .toStrictEqual([ 'World', 'Town' ]);
    });
  });
});
