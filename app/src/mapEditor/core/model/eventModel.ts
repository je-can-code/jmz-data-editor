import type {
  RmmzEventCommand,
  RmmzEventConditions,
  RmmzEventImage,
  RmmzEventPage,
  RmmzMapEvent,
  RmmzMoveRoute,
} from './rmmzTypes.ts';

/**
 * What starts an event page running.
 */
const EventTrigger = {
  actionButton: 0,
  playerTouch: 1,
  eventTouch: 2,
  autorun: 3,
  parallel: 4,
} as const;

/**
 * Where an event page draws and collides, relative to characters.
 */
const EventPriority = {
  belowCharacters: 0,
  sameAsCharacters: 1,
  aboveCharacters: 2,
} as const;

/**
 * How an event page moves on its own.
 */
const EventMoveType = {
  fixed: 0,
  random: 1,
  approach: 2,
  custom: 3,
} as const;

/**
 * The four directions a character faces, as RMMZ numbers them (the numeric keypad's arrows).
 */
const Direction = {
  down: 2,
  left: 4,
  right: 6,
  up: 8,
} as const;

/**
 * The command codes that carry comment text: the first line, then each continuation line.
 */
const COMMENT_CODE = 108;
const COMMENT_CONTINUATION_CODE = 408;

/**
 * An event page read in the groups the event window shows. It is a view, built on demand: the page itself is
 * always stored exactly as RMMZ writes it, so nothing about this grouping can ever change a saved file.
 */
type EventPageView = {
  conditions: RmmzEventConditions;
  image: RmmzEventImage;
  movement: {
    type: number;
    speed: number;
    frequency: number;
    route: RmmzMoveRoute;
  };
  options: {
    walking: boolean;
    stepping: boolean;
    directionFix: boolean;
    through: boolean;
  };
  priority: number;
  trigger: number;
  commands: RmmzEventCommand[];
};

/**
 * Builds a new event page with the values MZ gives one: no conditions, no graphic, fixed in place, below
 * characters, started by the action button, and an empty command list.
 * @returns {RmmzEventPage} A fresh page.
 */
const createEventPage = (): RmmzEventPage =>
{
  return {
    conditions: {
      actorId: 1,
      actorValid: false,
      itemId: 1,
      itemValid: false,
      selfSwitchCh: 'A',
      selfSwitchValid: false,
      switch1Id: 1,
      switch1Valid: false,
      switch2Id: 1,
      switch2Valid: false,
      variableId: 1,
      variableValid: false,
      variableValue: 0,
    },
    directionFix: false,
    image: {
      tileId: 0,
      characterName: '',
      direction: Direction.down,
      pattern: 0,
      characterIndex: 0,
    },
    // every command list ends with the empty command, code 0.
    list: [ { code: 0, indent: 0, parameters: [] } ],
    moveFrequency: 3,
    moveRoute: {
      list: [ { code: 0, parameters: [] } ],
      repeat: true,
      skippable: false,
      wait: false,
    },
    moveSpeed: 3,
    moveType: EventMoveType.fixed,
    priorityType: EventPriority.belowCharacters,
    stepAnime: false,
    through: false,
    trigger: EventTrigger.actionButton,
    walkAnime: true,
  };
};

/**
 * Builds a new event with one fresh page, named the way MZ names one ({@code EV001}).
 * @param {number} id The event id, which is also its slot in the map's event list.
 * @param {number} x The column it stands on.
 * @param {number} y The row it stands on.
 * @returns {RmmzMapEvent} A fresh event.
 */
const createMapEvent = (id: number, x: number, y: number): RmmzMapEvent =>
{
  return {
    id,
    name: `EV${String(id).padStart(3, '0')}`,
    note: '',
    pages: [ createEventPage() ],
    x,
    y,
  };
};

/**
 * Reads an event page in the event window's groups.
 * @param {RmmzEventPage} page The page as stored.
 * @returns {EventPageView} The grouped view, sharing the page's objects rather than copying them.
 */
const describeEventPage = (page: RmmzEventPage): EventPageView =>
{
  return {
    conditions: page.conditions,
    image: page.image,
    movement: {
      type: page.moveType,
      speed: page.moveSpeed,
      frequency: page.moveFrequency,
      route: page.moveRoute,
    },
    options: {
      walking: page.walkAnime,
      stepping: page.stepAnime,
      directionFix: page.directionFix,
      through: page.through,
    },
    priority: page.priorityType,
    trigger: page.trigger,
    commands: page.list,
  };
};

/**
 * Collects the text of every comment on a page, one line per comment line, in order. Plugins that read tags
 * out of comments (a battler's enemy, a light's radius) all start here.
 * @param {RmmzEventPage} page The page.
 * @returns {string} The comment lines joined with newlines, or an empty string when there are none.
 */
const pageCommentText = (page: RmmzEventPage): string =>
{
  const lines = page.list
    .filter(command => command.code === COMMENT_CODE || command.code === COMMENT_CONTINUATION_CODE)
    .map(command =>
    {
      // a comment line keeps its text as the first parameter.
      const [ text ] = command.parameters;
      return typeof text === 'string'
        ? text
        : '';
    });

  return lines.join('\n');
};

export {
  createEventPage,
  createMapEvent,
  describeEventPage,
  Direction,
  EventMoveType,
  EventPriority,
  EventTrigger,
  pageCommentText,
};
export type { EventPageView };
