import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import { textList } from '../commands/builtin/phrases.ts';
import { writeParameter } from '../commands/fieldValues.ts';
import {
  END_CODE,
  locateCommands,
  readCommandTree,
  type BlockSegment,
  type CommandBlockNode,
  type CommandStructure,
} from './commandTree.ts';
import { reindent, replaceRange } from './listEdits.ts';

/**
 * The codes a Show Choices block is made of.
 */
const SHOW_CHOICES = 102;
const WHEN_CHOICE = 402;
const WHEN_CANCEL = 403;
const END_CHOICES = 404;

/**
 * What a Show Choices' cancel setting holds when cancelling has a branch of its own.
 */
const CANCEL_BRANCH = -2;

/**
 * The parameters MZ writes on a cancel branch: 6, from the days of six choices at most, and nothing.
 */
const CANCEL_PARAMETERS = [ 6, null ];

/**
 * The codes a battle with outcome branches is made of.
 */
const BATTLE = 301;
const IF_WIN = 601;
const IF_ESCAPE = 602;
const IF_LOSE = 603;
const END_BATTLE = 604;

/**
 * The code of a conditional branch, and of its else.
 */
const CONDITIONAL_BRANCH = 111;
const ELSE = 411;

/**
 * Builds an empty branch: its head, and the empty command ending its body.
 * @param {number} code The branch's code.
 * @param {number} indent The block's indent.
 * @param {RmmzEventCommand['parameters']} parameters The head's parameters.
 * @returns {RmmzEventCommand[]} The branch.
 */
const emptyBranch = (code: number, indent: number, parameters: RmmzEventCommand['parameters']): RmmzEventCommand[] =>
{
  return [ { code, indent, parameters: [ ...parameters ] }, { code: END_CODE, indent: indent + 1, parameters: [] } ];
};

/**
 * Collects a segment's commands: its head and the body under it.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {BlockSegment} segment The segment.
 * @returns {RmmzEventCommand[]} The commands.
 */
const segmentCommands = (list: readonly RmmzEventCommand[], segment: BlockSegment): RmmzEventCommand[] =>
{
  const end = segment.body === null
    ? segment.head + 1
    : segment.body.end;
  return list.slice(segment.head, end);
};

/**
 * Builds the branches a Show Choices' own settings call for: one per choice, keeping each existing branch (and
 * everything under it) by its choice number with its text brought up to date, then a cancel branch when cancelling
 * has one. A branch whose choice is gone goes with it, as in MZ.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandBlockNode} block The Show Choices block.
 * @returns {RmmzEventCommand[]} The branches, in order.
 */
const choiceBranches = (list: readonly RmmzEventCommand[], block: CommandBlockNode): RmmzEventCommand[] =>
{
  const [ choicesValue, cancelType ] = list[block.start].parameters;
  const branches = block.segments.slice(1);
  const built = textList(choicesValue).flatMap((text, choice) =>
  {
    const existing = branches.find(segment => list[segment.head].code === WHEN_CHOICE && list[segment.head].parameters[0] === choice);
    if (existing === undefined)
    {
      return emptyBranch(WHEN_CHOICE, block.indent, [ choice, text ]);
    }

    const [ head, ...rest ] = segmentCommands(list, existing);
    return [ { ...head, parameters: writeParameter(head.parameters, [ 1 ], text) }, ...rest ];
  });

  if (cancelType !== CANCEL_BRANCH)
  {
    return built;
  }

  const cancel = branches.find(segment => list[segment.head].code === WHEN_CANCEL);
  return [
    ...built,
    ...(cancel === undefined ? emptyBranch(WHEN_CANCEL, block.indent, CANCEL_PARAMETERS) : segmentCommands(list, cancel)),
  ];
};

/**
 * Builds the outcome branches a battle's settings call for: win, then escape when it can escape, then lose when
 * it can lose, then the end; none at all when it can do neither, which is how MZ writes a plain battle. Existing
 * branches keep what is under them.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {number} start The battle command's index.
 * @param {CommandBlockNode | null} block The battle's block, or null when it has no branches yet.
 * @returns {RmmzEventCommand[]} What follows the battle command.
 */
const battleBranches = (list: readonly RmmzEventCommand[], start: number, block: CommandBlockNode | null): RmmzEventCommand[] =>
{
  const { indent, parameters } = list[start];
  const [ , , canEscape, canLose ] = parameters;
  if (canEscape !== true && canLose !== true)
  {
    return [];
  }

  const branches = block === null
    ? []
    : block.segments.slice(1);

  /**
   * Keeps an outcome's branch when there is one, or makes it empty.
   * @param {number} code The outcome's code.
   * @returns {RmmzEventCommand[]} The branch.
   */
  const branch = (code: number): RmmzEventCommand[] =>
  {
    const existing = branches.find(segment => list[segment.head].code === code);
    return existing === undefined
      ? emptyBranch(code, indent, [])
      : segmentCommands(list, existing);
  };

  const closer = block === null
    ? { code: END_BATTLE, indent, parameters: [] }
    : list[block.closer];
  return [
    ...branch(IF_WIN),
    ...(canEscape === true ? branch(IF_ESCAPE) : []),
    ...(canLose === true ? branch(IF_LOSE) : []),
    closer,
  ];
};

