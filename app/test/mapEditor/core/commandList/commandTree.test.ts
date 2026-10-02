import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import {
  catalogStructure,
  headEnd,
  indexesOfNode,
  indexesOfTree,
  isBodyInside,
  locateCommands,
  readCommandTree,
  type CommandBlockNode,
  type CommandLine,
} from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { buildMixedList, cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * A command list is stored flat, one command after another with an indent on each, but it means a tree: a
 * conditional branch owns the commands under it through its end, a Show Choices owns a branch per choice, Show
 * Text owns the lines continuing it. Every list operation (folding, selecting, dragging, copying) works on that
 * tree, so the tree owes one promise above all: every command of the list sits in exactly one place in it, in
 * order, so whatever is done through the tree can always be written back as a list, and an untouched list comes
 * back exactly as it went in.
 *
 * A list that strays from MZ's shapes (a block with no end, a command at an indent nothing explains) must still
 * read, as far as it goes, with the strays counted, so a list another tool mangled shows and saves as it is
 * rather than failing or being "repaired" into something else.
 */
describe('commandTree', () =>
{
  describe('readCommandTree', () =>
  {
    it('reads a line and the lines continuing it as one unit', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const [ text ] = tree.root.nodes;

      // Assert.
      expect([ text.kind, text.start, text.end, tree.irregular ])
        .toStrictEqual([ 'line', 0, 3, 0 ]);
    });

    it('stops a line\'s continuation at a line of another indent', () =>
    {
      // Arrange: the second text line sits deeper, so it is no longer Show Text's.
      const list = [ cmd(101, 0), cmd(401, 0, [ 'a' ]), cmd(401, 1, [ 'b' ]), cmd(0, 0) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);

      // Assert.
      expect(tree.root.nodes.map(node => [ node.start, node.end ]))
        .toStrictEqual([ [ 0, 2 ], [ 2, 3 ] ]);
    });

    it('reads a conditional branch with its else through its end, bodies and all', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const branch = tree.root.nodes[1] as CommandBlockNode;

      // Assert.
      expect([
        branch.kind,
        branch.start,
        branch.end,
        branch.closer,
        branch.segments.map(segment => [ segment.head, segment.body?.start, segment.body?.terminator ]),
      ])
        .toStrictEqual([ 'block', 3, 13, 12, [ [ 3, 4, 5 ], [ 6, 7, 11 ] ] ]);
    });

    it('nests a loop inside an else at the next indent', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const branch = tree.root.nodes[1] as CommandBlockNode;
      const loop = branch.segments[1].body?.nodes[0] as CommandBlockNode;

      // Assert.
      expect([ loop.kind, loop.start, loop.closer, loop.indent, loop.segments[0].body?.nodes.map(node => node.start) ])
        .toStrictEqual([ 'block', 7, 10, 1, [ 8 ] ]);
    });

    it('reads Show Choices with no body of its own, a branch per choice, and a cancel branch', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const choices = tree.root.nodes[2] as CommandBlockNode;

      // Assert.
      expect([ choices.start, choices.closer, choices.segments.map(segment => [ segment.head, segment.body === null ? null : segment.body.nodes.length ]) ])
        .toStrictEqual([ 13, 21, [ [ 13, null ], [ 14, 1 ], [ 17, 0 ], [ 19, 0 ] ] ]);
    });

    it('reads a battle with outcome branches as a block', () =>
    {
      // Arrange.
      const list = [ cmd(301, 0, [ 0, 1, true, true ]), cmd(601, 0), cmd(0, 1), cmd(602, 0), cmd(0, 1), cmd(603, 0), cmd(0, 1), cmd(604, 0), cmd(0, 0) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);

      // Assert.
      expect([ tree.root.nodes.length, tree.root.nodes[0].kind, tree.root.nodes[0].end, tree.irregular ])
        .toStrictEqual([ 1, 'block', 8, 0 ]);
    });

    it('reads a battle with no outcome branches as a plain line, which is how MZ writes one', () =>
    {
      // Arrange.
      const list = [ cmd(301, 0, [ 0, 1, false, false ]), cmd(230, 0, [ 5 ]), cmd(0, 0) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);

      // Assert.
      expect([ tree.root.nodes.map(node => node.kind), tree.irregular ])
        .toStrictEqual([ [ 'line', 'line' ], 0 ]);
    });

    it('reads a skipped run of commands as a block closing at its end', () =>
    {
      // Arrange.
      const list = [ cmd(109, 0), cmd(201, 1, [ 0, 2, 1, 1, 0, 0 ]), cmd(0, 1), cmd(409, 0), cmd(0, 0) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const skip = tree.root.nodes[0] as CommandBlockNode;

      // Assert.
      expect([ skip.kind, skip.closer, skip.segments[0].body?.nodes.length, tree.irregular ])
        .toStrictEqual([ 'block', 3, 1, 0 ]);
    });

    it('keeps a block with no end as lines, and counts it', () =>
    {
      // Arrange: a branch whose end is missing, so its body reads as commands deeper than their body.
      const list = [ cmd(111, 0, [ 0, 1, 0 ]), cmd(230, 1, [ 5 ]), cmd(0, 1), cmd(0, 0) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);

      // Assert: the opener, then the two deeper commands, each a line; and every command still in place.
      expect([ tree.root.nodes.map(node => [ node.kind, node.start ]), tree.irregular, indexesOfTree(tree) ])
        .toStrictEqual([ [ [ 'line', 0 ], [ 'line', 1 ], [ 'line', 2 ] ], 2, [ 0, 1, 2, 3 ] ]);
    });

    it('counts a body that runs out of commands before its end', () =>
    {
      // Arrange: a list with no empty command at the end.
      const list = [ cmd(230, 0, [ 5 ]) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);

      // Assert.
      expect([ tree.root.terminator, tree.root.end, tree.irregular ])
        .toStrictEqual([ null, 1, 1 ]);
    });

    it('closes a block body that meets a shallower command before its end, and counts it', () =>
    {
      // Arrange: the loop body has no empty command before its repeat.
      const list = [ cmd(112, 0), cmd(113, 1), cmd(413, 0), cmd(0, 0) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const loop = tree.root.nodes[0] as CommandBlockNode;

      // Assert.
      expect([ loop.kind, loop.segments[0].body?.terminator, loop.segments[0].body?.end, tree.irregular ])
        .toStrictEqual([ 'block', null, 2, 1 ]);
    });

    it('keeps commands after the list\'s own end, each counted', () =>
    {
      // Arrange.
      const list = [ cmd(0, 0), cmd(230, 0, [ 5 ]), cmd(221, 0) ];

      // Act.
      const tree = readCommandTree(list, MZ_STRUCTURE);

      // Assert.
      expect([ tree.trailing.map(node => node.start), tree.irregular, indexesOfTree(tree) ])
        .toStrictEqual([ [ 1, 2 ], 2, [ 0, 1, 2 ] ]);
    });

    it('reads an empty list as an empty body with no end, counted', () =>
    {
      // Arrange: nothing at all.

      // Act.
      const tree = readCommandTree([], MZ_STRUCTURE);

      // Assert.
      expect([ tree.root.nodes.length, tree.root.terminator, tree.irregular ])
        .toStrictEqual([ 0, null, 1 ]);
    });
  });

  describe('indexesOfTree', () =>
  {
    it('covers every command once, in order', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const indexes = indexesOfTree(readCommandTree(list, MZ_STRUCTURE));

      // Assert.
      expect(indexes)
        .toStrictEqual(list.map((_, index) => index));
    });
  });

  describe('indexesOfNode', () =>
  {
    it('covers a block from its opener through its closer', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const indexes = indexesOfNode(tree.root.nodes[2]);

      // Assert.
      expect(indexes)
        .toStrictEqual([ 13, 14, 15, 16, 17, 18, 19, 20, 21 ]);
    });
  });

  describe('locateCommands', () =>
  {
    it('names every command\'s role', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const locations = locateCommands(tree);
      const roles = [ 0, 1, 3, 5, 6, 12, 13, 14, 21, 22 ].map(index => locations.get(index)?.role);

      // Assert.
      expect(roles)
        .toStrictEqual([ 'line', 'continuation', 'opener', 'terminator', 'branch', 'closer', 'opener', 'branch', 'closer', 'terminator' ]);
    });

    it('ties a body\'s terminator to the block it closes, and the list\'s own to nothing', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);

      // Act.
      const locations = locateCommands(tree);

      // Assert.
      expect([ locations.get(5)?.node?.start, locations.get(5)?.body.indent, locations.get(22)?.node ?? null, locations.get(22)?.body === tree.root ])
        .toStrictEqual([ 3, 1, null, true ]);
    });

    it('places trailing commands beside the list\'s body', () =>
    {
      // Arrange.
      const tree = readCommandTree([ cmd(0, 0), cmd(230, 0, [ 5 ]) ], MZ_STRUCTURE);

      // Act.
      const location = locateCommands(tree).get(1);

      // Assert.
      expect([ location?.role, location?.body === tree.root ])
        .toStrictEqual([ 'line', true ]);
    });
  });

  describe('headEnd', () =>
  {
    it('spans a line\'s continuation, but only a block head itself', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);
      const locations = locateCommands(tree);

      // Act.
      const ends = [ headEnd(locations.get(0)!, 0), headEnd(locations.get(3)!, 3), headEnd(locations.get(14)!, 14) ];

      // Assert.
      expect(ends)
        .toStrictEqual([ 3, 4, 15 ]);
    });
  });

  describe('isBodyInside', () =>
  {
    it('finds a body under a block at any depth, and not under a sibling', () =>
    {
      // Arrange.
      const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);
      const branch = tree.root.nodes[1] as CommandBlockNode;
      const choices = tree.root.nodes[2] as CommandBlockNode;
      const loop = branch.segments[1].body?.nodes[0] as CommandBlockNode;
      const loopBody = loop.segments[0].body!;

      // Act.
      const answers = [ isBodyInside(loopBody, branch), isBodyInside(loopBody, loop), isBodyInside(loopBody, choices), isBodyInside(tree.root, branch) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, true, false, false ]);
    });
  });

  describe('catalogStructure', () =>
  {
    it('answers each code\'s block and continuation from its entry, and nothing for codes without', () =>
    {
      // Arrange.
      const catalog = new CommandCatalog();
      catalog.register({ id: 'core:112', code: 112, name: 'Loop', category: 'Flow Control', keywords: [], fields: [], sentence: 'Loop', block: { end: 413 } });
      catalog.register({ id: 'core:108', code: 108, name: 'Comment', category: 'Flow Control', keywords: [], fields: [], sentence: 'Comment', continuation: 408 });

      // Act.
      const structure = catalogStructure(catalog);
      const answers = [
        structure.blockOf(112),
        structure.blockOf(112),
        structure.blockOf(108),
        structure.continuationOf(108),
        structure.continuationOf(108),
        structure.continuationOf(112),
        structure.continuationOf(357),
      ];

      // Assert: a plugin command is continued by its display lines even with no header read.
      expect(answers)
        .toStrictEqual([ { end: 413 }, { end: 413 }, null, 408, 408, null, 657 ]);
    });
  });

  it('reads a line as a line, with the fields a unit carries', () =>
  {
    // Arrange.
    const tree = readCommandTree([ cmd(230, 0, [ 5 ]), cmd(0, 0) ], MZ_STRUCTURE);

    // Act.
    const node = tree.root.nodes[0] as CommandLine;

    // Assert.
    expect([ node.kind, node.start, node.end, node.indent, node.parent === tree.root ])
      .toStrictEqual([ 'line', 0, 1, 0, true ]);
  });
});
