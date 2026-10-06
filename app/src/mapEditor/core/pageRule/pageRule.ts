import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import { conditionWords, meetsOnFreshSave, type FreshSave } from './freshSave.ts';

/**
 * The moment a page is judged at: the time of day the window's clock shows. The clock moves only the time of day, so
 * everything else a plugin's condition reads, such as the date, is the game's own starting value.
 */
type PageMoment = {
  /**
   * The time of day, in minutes past midnight, 0 to 1439.
   */
  readonly timeOfDay: number;
};

/**
 * What one page asks of a condition a plugin adds, read once from the page as it stands, so judging it again as the
 * clock moves reads nothing twice.
 */
type PageTest = {
  /**
   * Whether the answer can change as the clock moves. An event with a page asking such a thing is judged again whenever
   * the clock moves, and no other event ever is.
   */
  readonly followsClock: boolean;

  /**
   * Judges the page at a moment.
   * @param {PageMoment} moment The moment.
   * @returns {boolean} True when what the page asks holds then.
   */
  readonly holds: (moment: PageMoment) => boolean;

  /**
   * When it holds, in the author's words, one entry for each thing the page asks, such as "from 18:00 to 05:00".
   */
  readonly words: readonly string[];
};

/**
 * A condition a plugin adds to the game's page rule, as J-TIME adds its hours: the plugin's own reading of a page, and
 * of when what the page asks holds. A page asking nothing of it is never kept from showing by it.
 */
type PageCondition = {
  /**
   * Unique, prefixed like event kinds: {@code time.pages}.
   */
  readonly id: `${string}.${string}`;

  /**
   * Reads what a page asks of the condition.
   * @param {RmmzEventPage} page The page.
   * @returns {PageTest | null} What it asks, or null when it asks nothing of this condition.
   */
  readonly read: (page: RmmzEventPage) => PageTest | null;
};

/**
 * The rule picking the page each event shows: what a fresh save holds, which the engine's own conditions read, and
 * every condition the active plugin modules add.
 */
type PageRule = {
  readonly save: FreshSave;
  readonly conditions: readonly PageCondition[];
};

/**
 * One page as the rule read it: whether its own conditions hold on a fresh save, which no moment changes, and what it
 * asks of each plugin's condition.
 */
type PageReading = {
  readonly meets: boolean;
  readonly tests: readonly PageTest[];
};

/**
 * One event as the rule read it: each page in order, and whether any of them asks something the clock can change.
 */
type EventReading = {
  readonly pages: readonly PageReading[];
  readonly followsClock: boolean;
};

/**
 * Reads one page under a rule.
 * @param {RmmzEventPage} page The page.
 * @param {PageRule} rule The rule.
 * @returns {PageReading} The reading.
 */
const readPage = (page: RmmzEventPage, rule: PageRule): PageReading =>
{
  const tests = rule.conditions.flatMap(condition =>
  {
    const test = condition.read(page);
    return test === null ? [] : [ test ];
  });
  return { meets: meetsOnFreshSave(page.conditions, rule.save), tests };
};

/**
 * Reads every page of an event under a rule, once, for judging at as many moments as the clock passes through.
 * @param {RmmzMapEvent} event The event.
 * @param {PageRule} rule The rule.
 * @returns {EventReading} The reading.
 */
const readEvent = (event: RmmzMapEvent, rule: PageRule): EventReading =>
{
  const pages = event.pages.map(page => readPage(page, rule));
  return { pages, followsClock: pages.some(page => page.tests.some(test => test.followsClock)) };
};

/**
 * Finds the page an event shows at a moment, as Game_Event#findProperPageIndex picks it: from the last page down, the
 * first whose own conditions hold on a fresh save and whose every plugin condition holds then. A page whose own
 * conditions fail is asked nothing more, as the plugins' aliases of Game_Event#meetsConditions return at once when the
 * engine's own answer is no.
 * @param {EventReading} reading The event, as the rule read it.
 * @param {PageMoment} moment The moment.
 * @returns {number} The page's index, or -1 when no page holds, which the game shows as nothing at all.
 */
const activePageOf = (reading: EventReading, moment: PageMoment): number =>
{
  for (let index = reading.pages.length - 1; index >= 0; index--)
  {
    const page = reading.pages[index];
    if (page.meets && page.tests.every(test => test.holds(moment)))
    {
      return index;
    }
  }

  return -1;
};

/**
 * Words when a page shows, as an author would say it: what its own conditions wait for, then what each plugin's
 * condition asks, such as "while switch 4 is on" and "from 18:00 to 05:00". A page asking nothing has no words.
 * @param {RmmzEventPage} page The page.
 * @param {readonly PageCondition[]} conditions The conditions the plugins add.
 * @returns {string[]} The words, one entry for each thing the page waits for.
 */
const pageWordsOf = (page: RmmzEventPage, conditions: readonly PageCondition[]): string[] =>
{
  const added = conditions.flatMap(condition =>
  {
    const test = condition.read(page);
    return test === null ? [] : test.words;
  });
  return [ ...conditionWords(page.conditions), ...added ];
};

export { activePageOf, pageWordsOf, readEvent };
export type { EventReading, PageCondition, PageMoment, PageReading, PageRule, PageTest };
