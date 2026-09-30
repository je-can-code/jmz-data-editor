import type { CommandLocation, CommandNode } from './commandTree.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';

/**
 * The codes of the two blocks whose editors change the block's shape.
 */
const SHOW_CHOICES_CODE = 102;
const CONDITIONAL_BRANCH_CODE = 111;

/**
 * Where a block sits in its list: its first command, and one past its last.
 */
type BlockSpan = {
  readonly start: number;
  readonly end: number;
};

/**
 * Reports whether a unit is a Show Choices block.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandNode | undefined} node The unit.
 * @returns {boolean} True when it is one.
 */
const isChoicesBlock = (list: readonly RmmzEventCommand[], node: CommandNode | undefined): node is CommandNode =>
{
  return node !== undefined && node.kind === 'block' && list[node.start].code === SHOW_CHOICES_CODE;
};

/**
 * Finds the whole block the editor of a block's opener works on, the way the hand-built editors expect it
 * ({@code blockSpanAt}): a conditional branch through its end, and a Show Choices list across every Show Choices
 * block HIME_LargeChoices merges with it, which are the Show Choices blocks sitting back to back in one body,
 * wherever in the run the row is. Every other command edits on its own.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandLocation | null} location Where the command sits.
 * @returns {BlockSpan | null} The span, or null when the command opens no such block.
 */
const blockSpanOf = (list: readonly RmmzEventCommand[], location: CommandLocation | null): BlockSpan | null =>
{
  const node = location?.node ?? null;
  if (location === null || location.role !== 'opener' || node === null || node.kind !== 'block')
  {
    return null;
  }

  const { code } = list[node.start];
  if (code === CONDITIONAL_BRANCH_CODE)
  {
    return { start: node.start, end: node.end };
  }

  if (code !== SHOW_CHOICES_CODE)
  {
    return null;
  }

  // units of one body follow each other with nothing between, so neighbouring blocks are back to back.
  const siblings = node.parent.nodes;
  let first = siblings.indexOf(node);
  let last = first;
  while (isChoicesBlock(list, siblings[first - 1]))
  {
    first -= 1;
  }

  while (isChoicesBlock(list, siblings[last + 1]))
  {
    last += 1;
  }

  return { start: siblings[first].start, end: siblings[last].end };
};

export { blockSpanOf };
export type { BlockSpan };
