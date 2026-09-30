import type { DatabaseNamesJson } from '../commandList/databaseNames.ts';
import { createCommand, isWholeNumber } from '../commands/editors/commandShape.ts';
import { SHOW_TEXT_CODE, SHOW_TEXT_LINE_CODE, textToLines } from '../commands/editors/showText.ts';
import { createEventPage, createMapEvent } from '../model/eventModel.ts';
import { cloneJson, type JsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzEventCommand, RmmzEventImage, RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import { messageField } from './dialogueKind.ts';
import {
  continuationEnd,
  endsList,
  hasGraphic,
  isEmptyPage,
  readMessage,
  readTextPage,
  startsUnit,
  type CommandUnit,
  type PageMessage,
} from './eventPages.ts';
import { pictureFields } from './pageFields.ts';
import type { EventEdit, QuickAction, QuickContext, QuickField, QuickModel, QuickOption } from './quickFields.ts';

/**
 * The id the core registers chests under.
 */
const CHEST_KIND_ID = 'core.chest';

/**
 * The codes of the commands a chest's opening is made of.
 */
const PLAY_SE_CODE = 250;
const SET_MOVEMENT_ROUTE_CODE = 205;
const MOVE_ROUTE_LINE_CODE = 505;
const CONTROL_SELF_SWITCH_CODE = 123;
const CONDITIONAL_BRANCH_CODE = 111;
const ELSE_CODE = 411;
const BRANCH_END_CODE = 412;

/**
 * What a chest can give: gold, or an item, weapon or armor.
 */
type ChestRewardKind = 'gold' | 'item' | 'weapon' | 'armor';

/**
 * The command that gives each kind of reward; the kind picker offers these codes as its choices.
 */
const REWARD_CODE: Readonly<Record<ChestRewardKind, number>> = {
  gold: 125,
  item: 126,
  weapon: 127,
  armor: 128,
};

/**
 * The kind of reward each giving command gives.
 */
const REWARD_KIND_BY_CODE: Readonly<Record<number, ChestRewardKind>> = {
  125: 'gold',
  126: 'item',
  127: 'weapon',
  128: 'armor',
};

/**
 * The kinds of reward, as the kind picker lists them.
 */
const REWARD_KIND_OPTIONS: readonly QuickOption[] = [
  { value: REWARD_CODE.gold, label: 'Gold' },
  { value: REWARD_CODE.item, label: 'Item' },
  { value: REWARD_CODE.weapon, label: 'Weapon' },
  { value: REWARD_CODE.armor, label: 'Armor' },
];

/**
 * What one of each kind is called.
 */
const REWARD_WORD: Readonly<Record<ChestRewardKind, string>> = {
  gold: 'Gold',
  item: 'Item',
  weapon: 'Weapon',
  armor: 'Armor',
};

/**
 * The most of each kind one command can give, as MZ allows it.
 */
const MAX_GOLD = 9999999;
const MAX_ROWS = 9999;

/**
 * The self switch a chest's opening turns on and its opened page waits for.
 */
const SELF_SWITCH_LETTERS: ReadonlySet<string> = new Set([ 'A', 'B', 'C', 'D' ]);

/**
 * The sound a chest makes opening, as MZ's treasure chests play it.
 */
const CHEST_SOUND = { name: 'Chest1', volume: 90, pitch: 100, pan: 0 };

/**
 * The route a chest turns through as it opens, exactly as MZ's treasure chests write it: facing fixed off, turn
 * left, wait, turn right, wait. The opened page then shows the lid up.
 */
const CHEST_OPENING_ROUTE: JsonObject & { list: JsonObject[] } = {
  repeat: false,
  skippable: false,
  wait: true,
  list: [ { code: 36 }, { code: 17 }, { code: 15, parameters: [ 3 ] }, { code: 18 }, { code: 15, parameters: [ 3 ] }, { code: 0 } ],
};

/**
 * The look a new chest takes when neither the event nor the map offers one: the first chest on MZ's own object
 * sheet, closed facing down and open facing up.
 */
const DEFAULT_CHEST_LOOK: ChestLook = {
  closed: { tileId: 0, characterName: '!Chest', direction: 2, pattern: 1, characterIndex: 0 },
  opened: { tileId: 0, characterName: '!Chest', direction: 8, pattern: 1, characterIndex: 0 },
};

/**
 * What a new chest gives until the author says otherwise.
 */
const DEFAULT_REWARD: ChestReward = { kind: 'item', id: 1, amount: 1 };

/**
 * One thing a chest gives.
 */
type ChestReward = {
  readonly kind: ChestRewardKind;

  /**
   * The item, weapon or armor; 0 for gold.
   */
  readonly id: number;

  /**
   * How many, or how much gold.
   */
  readonly amount: number;
};

/**
 * One reward on a chest: where its command sits in the closed page's list, the command, and what it gives.
 */
type ChestRewardSpot = {
  readonly listIndex: number;
  readonly command: RmmzEventCommand;
  readonly reward: ChestReward;
};

/**
 * A chest's two pictures: closed, on its first page, and open, on its second.
 */
type ChestLook = {
  readonly closed: RmmzEventImage;
  readonly opened: RmmzEventImage;
};

/**
 * A chest, read: the self switch that opens it, what it gives, what it says as it opens, and how it looks.
 */
type ChestModel = ChestLook & {
  readonly letter: string;
  readonly rewards: readonly ChestRewardSpot[];
  readonly messages: readonly PageMessage[];
};

/**
 * What a chest's opening is made of, counted as its closed page is read.
 */
type ChestOpening = {
  sounds: number;
  routes: number;
  letters: string[];
  rewards: ChestRewardSpot[];
  messages: PageMessage[];
};

/**
 * Reads a giving command as a reward, when it gives a set amount rather than taking one away or reading the
 * amount from a variable.
 * @param {RmmzEventCommand} command The command.
 * @returns {ChestReward | null} The reward, or null for anything else.
 */
const readReward = (command: RmmzEventCommand): ChestReward | null =>
{
  const kind = REWARD_KIND_BY_CODE[command.code];
  if (kind === undefined)
  {
    return null;
  }

  // gold has no id to pick; the others name their row first.
  const values = kind === 'gold'
    ? [ 0, ...command.parameters ]
    : command.parameters;
  const expected = { gold: 4, item: 4, weapon: 5, armor: 5 }[kind];
  const [ id, operation, operandType, amount, includeEquip ] = values;
  const shaped = values.length === expected
    && [ id, operation, operandType, amount ].every(isWholeNumber)
    && (expected === 4 || typeof includeEquip === 'boolean');
  if (shaped === false)
  {
    return null;
  }

  const gives = operation === 0 && operandType === 0 && (amount as number) >= 0 && (kind === 'gold' || (id as number) >= 1);
  return gives
    ? { kind, id: id as number, amount: amount as number }
    : null;
};

/**
 * Builds the parameters of the command giving a reward. A weapon or armor keeps the flag it had for counting
 * equipped ones, which only matters when taking them away.
 * @param {ChestReward} reward The reward.
 * @param {RmmzEventCommand | null} original The command it replaces, or null for a new one.
 * @returns {JsonValue[]} The parameters.
 */
const rewardParameters = (reward: ChestReward, original: RmmzEventCommand | null): JsonValue[] =>
{
  const { kind, id, amount } = reward;
  if (kind === 'gold')
  {
    return [ 0, 0, amount ];
  }

  if (kind === 'item')
  {
    return [ id, 0, 0, amount ];
  }

  const kept = original !== null && original.code === REWARD_CODE[kind] && original.parameters[4] === true;
  return [ id, 0, 0, amount, kept ];
};

/**
 * Builds the command giving a reward, keeping the layout of the command it replaces.
 * @param {ChestReward} reward The reward.
 * @param {RmmzEventCommand | null} original The command it replaces, or null for a new one at the top level.
 * @returns {RmmzEventCommand} The command.
 */
const rewardCommand = (reward: ChestReward, original: RmmzEventCommand | null): RmmzEventCommand =>
{
  const parameters = rewardParameters(reward, original);
  return original === null
    ? createCommand(REWARD_CODE[reward.kind], 0, parameters)
    : { ...cloneJson(original), code: REWARD_CODE[reward.kind], parameters };
};

/**
 * Finds where a conditional branch ends: just past its branch end, the first top-level branch end after it.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} index Where the branch opens.
 * @returns {number | null} The index after its end, or null when it never ends.
 */
const branchEnd = (list: readonly RmmzEventCommand[], index: number): number | null =>
{
  const end = list.findIndex((command, at) => at > index && command.indent === 0 && command.code === BRANCH_END_CODE);
  return end < 0
    ? null
    : end + 1;
};

/**
 * Reads a chest's closed page into units: each top-level command with its lines, and each conditional branch with
 * everything inside it, through its end.
 * @param {readonly RmmzEventCommand[]} list The closed page's command list.
 * @returns {CommandUnit[] | null} The units, or null when the list is not shaped the way MZ writes one.
 */
const readOpeningUnits = (list: readonly RmmzEventCommand[]): CommandUnit[] | null =>
{
  if (endsList(list) === false)
  {
    return null;
  }

  const units: CommandUnit[] = [];
  let index = 0;
  while (index < list.length - 1)
  {
    const command = list[index];
    const end = command.code === CONDITIONAL_BRANCH_CODE
      ? branchEnd(list, index)
      : continuationEnd(list, index);
    if (command.indent !== 0 || startsUnit(command) === false || end === null || end > list.length - 1)
    {
      return null;
    }

    units.push({ index, command, lines: list.slice(index + 1, end) });
    index = end;
  }

  return units;
};

/**
 * Reports whether a conditional branch on a chest only changes what is said: inside it, nothing but messages, an
 * else and the branch's end. What a chest gives never depends on a condition.
 * @param {CommandUnit} unit The branch, with everything inside it.
 * @returns {boolean} True when it only talks.
 */
const onlyTalks = (unit: CommandUnit): boolean =>
{
  return unit.lines.every(command => (command.indent === 0
    ? command.code === ELSE_CODE || command.code === BRANCH_END_CODE
    : command.indent === 1 && [ SHOW_TEXT_CODE, SHOW_TEXT_LINE_CODE, 0 ].includes(command.code)));
};

/**
 * Counts one unit of a chest's closed page into what the opening is made of.
 * @param {CommandUnit} unit The unit.
 * @param {ChestOpening} opening What has been counted so far.
 * @returns {boolean} True when the unit belongs in a chest's opening.
 */
const countOpeningUnit = (unit: CommandUnit, opening: ChestOpening): boolean =>
{
  const { command } = unit;
  const [ first, second ] = command.parameters;
  switch (command.code)
  {
    case PLAY_SE_CODE:
      opening.sounds += 1;
      return true;
    case SET_MOVEMENT_ROUTE_CODE:
      // the chest turns itself through its opening; a route for anyone else is more than a chest does.
      opening.routes += 1;
      return first === 0;
    case CONTROL_SELF_SWITCH_CODE:
      opening.letters.push(String(first));
      return SELF_SWITCH_LETTERS.has(String(first)) && second === 0;
    case SHOW_TEXT_CODE:
      return pushed(readMessage(unit), opening.messages);
    case CONDITIONAL_BRANCH_CODE:
      return onlyTalks(unit);
    default:
      return pushed(readRewardSpot(unit), opening.rewards);
  }
};

/**
 * Adds a value to a list when there is one.
 * @param {T | null} value The value, or null.
 * @param {T[]} list The list.
 * @returns {boolean} True when a value was added.
 */
const pushed = <T>(value: T | null, list: T[]): boolean =>
{
  if (value === null)
  {
    return false;
  }

  list.push(value);
  return true;
};

/**
 * Reads a unit as a reward.
 * @param {CommandUnit} unit The unit.
 * @returns {ChestRewardSpot | null} The reward, or null when the unit gives nothing.
 */
const readRewardSpot = (unit: CommandUnit): ChestRewardSpot | null =>
{
  const reward = readReward(unit.command);
  return reward === null
    ? null
    : { listIndex: unit.index, command: unit.command, reward };
};

/**
 * Reads a chest's closed page: one opening sound, one route turning the chest, one self switch turned on, at least
 * one reward, and any number of messages, in any order, all at the top level; a conditional branch is allowed only
 * when it varies what is said. Anything else makes the event more than a chest.
 * @param {RmmzEventPage} page The closed page.
 * @returns {ChestOpening | null} The opening, or null when the page is not a chest's.
 */
const readOpening = (page: RmmzEventPage): ChestOpening | null =>
{
  const units = readOpeningUnits(page.list);
  if (units === null || page.conditions.selfSwitchValid)
  {
    return null;
  }

  const opening: ChestOpening = { sounds: 0, routes: 0, letters: [], rewards: [], messages: [] };
  const belongs = units.every(unit => countOpeningUnit(unit, opening));
  return belongs && opening.sounds === 1 && opening.routes === 1 && opening.letters.length === 1 && opening.rewards.length > 0
    ? opening
    : null;
};

/**
 * Reports whether a page is a chest's opened page: shown once the opening's self switch is on, with a picture, and
 * saying something or nothing at all.
 * @param {RmmzEventPage} page The page.
 * @param {string} letter The self switch the opening turns on.
 * @returns {boolean} True for an opened page.
 */
const isOpenedPage = (page: RmmzEventPage, letter: string): boolean =>
{
  const { conditions, image } = page;
  return conditions.selfSwitchValid
    && conditions.selfSwitchCh === letter
    && hasGraphic(image)
    && (isEmptyPage(page) || readTextPage(page) !== null);
};

/**
 * Reads an event as a chest, in the two-page treasure pattern: a closed page whose opening plays a sound, turns the
 * chest, turns on a self switch, says what was found and gives it; and an opened page shown once that switch is on.
 * @param {RmmzMapEvent} event The event.
 * @returns {ChestModel | null} The chest, or null when the event is not one.
 */
const readChest = (event: RmmzMapEvent): ChestModel | null =>
{
  const [ closedPage, openedPage ] = event.pages;
  const opening = event.pages.length === 2
    ? readOpening(closedPage)
    : null;
  if (opening === null)
  {
    return null;
  }

  const [ letter ] = opening.letters;
  return isOpenedPage(openedPage, letter)
    ? { letter, rewards: opening.rewards, messages: opening.messages, closed: closedPage.image, opened: openedPage.image }
    : null;
};

/**
 * Recognises a chest.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for a chest.
 */
const isChest = (event: RmmzMapEvent): boolean =>
{
  return readChest(event) !== null;
};

/**
 * Writes an image with its keys in the order MZ writes them, whatever order it arrived in.
 * @param {RmmzEventImage} image The image.
 * @returns {RmmzEventImage} A copy, in MZ's order.
 */
const pageImage = (image: RmmzEventImage): RmmzEventImage =>
{
  const { tileId, characterName, direction, pattern, characterIndex } = image;
  return { tileId, characterName, direction, pattern, characterIndex };
};

/**
 * What a new chest is made from: its look, what it gives, and the message saying so.
 */
type NewChest = {
  readonly look: ChestLook;
  readonly reward: ChestReward;
  readonly message: string;
};

/**
 * Builds a chest's two pages exactly in the treasure pattern. The closed page plays the chest sound, turns the
 * chest through its opening, turns self switch A on, says what was found in a dimmed window in the middle of the
 * screen, then gives it; it starts from the action button, draws with characters, and keeps its facing fixed. The
 * opened page shows the open chest once self switch A is on, and does nothing more.
 * @param {NewChest} chest The look, the reward and the message.
 * @returns {RmmzEventPage[]} The two pages.
 */
const chestPages = (chest: NewChest): RmmzEventPage[] =>
{
  const route = cloneJson(CHEST_OPENING_ROUTE);
  const list = [
    createCommand(PLAY_SE_CODE, 0, [ CHEST_SOUND ]),
    createCommand(SET_MOVEMENT_ROUTE_CODE, 0, [ 0, route ]),
    ...route.list.slice(0, -1).map(step => createCommand(MOVE_ROUTE_LINE_CODE, 0, [ step ])),
    createCommand(CONTROL_SELF_SWITCH_CODE, 0, [ 'A', 0 ]),
    createCommand(SHOW_TEXT_CODE, 0, [ '', 0, 1, 1, '' ]),
    ...textToLines(chest.message).map(line => createCommand(SHOW_TEXT_LINE_CODE, 0, [ line ])),
    rewardCommand(chest.reward, null),
    createCommand(0, 0, []),
  ];

  const closed = createEventPage();
  const opened = createEventPage();
  return [
    { ...closed, directionFix: true, image: pageImage(chest.look.closed), list, priorityType: 1, walkAnime: false },
    {
      ...opened,
      conditions: { ...opened.conditions, selfSwitchCh: 'A', selfSwitchValid: true },
      directionFix: true,
      image: pageImage(chest.look.opened),
      priorityType: 1,
      walkAnime: false,
    },
  ];
};

/**
 * Builds a new chest event in the treasure pattern.
 * @param {number} id The event id, which is also its slot.
 * @param {number} x The column it stands on.
 * @param {number} y The row it stands on.
 * @param {NewChest} chest The look, the reward and the message.
 * @returns {RmmzMapEvent} The chest.
 */
const createChestEvent = (id: number, x: number, y: number, chest: NewChest): RmmzMapEvent =>
{
  return { ...createMapEvent(id, x, y), pages: chestPages(chest) };
};

/**
 * Names a reward the way the message saying it was found reads: a row by its name (or its kind and id before the
 * names arrive), with how many when more than one, and gold as an amount.
 * @param {ChestReward} reward The reward.
 * @param {DatabaseNamesJson | null} names The project's names, or null before they arrive.
 * @returns {string} Such as "Potion", "Silver Ore x10" or "150 gold".
 */
const rewardName = (reward: ChestReward, names: DatabaseNamesJson | null): string =>
{
  const { kind, id, amount } = reward;
  if (kind === 'gold')
  {
    return `${amount} gold`;
  }

  const lists = { item: names?.items, weapon: names?.weapons, armor: names?.armors };
  const name = lists[kind]?.[id] ?? '';
  const named = name === ''
    ? `${REWARD_WORD[kind]} ${id}`
    : name;
  return amount === 1
    ? named
    : `${named} x${amount}`;
};

/**
 * Writes the message a new chest shows as it opens.
 * @param {ChestReward} reward What it gives.
 * @param {DatabaseNamesJson | null} names The project's names, or null before they arrive.
 * @returns {string} Such as "Potion was found!".
 */
const chestMessage = (reward: ChestReward, names: DatabaseNamesJson | null): string =>
{
  return `${rewardName(reward, names)} was found!`;
};

/**
 * Reports whether two pictures come from the same character of the same sheet, or are the same tile.
 * @param {RmmzEventImage} left One picture.
 * @param {RmmzEventImage} right The other.
 * @returns {boolean} True when they match.
 */
const sameCharacter = (left: RmmzEventImage, right: RmmzEventImage): boolean =>
{
  return left.tileId === right.tileId && left.characterName === right.characterName && left.characterIndex === right.characterIndex;
};

/**
 * Works out the look a new chest made from an event takes. An event already showing a picture keeps it as the
 * closed chest, opening the way another chest on the map with the same picture opens, or turned to face up as
 * MZ's chest sheets open. An event showing nothing borrows the look of a chest already on the map, and failing
 * that takes MZ's own chest.
 * @param {RmmzMapEvent} event The event becoming a chest.
 * @param {readonly (RmmzMapEvent | null)[]} events Every event on its map.
 * @returns {ChestLook} The look.
 */
const chestLookFor = (event: RmmzMapEvent, events: readonly (RmmzMapEvent | null)[]): ChestLook =>
{
  const chests = events.flatMap(other =>
  {
    const chest = other === null || other.id === event.id ? null : readChest(other);
    return chest === null ? [] : [ chest ];
  });

  const own = event.pages[0]?.image;
  if (own !== undefined && hasGraphic(own))
  {
    const twin = chests.find(chest => sameCharacter(chest.closed, own));
    return { closed: own, opened: twin === undefined ? { ...own, direction: 8 } : twin.opened };
  }

  const [ nearest ] = chests;
  return nearest === undefined
    ? DEFAULT_CHEST_LOOK
    : { closed: nearest.closed, opened: nearest.opened };
};

/**
 * Works out the edit that makes an event a chest: its pages replaced by the treasure pattern, giving the default
 * reward with a message naming it, in the look {@link chestLookFor} picks. Its id, name, note and place stay.
 * @param {RmmzMapEvent} event The event.
 * @param {QuickContext} context The map's events and the project's names.
 * @returns {EventEdit[]} The edit.
 */
const makeChestEdits = (event: RmmzMapEvent, context: QuickContext): EventEdit[] =>
{
  const pages = chestPages({
    look: chestLookFor(event, context.events),
    reward: DEFAULT_REWARD,
    message: chestMessage(DEFAULT_REWARD, context.names),
  });
  return [ { kind: 'set', path: [], value: { ...cloneJson(event), pages } as unknown as JsonValue } ];
};

/**
 * Builds the edit that replaces one reward's command.
 * @param {ChestRewardSpot} spot The reward.
 * @param {ChestReward} reward What it should now give.
 * @returns {EventEdit[]} The edit.
 */
const replaceReward = (spot: ChestRewardSpot, reward: ChestReward): EventEdit[] =>
{
  return [ {
    kind: 'set',
    path: [ 'pages', 0, 'list', spot.listIndex ],
    value: rewardCommand(reward, spot.command) as unknown as JsonValue,
  } ];
};

/**
 * Builds the settings of one reward: its kind, which row it gives, and how many.
 * @param {ChestRewardSpot} spot The reward.
 * @param {number} ordinal Which of the chest's rewards it is, from 0.
 * @param {string} section The heading it sits under.
 * @returns {QuickField[]} The settings.
 */
const rewardFields = (spot: ChestRewardSpot, ordinal: number, section: string): QuickField[] =>
{
  const { reward } = spot;
  const key = `reward.${ordinal}`;
  const step = 'Change chest reward';
  const gold = reward.kind === 'gold';
  const kindField: QuickField = {
    key: `${key}.kind`,
    label: 'Gives',
    section,
    control: { kind: 'select', options: REWARD_KIND_OPTIONS },
    value: REWARD_CODE[reward.kind],
    step,
    write: value =>
    {
      // a row id means something else in another table, so a new kind starts from its first row.
      const kind = REWARD_KIND_BY_CODE[value as number];
      const amount = Math.min(reward.amount, kind === 'gold' ? MAX_GOLD : MAX_ROWS);
      return kind === reward.kind
        ? []
        : replaceReward(spot, { kind, id: kind === 'gold' ? 0 : 1, amount });
    },
  };

  const rowField: QuickField[] = gold ? [] : [ {
    key: `${key}.${reward.kind}`,
    label: REWARD_WORD[reward.kind],
    section,
    control: { kind: 'row', list: reward.kind as 'item' | 'weapon' | 'armor' },
    value: reward.id,
    step,
    write: value => replaceReward(spot, { ...reward, id: value as number }),
  } ];

  const amountField: QuickField = {
    key: `${key}.amount`,
    label: gold ? 'Gold' : 'Amount',
    section,
    control: { kind: 'number', min: 0, max: gold ? MAX_GOLD : MAX_ROWS },
    value: reward.amount,
    step,
    write: value => replaceReward(spot, { ...reward, amount: value as number }),
  };

  return [ kindField, ...rowField, amountField ];
};

/**
 * Builds the actions on a chest's rewards: removing each one while another would remain, and adding one more.
 * @param {ChestModel} chest The chest.
 * @param {(ordinal: number) => string} sectionOf The heading each reward sits under.
 * @returns {QuickAction[]} The actions.
 */
const rewardActions = (chest: ChestModel, sectionOf: (ordinal: number) => string): QuickAction[] =>
{
  const { rewards } = chest;
  const removals: QuickAction[] = rewards.length < 2 ? [] : rewards.map((spot, ordinal) => ({
    key: `reward.${ordinal}.remove`,
    label: 'Remove this reward',
    section: sectionOf(ordinal),
    step: 'Remove chest reward',
    run: () => [ { kind: 'splice', path: [ 'pages', 0, 'list' ], index: spot.listIndex, deleteCount: 1, inserted: [] } ],
  }));

  // a new reward goes right after the last one, so it is given with the others, and its button sits under it.
  const after = (rewards.at(-1)?.listIndex ?? 0) + 1;
  const addition: QuickAction = {
    key: 'reward.add',
    label: 'Add a reward',
    section: sectionOf(rewards.length - 1),
    step: 'Add chest reward',
    run: () => [ {
      kind: 'splice',
      path: [ 'pages', 0, 'list' ],
      index: after,
      deleteCount: 0,
      inserted: [ rewardCommand(DEFAULT_REWARD, null) as unknown as JsonValue ],
    } ],
  };

  return [ ...removals, addition ];
};

/**
 * What a chest's quick panel offers: what it gives and how much, what it says as it opens, and how it looks
 * closed and open.
 * @param {RmmzMapEvent} event The event.
 * @returns {QuickModel} The settings and actions; none for an event that is not a chest.
 */
const chestQuickModel = (event: RmmzMapEvent): QuickModel =>
{
  const chest = readChest(event);
  if (chest === null)
  {
    return { fields: [], actions: [] };
  }

  const sectionOf = (ordinal: number) => (chest.rewards.length > 1 ? `Reward ${ordinal + 1}` : 'Reward');
  const rewards = chest.rewards.flatMap((spot, ordinal) => rewardFields(spot, ordinal, sectionOf(ordinal)));
  const messages = chest.messages.map((message, ordinal) => messageField(message, 0, {
    key: `message.${ordinal}`,
    label: `Message ${ordinal + 1}`,
    section: 'Messages',
    step: 'Change chest message',
  }));
  const [ closedPage, openedPage ] = event.pages;
  const looks = [
    ...pictureFields(closedPage, 0, { key: 'look.closed', label: 'Closed', section: 'Look', step: 'Change chest look' }),
    ...pictureFields(openedPage, 1, { key: 'look.opened', label: 'Open', section: 'Look', step: 'Change chest look' }),
  ];

  return { fields: [ ...rewards, ...messages, ...looks ], actions: rewardActions(chest, sectionOf) };
};

export {
  CHEST_KIND_ID,
  CHEST_OPENING_ROUTE,
  CHEST_SOUND,
  chestLookFor,
  chestMessage,
  chestPages,
  chestQuickModel,
  createChestEvent,
  DEFAULT_CHEST_LOOK,
  DEFAULT_REWARD,
  isChest,
  makeChestEdits,
  readChest,
  readReward,
  REWARD_CODE,
  rewardName,
};
export type { ChestLook, ChestModel, ChestReward, ChestRewardKind, ChestRewardSpot, NewChest };
