import { describe, expect, it } from 'vitest';
import { blockSpanOf } from '../../../../src/mapEditor/core/commandList/blockSpans.ts';
import { locateCommands, readCommandTree } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMixedList, cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * The Show Choices and Conditional Branch editors change their block's shape, so the list hands each its whole
 * block. The span owes them exactly the block: a conditional branch through its end, and a Show Choices across
 * every Show Choices block HIME_LargeChoices merges with it (the ones sitting back to back in one body), whichever
 * of them the row is. A Show Choices with anything between it and the next is a list of its own, and every other
 * command gets no span.
 */
describe('blockSpans', () =>
{
  /**
   * Finds the span for a command of a list.
   * @param {RmmzEventCommand[]} list The list.
   * @param {number} index The command.
   * @returns {ReturnType<typeof blockSpanOf>} The span.
   */
  const spanAt = (list: RmmzEventCommand[], index: number) => blockSpanOf(list, locateCommands(readCommandTree(list, MZ_STRUCTURE)).get(index) ?? null);

  /**
   * Two Show Choices back to back, then a wait, then a third on its own.
   * @returns {RmmzEventCommand[]} The list.
   */
  const buildRun = (): RmmzEventCommand[] => [
    cmd(102, 0, [ [ 'A' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(404, 0), // 0 to 3
    cmd(102, 0, [ [ 'B' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'B' ]), cmd(0, 1), cmd(404, 0), // 4 to 7
    cmd(230, 0, [ 5 ]), // 8
    cmd(102, 0, [ [ 'C' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'C' ]), cmd(0, 1), cmd(404, 0), // 9 to 12
    cmd(0, 0),
  ];

  describe('blockSpanOf', () =>
  {
    it('spans a conditional branch through its end', () =>
    {
      // Arrange.
      const list = buildMixedList();

      // Act.
      const span = spanAt(list, 3);

      // Assert.
      expect(span)
        .toStrictEqual({ start: 3, end: 13 });
    });

    it('spans a merged run of Show Choices from either of its rows, and stops at anything between', () =>
    {
      // Arrange.
      const list = buildRun();

      // Act.
      const spans = [ spanAt(list, 0), spanAt(list, 4), spanAt(list, 9) ];

      // Assert.
      expect(spans)
        .toStrictEqual([ { start: 0, end: 8 }, { start: 0, end: 8 }, { start: 9, end: 13 } ]);
    });

    it('gives no span to a branch row, a line, another block, or past the end', () =>
    {
      // Arrange.
      const list = buildMixedList();
      const loop = [ cmd(112, 0), cmd(0, 1), cmd(413, 0), cmd(0, 0) ];

      // Act.
      const spans = [ spanAt(list, 14), spanAt(list, 0), spanAt(loop, 0), spanAt(list, 99) ];

      // Assert.
      expect(spans)
        .toStrictEqual([ null, null, null, null ]);
    });
  });
});
