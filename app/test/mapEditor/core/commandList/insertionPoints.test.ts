import { describe, expect, it } from 'vitest';
import { readCommandTree, type CommandBlockNode } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import {
  areaTagFloor,
  canDropAt,
  dropTargetAt,
  insertionIndex,
  pointAfterNode,
  pointAtRow,
  pointBeforeNode,
  pointBelowRow,
  pointOfGap,
  settleInsertion,
  splitsChoiceRun,
  type InsertionPoint,
} from '../../../../src/mapEditor/core/commandList/insertionPoints.ts';
import { buildListRows, type ListRow } from '../../../../src/mapEditor/core/commandList/listRows.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMixedList, cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * Every command that is added, pasted or dropped lands at an insertion point: a body, and how many of its units come
 * before. That is what keeps an edit from ever landing between a block's branches, or inside the very block being
 * dragged. The module owes the list the right point for every gap between rows (below an open head is the top of
 * its body, below a folded one its end, below Show Choices' own row nowhere at all), the right index and indent for
 * each point, and a drop target that never marks a gap the drop would not land in.
 *
 * It also owes the game two shapes it reads across units. Show Choices blocks back to back are one choice window
 * to HIME_LargeChoices, so no addition, paste or drop lands between them. And KMS_AreaEvent reads an event's area
 * from the comments a page opens with, so nothing but a comment lands above the comment holding the area tag.
 */
describe('insertionPoints', () =>
{
  /**
   * The mixed list's tree and rows, nothing folded unless asked.
   * @param {(index: number) => boolean} isFolded Which heads are folded.
   * @returns {{ tree: CommandTree, rows: ListRow[], list: readonly RmmzEventCommand[] }} The tree, rows and list.
   */
  const build = (isFolded: (index: number) => boolean = () => false) =>
  {
    const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);
    return { tree, rows: buildListRows(tree, isFolded), list: tree.list };
  };

  /**
   * A tree and rows of any list, nothing folded.
   * @param {RmmzEventCommand[]} list The list.
   * @returns {{ tree: CommandTree, rows: ListRow[] }} The tree and rows.
   */
  const buildOf = (list: RmmzEventCommand[]) =>
  {
    const tree = readCommandTree(list, MZ_STRUCTURE);
    return { tree, rows: buildListRows(tree, () => false) };
  };

  /**
   * Describes a point by the index it inserts at and its indent.
   * @param {InsertionPoint | null} point The point.
   * @returns {string} Such as "3@0", or "none".
   */
  const describePoint = (point: InsertionPoint | null): string => (point === null ? 'none' : `${insertionIndex(point)}@${point.body.indent}`);

  /**
   * Finds the row showing a command.
   * @param {readonly ListRow[]} rows The rows.
   * @param {number} index The command's index.
   * @returns {ListRow} The row.
   */
  const rowAt = (rows: readonly ListRow[], index: number): ListRow => rows.find(row => row.index === index) as ListRow;

  /**
   * A wait, then two Show Choices back to back that HIME_LargeChoices merges into one window, then a wait.
   * @returns {RmmzEventCommand[]} The list.
   */
  const buildRun = (): RmmzEventCommand[] => [
    cmd(230, 0, [ 5 ]), // 0
    cmd(102, 0, [ [ 'A' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(404, 0), // 1 to 4
    cmd(102, 0, [ [ 'B' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'B' ]), cmd(0, 1), cmd(404, 0), // 5 to 8
    cmd(230, 0, [ 6 ]), // 9
    cmd(0, 0), // 10
  ];

  /**
   * A page opening with a plain comment, then the area comment (its tag on the comment's second line), then a wait.
   * @returns {RmmzEventCommand[]} The list.
   */
  const buildAreaPage = (): RmmzEventCommand[] => [
    cmd(108, 0, [ 'a door' ]), // 0
    cmd(108, 0, [ 'wide:' ]), cmd(408, 0, [ '<areaEvent:3x1>' ]), // 1 to 2
    cmd(230, 0, [ 5 ]), // 3
    cmd(0, 0), // 4
  ];

  describe('insertionIndex', () =>
  {
    it('inserts before the unit at the position, or at the body\'s end', () =>
    {
      // Arrange.
      const { tree } = build();
      const branch = tree.root.nodes[1] as CommandBlockNode;

      // Act.
      const indexes = [ insertionIndex({ body: tree.root, position: 1 }), insertionIndex({ body: branch.segments[0].body!, position: 1 }), insertionIndex({ body: tree.root, position: 3 }) ];

      // Assert.
      expect(indexes)
        .toStrictEqual([ 3, 5, 22 ]);
    });

    it('inserts at a body\'s last index when it never met its end', () =>
    {
      // Arrange: a list with no end.
      const tree = readCommandTree([ cmd(230, 0, [ 5 ]) ], MZ_STRUCTURE);

      // Act.
      const index = insertionIndex({ body: tree.root, position: 1 });

      // Assert.
      expect(index)
        .toBe(1);
    });
  });

  describe('pointBelowRow', () =>
  {
    it('puts the place after a line or a closer in the body it sits in', () =>
    {
      // Arrange.
      const { rows, list } = build();

      // Act.
      const points = [ 0, 10, 12 ].map(index => describePoint(pointBelowRow(rowAt(rows, index), list)));

      // Assert: after Show Text; after the loop, inside the else; after the whole branch.
      expect(points)
        .toStrictEqual([ '3@0', '11@1', '13@0' ]);
    });

    it('puts the place at the top of an open head\'s body, and at the end of a folded one', () =>
    {
      // Arrange.
      const open = build();
      const folded = build(index => index === 3);

      // Act.
      const points = [
        pointBelowRow(rowAt(open.rows, 3), open.list),
        pointBelowRow(rowAt(folded.rows, 3), folded.list),
        pointBelowRow(rowAt(open.rows, 17), open.list),
      ].map(describePoint);

      // Assert.
      expect(points)
        .toStrictEqual([ '4@1', '5@1', '18@1' ]);
    });

    it('takes nothing below an open Show Choices, and the place after the block below a folded one', () =>
    {
      // Arrange.
      const open = build();
      const folded = build(index => index === 13);

      // Act.
      const points = [ pointBelowRow(rowAt(open.rows, 13), open.list), pointBelowRow(rowAt(folded.rows, 13), folded.list) ].map(describePoint);

      // Assert.
      expect(points)
        .toStrictEqual([ 'none', '22@0' ]);
    });

    it('keeps the place below a body\'s end row at that body\'s end', () =>
    {
      // Arrange.
      const { rows, list } = build();

      // Act.
      const points = [ pointBelowRow(rowAt(rows, 5), list), pointBelowRow(rowAt(rows, 22), list) ].map(describePoint);

      // Assert.
      expect(points)
        .toStrictEqual([ '5@1', '22@0' ]);
    });

    it('takes nothing below a command left after the list\'s end', () =>
    {
      // Arrange.
      const tree = readCommandTree([ cmd(0, 0), cmd(230, 0, [ 5 ]) ], MZ_STRUCTURE);
      const rows = buildListRows(tree, () => false);

      // Act.
      const point = pointBelowRow(rows[1], tree.list);

      // Assert.
      expect(point)
        .toBeNull();
    });

    it('puts the place below a merged Show Choices run\'s first end after the whole run', () =>
    {
      // Arrange: the first block's end row, and the second block's (a near miss that already ends the run).
      const { tree, rows } = buildOf(buildRun());

      // Act.
      const points = [ pointBelowRow(rowAt(rows, 4), tree.list), pointBelowRow(rowAt(rows, 8), tree.list) ].map(describePoint);

      // Assert.
      expect(points)
        .toStrictEqual([ '9@0', '9@0' ]);
    });
  });

  describe('pointOfGap', () =>
  {
    it('puts gap 0 at the list\'s top, and any other gap below the row above it', () =>
    {
      // Arrange.
      const { tree, rows } = build();

      // Act.
      const points = [ pointOfGap(tree, rows, 0), pointOfGap(tree, rows, 1), pointOfGap(tree, rows, 99) ].map(describePoint);

      // Assert.
      expect(points)
        .toStrictEqual([ '0@0', '3@0', 'none' ]);
    });

    it('keeps a gap inside a merged Show Choices run where it is, for the drop to refuse', () =>
    {
      // Arrange: the gap below the first block's end row.
      const { tree, rows } = buildOf(buildRun());
      const gap = rows.findIndex(row => row.index === 4) + 1;

      // Act.
      const point = pointOfGap(tree, rows, gap);

      // Assert.
      expect(describePoint(point))
        .toBe('5@0');
    });
  });

  describe('pointAtRow', () =>
  {
    it('adds before a line or a block, at the end of a body for its end row, and nowhere at a branch or closer', () =>
    {
      // Arrange.
      const { rows, list } = build();

      // Act.
      const points = [ 0, 3, 5, 6, 12 ].map(index => describePoint(pointAtRow(rowAt(rows, index), list)));

      // Assert.
      expect(points)
        .toStrictEqual([ '0@0', '3@0', '5@1', 'none', 'none' ]);
    });

    it('adds before the whole of a merged Show Choices run from any of its openers', () =>
    {
      // Arrange: the run's second opener, its first, and the wait after it as a near miss.
      const { tree, rows } = buildOf(buildRun());

      // Act.
      const points = [ 5, 1, 9 ].map(index => describePoint(pointAtRow(rowAt(rows, index), tree.list)));

      // Assert.
      expect(points)
        .toStrictEqual([ '1@0', '1@0', '9@0' ]);
    });
  });

  describe('pointBeforeNode and pointAfterNode', () =>
  {
    it('put the place on either side of a unit in its body', () =>
    {
      // Arrange.
      const { tree } = build();
      const [ , branch ] = tree.root.nodes;

      // Act.
      const points = [ pointBeforeNode(branch), pointAfterNode(branch) ].map(describePoint);

      // Assert.
      expect(points)
        .toStrictEqual([ '3@0', '13@0' ]);
    });

    it('take nothing beside a unit left after the list\'s end', () =>
    {
      // Arrange.
      const tree = readCommandTree([ cmd(0, 0), cmd(230, 0, [ 5 ]) ], MZ_STRUCTURE);
      const [ stray ] = tree.trailing;

      // Act.
      const points = [ pointBeforeNode(stray), pointAfterNode(stray) ];

      // Assert.
      expect(points)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('splitsChoiceRun', () =>
  {
    it('finds only the place between two Show Choices back to back', () =>
    {
      // Arrange: a run of two, and a Show Choices with a wait after it in the mixed list as a near miss.
      const run = buildOf(buildRun()).tree;
      const mixed = build().tree;

      // Act.
      const answers = [
        splitsChoiceRun(run.list, { body: run.root, position: 2 }),
        splitsChoiceRun(run.list, { body: run.root, position: 1 }),
        splitsChoiceRun(run.list, { body: run.root, position: 3 }),
        splitsChoiceRun(mixed.list, { body: mixed.root, position: 3 }),
      ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, false, false, false ]);
    });
  });

  describe('areaTagFloor', () =>
  {
    it('keeps every unit through the area comment first, when the page opens with comments holding it', () =>
    {
      // Arrange: the area page, the same page with its tag after the wait, and a page with no tag at all.
      const opening = buildOf(buildAreaPage()).tree;
      const late = buildOf([ cmd(230, 0, [ 5 ]), cmd(108, 0, [ '<AreaEvent:2x2>' ]), cmd(0, 0) ]).tree;
      const none = buildOf([ cmd(108, 0, [ 'a note' ]), cmd(0, 0) ]).tree;

      // Act.
      const floors = [ areaTagFloor(opening), areaTagFloor(late), areaTagFloor(none) ];

      // Assert.
      expect(floors)
        .toStrictEqual([ 2, 0, 0 ]);
    });

    it('reads a page of nothing but comments, and the tag under its other name', () =>
    {
      // Arrange.
      const { tree } = buildOf([ cmd(108, 0, [ 'first' ]), cmd(108, 0, [ '<エリアイベント 2x3>' ]), cmd(0, 0) ]);

      // Act.
      const floor = areaTagFloor(tree);

      // Assert.
      expect(floor)
        .toBe(2);
    });
  });

  describe('settleInsertion', () =>
  {
    it('moves a command that is not a comment from above the area comment to just below it', () =>
    {
      // Arrange.
      const { tree } = buildOf(buildAreaPage());

      // Act.
      const settled = settleInsertion(tree, { body: tree.root, position: 0 }, [ cmd(250, 0, [ { name: 'Door', volume: 90, pitch: 100, pan: 0 } ]) ]);

      // Assert.
      expect(describePoint(settled))
        .toBe('3@0');
    });

    it('leaves a comment above the area comment, and anything below it, where they were aimed', () =>
    {
      // Arrange.
      const { tree } = buildOf(buildAreaPage());
      const top = { body: tree.root, position: 0 };
      const below = { body: tree.root, position: 2 };

      // Act.
      const settled = [ settleInsertion(tree, top, [ cmd(108, 0, [ 'more notes' ]) ]), settleInsertion(tree, below, [ cmd(230, 0, [ 1 ]) ]) ];

      // Assert.
      expect(settled)
        .toStrictEqual([ top, below ]);
    });
  });

  describe('canDropAt', () =>
  {
    it('refuses a place inside a unit being moved, and allows one beside it', () =>
    {
      // Arrange.
      const { tree } = build();
      const branch = tree.root.nodes[1] as CommandBlockNode;
      const inside = { body: branch.segments[1].body!, position: 0 };
      const beside = { body: tree.root, position: 3 };

      // Act.
      const answers = [ canDropAt(tree, inside, [ branch ]), canDropAt(tree, beside, [ branch ]), canDropAt(tree, inside, [ tree.root.nodes[0] ]) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ false, true, true ]);
    });

    it('refuses the place between the blocks of a merged Show Choices run, and allows the places around it', () =>
    {
      // Arrange: dragging the last wait.
      const { tree } = buildOf(buildRun());
      const moving = [ tree.root.nodes[3] ];

      // Act.
      const answers = [ 2, 1, 3 ].map(position => canDropAt(tree, { body: tree.root, position }, moving));

      // Assert.
      expect(answers)
        .toStrictEqual([ false, true, true ]);
    });

    it('refuses a command above the area comment, and allows a comment there or a command below it', () =>
    {
      // Arrange: the wait and the plain comment, each dragged.
      const { tree } = buildOf(buildAreaPage());
      const [ comment, , wait ] = tree.root.nodes;

      // Act.
      const answers = [
        canDropAt(tree, { body: tree.root, position: 0 }, [ wait ]),
        canDropAt(tree, { body: tree.root, position: 2 }, [ comment ]),
        canDropAt(tree, { body: tree.root, position: 2 }, [ wait ]),
      ];

      // Assert.
      expect(answers)
        .toStrictEqual([ false, true, true ]);
    });
  });

  describe('dropTargetAt', () =>
  {
    it('takes the gap above for the upper half of a row and below for the lower', () =>
    {
      // Arrange.
      const { tree, rows } = build();

      // Act.
      const targets = [ dropTargetAt(tree, rows, 2, true, []), dropTargetAt(tree, rows, 2, false, []) ];

      // Assert.
      expect(targets.map(target => [ target?.gap, describePoint(target?.point ?? null) ]))
        .toStrictEqual([ [ 2, '4@1' ], [ 3, '5@1' ] ]);
    });

    it('moves off a gap between a block\'s parts to the nearest one that takes the drop, below first', () =>
    {
      // Arrange: the gap below Show Choices' own row takes nothing.
      const { tree, rows } = build();
      const opener = rows.findIndex(row => row.index === 13);

      // Act.
      const target = dropTargetAt(tree, rows, opener, false, []);

      // Assert.
      expect([ target?.gap, describePoint(target?.point ?? null) ])
        .toStrictEqual([ opener + 2, '15@1' ]);
    });

    it('moves off gaps inside the block being dragged', () =>
    {
      // Arrange: dragging the whole branch over its own first body row.
      const { tree, rows } = build();
      const [ , branch ] = tree.root.nodes;

      // Act.
      const target = dropTargetAt(tree, rows, 2, true, [ branch ]);

      // Assert.
      expect([ target?.gap, describePoint(target?.point ?? null) ])
        .toStrictEqual([ 1, '3@0' ]);
    });

    it('moves off the gap between a merged run\'s blocks, to the end of the branch above it', () =>
    {
      // Arrange: the wait dragged over the lower half of the first block's end row.
      const { tree, rows } = buildOf(buildRun());
      const end = rows.findIndex(row => row.index === 4);

      // Act.
      const target = dropTargetAt(tree, rows, end, false, [ tree.root.nodes[0] ]);

      // Assert.
      expect([ target?.gap, describePoint(target?.point ?? null) ])
        .toStrictEqual([ end, '3@1' ]);
    });

    it('finds nowhere when no gap near takes the drop', () =>
    {
      // Arrange: a lone loop dragged over its own body end, every gap nearby inside it.
      const tree = readCommandTree([ cmd(112, 0), cmd(113, 1), cmd(0, 1), cmd(413, 0), cmd(0, 0) ], MZ_STRUCTURE);
      const rows = buildListRows(tree, () => false);
      const [ loop ] = tree.root.nodes;

      // Act.
      const target = dropTargetAt(tree, rows, 2, true, [ loop ]);

      // Assert.
      expect(target)
        .toBeNull();
    });
  });
});
