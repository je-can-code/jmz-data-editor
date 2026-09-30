import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { bodyEnd, createCommand, isWholeNumber, withIndentAndParameters } from './commandShape.ts';

/**
 * The code of Show Choices.
 */
const SHOW_CHOICES_CODE = 102;

/**
 * The code of the line that opens one choice's branch ("When ...").
 */
const CHOICE_BRANCH_CODE = 402;

/**
 * The code of the line that opens the cancel branch ("When Cancel").
 */
const CHOICE_CANCEL_CODE = 403;

/**
 * The code of the line that ends a Show Choices.
 */
const CHOICES_END_CODE = 404;

/**
 * The most choices one Show Choices command holds in MZ.
 */
const CHOICES_PER_COMMAND = 6;

/**
 * The cancel setting that runs the cancel branch.
 */
const CANCEL_BRANCH = -2;

/**
 * The cancel setting that ignores the cancel button.
 */
const CANCEL_DISALLOWED = -1;

/**
 * The default setting that highlights no choice.
 */
const NO_DEFAULT = -1;

/**
 * One choice of a list: its text, and the branch that runs when it is picked.
 */
type ChoiceEntry = {
  /**
   * The text the player sees.
   */
  readonly text: string;

  /**
   * The text the choice's "When" line repeats, which MZ keeps equal to the choice's.
   */
  readonly branchText: string;

  /**
   * The "When" line as it arrived, so its own layout (a folded branch) survives; null for a new choice.
   */
  readonly branch: RmmzEventCommand | null;

  /**
   * Every command the branch runs, through the empty line that closes it.
   */
  readonly body: readonly RmmzEventCommand[];
};

/**
 * The cancel branch of one Show Choices command.
 */
type CancelBranch = {
  readonly line: RmmzEventCommand;
  readonly body: readonly RmmzEventCommand[];
};

/**
 * One Show Choices command of a list, as it arrived. HIME_LargeChoices merges consecutive Show Choices commands
 * into one list, so a list longer than six arrives as several of these; each keeps its own raw settings, which
 * are what is written back whenever they still mean what the list asks for.
 */
type ChoiceBlock = {
  /**
   * How many of the list's choices this command holds.
   */
  readonly size: number;

  /**
   * The command as it arrived.
   */
  readonly opener: RmmzEventCommand;

  /**
   * Its cancel setting as stored: a choice of its own, -1 disallowed, -2 the cancel branch.
   */
  readonly cancel: number;

  /**
   * Its default setting as stored: a choice of its own, or -1 for none.
   */
  readonly defaultChoice: number;

  /**
   * Its window position and background as stored; only the first command's are ever used.
   */
  readonly position: number;
  readonly background: number;

  /**
   * Its cancel branch, when it has one.
   */
  readonly cancelBranch: CancelBranch | null;

  /**
   * The line ending it, as it arrived.
   */
  readonly end: RmmzEventCommand;
};

/**
 * A Show Choices list read for editing, merged the way HIME_LargeChoices merges it: one list of choices, with
 * one cancel setting and one default across all of them, over the commands it arrived as.
 */
type ChoiceListModel = {
  /**
   * The indent the list sits at.
   */
  readonly indent: number;

  /**
   * Every choice, in order.
   */
  readonly choices: readonly ChoiceEntry[];

  /**
   * The commands the choices are spread over; their sizes add up to the number of choices.
   */
  readonly blocks: readonly ChoiceBlock[];

  /**
   * What cancel does: a choice (by its place in the whole list), -1 nothing, -2 the cancel branch.
   */
  readonly cancelType: number;

  /**
   * The choice highlighted first (by its place in the whole list), or -1 for none.
   */
  readonly defaultType: number;

  /**
   * Where the choice window sits: 0 left, 1 middle, 2 right.
   */
  readonly position: number;

  /**
   * The choice window: 0 a window, 1 dimmed, 2 transparent.
   */
  readonly background: number;
};

