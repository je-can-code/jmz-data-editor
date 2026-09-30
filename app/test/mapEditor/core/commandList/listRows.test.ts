import { describe, expect, it } from 'vitest';
import { readCommandTree } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { buildListRows, startsFolded, type ListRow } from '../../../../src/mapEditor/core/commandList/listRows.ts';
import { buildMixedList, cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * The rows are what the author sees of a list: every unit in order, the lines continuing a command inside its row,
 * each body's end as a row of its own where a command can be added, and the branches and ends of blocks between
 * them. Folding hides what sits under a head: a conditional branch, a choice or an else folds its own body, and a
 * Show Choices, which has no body of its own, folds its whole block into one row. The module owes the list rows
 * that match the tree exactly, with each fold hiding what it says and nothing else, and counting what it hides.
 */
describe('listRows', () =>
{
  /**
   * Describes rows compactly: kind and command index.
   * @param {readonly ListRow[]} rows The rows.
   * @returns {string[]} Such as "line 0".
   */
  const describeRows = (rows: readonly ListRow[]): string[] => rows.map(row => `${row.kind} ${row.index}`);

  describe('buildListRows', () =>
  {
    it('lays out every unit, branch, end and body end in order when nothing is folded', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const rows = buildListRows(tree, () => false);

      // Assert.
      expect(describeRows(rows))
        .toStrictEqual([
          'line 0', 'opener 3', 'line 4', 'terminator 5', 'branch 6', 'opener 7', 'line 8', 'terminator 9', 'closer 10',
          'terminator 11', 'closer 12', 'opener 13', 'branch 14', 'line 15', 'terminator 16', 'branch 17', 'terminator 18',
          'branch 19', 'terminator 20', 'closer 21', 'terminator 22',
        ]);
    });

    it('shows a line\'s continuation inside its row', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const [ text ] = buildListRows(tree, () => false);

      // Assert.
      expect([ text.index, text.end, text.foldable ])
        .toStrictEqual([ 0, 3, false ]);
    });

    it('folds a branch\'s own body, counting what it hides, and leaves its else open', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const rows = buildListRows(tree, index => index === 3);

      // Assert.
      expect([ describeRows(rows).slice(0, 4), rows[1].folded, rows[1].hidden ])
        .toStrictEqual([ [ 'line 0', 'opener 3', 'branch 6', 'opener 7' ], true, 2 ]);
    });

    it('folds a whole Show Choices into its opener row, closer and all', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const rows = buildListRows(tree, index => index === 13);
      const opener = rows.find(row => row.index === 13) as ListRow;

      // Assert.
      expect([ describeRows(rows).slice(-2), opener.folded, opener.hidden, opener.foldable ])
        .toStrictEqual([ [ 'opener 13', 'terminator 22' ], true, 8, true ]);
    });

    it('never folds a choice\'s body when only a sibling choice is folded', () =>
    {
      // Arrange: the second choice folded; its empty body hides only its own end.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const rows = buildListRows(tree, index => index === 17);

      // Assert.
      expect(describeRows(rows).slice(12, 17))
        .toStrictEqual([ 'branch 14', 'line 15', 'terminator 16', 'branch 17', 'branch 19' ]);
    });

    it('offers no fold on a line, a closer or a body end', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const rows = buildListRows(tree, () => true);
      const unfoldable = rows.filter(row => row.kind === 'line' || row.kind === 'closer' || row.kind === 'terminator');

      // Assert.
      expect(unfoldable.every(row => row.foldable === false && row.folded === false))
        .toBe(true);
    });

    it('ties a body end row to the body it ends and the block that owns it', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const rows = buildListRows(tree, () => false);
      const inner = rows.find(row => row.index === 5) as ListRow;
      const outer = rows.find(row => row.index === 22) as ListRow;

      // Assert.
      expect([ inner.indent, inner.node?.start, outer.node, outer.body === tree.root ])
        .toStrictEqual([ 1, 3, null, true ]);
    });

    it('lays out commands after the list\'s end as rows of their own', () =>
    {
      // Arrange.
      const tree = readCommandTree([ cmd(0, 0), cmd(230, 0, [ 5 ]) ], MZ_STRUCTURE);

      // Act.
      const rows = buildListRows(tree, () => false);

      // Assert.
      expect(describeRows(rows))
        .toStrictEqual([ 'terminator 0', 'line 1' ]);
    });
  });

  describe('startsFolded', () =>
  {
    it('starts a branch MZ folded shut folded, and nothing else', () =>
    {
      // Arrange.
      const folded = { ...cmd(111, 0), collapsed: true };
      const open = { ...cmd(111, 0), collapsed: false };

      // Act.
      const answers = [ startsFolded(folded), startsFolded(open), startsFolded(cmd(111, 0)), startsFolded(undefined) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, false, false, false ]);
    });
  });
});