/**
 * Brings a block's branches in line with its opener after the opener was edited: a Show Choices gains or loses a
 * branch per choice and its cancel branch, and a battle gains or loses its outcome branches. An editor only ever
 * changes the opener itself (see {@code CommandEditorProps}); this is how its branches follow, bodies kept. Any
 * other command comes back unchanged, and so does a block that already matches its opener, so calling it after
 * every edit is always safe.
 *
 * The runs of Show Choices that HIME_LargeChoices merges into one list are separate blocks here, each with its own
 * choice numbers, so reconciling one never touches the next.
 * @param {readonly RmmzEventCommand[]} list The list, with the opener already edited.
 * @param {CommandStructure} structure How commands nest.
 * @param {number} index The opener's index.
 * @returns {RmmzEventCommand[]} The list with the block's branches in line.
 */
const reconcileBlock = (list: readonly RmmzEventCommand[], structure: CommandStructure, index: number): RmmzEventCommand[] =>
{
  const { code } = list[index];
  if (code !== SHOW_CHOICES && code !== BATTLE)
  {
    return [ ...list ];
  }

  const location = locateCommands(readCommandTree(list, structure)).get(index);
  const node = location?.node ?? null;
  const block = node !== null && node.kind === 'block' && node.start === index
    ? node
    : null;

  if (code === BATTLE)
  {
    const end = block === null
      ? index + 1
      : block.end;
    return replaceRange(list, index + 1, end, battleBranches(list, index, block));
  }

  // a Show Choices that never closed is left as it is, rather than guessed at.
  return block === null
    ? [ ...list ]
    : replaceRange(list, index + 1, block.closer, choiceBranches(list, block));
};

/**
 * Reports whether a conditional branch has an else.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandBlockNode} block The conditional branch.
 * @returns {boolean} True when it has one.
 */
const hasElseBranch = (list: readonly RmmzEventCommand[], block: CommandBlockNode): boolean =>
{
  return block.segments.some(segment => list[segment.head].code === ELSE);
};

/**
 * Gives a conditional branch an else, or takes it away with everything under it. MZ keeps this in the list's
 * shape rather than in the branch's parameters, so it is the list's to change.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandBlockNode} block The conditional branch.
 * @param {boolean} wanted Whether it should have one.
 * @returns {RmmzEventCommand[]} The new list; the same commands when it already is that way.
 */
const setElseBranch = (list: readonly RmmzEventCommand[], block: CommandBlockNode, wanted: boolean): RmmzEventCommand[] =>
{
  if (list[block.start].code !== CONDITIONAL_BRANCH || hasElseBranch(list, block) === wanted)
  {
    return [ ...list ];
  }

  if (wanted)
  {
    return replaceRange(list, block.closer, block.closer, emptyBranch(ELSE, block.indent, []));
  }

  const segment = block.segments.find(each => list[each.head].code === ELSE) as BlockSegment;
  const end = segment.body === null
    ? segment.head + 1
    : segment.body.end;
  return replaceRange(list, segment.head, end, []);
};

/**
 * Builds the commands a fresh block needs around its opener: a body under an opener that owns one (a conditional
 * branch, a loop, a skip), and the branches a Show Choices or a battle's settings call for, then the closer.
 * @param {RmmzEventCommand} opener The fresh opener.
 * @param {number} closerCode The code closing the block.
 * @param {CommandStructure} structure How commands nest.
 * @returns {RmmzEventCommand[]} The whole block, opener first.
 */
const freshBlock = (opener: RmmzEventCommand, closerCode: number, structure: CommandStructure): RmmzEventCommand[] =>
{
  // the block is built at the top level, where it reads on its own, then moved to the opener's indent.
  const top = { ...opener, indent: 0 };
  let block: RmmzEventCommand[];
  if (opener.code === BATTLE)
  {
    block = reconcileBlock([ top ], structure, 0);
  }
  else if (opener.code === SHOW_CHOICES)
  {
    block = reconcileBlock([ top, { code: END_CHOICES, indent: 0, parameters: [] } ], structure, 0);
  }
  else
  {
    block = [ top, { code: END_CODE, indent: 1, parameters: [] }, { code: closerCode, indent: 0, parameters: [] } ];
  }

  return reindent(block, opener.indent);
};

export { freshBlock, hasElseBranch, reconcileBlock, setElseBranch };