/**
 * Collects a branch body: every command after a branch line that sits deeper than the list.
 * @param {readonly RmmzEventCommand[]} commands The commands.
 * @param {number} start The first command after the branch line.
 * @param {number} indent The list's indent.
 * @returns {number} The index of the first command that is not part of the body.
 */
const bodyEndIndex = (commands: readonly RmmzEventCommand[], start: number, indent: number): number =>
{
  let index = start;
  while (index < commands.length && commands[index].indent > indent)
  {
    index += 1;
  }

  return index;
};

/**
 * Reports whether a command is a given code at a given indent.
 * @param {RmmzEventCommand | undefined} command The command.
 * @param {number} code The code.
 * @param {number} indent The indent.
 * @returns {boolean} True when it is.
 */
const isAt = (command: RmmzEventCommand | undefined, code: number, indent: number): boolean =>
{
  return command !== undefined && command.code === code && command.indent === indent;
};

/**
 * Reports whether a stored cancel or default setting is one MZ's dialog can hold: a special value, or one of the
 * command's six slots, filled or not.
 * @param {number} value The stored setting.
 * @param {number} lowest The lowest special value the setting allows.
 * @returns {boolean} True when MZ could have stored it.
 */
const fitsSlots = (value: number, lowest: number): boolean =>
{
  return value >= lowest && value < CHOICES_PER_COMMAND;
};

/**
 * Reads the settings of a Show Choices command: choices of text, then four whole numbers.
 * @param {RmmzEventCommand} opener The command.
 * @returns {{ texts: string[], cancel: number, defaultChoice: number, position: number, background: number } | null} The settings, or null when not MZ-shaped.
 */
const readOpener = (opener: RmmzEventCommand) =>
{
  const { code, parameters } = opener;
  const [ texts, cancel, defaultChoice, position, background ] = parameters;
  const shaped = code === SHOW_CHOICES_CODE
    && parameters.length === 5
    && Array.isArray(texts)
    && texts.every(text => typeof text === 'string')
    && isWholeNumber(cancel)
    && isWholeNumber(defaultChoice)
    && isWholeNumber(position)
    && isWholeNumber(background);
  if (shaped === false)
  {
    return null;
  }

  // MZ's dialog always offers six slots, so a setting may point at a slot the command left empty.
  const settingsFit = fitsSlots(cancel, CANCEL_BRANCH) && fitsSlots(defaultChoice, NO_DEFAULT);
  return settingsFit
    ? { texts: texts as string[], cancel, defaultChoice, position, background }
    : null;
};

/**
 * Reads the choice branches of one Show Choices command.
 * @param {readonly RmmzEventCommand[]} commands The commands.
 * @param {number} start The first line after the command.
 * @param {number} indent The list's indent.
 * @param {readonly string[]} texts The command's choice texts.
 * @returns {{ choices: ChoiceEntry[], next: number } | null} The choices and the first line after them, or null when not MZ-shaped.
 */
const readBranches = (commands: readonly RmmzEventCommand[], start: number, indent: number, texts: readonly string[]) =>
{
  const choices: ChoiceEntry[] = [];
  let index = start;
  while (isAt(commands[index], CHOICE_BRANCH_CODE, indent))
  {
    const branch = commands[index];
    const [ local, branchText ] = branch.parameters;
    const text = texts.at(choices.length);
    if (branch.parameters.length !== 2 || local !== choices.length || typeof branchText !== 'string' || text === undefined)
    {
      return null;
    }

    const next = bodyEndIndex(commands, index + 1, indent);
    choices.push({ text, branchText, branch, body: commands.slice(index + 1, next) });
    index = next;
  }

  return choices.length === texts.length
    ? { choices, next: index }
    : null;
};

