import type { DocumentHub } from '../history/DocumentHub.ts';
import type { Transaction } from '../history/Transaction.ts';
import { cloneJson, type JsonValue } from '../model/json.ts';
import { Direction, EventMoveType, EventPriority, EventTrigger, type EventPageView } from '../model/eventModel.ts';
import type { RmmzEventImage, RmmzEventPage } from '../model/rmmzTypes.ts';
import {
  locatePage,
  pagePath,
  pageWords,
  recordEventStep,
  targetDocument,
  type EventWindowTarget,
  type PageOutcome,
} from './eventWindowTarget.ts';
import { isEventImage, isMoveRoute } from './pageShapes.ts';

/**
 * The four on-or-off options of a page, in the words the window uses: the walking animation while it moves, the
 * stepping animation while it stands, a facing that never turns, and passing through anything.
 */
type PageOption = 'walking' | 'stepping' | 'directionFix' | 'through';

/**
 * A page's movement, grouped the way the event window shows it, which is what the movement settings edit.
 */
type PageMovement = EventPageView['movement'];

/**
 * Every option, in the order MZ lists them.
 */
const PAGE_OPTIONS: readonly PageOption[] = [ 'walking', 'stepping', 'directionFix', 'through' ];

/**
 * Where each option lives on a page, exactly as the map file spells it.
 */
const OPTION_FIELDS: Readonly<Record<PageOption, 'walkAnime' | 'stepAnime' | 'directionFix' | 'through'>> = {
  walking: 'walkAnime',
  stepping: 'stepAnime',
  directionFix: 'directionFix',
  through: 'through',
};

/**
 * What each option is called, on its checkbox and in the history panel.
 */
const OPTION_LABELS: Readonly<Record<PageOption, string>> = {
  walking: 'Walking animation',
  stepping: 'Stepping animation',
  directionFix: 'Direction fix',
  through: 'Through',
};

/**
 * The values a page's priority can take.
 */
const PRIORITIES: ReadonlySet<number> = new Set(Object.values(EventPriority));

/**
 * The values a page's trigger can take.
 */
const TRIGGERS: ReadonlySet<number> = new Set(Object.values(EventTrigger));

/**
 * The values a page's movement type can take.
 */
const MOVE_TYPES: ReadonlySet<number> = new Set(Object.values(EventMoveType));

/**
 * The ways a page's picture can face.
 */
const DIRECTIONS: ReadonlySet<number> = new Set(Object.values(Direction));

/**
 * What the author reads when a setting is asked to hold something the game cannot run.
 */
const REFUSALS = {
  priority: 'A page draws below, beside or above characters.',
  trigger: 'A page starts by the action button, player touch, event touch, autorun or parallel.',
  image: 'That picture is not one a page can show.',
  movement: 'That movement is not one a page can make.',
} as const;

/**
 * Reports whether a number is a whole number within bounds.
 * @param {number} value The number.
 * @param {number} low The lowest allowed.
 * @param {number} high The highest allowed.
 * @returns {boolean} True when it is.
 */
const isWholeWithin = (value: number, low: number, high: number): boolean =>
{
  return Number.isInteger(value) && value >= low && value <= high;
};

/**
 * Reads a page's four options, in the window's words.
 * @param {RmmzEventPage} page The page.
 * @returns {Record<PageOption, boolean>} Each option's state.
 */
const readPageOptions = (page: RmmzEventPage): Record<PageOption, boolean> =>
{
  return {
    walking: page.walkAnime,
    stepping: page.stepAnime,
    directionFix: page.directionFix,
    through: page.through,
  };
};

/**
 * Changes one setting of a page as one step in the event's own history, refusing a page that has gone.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {string} label What the history panel calls the step, before the page's number.
 * @param {(transaction: Transaction, path: readonly (string | number)[]) => void} build Adds the patches, given the
 * page's path.
 * @returns {PageOutcome} The step (null when nothing changed), with the same page to show, or why nothing changed.
 */
const editPage = (
  hub: DocumentHub,
  target: EventWindowTarget,
  pageIndex: number,
  label: string,
  build: (transaction: Transaction, path: readonly (string | number)[]) => void,
): PageOutcome =>
{
  const found = locatePage(hub, target, pageIndex);
  if (found.ok === false)
  {
    return found;
  }

  const step = recordEventStep(hub, target, `${label} (${pageWords(pageIndex)})`, transaction =>
  {
    build(transaction, pagePath(target, pageIndex));
  });
  return { ok: true, step, page: pageIndex };
};

/**
 * Turns one of a page's options on or off, as one step; only that option's field is written.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {PageOption} option The option.
 * @param {boolean} on Whether it is on.
 * @returns {PageOutcome} The step (null when it already was), with the same page to show, or why nothing changed.
 */
const setPageOption = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, option: PageOption, on: boolean): PageOutcome =>
{
  const label = `${on ? 'Turn on' : 'Turn off'} ${OPTION_LABELS[option].toLowerCase()}`;
  return editPage(hub, target, pageIndex, label, (transaction, path) =>
  {
    transaction.set(targetDocument(target), [ ...path, OPTION_FIELDS[option] ], on);
  });
};

