import { describe, expect, it } from 'vitest';
import { freshBlock, hasElseBranch, reconcileBlock, setElseBranch } from '../../../../src/mapEditor/core/commandList/blockReconcile.ts';
import { readCommandTree, type CommandBlockNode } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMixedList, cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * An editor only ever changes a block's opener; the branches have to follow. A Show Choices gains a branch per new
 * choice and loses the branch of a removed one, keeps every surviving branch with everything under it (renamed to
 * its choice's new text), and has a cancel branch exactly when cancelling has one. A battle has outcome branches
 * exactly when it can escape or lose. A block already in line comes back unchanged, so reconciling after every edit
 * is always safe, and a conditional branch's else, which lives in the list's shape rather than its parameters, is
 * added and removed here too.
 */
describe('blockReconcile', () =>
{
  /**
   * Describes commands compactly: code, indent and, for choices, the choice text.
   * @param {readonly RmmzEventCommand[]} commands The commands.
   * @returns {string[]} Such as "402@0 Yes".
   */
  const describeList = (commands: readonly RmmzEventCommand[]): string[] => commands.map(command => (command.code === 402
    ? `402@${command.indent} ${String(command.parameters[1])}`
    : `${command.code}@${command.indent}`));

  /**
   * The mixed list with its Show Choices' opener changed.
   * @param {unknown[]} parameters The opener's new parameters.
   * @returns {RmmzEventCommand[]} The list.
   */
  const withChoices = (parameters: unknown[]): RmmzEventCommand[] =>
  {
    const list = buildMixedList();
    list[13] = cmd(102, 0, parameters as never);
    return list;
  };

  describe('reconcileBlock', () =>
  {
    it('leaves a Show Choices already in line exactly as it was', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 13);

      // Assert.
      expect(reconciled)
        .toStrictEqual(list);
    });

    it('adds a branch for a new choice, keeping the others and what is under them', () =>
    {
      // Arrange: a third choice, cancel still its own branch.
      const list = withChoices([ [ 'Yes', 'No', 'Maybe' ], -2, 0, 2, 0 ]);

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 13);

      // Assert.
      expect(describeList(reconciled.slice(13)))
        .toStrictEqual([ '102@0', '402@0 Yes', '230@1', '0@1', '402@0 No', '0@1', '402@0 Maybe', '0@1', '403@0', '0@1', '404@0', '0@0' ]);
    });

    it('drops the branch of a removed choice, renames the survivors, and drops the cancel branch when cancelling has none', () =>
    {
      // Arrange: one choice left, renamed, cancelling now disallowed.
      const list = withChoices([ [ 'Sure' ], -1, 0, 2, 0 ]);

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 13);

      // Assert.
      expect(describeList(reconciled.slice(13)))
        .toStrictEqual([ '102@0', '402@0 Sure', '230@1', '0@1', '404@0', '0@0' ]);
    });

    it('adds a cancel branch when cancelling gets one', () =>
    {
      // Arrange: a Show Choices with no cancel branch, switched to have one.
      const list = [ cmd(102, 1, [ [ 'A' ], -2, 0, 2, 0 ]), cmd(402, 1, [ 0, 'A' ]), cmd(0, 2), cmd(404, 1) ];

      // Act.
      const reconciled = reconcileBlock([ cmd(111, 0, [ 0, 1, 0 ]), ...list, cmd(0, 1), cmd(412, 0), cmd(0, 0) ], MZ_STRUCTURE, 1);

      // Assert.
      expect([ describeList(reconciled.slice(1, 7)), reconciled[4].parameters ])
        .toStrictEqual([ [ '102@1', '402@1 A', '0@2', '403@1', '0@2', '404@1' ], [ 6, null ] ]);
    });

    it('leaves the next Show Choices of a merged run untouched', () =>
    {
      // Arrange: two Show Choices back to back, as HIME_LargeChoices merges them; the first gains a choice.
      const list = [
        cmd(102, 0, [ [ 'A', 'B' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(404, 0),
        cmd(102, 0, [ [ 'C' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'C' ]), cmd(0, 1), cmd(404, 0),
        cmd(0, 0),
      ];

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 0);

      // Assert: the second block keeps its own numbering and follows the first at once.
      expect([ describeList(reconciled), reconciled[6].parameters ])
        .toStrictEqual([
          [ '102@0', '402@0 A', '0@1', '402@0 B', '0@1', '404@0', '102@0', '402@0 C', '0@1', '404@0', '0@0' ],
          [ 0, 'C' ],
        ]);
    });

    it('gives a battle outcome branches when it can escape or lose, win first', () =>
    {
      // Arrange: a plain battle switched to escapable.
      const list = [ cmd(301, 0, [ 0, 1, true, false ]), cmd(0, 0) ];

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 0);

      // Assert.
      expect(describeList(reconciled))
        .toStrictEqual([ '301@0', '601@0', '0@1', '602@0', '0@1', '604@0', '0@0' ]);
    });

    it('keeps a battle\'s outcome bodies, adding and dropping branches as its settings change', () =>
    {
      // Arrange: win and escape branches with a command each; escaping off, losing on.
      const list = [
        cmd(301, 0, [ 0, 1, false, true ]),
        cmd(601, 0), cmd(221, 1), cmd(0, 1),
        cmd(602, 0), cmd(222, 1), cmd(0, 1),
        cmd(604, 0),
        cmd(0, 0),
      ];

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 0);

      // Assert.
      expect(describeList(reconciled))
        .toStrictEqual([ '301@0', '601@0', '221@1', '0@1', '603@0', '0@1', '604@0', '0@0' ]);
    });

    it('takes a battle\'s branches away when it can neither escape nor lose', () =>
    {
      // Arrange.
      const list = [ cmd(301, 0, [ 0, 1, false, false ]), cmd(601, 0), cmd(221, 1), cmd(0, 1), cmd(604, 0), cmd(0, 0) ];

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 0);

      // Assert.
      expect(describeList(reconciled))
        .toStrictEqual([ '301@0', '0@0' ]);
    });

    it('leaves a plain battle plain', () =>
    {
      // Arrange.
      const list = [ cmd(301, 0, [ 0, 1, false, false ]), cmd(230, 0, [ 5 ]), cmd(0, 0) ];

      // Act.
      const reconciled = reconcileBlock(list, MZ_STRUCTURE, 0);

      // Assert.
      expect(reconciled)
        .toStrictEqual(list);
    });

    it('leaves every other command, and a Show Choices that never closed, as they are', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const unclosed = [ cmd(102, 0, [ [ 'A' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(0, 0) ];

      // Act.
      const reconciled = [ reconcileBlock(list, MZ_STRUCTURE, 3), reconcileBlock(unclosed, MZ_STRUCTURE, 0) ];

      // Assert.
      expect(reconciled)
        .toStrictEqual([ list, unclosed ]);
    });
  });

  describe('hasElseBranch and setElseBranch', () =>
  {
    it('reports the else a branch has', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const branch = tree.root.nodes[1] as CommandBlockNode;
      const plain = readCommandTree([ cmd(111, 0, [ 0, 1, 0 ]), cmd(0, 1), cmd(412, 0), cmd(0, 0) ], MZ_STRUCTURE).root.nodes[0] as CommandBlockNode;

      // Act.
      const answers = [ hasElseBranch(list, branch), hasElseBranch([ cmd(111, 0, [ 0, 1, 0 ]), cmd(0, 1), cmd(412, 0), cmd(0, 0) ], plain) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, false ]);
    });

    it('adds an empty else before the branch\'s end', () =>
    {
      // Arrange.
      const list = [ cmd(111, 1, [ 0, 1, 0 ]), cmd(230, 2, [ 5 ]), cmd(0, 2), cmd(412, 1) ];
      const wrapped = [ cmd(112, 0), ...list, cmd(0, 1), cmd(413, 0), cmd(0, 0) ];
      const loop = readCommandTree(wrapped, MZ_STRUCTURE).root.nodes[0] as CommandBlockNode;
      const branch = loop.segments[0].body!.nodes[0] as CommandBlockNode;

      // Act.
      const changed = setElseBranch(wrapped, branch, true);

      // Assert.
      expect(describeList(changed.slice(1, 8)))
        .toStrictEqual([ '111@1', '230@2', '0@2', '411@1', '0@2', '412@1', '0@1' ]);
    });

    it('takes the else away with everything under it', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const branch = readCommandTree(list, MZ_STRUCTURE).root.nodes[1] as CommandBlockNode;

      // Act.
      const changed = setElseBranch(list, branch, false);

      // Assert.
      expect(describeList(changed.slice(3, 8)))
        .toStrictEqual([ '111@0', '250@1', '0@1', '412@0', '102@0' ]);
    });

    it('changes nothing when the branch already is that way, or is not a conditional branch', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const branch = tree.root.nodes[1] as CommandBlockNode;
      const choices = tree.root.nodes[2] as CommandBlockNode;

      // Act.
      const changed = [ setElseBranch(list, branch, true), setElseBranch(list, choices, true) ];

      // Assert.
      expect(changed)
        .toStrictEqual([ list, list ]);
    });
  });

  describe('freshBlock', () =>
  {
    it('builds a body and closer around an opener that owns a body, at the opener\'s indent', () =>
    {
      // Arrange.
      const opener = cmd(111, 2, [ 0, 1, 0 ]);

      // Act.
      const block = freshBlock(opener, 412, MZ_STRUCTURE);

      // Assert.
      expect(describeList(block))
        .toStrictEqual([ '111@2', '0@3', '412@2' ]);
    });

    it('builds a Show Choices with a branch per choice and a cancel branch when it has one', () =>
    {
      // Arrange.
      const opener = cmd(102, 1, [ [ 'Yes', 'No' ], -2, 0, 2, 0 ]);

      // Act.
      const block = freshBlock(opener, 404, MZ_STRUCTURE);

      // Assert.
      expect(describeList(block))
        .toStrictEqual([ '102@1', '402@1 Yes', '0@2', '402@1 No', '0@2', '403@1', '0@2', '404@1' ]);
    });

    it('builds a plain battle as just its command', () =>
    {
      // Arrange.
      const opener = cmd(301, 0, [ 0, 1, false, false ]);

      // Act.
      const block = freshBlock(opener, 604, MZ_STRUCTURE);

      // Assert.
      expect(describeList(block))
        .toStrictEqual([ '301@0' ]);
    });
  });
});
