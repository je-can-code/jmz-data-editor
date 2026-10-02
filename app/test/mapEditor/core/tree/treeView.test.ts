import { describe, expect, it } from 'vitest';
import { TREE_ROOT } from '../../../../src/mapEditor/core/tree/MapTreeModel.ts';
import {
  deleteQuestion,
  draggedMaps,
  dropPlace,
  dropZoneAt,
  initiallyExpanded,
  revealMaps,
  selectionAfterCollapse,
  selectRange,
  toggleSelection,
  visibleTreeLines,
} from '../../../../src/mapEditor/core/tree/treeView.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * The tree panel shows and selects maps the way every file tree does, and these rules decide it: lines top to bottom
 * with closed branches folded away; Shift clicks select a run in the order shown and Ctrl clicks add or take out one;
 * closing a branch moves any pick inside it onto the branch, so the pick stays in sight and the branch stays closed;
 * a drag carries the whole selection when the dragged row is in it; and a drop lands in front of a row from its top
 * quarter, after it from its bottom quarter, and inside it from the middle. The drop's place is what the tree
 * service moves maps to, so it decides what gets written to MapInfos.json. Before a delete, the tree asks in place,
 * counting every map the delete takes, branches included, since the tree's history ends with the window.
 *
 * The fixture tree: 1 World (2 Town (3 Inn), 5 Cave), 6 Test; only World is open in the file.
 */