/**
 * Reads one Show Choices command of a list, from the command through its end line.
 * @param {readonly RmmzEventCommand[]} commands The commands.
 * @param {number} start Where the command sits.
 * @returns {{ block: ChoiceBlock, choices: ChoiceEntry[], next: number } | null} The command, its choices and the first line after it, or null when not MZ-shaped.
 */
const readBlock = (commands: readonly RmmzEventCommand[], start: number) =>
{
  const opener = commands[start];
  const settings = readOpener(opener);
  const branches = settings === null
    ? null
    : readBranches(commands, start + 1, opener.indent, settings.texts);
  if (settings === null || branches === null)
  {
    return null;
  }

  // a cancel branch follows the choices exactly when cancel is set to run one.
  let index = branches.next;
  let cancelBranch: CancelBranch | null = null;
  if (isAt(commands[index], CHOICE_CANCEL_CODE, opener.indent))
  {
    const next = bodyEndIndex(commands, index + 1, opener.indent);
    cancelBranch = { line: commands[index], body: commands.slice(index + 1, next) };
    index = next;
  }

  const end = commands[index];
  if (isAt(end, CHOICES_END_CODE, opener.indent) === false || (cancelBranch !== null) !== (settings.cancel === CANCEL_BRANCH))
  {
    return null;
  }

  const { texts, cancel, defaultChoice, position, background } = settings;
  return {
    block: { size: texts.length, opener, cancel, defaultChoice, position, background, cancelBranch, end },
    choices: branches.choices,
    next: index + 1,
  };
};

/**
 * Works out the list's cancel setting from its commands' own, exactly as HIME_LargeChoices does: the first
 * command's setting stands until a later command names a choice of its own (counted from where its choices
 * start) or asks for the cancel branch; a later "disallowed" changes nothing.
 * @param {readonly number[]} raws Each command's stored cancel setting.
 * @param {readonly number[]} sizes Each command's number of choices.
 * @returns {number} The list's cancel setting.
 */
const mergedCancel = (raws: readonly number[], sizes: readonly number[]): number =>
{
  let merged = raws[0];
  let offset = sizes[0];
  for (let index = 1; index < raws.length; index++)
  {
    if (raws[index] > CANCEL_DISALLOWED)
    {
      merged = raws[index] + offset;
    }
    else if (raws[index] === CANCEL_BRANCH)
    {
      merged = CANCEL_BRANCH;
    }

    offset += sizes[index];
  }

  return merged;
};

/**
 * Works out the list's default choice from its commands' own, exactly as HIME_LargeChoices does: the first
 * command's stands until a later command names a choice of its own.
 * @param {readonly number[]} raws Each command's stored default.
 * @param {readonly number[]} sizes Each command's number of choices.
 * @returns {number} The list's default choice.
 */
const mergedDefault = (raws: readonly number[], sizes: readonly number[]): number =>
{
  let merged = raws[0];
  let offset = sizes[0];
  for (let index = 1; index < raws.length; index++)
  {
    if (raws[index] > NO_DEFAULT)
    {
      merged = raws[index] + offset;
    }

    offset += sizes[index];
  }

  return merged;
};

/**
 * Lists where each command's choices start in the whole list.
 * @param {readonly number[]} sizes Each command's number of choices.
 * @returns {number[]} The starting place of each.
 */
const blockOffsets = (sizes: readonly number[]): number[] =>
{
  let offset = 0;
  return sizes.map(size =>
  {
    const start = offset;
    offset += size;
    return start;
  });
};

/**
 * Stores a choice-pointing setting the canonical way: the command holding the choice names it among its own,
 * and every other command stores the neutral value, which HIME_LargeChoices passes over. A setting pointing
 * past the last choice lands in one of the last command's empty slots, where MZ's dialog would have kept it.
 * @param {number} choice The choice, by its place in the whole list.
 * @param {readonly number[]} sizes Each command's number of choices.
 * @param {number} neutral The value that changes nothing.
 * @returns {number[]} Each command's stored setting.
 */
