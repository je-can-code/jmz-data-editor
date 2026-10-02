import { describe, expect, it } from 'vitest';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  copyMaps,
  defaultMapName,
  newMapContent,
  planCreate,
  planDelete,
  planDuplicate,
  planMove,
  planPaste,
  planRename,
  rowPatches,
  TreePlanError,
} from '../../../../src/mapEditor/core/tree/treePlans.ts';
import { TREE_ROOT } from '../../../../src/mapEditor/core/tree/MapTreeModel.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { buildTreeRows, row } from '../../support/treeFixtures.ts';

/*
 * Every tree operation is worked out here before anything is written, so each plan owes the tree service exactly
 * the rows MapInfos.json must hold afterwards, the map files that appear and go, and a label the history panel can
 * list. A new map takes the lowest free id and the shape MZ gives new rows and files; a delete takes a map's whole
 * branch, as MZ does; a move takes a branch along and never into itself; paste and duplicate copy a map's file as
 * it was captured; and nothing changes a field the operation is not about, which rowPatches turns into single-field
 * writes, so a rename and a move of one map undo independently.
 *
 * The fixture tree has a branch two deep beside a sibling, a second top-level map and a free slot (4).
 */
describe('treePlans', () =>
{
  /**
   * Reads each row's name, parent and order from a plan's rows, for compact comparisons.
   * @param {readonly unknown[]} rows The rows.
   * @returns {(string | null)[]} One "name@parent#order" per slot, null for empty slots.
   */
  const shapeOf = (rows: readonly ({ name: string; parentId: number; order: number } | null)[]): (string | null)[] =>
  {
    return rows.map(each => (each === null ? null : `${each.name}@${each.parentId}#${each.order}`));
  };

  describe('newMapContent', () =>
  {
    it('builds the file MZ writes for a new map: 17 by 13, empty tiles, no events', () =>
    {
      // Arrange: nothing but the tileset.

      // Act.
      const content = newMapContent(12);

      // Assert.
      expect([ content.width, content.height, content.tilesetId, content.data.length, content.data.every(cell => cell === 0), content.events ])
        .toStrictEqual([ 17, 13, 12, 17 * 13 * 6, true, [] ]);
      expect([ content.bgm, content.encounterStep, content.parallaxShow, content.displayName ])
        .toStrictEqual([ { name: '', pan: 0, pitch: 100, volume: 90 }, 30, true, '' ]);
    });
  });

  describe('planCreate', () =>
  {
    it('takes the free slot, names the map as MZ does, and hangs it last under its parent', () =>
    {
      // Arrange.
      const content = newMapContent(3);

      // Act.
      const plan = planCreate(buildTreeRows(), 1, content);

      // Assert.
      expect([ plan.label, plan.created.map(each => each.mapId), plan.removed, plan.selection ])
        .toStrictEqual([ 'Create "MAP004"', [ 4 ], [], [ 4 ] ]);
      expect(plan.rows[4])
        .toStrictEqual({ id: 4, expanded: false, name: 'MAP004', order: 5, parentId: 1, scrollX: 0, scrollY: 0, quick: false });
      expect(shapeOf(plan.rows))
        .toStrictEqual([ null, 'World@0#1', 'Town@1#2', 'Inn@2#3', 'MAP004@1#5', 'Cave@1#4', 'Test@0#6' ]);
    });

    it('passes over an id to skip, landing past the end', () =>
    {
      // Arrange.
      const skip = new Set([ 4 ]);

      // Act.
      const plan = planCreate(buildTreeRows(), TREE_ROOT, newMapContent(1), skip);

      // Assert.
      expect([ plan.created[0].mapId, plan.rows.length, plan.rows[7]?.parentId, plan.rows[7]?.order, plan.rows[4] ])
        .toStrictEqual([ 7, 8, 0, 6, null ]);
    });

    it('carries a copy of the new file, not the caller\'s', () =>
    {
      // Arrange.
      const content = newMapContent(1);

      // Act.
      const plan = planCreate(buildTreeRows(), 1, content);
      content.width = 99;

      // Assert.
      expect(plan.created[0].content.width)
        .toBe(17);
    });

    it('refuses a parent that is not in the tree', () =>
    {
      // Arrange: slot 4 is free.

      // Act.
      const attempt = () => planCreate(buildTreeRows(), 4, newMapContent(1));

      // Assert.
      expect(attempt)
        .toThrow(new TreePlanError('Map 4 is not in the tree.'));
    });
  });

  describe('planRename', () =>
  {
    it('changes only the name, trimmed, and says from what to what', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const plan = planRename(rows, 5, '  Crystal Cave ');

      // Assert.
      expect([ plan.label, rowPatches(rows, plan.rows), plan.selection ])
        .toStrictEqual([ 'Rename "Cave" to "Crystal Cave"', [ { path: [ 5, 'name' ], value: 'Crystal Cave' } ], [ 5 ] ]);
    });

    it('refuses an empty name and a map that is not there', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const attempts = [ () => planRename(rows, 5, '   '), () => planRename(rows, 4, 'Ghost') ];

      // Assert.
      expect(attempts[0])
        .toThrow('A map needs a name.');
      expect(attempts[1])
        .toThrow('Map 4 is not in the tree.');
    });
  });

  describe('planMove', () =>
  {
    it('nests a map, with its branch, last under another', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const plan = planMove(rows, [ 2 ], { parentId: 6, beforeId: null });

      // Assert.
      expect([ plan.label, plan.selection ])
        .toStrictEqual([ 'Move "Town"', [ 2 ] ]);
      expect(shapeOf(plan.rows))
        .toStrictEqual([ null, 'World@0#1', 'Town@6#4', 'Inn@2#5', null, 'Cave@1#2', 'Test@0#3' ]);
    });

    it('reorders a map in front of its sibling, touching only orders', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const plan = planMove(rows, [ 5 ], { parentId: 1, beforeId: 2 });

      // Assert.
      expect(rowPatches(rows, plan.rows))
        .toStrictEqual([
          { path: [ 2, 'order' ], value: 3 },
          { path: [ 3, 'order' ], value: 4 },
          { path: [ 5, 'order' ], value: 2 },
        ]);
    });

    it('moves several maps in tree order, a selected map inside a selected branch travelling with it', () =>
    {
      // Arrange: the inn is inside the selected town.
      const rows = buildTreeRows();

      // Act.
      const plan = planMove(rows, [ 6, 3, 2 ], { parentId: 5, beforeId: null });

      // Assert.
      expect([ plan.label, plan.selection ])
        .toStrictEqual([ 'Move 2 maps', [ 2, 6 ] ]);
      expect(shapeOf(plan.rows))
        .toStrictEqual([ null, 'World@0#1', 'Town@5#3', 'Inn@2#4', null, 'Cave@1#2', 'Test@5#5' ]);
    });

    it('lands in front of the next map that stays when the sibling named is moving too, or at the end when it is not there', () =>
    {
      // Arrange.
      const rows = [ null, row(1, 'A', 1, 0), row(2, 'B', 2, 0), row(3, 'C', 3, 0), row(4, 'D', 4, 0) ];

      // Act.
      const inFrontOfMoving = planMove(rows, [ 1, 2 ], { parentId: TREE_ROOT, beforeId: 2 });
      const inFrontOfMissing = planMove(rows, [ 1 ], { parentId: TREE_ROOT, beforeId: 9 });

      // Assert.
      expect([ shapeOf(inFrontOfMoving.rows), shapeOf(inFrontOfMissing.rows) ])
        .toStrictEqual([
          [ null, 'A@0#1', 'B@0#2', 'C@0#3', 'D@0#4' ],
          [ null, 'A@0#4', 'B@0#1', 'C@0#2', 'D@0#3' ],
        ]);
    });

    it('refuses to move a map inside itself or its branch, or with nothing picked', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const attempts = [
        () => planMove(rows, [ 1 ], { parentId: 3, beforeId: null }),
        () => planMove(rows, [ 2 ], { parentId: 2, beforeId: null }),
        () => planMove(rows, [ 4 ], { parentId: TREE_ROOT, beforeId: null }),
      ];

      // Assert.
      expect(attempts[0])
        .toThrow('A map cannot move inside itself.');
      expect(attempts[1])
        .toThrow('A map cannot move inside itself.');
      expect(attempts[2])
        .toThrow('Pick a map to move.');
    });
  });

  describe('planDelete', () =>
  {
    it('takes a map\'s whole branch, and names how many go with it', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const plan = planDelete(rows, [ 2 ]);

      // Assert.
      expect([ plan.label, plan.removed, plan.created, plan.selection ])
        .toStrictEqual([ 'Delete "Town" and 1 map inside', [ 2, 3 ], [], [] ]);
      expect(shapeOf(plan.rows))
        .toStrictEqual([ null, 'World@0#1', null, null, null, 'Cave@1#2', 'Test@0#3' ]);
    });

    it('names a lone map, and counts several with everything inside them', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const plans = [ planDelete(rows, [ 5 ]), planDelete(rows, [ 6, 1 ]) ];

      // Assert.
      expect(plans.map(plan => [ plan.label, plan.removed ]))
        .toStrictEqual([ [ 'Delete "Cave"', [ 5 ] ], [ 'Delete 2 maps and 3 maps inside', [ 1, 2, 3, 5, 6 ] ] ]);
    });

    it('refuses with nothing picked', () =>
    {
      // Arrange: slot 4 is free.

      // Act.
      const attempt = () => planDelete(buildTreeRows(), [ 4 ]);

      // Assert.
      expect(attempt)
        .toThrow('Pick a map to delete.');
    });
  });

  describe('copyMaps and planPaste', () =>
  {
    /**
     * Files for the fixture's maps, each named after its map so copies can be told apart.
     * @returns {Map<number, RmmzMap>} The files.
     */
    const files = (): Map<number, RmmzMap> =>
    {
      return new Map([ 1, 2, 3, 5, 6 ].map(id => [ id, { ...buildMapJson(), displayName: `file ${id}` } ]));
    };

    it('captures the chosen maps in tree order, each hanging from the nearest copied map above it', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const copies = copyMaps(rows, [ 3, 1, 6 ], files());

      // Assert: the inn's town was not copied, so its copy hangs from the world's.
      expect(copies.map(copy => [ copy.sourceId, copy.parentSourceId, copy.name, copy.content.displayName ]))
        .toStrictEqual([ [ 1, null, 'World', 'file 1' ], [ 3, 1, 'Inn', 'file 3' ], [ 6, null, 'Test', 'file 6' ] ]);
    });

    it('refuses a map with no file to copy', () =>
    {
      // Arrange.
      const contents = files();
      contents.delete(5);

      // Act.
      const attempt = () => copyMaps(buildTreeRows(), [ 5 ], contents);

      // Assert.
      expect(attempt)
        .toThrow('Map 5 has no file to copy.');
    });

    it('pastes a copied branch as the same branch under the target, with new ids and the copied files', () =>
    {
      // Arrange.
      const rows = buildTreeRows();
      const copies = copyMaps(rows, [ 2, 3 ], files());

      // Act.
      const plan = planPaste(rows, copies, 6);

      // Assert.
      expect([ plan.label, plan.selection, plan.created.map(each => [ each.mapId, each.content.displayName ]) ])
        .toStrictEqual([ 'Paste 2 maps', [ 4, 7 ], [ [ 4, 'file 2' ], [ 7, 'file 3' ] ] ]);
      expect(shapeOf(plan.rows))
        .toStrictEqual([ null, 'World@0#1', 'Town@1#2', 'Inn@2#3', 'Town@6#6', 'Cave@1#4', 'Test@0#5', 'Inn@4#7' ]);
    });

    it('names a single pasted map, and refuses an empty clipboard or a target that is not there', () =>
    {
      // Arrange.
      const rows = buildTreeRows();
      const copies = copyMaps(rows, [ 5 ], files());

      // Act.
      const plan = planPaste(rows, copies, TREE_ROOT);
      const attempts = [ () => planPaste(rows, [], TREE_ROOT), () => planPaste(rows, copies, 4) ];

      // Assert.
      expect([ plan.label, plan.rows[4]?.parentId, plan.rows[4]?.order ])
        .toStrictEqual([ 'Paste "Cave"', 0, 6 ]);
      expect(attempts[0])
        .toThrow('Nothing is copied.');
      expect(attempts[1])
        .toThrow('Map 4 is not in the tree.');
    });
  });

  describe('planDuplicate', () =>
  {
    it('puts each copy right after its original, under the same parent, named the same', () =>
    {
      // Arrange.
      const rows = buildTreeRows();
      const sources = [ { mapId: 2, content: buildMapJson() }, { mapId: 1, content: { ...buildMapJson(), displayName: 'world file' } } ];

      // Act.
      const plan = planDuplicate(rows, sources);

      // Assert: the world's copy comes first, being higher in the tree.
      expect([ plan.label, plan.selection, plan.created.map(each => [ each.mapId, each.content.displayName ]) ])
        .toStrictEqual([ 'Duplicate 2 maps', [ 4, 7 ], [ [ 4, 'world file' ], [ 7, 'Test Town' ] ] ]);
      expect(shapeOf(plan.rows))
        .toStrictEqual([ null, 'World@0#1', 'Town@1#2', 'Inn@2#3', 'World@0#6', 'Cave@1#5', 'Test@0#7', 'Town@1#4' ]);
    });

    it('names a single duplicate, and refuses with nothing picked', () =>
    {
      // Arrange.
      const rows = buildTreeRows();

      // Act.
      const plan = planDuplicate(rows, [ { mapId: 5, content: buildMapJson() } ]);
      const attempt = () => planDuplicate(rows, [ { mapId: 4, content: buildMapJson() } ]);

      // Assert.
      expect([ plan.label, plan.rows[4]?.parentId, plan.rows[4]?.order ])
        .toStrictEqual([ 'Duplicate "Cave"', 1, 5 ]);
      expect(attempt)
        .toThrow('Pick a map to duplicate.');
    });
  });

  describe('rowPatches', () =>
  {
    it('writes whole rows for maps that enter or leave, and nothing for rows that did not change', () =>
    {
      // Arrange.
      const before = buildTreeRows();
      const after = buildTreeRows();
      after[4] = row(4, 'Well', 6, 0);
      after[5] = null;
      after[6] = row(6, 'Test', 5, 0);

      // Act.
      const patches = rowPatches(before, after);

      // Assert.
      expect(patches)
        .toStrictEqual([ { path: [ 4 ], value: row(4, 'Well', 6, 0) }, { path: [ 5 ], value: null } ]);
    });

    it('appends past the end in id order, empty slots included, and writes removed fields as absent', () =>
    {
      // Arrange.
      const before = buildTreeRows();
      const after = [ ...buildTreeRows(), null, row(8, 'Far', 6, 0) ];
      after[3] = row(3, 'Inn', 3, 2);

      // Act.
      const patches = rowPatches(before, after);

      // Assert.
      expect(patches)
        .toStrictEqual([ { path: [ 3, 'quick' ], value: undefined }, { path: [ 7 ], value: null }, { path: [ 8 ], value: row(8, 'Far', 6, 0) } ]);
    });
  });

  it('names new maps the way MZ does, padded to three digits', () =>
  {
    // Arrange: nothing to arrange.

    // Act.
    const names = [ defaultMapName(4), defaultMapName(385), defaultMapName(1204) ];

    // Assert.
    expect(names)
      .toStrictEqual([ 'MAP004', 'MAP385', 'MAP1204' ]);
  });
});