describe('treeView', () =>
{
  describe('visibleTreeLines', () =>
  {
    it('folds away whatever sits inside a closed branch', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const lines = visibleTreeLines(rows, new Set([ 1 ]));

      // Assert.
      expect(lines)
        .toStrictEqual([
          { id: 1, name: 'World', depth: 0, hasChildren: true, expanded: true },
          { id: 2, name: 'Town', depth: 1, hasChildren: true, expanded: false },
          { id: 5, name: 'Cave', depth: 1, hasChildren: false, expanded: false },
          { id: 6, name: 'Test', depth: 0, hasChildren: false, expanded: false },
        ]);
    });

    it('shows a branch two deep when both are open, and never marks a map with no branch open', () =>
    {
      // Arrange: the cave has nothing inside it, open or not.
      const rows = buildTreeRows();

      // Act.
      const lines = visibleTreeLines(rows, new Set([ 1, 2, 5 ]));

      // Assert.
      expect(lines.map(line => `${line.id}:${line.depth}:${line.expanded}`))
        .toStrictEqual([ '1:0:true', '2:1:true', '3:2:false', '5:1:false', '6:0:false' ]);
    });
  });

  it('starts with the branches the file says are open', () =>
  {
    // Arrange.
    const rows = buildTreeRows();

    // Act.
    const open = initiallyExpanded(rows);

    // Assert.
    expect(open)
      .toStrictEqual([ 1 ]);
  });

  it('opens every branch above a map to reveal it, keeping the ones already open', () =>
  {
    // Arrange.
    const rows = buildTreeRows();

    // Act.
    const open = revealMaps(rows, new Set([ 6 ]), [ 3 ]);

    // Assert.
    expect([ ...open ].sort())
      .toStrictEqual([ 1, 2, 6 ]);
  });

  describe('selection', () =>
  {
    const lines = visibleTreeLines(buildTreeRows(), new Set([ 1, 2 ]));

    it('selects a run in the order shown, whichever way the Shift click goes', () =>
    {
      // Arrange: lines are 1, 2, 3, 5, 6.

      // Act.
      const runs = [ selectRange(lines, 2, 5), selectRange(lines, 6, 3) ];

      // Assert.
      expect(runs)
        .toStrictEqual([ [ 2, 3, 5 ], [ 3, 5, 6 ] ]);
    });

    it('treats a Shift click with no anchor shown as a plain click, and one on a line not shown as nothing', () =>
    {
      // Arrange: map 4 is not in the tree.

      // Act.
      const runs = [ selectRange(lines, null, 5), selectRange(lines, 4, 5), selectRange(lines, 2, 4) ];

      // Assert.
      expect(runs)
        .toStrictEqual([ [ 5 ], [ 5 ], [] ]);
    });

    it('moves a pick inside a branch being closed onto the branch, once, keeping picks elsewhere in order', () =>
    {
      // Arrange: the inn sits inside the town, which sits inside the world; the cave sits beside the town.
      const rows = buildTreeRows();

      // Act.
      const closingTown = selectionAfterCollapse(rows, [ 6, 3, 5 ], 2);
      const closingWorld = selectionAfterCollapse(rows, [ 3, 6, 2, 5 ], 1);

      // Assert.
      expect([ closingTown, closingWorld ])
        .toStrictEqual([ [ 6, 2, 5 ], [ 1, 6 ] ]);
    });

    it('leaves the selection alone when nothing picked is inside the branch being closed', () =>
    {
      // Arrange: the town itself and the cave beside it are picked, neither inside the town's branch.
      const rows = buildTreeRows();

      // Act.
      const picked = selectionAfterCollapse(rows, [ 2, 5 ], 2);

      // Assert.
      expect(picked)
        .toStrictEqual([ 2, 5 ]);
    });

    it('adds a line with a Ctrl click, and takes it out with another', () =>
    {
      // Arrange.
      const selection = [ 2 ];

      // Act.
      const added = toggleSelection(selection, 5);
      const removed = toggleSelection(added, 2);

      // Assert.
      expect([ added, removed ])
        .toStrictEqual([ [ 2, 5 ], [ 5 ] ]);
    });

    it('drags the whole selection when the dragged row is in it, and the row alone otherwise', () =>
    {
      // Arrange.
      const selection = [ 2, 5 ];

      // Act.
      const dragged = [ draggedMaps(selection, 5), draggedMaps(selection, 6) ];

      // Assert.
      expect(dragged)
        .toStrictEqual([ [ 2, 5 ], [ 6 ] ]);
    });
  });

  describe('dropping', () =>
  {
    it('lands in front from the top quarter, after from the bottom quarter, and inside from the middle', () =>
    {
      // Arrange: a 24-pixel row.

      // Act.
      const zones = [ dropZoneAt(0, 24), dropZoneAt(5.9, 24), dropZoneAt(6, 24), dropZoneAt(18, 24), dropZoneAt(18.1, 24), dropZoneAt(24, 24) ];

      // Assert.
      expect(zones)
        .toStrictEqual([ 'before', 'before', 'inside', 'inside', 'after', 'after' ]);
    });

    it('turns each zone into a place in the tree', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const places = [
        dropPlace(rows, 5, 'inside'),
        dropPlace(rows, 5, 'before'),
        dropPlace(rows, 2, 'after'),
        dropPlace(rows, 5, 'after'),
        dropPlace(rows, 6, 'after'),
      ];

      // Assert.
      expect(places)
        .toStrictEqual([
          { parentId: 5, beforeId: null },
          { parentId: 1, beforeId: 5 },
          { parentId: 1, beforeId: 5 },
          { parentId: 1, beforeId: null },
          { parentId: TREE_ROOT, beforeId: null },
        ]);
    });
  });

  describe('deleteQuestion', () =>
  {
    it('counts every map a branch takes with it', () =>
    {
      // Arrange: the town holds the inn.
      const rows = buildTreeRows();

      // Act.
      const question = deleteQuestion(rows, [ 2 ]);

      // Assert.
      expect(question)
        .toStrictEqual({ count: 2, text: 'Delete "Town" and 1 map inside? This removes 2 maps.' });
    });

    it('counts a map picked inside another picked map once', () =>
    {
      // Arrange: the inn is picked along with the town that holds it, and the cave beside them.
      const rows = buildTreeRows();

      // Act.
      const question = deleteQuestion(rows, [ 3, 2, 5 ]);

      // Assert.
      expect(question)
        .toStrictEqual({ count: 3, text: 'Delete 2 maps and 1 map inside? This removes 3 maps.' });
    });

    it('says one map for a map with nothing inside', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const question = deleteQuestion(rows, [ 6 ]);

      // Assert.
      expect(question)
        .toStrictEqual({ count: 1, text: 'Delete "Test"? This removes 1 map.' });
    });

    it('asks nothing when nothing in the tree is picked', () =>
    {
      // Arrange: slot 4 is free.
      const rows = buildTreeRows();

      // Act.
      const questions = [ deleteQuestion(rows, []), deleteQuestion(rows, [ 4 ]) ];

      // Assert.
      expect(questions)
        .toStrictEqual([ null, null ]);
    });
  });
});