const pointAtChoice = (choice: number, sizes: readonly number[], neutral: number): number[] =>
{
  const offsets = blockOffsets(sizes);
  const holder = sizes.findIndex((size, index) => choice >= offsets[index] && choice < offsets[index] + size);
  const last = sizes.length - 1;
  const owner = holder === -1 && choice - offsets[last] < CHOICES_PER_COMMAND
    ? last
    : holder;
  return sizes.map((_size, index) => (index === owner ? choice - offsets[index] : neutral));
};

/**
 * Stores the list's cancel setting across its commands. The commands keep their own stored values whenever those
 * still mean exactly what the list asks for, which is what keeps an untouched list exactly as it arrived;
 * otherwise the setting is stored canonically, with the cancel branch on the last command.
 * @param {readonly number[]} raws Each command's stored cancel setting.
 * @param {readonly number[]} sizes Each command's number of choices.
 * @param {number} desired The list's cancel setting.
 * @returns {number[]} Each command's cancel setting.
 */
const storeCancel = (raws: readonly number[], sizes: readonly number[], desired: number): number[] =>
{
  const fits = raws.every(raw => fitsSlots(raw, CANCEL_BRANCH));
  if (fits && mergedCancel(raws, sizes) === desired)
  {
    return [ ...raws ];
  }

  if (desired === CANCEL_BRANCH)
  {
    return sizes.map((_size, index) => (index === sizes.length - 1 ? CANCEL_BRANCH : CANCEL_DISALLOWED));
  }

  return desired === CANCEL_DISALLOWED
    ? sizes.map(() => CANCEL_DISALLOWED)
    : pointAtChoice(desired, sizes, CANCEL_DISALLOWED);
};

/**
 * Stores the list's default choice across its commands, keeping their own stored values whenever those still
 * mean it.
 * @param {readonly number[]} raws Each command's stored default.
 * @param {readonly number[]} sizes Each command's number of choices.
 * @param {number} desired The list's default choice.
 * @returns {number[]} Each command's default.
 */
const storeDefault = (raws: readonly number[], sizes: readonly number[], desired: number): number[] =>
{
  const fits = raws.every(raw => fitsSlots(raw, NO_DEFAULT));
  if (fits && mergedDefault(raws, sizes) === desired)
  {
    return [ ...raws ];
  }

  return desired === NO_DEFAULT
    ? sizes.map(() => NO_DEFAULT)
    : pointAtChoice(desired, sizes, NO_DEFAULT);
};

/**
 * Reads a Show Choices list: one command, or several that HIME_LargeChoices merges, from the first command
 * through the last one's end line and nothing else. Anything not shaped the way MZ writes it reads as null, so
 * the editor leaves it exactly as it is.
 * @param {readonly RmmzEventCommand[]} commands The list's commands, as {@link blockSpanAt} finds them.
 * @returns {ChoiceListModel | null} The model, or null when not MZ-shaped.
 */
const parseChoiceList = (commands: readonly RmmzEventCommand[]): ChoiceListModel | null =>
{
  const [ first ] = commands;
  if (first === undefined)
  {
    return null;
  }

  const blocks: ChoiceBlock[] = [];
  const choices: ChoiceEntry[] = [];
  let start = 0;
  while (start < commands.length)
  {
    const read = isAt(commands[start], SHOW_CHOICES_CODE, first.indent)
      ? readBlock(commands, start)
      : null;
    if (read === null)
    {
      return null;
    }

    blocks.push(read.block);
    choices.push(...read.choices);
    start = read.next;
  }

  const sizes = blocks.map(block => block.size);
  return {
    indent: first.indent,
    choices,
    blocks,
    cancelType: mergedCancel(blocks.map(block => block.cancel), sizes),
    defaultType: mergedDefault(blocks.map(block => block.defaultChoice), sizes),
    position: blocks[0].position,
    background: blocks[0].background,
  };
};

