import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { BRANCH_ELSE_CODE, BRANCH_END_CODE, CONDITIONAL_BRANCH_CODE } from './conditionalBranch.ts';
import { CHOICE_BRANCH_CODE, CHOICE_CANCEL_CODE, CHOICES_END_CODE, SHOW_CHOICES_CODE } from './showChoices.ts';

/**
 * Where a block sits in a command list: the index of its first command, and the index just past its last.
 */
type CommandSpan = {
  readonly start: number;
  readonly end: number;
};

/**
 * Finds the line that ends the block opened at an index: the first line back at the block's own indent that is
 * not one of its branch lines. Anything shallower first, or a stranger at the block's indent, means the block
 * is not MZ-shaped.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} start The block's first command.
 * @param {number} endCode The code of its end line.
 * @param {readonly number[]} branchCodes The codes of its branch lines.
 * @returns {number | null} The end line's index, or null when there is none.
 */
const findBlockEnd = (
  list: readonly RmmzEventCommand[],
  start: number,
  endCode: number,
  branchCodes: readonly number[],
): number | null =>
{
  const { indent } = list[start];
  for (let index = start + 1; index < list.length; index++)
  {
    const command = list[index];
    if (command.indent < indent)
    {
      return null;
    }

    if (command.indent === indent)
    {
      if (command.code === endCode)
      {
        return index;
      }

      if (branchCodes.includes(command.code) === false)
      {
        return null;
      }
    }
  }

  return null;
};

/**
 * Finds the end of the Show Choices opened at an index.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} start The Show Choices command.
 * @returns {number | null} Its end line's index, or null when there is none.
 */
const choicesEnd = (list: readonly RmmzEventCommand[], start: number): number | null =>
{
  return findBlockEnd(list, start, CHOICES_END_CODE, [ CHOICE_BRANCH_CODE, CHOICE_CANCEL_CODE ]);
};

/**
 * Finds the Show Choices whose end line sits just before an index, when there is one: the list merged into the
 * one starting at that index.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} start A Show Choices command.
 * @returns {number | null} The earlier Show Choices, or null when none ends right before it.
 */
const previousChoices = (list: readonly RmmzEventCommand[], start: number): number | null =>
{
  const { indent } = list[start];
  const endLine = start - 1;
  const before = list.at(endLine);
  if (endLine < 0 || before === undefined || before.code !== CHOICES_END_CODE || before.indent !== indent)
  {
    return null;
  }

  // walk back over its branches to the command that opened it, then check that command really ends there.
  for (let index = endLine - 1; index >= 0; index--)
  {
    const command = list[index];
    if (command.indent < indent)
    {
      return null;
    }

    if (command.indent === indent && command.code === SHOW_CHOICES_CODE)
    {
      return choicesEnd(list, index) === endLine ? index : null;
    }

    if (command.indent === indent && [ CHOICE_BRANCH_CODE, CHOICE_CANCEL_CODE ].includes(command.code) === false)
    {
      return null;
    }
  }

  return null;
};

/**
 * Finds a Show Choices list the way HIME_LargeChoices merges it: back to the first of the consecutive Show
 * Choices commands this one belongs to, and on through the end line of the last.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} index A Show Choices command.
 * @returns {CommandSpan | null} The list's span, or null when not MZ-shaped.
 */
const choiceListSpan = (list: readonly RmmzEventCommand[], index: number): CommandSpan | null =>
{
  let start = index;
  let earlier = previousChoices(list, start);
  while (earlier !== null)
  {
    start = earlier;
    earlier = previousChoices(list, start);
  }

  let opener = start;
  let end = choicesEnd(list, opener);
  while (end !== null)
  {
    const next = list.at(end + 1);
    if (next === undefined || next.code !== SHOW_CHOICES_CODE || next.indent !== list[opener].indent)
    {
      return { start, end: end + 1 };
    }

    opener = end + 1;
    end = choicesEnd(list, opener);
  }

  return null;
};

/**
 * Finds the whole block an editor needs for the command at an index: a conditional branch through its end, or a
 * Show Choices list from its first merged command through its last end line, wherever in it the index points.
 * Every other command edits on its own, and gets null.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} index The command.
 * @returns {CommandSpan | null} The block's span, or null when the command is no block's opener or the block is not MZ-shaped.
 */
const blockSpanAt = (list: readonly RmmzEventCommand[], index: number): CommandSpan | null =>
{
  const command = list.at(index);
  if (index < 0 || command === undefined)
  {
    return null;
  }

  if (command.code === CONDITIONAL_BRANCH_CODE)
  {
    const end = findBlockEnd(list, index, BRANCH_END_CODE, [ BRANCH_ELSE_CODE ]);
    return end === null
      ? null
      : { start: index, end: end + 1 };
  }

  return command.code === SHOW_CHOICES_CODE
    ? choiceListSpan(list, index)
    : null;
};

export { blockSpanAt };
export type { CommandSpan };
