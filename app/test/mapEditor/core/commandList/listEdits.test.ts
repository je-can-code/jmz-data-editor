import { describe, expect, it } from 'vitest';
import { readCommandTree, type CommandBlockNode } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import {
  asJsonCommands,
  duplicateNodes,
  insertAt,
  landingIndex,
  moveNodes,
  outermostNodes,
  reindent,
  removeNodes,
  replaceRange,
  spliceBetween,
  toRelativeIndent,
  unitsAtIndent,
} from '../../../../src/mapEditor/core/commandList/listEdits.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMixedList, cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * Every list edit is a pure function from one list to the next, and the difference between them becomes one splice
 * in history. So each function owes a list that is still well formed (blocks whole, bodies ended, every command at
 * the indent of the body it landed in) and exactly what was asked changed; and the splice between two lists owes
 * the smallest change, so one edit in a long list records one command rather than the whole list.
 */
describe('listEdits', () =>
{
  /**
   * Describes commands compactly: code and indent.
   * @param {readonly RmmzEventCommand[]} commands The commands.
   * @returns {string[]} Such as "111@0".
   */
  const describeList = (commands: readonly RmmzEventCommand[]): string[] => commands.map(command => `${command.code}@${command.indent}`);

  describe('outermostNodes', () =>
  {
    it('keeps only the outermost units, in list order, each once', () =>
    {
      // Arrange: the branch, the loop inside it, Show Text, and the branch again.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);
      const [ text, branch ] = tree.root.nodes;
      const [ loop ] = (branch as CommandBlockNode).segments[1].body!.nodes;

      // Act.
      const outer = outermostNodes([ branch, loop, text, branch ]);

      // Assert.
      expect(outer.map(node => node.start))
        .toStrictEqual([ 0, 3 ]);
    });
  });

  describe('unitsAtIndent', () =>
  {
    it('collects each unit\'s commands, continuation and bodies included, in list order', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text, , choices ] = tree.root.nodes;

      // Act.
      const commands = unitsAtIndent(list, [ choices, text ], 1);

      // Assert.
      expect(describeList(commands))
        .toStrictEqual([ '101@1', '401@1', '401@1', '102@1', '402@1', '230@2', '0@2', '402@1', '0@2', '403@1', '0@2', '404@1' ]);
    });

    it('moves each unit by its own depth, so units from different depths line up as siblings', () =>
    {
      // Arrange: the sound deep in the branch, and the loop deeper in the else, with Show Text at the top.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text, branch ] = tree.root.nodes;
      const [ sound ] = (branch as CommandBlockNode).segments[0].body!.nodes;
      const [ loop ] = (branch as CommandBlockNode).segments[1].body!.nodes;

      // Act.
      const commands = unitsAtIndent(list, [ loop, text, sound ], 0);

      // Assert.
      expect(describeList(commands))
        .toStrictEqual([ '101@0', '401@0', '401@0', '250@0', '112@0', '113@1', '0@1', '413@0' ]);
    });
  });

  describe('reindent and toRelativeIndent', () =>
  {
    it('move commands keeping how they nest, as copies', () =>
    {
      // Arrange.
      const commands = [ cmd(112, 2), cmd(113, 3), cmd(0, 3), cmd(413, 2) ];

      // Act.
      const relative = toRelativeIndent(commands);
      const deeper = reindent(relative, 1);

      // Assert.
      expect([ describeList(relative), describeList(deeper), commands[0].indent, relative[0] === commands[0] ])
        .toStrictEqual([ [ '112@0', '113@1', '0@1', '413@0' ], [ '112@1', '113@2', '0@2', '413@1' ], 2, false ]);
    });

    it('make nothing relative out of nothing', () =>
    {
      // Arrange: no commands.

      // Act.
      const relative = toRelativeIndent([]);

      // Assert.
      expect(relative)
        .toStrictEqual([]);
    });
  });

  describe('insertAt', () =>
  {
    it('inserts at a place, moved to that body\'s indent', () =>
    {
      // Arrange: a loop copied from indent 0, landing in the branch's first body.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const branch = tree.root.nodes[1] as CommandBlockNode;

      // Act.
      const inserted = insertAt(list, { body: branch.segments[0].body!, position: 1 }, [ cmd(112, 0), cmd(0, 1), cmd(413, 0) ]);

      // Assert.
      expect([ describeList(inserted.slice(3, 9)), readCommandTree(inserted, MZ_STRUCTURE).irregular ])
        .toStrictEqual([ [ '111@0', '250@1', '112@1', '0@2', '413@1', '0@1' ], 0 ]);
    });
  });

  describe('removeNodes', () =>
  {
    it('removes whole units, nested selections and all', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text, branch ] = tree.root.nodes;
      const [ loop ] = (branch as CommandBlockNode).segments[1].body!.nodes;

      // Act.
      const removed = removeNodes(list, [ loop, branch, text ]);

      // Assert.
      expect(describeList(removed).slice(0, 2))
        .toStrictEqual([ '102@0', '402@0' ]);
    });
  });

  describe('moveNodes', () =>
  {
    it('moves units down past others, re-indented to where they land', () =>
    {
      // Arrange: Show Text dropped into the first choice, after its wait.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text, , choices ] = tree.root.nodes;
      const firstChoice = (choices as CommandBlockNode).segments[1].body!;

      // Act.
      const moved = moveNodes(list, [ text ], { body: firstChoice, position: 1 });

      // Assert.
      expect([ describeList(moved.slice(11, 17)), moved.length, readCommandTree(moved, MZ_STRUCTURE).irregular ])
        .toStrictEqual([ [ '402@0', '230@1', '101@1', '401@1', '401@1', '0@1' ], list.length, 0 ]);
    });

    it('moves units up, out of a block to the list\'s top', () =>
    {
      // Arrange: the loop inside the else, dropped at the very top.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ loop ] = (tree.root.nodes[1] as CommandBlockNode).segments[1].body!.nodes;

      // Act.
      const moved = moveNodes(list, [ loop ], { body: tree.root, position: 0 });

      // Assert.
      expect([ describeList(moved.slice(0, 5)), readCommandTree(moved, MZ_STRUCTURE).irregular ])
        .toStrictEqual([ [ '112@0', '113@1', '0@1', '413@0', '101@0' ], 0 ]);
    });

    it('moves units chosen at different depths as siblings, each at the indent of the body it lands in', () =>
    {
      // Arrange: Show Text at the top and the sound deep in the branch, dropped at the list's end.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text, branch ] = tree.root.nodes;
      const [ sound ] = (branch as CommandBlockNode).segments[0].body!.nodes;

      // Act.
      const moved = moveNodes(list, [ text, sound ], { body: tree.root, position: tree.root.nodes.length });

      // Assert: both land at the top level, in order, and the list reads with no strays.
      expect([ describeList(moved.slice(-5)), readCommandTree(moved, MZ_STRUCTURE).irregular ])
        .toStrictEqual([ [ '101@0', '401@0', '401@0', '250@0', '0@0' ], 0 ]);
    });

    it('leaves the list as it was when units drop where they already are', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text ] = tree.root.nodes;

      // Act.
      const moved = moveNodes(list, [ text ], { body: tree.root, position: 1 });

      // Assert.
      expect(moved)
        .toStrictEqual(list);
    });

    it('refuses to move a block into itself', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const branch = tree.root.nodes[1] as CommandBlockNode;

      // Act.
      const move = () => moveNodes(list, [ branch ], { body: branch.segments[0].body!, position: 0 });

      // Assert.
      expect(move)
        .toThrow('cannot move commands into themselves');
    });
  });

  describe('landingIndex', () =>
  {
    it('pulls the place up by the moved commands above it, and not by those below', () =>
    {
      // Arrange: Show Text (three commands, above) and the choices (below) both moved into the branch's body.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text, branch, choices ] = tree.root.nodes;
      const point = { body: (branch as CommandBlockNode).segments[0].body!, position: 1 };

      // Act.
      const landings = [ landingIndex([ text ], point), landingIndex([ choices ], point), landingIndex([ choices, text ], point) ];

      // Assert: the place is index 5, the branch body's end.
      expect(landings)
        .toStrictEqual([ 2, 5, 2 ]);
    });
  });

  describe('duplicateNodes', () =>
  {
    it('copies units right after the last of them, at its indent', () =>
    {
      // Arrange: the wait inside the first choice.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ wait ] = (tree.root.nodes[2] as CommandBlockNode).segments[1].body!.nodes;

      // Act.
      const duplicated = duplicateNodes(list, [ wait ]);

      // Assert.
      expect([ describeList(duplicated.slice(14, 18)), duplicated[16] === list[15] ])
        .toStrictEqual([ [ '402@0', '230@1', '230@1', '0@1' ], false ]);
    });

    it('copies units chosen at different depths as siblings, at the indent of the body the copies land in', () =>
    {
      // Arrange: Show Text at the top and the sound deep in the branch, which comes last.
      const list = buildMixedList();
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text, branch ] = tree.root.nodes;
      const [ sound ] = (branch as CommandBlockNode).segments[0].body!.nodes;

      // Act.
      const duplicated = duplicateNodes(list, [ text, sound ]);

      // Assert: the copies follow the sound inside the branch, and the list reads with no strays.
      expect([ describeList(duplicated.slice(3, 10)), readCommandTree(duplicated, MZ_STRUCTURE).irregular ])
        .toStrictEqual([ [ '111@0', '250@1', '101@1', '401@1', '401@1', '250@1', '0@1' ], 0 ]);
    });

    it('copies nothing when nothing is chosen', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const duplicated = duplicateNodes(list, []);

      // Assert.
      expect(duplicated)
        .toStrictEqual(list);
    });
  });

  describe('replaceRange', () =>
  {
    it('replaces exactly the run asked for', () =>
    {
      // Arrange.
      const list = [ cmd(1, 0), cmd(2, 0), cmd(3, 0), cmd(0, 0) ];

      // Act.
      const replaced = replaceRange(list, 1, 3, [ cmd(9, 0) ]);

      // Assert.
      expect(describeList(replaced))
        .toStrictEqual([ '1@0', '9@0', '0@0' ]);
    });
  });

  describe('spliceBetween', () =>
  {
    it('finds the smallest splice, keeping what both lists start and end with', () =>
    {
      // Arrange.
      const before = [ cmd(1, 0), cmd(2, 0), cmd(3, 0), cmd(0, 0) ];
      const after = [ cmd(1, 0), cmd(9, 0), cmd(8, 0), cmd(3, 0), cmd(0, 0) ];

      // Act.
      const splice = spliceBetween(before, after);

      // Assert.
      expect(splice)
        .toStrictEqual({ index: 1, deleteCount: 1, inserted: [ cmd(9, 0), cmd(8, 0) ] });
    });

    it('sees a key added to a command as a change', () =>
    {
      // Arrange.
      const before = [ cmd(111, 0), cmd(0, 0) ];
      const after = [ { ...cmd(111, 0), collapsed: true }, cmd(0, 0) ];

      // Act.
      const splice = spliceBetween(before, after);

      // Assert.
      expect(splice)
        .toStrictEqual({ index: 0, deleteCount: 1, inserted: [ after[0] ] });
    });

    it('finds no splice between equal lists', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const splice = spliceBetween(list, buildMixedList());

      // Assert.
      expect(splice)
        .toBeNull();
    });

    it('splices only removals off the end of a list', () =>
    {
      // Arrange.
      const before = [ cmd(1, 0), cmd(2, 0), cmd(0, 0) ];
      const after = [ cmd(1, 0), cmd(0, 0) ];

      // Act.
      const splice = spliceBetween(before, after);

      // Assert.
      expect(splice)
        .toStrictEqual({ index: 1, deleteCount: 1, inserted: [] });
    });
  });

  describe('asJsonCommands', () =>
  {
    it('hands back the same commands, typed for a patch', () =>
    {
      // Arrange.
      const list = [ cmd(1, 0) ];

      // Act.
      const json = asJsonCommands(list);

      // Assert.
      expect(json === (list as unknown))
        .toBe(true);
    });
  });
});