/**
 * Changes where a page draws and collides relative to characters, as one step.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {number} priority Below (0), the same as (1), or above (2) characters.
 * @returns {PageOutcome} The step (null when it already was), with the same page to show, or why nothing changed.
 */
const setPagePriority = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, priority: number): PageOutcome =>
{
  if (PRIORITIES.has(priority) === false)
  {
    return { ok: false, message: REFUSALS.priority };
  }

  return editPage(hub, target, pageIndex, 'Change priority', (transaction, path) =>
  {
    transaction.set(targetDocument(target), [ ...path, 'priorityType' ], priority);
  });
};

/**
 * Changes what starts a page running, as one step.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {number} trigger The action button (0), player touch (1), event touch (2), autorun (3) or parallel (4).
 * @returns {PageOutcome} The step (null when it already was), with the same page to show, or why nothing changed.
 */
const setPageTrigger = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, trigger: number): PageOutcome =>
{
  if (TRIGGERS.has(trigger) === false)
  {
    return { ok: false, message: REFUSALS.trigger };
  }

  return editPage(hub, target, pageIndex, 'Change trigger', (transaction, path) =>
  {
    transaction.set(targetDocument(target), [ ...path, 'trigger' ], trigger);
  });
};

/**
 * Reports whether a picture is one the game can show: a tile, or a sheet's character from 0 to 7, facing one of the
 * four directions, on frame 0, 1 or 2.
 * @param {RmmzEventImage} image The picture.
 * @returns {boolean} True when it is.
 */
const isShowableImage = (image: RmmzEventImage): boolean =>
{
  return isEventImage(image as unknown as JsonValue)
    && image.tileId >= 0
    && isWholeWithin(image.characterIndex, 0, 7)
    && isWholeWithin(image.pattern, 0, 2)
    && DIRECTIONS.has(image.direction);
};

/**
 * Changes a page's picture, as one step: the graphic picker's change. Each of the picture's five fields is written
 * only where it differs, so a new facing alone never touches the sheet.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {RmmzEventImage} image The new picture.
 * @returns {PageOutcome} The step (null when nothing differs), with the same page to show, or why nothing changed.
 */
const setPageImage = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, image: RmmzEventImage): PageOutcome =>
{
  if (isShowableImage(image) === false)
  {
    return { ok: false, message: REFUSALS.image };
  }

  const { tileId, characterName, direction, pattern, characterIndex } = image;
  const fields: Readonly<Record<keyof RmmzEventImage, JsonValue>> = { tileId, characterName, direction, pattern, characterIndex };
  return editPage(hub, target, pageIndex, 'Change graphic', (transaction, path) =>
  {
    // a write that changes nothing is left out of the step by the transaction.
    Object.entries(fields).forEach(([ field, value ]) =>
    {
      transaction.set(targetDocument(target), [ ...path, 'image', field ], value);
    });
  });
};

/**
 * Reports whether a movement is one the game can run: a type from fixed to custom, a speed from 1 to 6, a frequency
 * from 1 to 5, and a whole route.
 * @param {PageMovement} movement The movement.
 * @returns {boolean} True when it is.
 */
const isRunnableMovement = (movement: PageMovement): boolean =>
{
  return MOVE_TYPES.has(movement.type)
    && isWholeWithin(movement.speed, 1, 6)
    && isWholeWithin(movement.frequency, 1, 5)
    && isMoveRoute(movement.route as unknown as JsonValue);
};

/**
 * Changes a page's movement, as one step: the movement settings' change. The type, speed, frequency and route are each
 * written only where they differ, so a new speed alone never touches the route.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {PageMovement} movement The new movement.
 * @returns {PageOutcome} The step (null when nothing differs), with the same page to show, or why nothing changed.
 */
const setPageMovement = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, movement: PageMovement): PageOutcome =>
{
  if (isRunnableMovement(movement) === false)
  {
    return { ok: false, message: REFUSALS.movement };
  }

  const fields: Readonly<Record<string, JsonValue>> = {
    moveType: movement.type,
    moveSpeed: movement.speed,
    moveFrequency: movement.frequency,
    moveRoute: cloneJson(movement.route) as unknown as JsonValue,
  };
  return editPage(hub, target, pageIndex, 'Change movement', (transaction, path) =>
  {
    // a write that changes nothing is left out of the step by the transaction.
    Object.entries(fields).forEach(([ field, value ]) =>
    {
      transaction.set(targetDocument(target), [ ...path, field ], value);
    });
  });
};

export {
  OPTION_FIELDS,
  OPTION_LABELS,
  PAGE_OPTIONS,
  readPageOptions,
  setPageImage,
  setPageMovement,
  setPageOption,
  setPagePriority,
  setPageTrigger,
};
export type { PageMovement, PageOption };