/**
 * Writes one choice's branch: its "When" line, numbered among its own command's choices as MZ numbers them, then
 * its body.
 * @param {ChoiceEntry} choice The choice.
 * @param {number} local Its place among its command's choices.
 * @param {number} indent The list's indent.
 * @returns {RmmzEventCommand[]} The branch.
 */
const writeBranch = (choice: ChoiceEntry, local: number, indent: number): RmmzEventCommand[] =>
{
  const line = choice.branch === null
    ? createCommand(CHOICE_BRANCH_CODE, indent, [ local, choice.branchText ])
    : withIndentAndParameters(choice.branch, indent, [ local, choice.branchText ]);
  return [ line, ...choice.body ];
};

/**
 * Writes a Show Choices list back as the commands it is spread over: each command with its own choices and its
 * stored settings, each choice with its branch, and a cancel branch on each command whose cancel runs one. An
 * untouched list comes back exactly as it arrived.
 * @param {ChoiceListModel} model The list.
 * @returns {RmmzEventCommand[]} The commands, from the first Show Choices through the last end line.
 */
const writeChoiceList = (model: ChoiceListModel): RmmzEventCommand[] =>
{
  const { indent, choices, blocks } = model;
  const sizes = blocks.map(block => block.size);
  if (sizes.reduce((sum, size) => sum + size, 0) !== choices.length)
  {
    throw new Error(`the commands hold ${sizes.join('+')} choices, but the list has ${choices.length}`);
  }

  const cancels = storeCancel(blocks.map(block => block.cancel), sizes, model.cancelType);
  const defaults = storeDefault(blocks.map(block => block.defaultChoice), sizes, model.defaultType);
  const offsets = blockOffsets(sizes);

  return blocks.flatMap((block, index) =>
  {
    const own = choices.slice(offsets[index], offsets[index] + block.size);

    // only the first command's window settings are ever used; the others keep whatever they stored.
    const position = index === 0 ? model.position : block.position;
    const background = index === 0 ? model.background : block.background;
    const opener = withIndentAndParameters(block.opener, indent, [
      own.map(choice => choice.text), cancels[index], defaults[index], position, background,
    ]);

    let cancel: RmmzEventCommand[] = [];
    if (cancels[index] === CANCEL_BRANCH)
    {
      cancel = block.cancelBranch === null
        ? [ createCommand(CHOICE_CANCEL_CODE, indent, [ CHOICES_PER_COMMAND, null ]), bodyEnd(indent) ]
        : [ block.cancelBranch.line, ...block.cancelBranch.body ];
    }

    return [ opener, ...own.flatMap((choice, local) => writeBranch(choice, local, indent)), ...cancel, block.end ];
  });
};

/**
 * Builds an extra command for a list that has outgrown its commands, with neutral settings HIME_LargeChoices
 * passes over.
 * @param {ChoiceListModel} model The list.
 * @param {number} size How many choices it holds.
 * @returns {ChoiceBlock} The command.
 */
const extraBlock = (model: ChoiceListModel, size: number): ChoiceBlock =>
{
  const { indent, position, background } = model;
  return {
    size,
    opener: createCommand(SHOW_CHOICES_CODE, indent, [ [], CANCEL_DISALLOWED, NO_DEFAULT, position, background ]),
    cancel: CANCEL_DISALLOWED,
    defaultChoice: NO_DEFAULT,
    position,
    background,
    cancelBranch: null,
    end: createCommand(CHOICES_END_CODE, indent, []),
  };
};

/**
 * Spreads a list's choices so no command holds more than six: a command that overflows passes its extra choices
 * on to the next, and the last one's overflow becomes a new command.
 * @param {ChoiceListModel} model The list.
 * @param {readonly ChoiceBlock[]} blocks Its commands, some possibly over six.
 * @returns {ChoiceBlock[]} Its commands, none over six.
 */
