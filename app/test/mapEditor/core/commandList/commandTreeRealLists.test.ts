import { describe, expect, it } from 'vitest';
import { indexesOfTree, readCommandTree } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { locateGameProject } from '../../../support/gameProject.ts';
import { MZ_STRUCTURE } from '../../support/commandFixtures.ts';
import { readRealCommandLists } from '../../support/realCommandLists.ts';

/*
 * The tree's shapes were written from MZ's rules, and the game's own lists are the proof they are the whole story:
 * every page of every event on every map, and every common event, must read as a tree with nothing irregular in
 * it, every command in exactly one place, in order. A shape the reader did not know would show up here first, as
 * an irregular count on a named list, long before a drag or a paste mangled it.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();
const lists = project === null
  ? []
  : readRealCommandLists(project);

describe.skipIf(project === null)('command trees over the shipped lists', () =>
{
  it('finds the shipped lists to read', () =>
  {
    // Arrange: the lists read above.

    // Act.
    const count = lists.length;

    // Assert: a wrong folder would otherwise pass by checking nothing.
    expect(count)
      .toBeGreaterThan(9000);
  });

  it('reads every shipped list with nothing irregular, every command in place', () =>
  {
    // Arrange.
    const failures: string[] = [];

    // Act.
    lists.forEach(({ where, list }) =>
    {
      const tree = readCommandTree(list, MZ_STRUCTURE);
      const indexes = indexesOfTree(tree);
      const inOrder = indexes.length === list.length && indexes.every((value, position) => value === position);
      if (tree.irregular !== 0 || inOrder === false)
      {
        failures.push(`${where}: ${tree.irregular} irregular, ${inOrder ? 'in order' : 'out of order'}`);
      }
    });

    // Assert.
    expect(failures)
      .toStrictEqual([]);
  });
});
