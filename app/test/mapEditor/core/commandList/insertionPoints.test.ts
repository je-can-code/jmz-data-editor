import { describe, expect, it } from 'vitest';
import { readCommandTree, type CommandBlockNode } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import {
  canDropAt,
  dropTargetAt,
  insertionIndex,
  pointAfterNode,
  pointAtRow,
  pointBeforeNode,
  pointBelowRow,
  pointOfGap,
  type InsertionPoint,
} from '../../../../src/mapEditor/core/commandList/insertionPoints.ts';
import { buildListRows, type ListRow } from '../../../../src/mapEditor/core/commandList/listRows.ts';
import { buildMixedList, cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * Every command that is added, pasted or dropped lands at an insertion point: a body, and how many of its units come
 * before. That is what keeps an edit from ever landing between a block's branches, or inside the very block being
 * dragged. The module owes the list the right point for every gap between rows (below an open head is the top of
 * its body, below a folded one its end, below Show Choices' own row nowhere at all), the right index and indent for
 * each point, and a drop target that never marks a gap the drop would not land in.
 */
describe('insertionPoints', () =>
{
  /**
   * The mixed list's tree and rows, nothing folded unless asked.
   * @param {(index: number) => boolean} isFolded Which heads are folded.
   * @returns {{ tree: CommandTree, rows: ListRow[] }} The tree and rows.
   */
  const build = (isFolded: (index: number) => boolean = () => false) =>
  {
    const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);
    return { tree, rows: buildListRows(tree, isFolded) };
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
      const { rows } = build();

      // Act.
      const points = [ pointBelowRow(rowAt(rows, 0)), pointBelowRow(rowAt(rows, 10)), pointBelowRow(rowAt(rows, 12)) ].map(describePoint);

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
      const points = [ pointBelowRow(rowAt(open.rows, 3)), pointBelowRow(rowAt(folded.rows, 3)), pointBelowRow(rowAt(open.rows, 17)) ].map(describePoint);

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
      const points = [ pointBelowRow(rowAt(open.rows, 13)), pointBelowRow(rowAt(folded.rows, 13)) ].map(describePoint);

      // Assert.
      expect(points)
        .toStrictEqual([ 'none', '22@0' ]);
    });

    it('keeps the place below a body\'s end row at that body\'s end', () =>
    {
      // Arrange.
      const { rows } = build();

      // Act.
      const points = [ pointBelowRow(rowAt(rows, 5)), pointBelowRow(rowAt(rows, 22)) ].map(describePoint);

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
      const point = pointBelowRow(rows[1]);

      // Assert.
      expect(point)
        .toBeNull();
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
  });

  describe('pointAtRow', () =>
  {
    it('adds before a line or a block, at the end of a body for its end row, and nowhere at a branch or closer', () =>
    {
      // Arrange.
      const { rows } = build();

      // Act.
      const points = [ 0, 3, 5, 6, 12 ].map(index => describePoint(pointAtRow(rowAt(rows, index))));

      // Assert.
      expect(points)
        .toStrictEqual([ '0@0', '3@0', '5@1', 'none', 'none' ]);
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
      const answers = [ canDropAt(inside, [ branch ]), canDropAt(beside, [ branch ]), canDropAt(inside, [ tree.root.nodes[0] ]) ];

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