const spreadBlocks = (model: ChoiceListModel, blocks: readonly ChoiceBlock[]): ChoiceBlock[] =>
{
  let carry = 0;
  const spread = blocks.map(block =>
  {
    const size = block.size + carry;
    carry = Math.max(0, size - CHOICES_PER_COMMAND);
    return { ...block, size: Math.min(size, CHOICES_PER_COMMAND) };
  });

  while (carry > 0)
  {
    const size = Math.min(carry, CHOICES_PER_COMMAND);
    spread.push(extraBlock(model, size));
    carry -= size;
  }

  return spread;
};

/**
 * Finds which command holds a place in the list; the place just past the end belongs to the last command.
 * @param {readonly ChoiceBlock[]} blocks The commands.
 * @param {number} place The place.
 * @returns {number} The command's index.
 */
const blockHolding = (blocks: readonly ChoiceBlock[], place: number): number =>
{
  const offsets = blockOffsets(blocks.map(block => block.size));
  const found = offsets.findIndex((offset, index) => place >= offset && place < offset + blocks[index].size);
  return found === -1
    ? blocks.length - 1
    : found;
};

/**
 * Moves a choice-pointing setting to follow its choice through a change of places.
 * @param {number} value The setting: a place, or a negative special value that points at no choice.
 * @param {(place: number) => number | null} move Where a place ends up, or null when its choice is gone.
 * @param {number} fallback The setting when its choice is gone.
 * @returns {number} The moved setting.
 */
const followChoice = (value: number, move: (place: number) => number | null, fallback: number): number =>
{
  if (value < 0)
  {
    return value;
  }

  return move(value) ?? fallback;
};

/**
 * Changes a choice's text, and the "When" line that repeats it.
 * @param {ChoiceListModel} model The list.
 * @param {number} index The choice.
 * @param {string} text Its new text.
 * @returns {ChoiceListModel} The list with the new text.
 */
const setChoiceText = (model: ChoiceListModel, index: number, text: string): ChoiceListModel =>
{
  return {
    ...model,
    choices: model.choices.map((choice, place) => (place === index ? { ...choice, text, branchText: text } : choice)),
  };
};

/**
 * Adds a choice, with an empty branch, at a place in the list. The command holding that place grows, passing
 * any overflow on, and the cancel and default settings keep pointing at the choices they pointed at.
 * @param {ChoiceListModel} model The list.
 * @param {number} index Where the new choice goes, from 0 to the number of choices.
 * @param {string} text Its text.
 * @returns {ChoiceListModel} The list with the new choice.
 */
const insertChoice = (model: ChoiceListModel, index: number, text: string): ChoiceListModel =>
{
  const { choices, blocks, indent } = model;
  const place = Math.max(0, Math.min(index, choices.length));
  const added: ChoiceEntry = { text, branchText: text, branch: null, body: [ bodyEnd(indent) ] };
  const holder = blockHolding(blocks, place);
  const grown = blocks.map((block, at) => (at === holder ? { ...block, size: block.size + 1 } : block));
  const move = (old: number) => (old >= place ? old + 1 : old);

  return {
    ...model,
    choices: [ ...choices.slice(0, place), added, ...choices.slice(place) ],
    blocks: spreadBlocks(model, grown),
    cancelType: followChoice(model.cancelType, move, CANCEL_DISALLOWED),
    defaultType: followChoice(model.defaultType, move, NO_DEFAULT),
  };
};

/**
 * Removes a choice and its branch. A command left with no choices goes, handing its cancel branch to a
 * neighbour that has none, so the branch is never lost by removing a choice. A cancel or default pointing at the
 * removed choice falls back to disallowed or none.
 * @param {ChoiceListModel} model The list.
 * @param {number} index The choice.
 * @returns {ChoiceListModel} The list without it.
 */
