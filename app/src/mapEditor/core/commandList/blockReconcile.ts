import type { JsonValue } from '../model/json.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import { textList } from '../commands/builtin/phrases.ts';
import { writeParameter, type ListOrigins } from '../commands/fieldValues.ts';
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
 * What a Show Choices' cancel setting holds when cancelling has a branch of its own, and when cancelling does
 * nothing.
 */
const CANCEL_BRANCH = -2;
const CANCEL_DISALLOWED = -1;

/**
 * What a Show Choices' default setting holds when no choice is highlighted first.
 */
const NO_DEFAULT = -1;

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
 * Finds the choice an entry of the edited choices was before the edit: the one at its own place when nothing says
 * otherwise, the one its origin names, or none for a choice just added.
 * @param {number} choice The entry's place in the edited choices.
 * @param {ListOrigins | undefined} origins Where each entry came from, when the choices were reshaped.
 * @returns {number | null} The choice it was, or null when it is new.
 */
const originOf = (choice: number, origins: ListOrigins | undefined): number | null =>
{
  return origins === undefined
    ? choice
    : origins[choice] ?? null;
};

/**
 * Builds the branches a Show Choices' own settings call for: one per choice, each keeping the branch (and everything
 * under it) of the choice it was before the edit, renumbered and with its text brought up to date, then a cancel
 * branch when cancelling has one. A branch whose choice is gone goes with it, as in MZ.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandBlockNode} block The Show Choices block.
 * @param {ListOrigins | undefined} origins Where each choice came from, when the choices were reshaped; by place without.
 * @returns {RmmzEventCommand[]} The branches, in order.
 */
const choiceBranches = (list: readonly RmmzEventCommand[], block: CommandBlockNode, origins: ListOrigins | undefined): RmmzEventCommand[] =>
{
  const [ choicesValue, cancelType ] = list[block.start].parameters;
  const branches = block.segments.slice(1);
  const built = textList(choicesValue).flatMap((text, choice) =>
  {
    const origin = originOf(choice, origins);
    const existing = origin === null
      ? undefined
      : branches.find(segment => list[segment.head].code === WHEN_CHOICE && list[segment.head].parameters[0] === origin);
    if (existing === undefined)
    {
      return emptyBranch(WHEN_CHOICE, block.indent, [ choice, text ]);
    }

    const [ head, ...rest ] = segmentCommands(list, existing);
    return [ { ...head, parameters: writeParameter(writeParameter(head.parameters, [ 0 ], choice), [ 1 ], text) }, ...rest ];
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
 * Moves one of a Show Choices' choice settings (cancel, or the choice highlighted first) to follow the choice it
 * named through a reshape. A setting that names no choice stays; one naming an empty slot past the last choice
 * becomes what the game already does with it; one naming a choice that went falls back.
 * @param {JsonValue} setting The setting as stored.
 * @param {ListOrigins} origins Where each choice came from.
 * @param {number} before How many choices there were before the reshape.
 * @param {number} stray What an empty slot past the last choice amounts to in the game.
 * @param {number} fallback What the setting becomes when its choice went.
 * @returns {JsonValue} The setting, following its choice.
 */
const followChoice = (setting: JsonValue, origins: ListOrigins, before: number, stray: number, fallback: number): JsonValue =>
{
  if (typeof setting !== 'number' || setting < 0)
  {
    return setting;
  }

  if (setting >= before)
  {
    return stray;
  }

  const moved = origins.indexOf(setting);
  return moved === -1
    ? fallback
    : moved;
};

/**
 * Moves a Show Choices' cancel and default settings to follow the choices they named when its choices were
 * reshaped (one removed from the middle, one added), as its own editor does. Cancel naming a removed choice then
 * does nothing, and a default naming one highlights nothing. The game runs a cancel naming an empty slot as the
 * cancel branch and highlights nothing for such a default, so those are written as exactly that, where a new choice
 * can never take them over.
 * @param {RmmzEventCommand} opener The Show Choices command, its choices already edited.
 * @param {ListOrigins} origins Where each choice came from.
 * @param {number} before How many choices it had before the edit.
 * @returns {RmmzEventCommand} The command, its settings following their choices.
 */
const followChoices = (opener: RmmzEventCommand, origins: ListOrigins, before: number): RmmzEventCommand =>
{
  const [ texts, cancelType, defaultType, ...rest ] = opener.parameters;
  const cancel = followChoice(cancelType, origins, before, CANCEL_BRANCH, CANCEL_DISALLOWED);
  const highlighted = followChoice(defaultType, origins, before, NO_DEFAULT, NO_DEFAULT);
  return { ...opener, parameters: [ texts, cancel, highlighted, ...rest ] };
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
 *
 * Branches follow their choices by place unless the edit says where each choice came from: a choice removed from
 * the middle takes its own branch with it, the later choices keep theirs, and the cancel and default settings follow
 * the choices they named.
 * @param {readonly RmmzEventCommand[]} list The list, with the opener already edited.
 * @param {CommandStructure} structure How commands nest.
 * @param {number} index The opener's index.
 * @param {ListOrigins} origins Where each of a Show Choices' choices came from, when the edit reshaped them.
 * @returns {RmmzEventCommand[]} The list with the block's branches in line.
 */
const reconcileBlock = (list: readonly RmmzEventCommand[], structure: CommandStructure, index: number, origins?: ListOrigins): RmmzEventCommand[] =>
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
  if (block === null)
  {
    return [ ...list ];
  }

  // the branches still stand as they were before the edit, so they say how many choices there were.
  const before = block.segments.filter(segment => list[segment.head].code === WHEN_CHOICE).length;
  const opened = origins === undefined
    ? list
    : replaceRange(list, index, index + 1, [ followChoices(list[index], origins, before) ]);
  return replaceRange(opened, index + 1, block.closer, choiceBranches(opened, block, origins));
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
