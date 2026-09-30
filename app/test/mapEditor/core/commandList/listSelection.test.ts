import { describe, expect, it } from 'vitest';
import { locateCommands, readCommandTree, type CommandBlockNode, type CommandNode } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { buildListRows, type ListRow } from '../../../../src/mapEditor/core/commandList/listRows.ts';
import {
  clickSelection,
  EMPTY_SELECTION,
  nodeOfRow,
  nodesBetween,
  selectedNodes,
} from '../../../../src/mapEditor/core/commandList/listSelection.ts';
import { buildMixedList, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * Selecting in the list works on whole units: clicking any row of a block selects the block, so a copy or a drag
 * never takes half of one. A plain click selects one unit, the toggle key adds or takes one away, and Shift takes a
 * range from the anchor within the innermost body holding both ends, lifting either end to the unit of that body it
 * sits in, so a range can never tear a block apart either.
 */
describe('listSelection', () =>
{
  /**
   * The mixed list's tree, rows and a unit finder.
   * @returns {object} The pieces.
   */
  const build = () =>
  {
    const tree = readCommandTree(buildMixedList(), MZ_STRUCTURE);
    const locations = locateCommands(tree);
    const nodeAt = (start: number): CommandNode | null =>
    {
      const node = locations.get(start)?.node ?? null;
      return node !== null && node.start === start ? node : null;
    };
    return { tree, rows: buildListRows(tree, () => false), nodeAt };
  };

  describe('nodeOfRow', () =>
  {
    it('selects a line itself, the whole block from any of its rows, and nothing from a body end', () =>
    {
      // Arrange.
      const { rows } = build();

      // Act.
      const starts = [ 0, 3, 6, 12, 5 ].map(index => nodeOfRow(rows.find(row => row.index === index) as ListRow)?.start ?? null);

      // Assert.
      expect(starts)
        .toStrictEqual([ 0, 3, 3, 3, null ]);
    });
  });

  describe('nodesBetween', () =>
  {
    it('takes the units between two siblings, either way round', () =>
    {
      // Arrange.
      const { tree } = build();
      const [ text, , choices ] = tree.root.nodes;

      // Act.
      const ranges = [ nodesBetween(text, choices), nodesBetween(choices, text) ].map(nodes => nodes.map(node => node.start));

      // Assert.
      expect(ranges)
        .toStrictEqual([ [ 0, 3, 13 ], [ 0, 3, 13 ] ]);
    });

    it('lifts an end inside a block to the block, in the body holding both', () =>
    {
      // Arrange: from Show Text to the wait inside the first choice.
      const { tree } = build();
      const [ text, , choices ] = tree.root.nodes;
      const wait = (choices as CommandBlockNode).segments[1].body!.nodes[0];

      // Act.
      const range = nodesBetween(text, wait).map(node => node.start);

      // Assert.
      expect(range)
        .toStrictEqual([ 0, 3, 13 ]);
    });

    it('stays inside a block when both ends are in it', () =>
    {
      // Arrange: the loop and itself, inside the else.
      const { tree } = build();
      const loop = (tree.root.nodes[1] as CommandBlockNode).segments[1].body!.nodes[0];

      // Act.
      const range = nodesBetween(loop, loop).map(node => node.start);

      // Assert.
      expect(range)
        .toStrictEqual([ 7 ]);
    });
  });

  describe('clickSelection', () =>
  {
    it('selects one unit alone on a plain click, and anchors there', () =>
    {
      // Arrange.
      const { tree, nodeAt } = build();
      const selection = { selected: [ 0, 13 ], anchor: 0 };

      // Act.
      const next = clickSelection(selection, tree.root.nodes[1], { shift: false, toggle: false }, nodeAt);

      // Assert.
      expect(next)
        .toStrictEqual({ selected: [ 3 ], anchor: 3 });
    });

    it('adds and takes away units with the toggle key', () =>
    {
      // Arrange.
      const { tree, nodeAt } = build();
      const [ text, branch ] = tree.root.nodes;

      // Act.
      const added = clickSelection({ selected: [ 13 ], anchor: 13 }, text, { shift: false, toggle: true }, nodeAt);
      const removed = clickSelection(added, branch, { shift: false, toggle: true }, nodeAt);
      const again = clickSelection(removed, text, { shift: false, toggle: true }, nodeAt);

      // Assert.
      expect([ added, removed, again ])
        .toStrictEqual([ { selected: [ 0, 13 ], anchor: 0 }, { selected: [ 0, 3, 13 ], anchor: 3 }, { selected: [ 3, 13 ], anchor: 0 } ]);
    });

    it('takes a range from the anchor with Shift, keeping the anchor', () =>
    {
      // Arrange.
      const { tree, nodeAt } = build();

      // Act.
      const next = clickSelection({ selected: [ 0 ], anchor: 0 }, tree.root.nodes[2], { shift: true, toggle: false }, nodeAt);

      // Assert.
      expect(next)
        .toStrictEqual({ selected: [ 0, 3, 13 ], anchor: 0 });
    });

    it('treats Shift with no anchor as a plain click', () =>
    {
      // Arrange.
      const { tree, nodeAt } = build();

      // Act.
      const next = clickSelection(EMPTY_SELECTION, tree.root.nodes[2], { shift: true, toggle: false }, nodeAt);

      // Assert.
      expect(next)
        .toStrictEqual({ selected: [ 13 ], anchor: 13 });
    });

    it('treats Shift from an anchor that is gone as a plain click', () =>
    {
      // Arrange: an anchor on a command that no longer starts a unit.
      const { tree, nodeAt } = build();

      // Act.
      const next = clickSelection({ selected: [ 1 ], anchor: 1 }, tree.root.nodes[0], { shift: true, toggle: false }, nodeAt);

      // Assert.
      expect(next)
        .toStrictEqual({ selected: [ 0 ], anchor: 0 });
    });
  });

  describe('selectedNodes', () =>
  {
    it('finds the selected units that still exist, in list order', () =>
    {
      // Arrange: 1 is a continuation line, which starts no unit.
      const { nodeAt } = build();

      // Act.
      const nodes = selectedNodes({ selected: [ 13, 1, 0 ], anchor: null }, nodeAt);

      // Assert.
      expect(nodes.map(node => node.start))
        .toStrictEqual([ 0, 13 ]);
    });
  });
});