const removeChoice = (model: ChoiceListModel, index: number): ChoiceListModel =>
{
  const { choices, blocks } = model;
  if (index < 0 || index >= choices.length)
  {
    return model;
  }

  const holder = blockHolding(blocks, index);
  const shrunk = blocks.map((block, at) => (at === holder ? { ...block, size: block.size - 1 } : block));
  let kept = shrunk;
  if (shrunk[holder].size === 0 && shrunk.length > 1)
  {
    // the neighbour before it, or after it when it was first, inherits its cancel branch if it has none.
    const heir = holder === 0 ? 1 : holder - 1;
    const orphan = shrunk[holder].cancelBranch;
    kept = shrunk
      .map((block, at) => (at === heir && block.cancelBranch === null ? { ...block, cancelBranch: orphan } : block))
      .filter((_block, at) => at !== holder);
  }

  const move = (old: number) =>
  {
    if (old === index)
    {
      return null;
    }

    return old > index ? old - 1 : old;
  };

  return {
    ...model,
    choices: choices.filter((_choice, place) => place !== index),
    blocks: kept,
    cancelType: followChoice(model.cancelType, move, CANCEL_DISALLOWED),
    defaultType: followChoice(model.defaultType, move, NO_DEFAULT),
  };
};

/**
 * Moves a choice, with its branch, to another place. The commands keep their sizes, so choices flow across
 * them; the cancel and default settings follow the choices they pointed at.
 * @param {ChoiceListModel} model The list.
 * @param {number} from The choice's place.
 * @param {number} to Its new place.
 * @returns {ChoiceListModel} The list in its new order.
 */
const moveChoice = (model: ChoiceListModel, from: number, to: number): ChoiceListModel =>
{
  const { choices } = model;
  if (from === to || from < 0 || to < 0 || from >= choices.length || to >= choices.length)
  {
    return model;
  }

  const order = choices.map((_choice, place) => place);
  const [ moved ] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const move = (old: number) => order.indexOf(old);

  return {
    ...model,
    choices: order.map(place => choices[place]),
    cancelType: followChoice(model.cancelType, move, CANCEL_DISALLOWED),
    defaultType: followChoice(model.defaultType, move, NO_DEFAULT),
  };
};

/**
 * Counts the commands the cancel branches hold besides the empty lines closing them, so switching the cancel
 * branch off can say what goes with it.
 * @param {ChoiceListModel} model The list.
 * @returns {number} How many commands the cancel branches hold.
 */
const cancelBranchCommandCount = (model: ChoiceListModel): number =>
{
  return model.blocks
    .flatMap(block => block.cancelBranch?.body ?? [])
    .filter(command => command.code !== 0)
    .length;
};

/**
 * Builds a new Show Choices as MZ does: "Yes" and "No", cancel picking "No", "Yes" highlighted, on the right.
 * @param {number} indent The indent it sits at.
 * @returns {RmmzEventCommand[]} The commands.
 */
const newChoiceList = (indent: number): RmmzEventCommand[] =>
{
  return [
    createCommand(SHOW_CHOICES_CODE, indent, [ [ 'Yes', 'No' ], 1, 0, 2, 0 ]),
    createCommand(CHOICE_BRANCH_CODE, indent, [ 0, 'Yes' ]),
    bodyEnd(indent),
    createCommand(CHOICE_BRANCH_CODE, indent, [ 1, 'No' ]),
    bodyEnd(indent),
    createCommand(CHOICES_END_CODE, indent, []),
  ];
};

export {
  CANCEL_BRANCH,
  CANCEL_DISALLOWED,
  cancelBranchCommandCount,
  CHOICE_BRANCH_CODE,
  CHOICE_CANCEL_CODE,
  CHOICES_END_CODE,
  CHOICES_PER_COMMAND,
  insertChoice,
  mergedCancel,
  mergedDefault,
  moveChoice,
  newChoiceList,
  NO_DEFAULT,
  parseChoiceList,
  removeChoice,
  setChoiceText,
  SHOW_CHOICES_CODE,
  writeChoiceList,
};
export type { CancelBranch, ChoiceBlock, ChoiceEntry, ChoiceListModel };
