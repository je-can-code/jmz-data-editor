import { describe, expect, it } from 'vitest';
import { blockSpanAt } from '../../../../../src/mapEditor/core/commands/editors/blockSpan.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * Two of the hand-built editors change a block's structure rather than one command: Show Choices adds, removes
 * and renames branches, and Conditional Branch adds or removes its Else. The command list hands those editors
 * the whole block, and this is how it finds it: a conditional branch through its end, and a Show Choices list
 * from the first of the consecutive commands HIME_LargeChoices merges through the end of the last, wherever in
 * the list the pointed-at command sits. Any other command, or a block that is not MZ-shaped, has no span.
 */
describe('blockSpanAt', () =>
{
  /**
   * Builds a command.
   * @param {number} code The code.
   * @param {number} indent The indent.
   * @param {unknown[]} parameters The parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const command = (code: number, indent: number, parameters: unknown[] = []): RmmzEventCommand => ({ code, indent, parameters: parameters as never });

  /**
   * Builds one Show Choices command with empty branches.
   * @param {string[]} texts The choices.
   * @param {number} indent The indent.
   * @returns {RmmzEventCommand[]} The commands.
   */
  const choices = (texts: string[], indent = 0): RmmzEventCommand[] => [
    command(102, indent, [ texts, -1, 0, 2, 0 ]),
    ...texts.flatMap((text, index) => [ command(402, indent, [ index, text ]), command(0, indent + 1) ]),
    command(404, indent),
  ];

  it('spans a conditional branch through its end, Else included', () =>
  {
    // Arrange: a line before, the branch at 1 to 6, a line after.
    const list = [
      command(101, 0, [ '', 0, 0, 2, '' ]),
      command(111, 0, [ 0, 1, 0 ]),
      command(111, 1, [ 0, 2, 0 ]),
      command(0, 2),
      command(412, 1),
      command(411, 0),
      command(0, 1),
      command(412, 0),
      command(0, 0),
    ];

    // Act.
    const spans = [ blockSpanAt(list, 1), blockSpanAt(list, 2) ];

    // Assert: the outer branch holds the inner one.
    expect(spans)
      .toStrictEqual([ { start: 1, end: 8 }, { start: 2, end: 5 } ]);
  });

  it('spans every Show Choices HIME merges into one list, from whichever of them is pointed at', () =>
  {
    // Arrange: two merged commands at 1 and 16, then a separate list after a comment.
    const list = [
      command(108, 0, [ 'start' ]),
      ...choices([ 'a', 'b', 'c', 'd', 'e', 'f' ]),
      ...choices([ 'g', 'h' ]),
      command(108, 0, [ 'keeps the next list apart' ]),
      ...choices([ 'x', 'y' ]),
    ];

    // Act.
    const spans = [ blockSpanAt(list, 1), blockSpanAt(list, 15), blockSpanAt(list, 22) ];

    // Assert.
    expect(spans)
      .toStrictEqual([ { start: 1, end: 21 }, { start: 1, end: 21 }, { start: 22, end: 28 } ]);
  });

  it('does not merge a list into one at another indent', () =>
  {
    // Arrange: a list nested in a branch, closing just before a list outside it.
    const list = [
      command(111, 0, [ 0, 1, 0 ]),
      ...choices([ 'a' ], 1),
      command(412, 0),
      ...choices([ 'b' ]),
    ];

    // Act.
    const spans = [ blockSpanAt(list, 1), blockSpanAt(list, 6) ];

    // Assert.
    expect(spans)
      .toStrictEqual([ { start: 1, end: 5 }, { start: 6, end: 10 } ]);
  });

  it('has no span for other commands, a place past the list, or a block that never ends', () =>
  {
    // Arrange: an unended branch, and an unended list.
    const unendedBranch = [ command(111, 0, [ 0, 1, 0 ]), command(0, 1) ];
    const unendedList = choices([ 'a' ]).slice(0, -1);
    const strayInside = [ command(111, 0, [ 0, 1, 0 ]), command(250, 0, [ {} ]), command(412, 0) ];
    const escaped = [ command(111, 1, [ 0, 1, 0 ]), command(0, 0), command(412, 1) ];

    // Act.
    const spans = [
      blockSpanAt(unendedBranch, 1),
      blockSpanAt(unendedBranch, 5),
      blockSpanAt(unendedBranch, -1),
      blockSpanAt(unendedBranch, 0),
      blockSpanAt(unendedList, 0),
      blockSpanAt(strayInside, 0),
      blockSpanAt(escaped, 0),
    ];

    // Assert.
    expect(spans)
      .toStrictEqual([ null, null, null, null, null, null, null ]);
  });

  it('starts a list at the pointed-at command when what closes before it is no list of its own', () =>
  {
    // Arrange: an end line with no Show Choices before it, then a list.
    const orphanEnd = [ command(404, 0), ...choices([ 'a' ]) ];
    const brokenBefore = [ command(102, 0, [ [ 'a' ], -1, 0, 2, 0 ]), command(250, 0, [ {} ]), command(404, 0), ...choices([ 'b' ]) ];
    const deeperBefore = [ command(0, 0), command(0, -1), command(404, 0), ...choices([ 'b' ]) ];

    // Act.
    const spans = [ blockSpanAt(orphanEnd, 1), blockSpanAt(brokenBefore, 3), blockSpanAt(deeperBefore, 3) ];

    // Assert.
    expect(spans)
      .toStrictEqual([ { start: 1, end: 5 }, { start: 3, end: 7 }, { start: 3, end: 7 } ]);
  });
});
