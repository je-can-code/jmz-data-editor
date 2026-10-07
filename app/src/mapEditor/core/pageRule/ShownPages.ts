import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { GamePreview } from '../preview/GamePreview.ts';
import { activePageOf, readEvent, type EventReading, type PageMoment, type PageRule } from './pageRule.ts';

/**
 * The page an event draws, and whether it draws faded: an event no page holds for at the clock's time shows its first
 * page faded rather than vanishing, so it can still be found, selected and edited.
 */
type PageShown = {
  /**
   * The page drawn: the page the game shows, or the first page while none holds.
   */
  readonly index: number;

  /**
   * True while no page holds, when the game shows nothing there.
   */
  readonly faded: boolean;
};

/**
 * Reads the page the game shows an event at the clock's time, for whatever draws an event's light from it.
 */
interface ActivePages
{
  /**
   * Finds the page the game shows an event at the clock's time, at the window's preview.
   * @param {RmmzMapEvent} event The event.
   * @returns {number} The page's index, or -1 when no page holds.
   */
  activePage(event: RmmzMapEvent): number;
}

/**
 * Reads the page an event draws at the clock's time, for whatever draws the event itself.
 */
interface ShownPageReader
{
  /**
   * Finds the page an event draws, and whether faded.
   * @param {RmmzMapEvent} event The event.
   * @returns {PageShown} The page.
   */
  shownPage(event: RmmzMapEvent): PageShown;
}

/**
 * One event as the table last read it: the event read, the rule's reading of it, and the page it shows at the moment.
 */
type ReadEvent = {
  readonly event: RmmzMapEvent;
  readonly reading: EventReading;
  active: number;
};

/**
 * The page every event on one map shows at the window's clock and preview, as a map view draws them: the game's own page
 * rule, judged against the switches and variables the preview sets and a fresh save everywhere else, with the plugins'
 * conditions added. Without a rule, every event shows its first page, as MZ's own editor shows it, and nothing is faded.
 *
 * Each event is read once and remembered until it changes: whoever draws it says so ({@link forget}), and an event put
 * back in its slot as a new object is read afresh on its own. Moving the clock judges again only the events read so far
 * whose pages ask something the clock can change; changing the preview, only those whose pages read a switch, a variable
 * or another piece of state it changed. Each answers which of those now show another page, so only those are drawn
 * again; every other event keeps its page without being looked at.
 */
class ShownPages implements ActivePages, ShownPageReader
{
  #rule: PageRule | null;

  #time: number;

  #preview: GamePreview;

  #read = new Map<number, ReadEvent>();

  #followingClock = new Set<number>();

  /**
   * @param {PageRule | null} rule The rule, or null to show every event's first page.
   * @param {number} time The time of day to start at, in minutes past midnight.
   * @param {GamePreview} preview The preview to start at; a fresh save's unless another is given.
   */
  constructor(rule: PageRule | null = null, time = 0, preview: GamePreview = GamePreview.FRESH)
  {
    this.#rule = rule;
    this.#time = time;
    this.#preview = preview;
  }

  /**
   * The rule events are shown by.
   * @returns {PageRule | null} The rule, or null while every event shows its first page.
   */
  get rule(): PageRule | null
  {
    return this.#rule;
  }

  /**
   * The preview events are judged at.
   * @returns {GamePreview} The preview.
   */
  get preview(): GamePreview
  {
    return this.#preview;
  }

  /**
   * How many events read so far can show another page as the clock moves.
   * @returns {number} The count.
   */
  get followingClock(): number
  {
    return this.#followingClock.size;
  }

  /**
   * Shows events by another rule, forgetting every event read under the old one.
   * @param {PageRule | null} rule The rule, or null to show every event's first page.
   */
  setRule(rule: PageRule | null): void
  {
    this.#rule = rule;
    this.forget(null);
  }

  /**
   * Moves to another time of day, judging again every event read so far whose pages ask something the clock can change.
   * @param {number} minutes The time of day, in minutes past midnight.
   * @returns {number[]} The ids of the events now showing another page; none when the time did not move.
   */
  setTime(minutes: number): number[]
  {
    if (minutes === this.#time)
    {
      return [];
    }

    this.#time = minutes;

    // only events read so far are ever in the set, so each has its reading.
    return this.#judgeAgain([ ...this.#followingClock ].map(id => this.#read.get(id) as ReadEvent));
  }

  /**
   * Moves to another preview, judging again every event read so far whose pages read a piece of state it sets otherwise
   * than the preview before: switch 74 turned on judges the events waiting on switch 74, and no event waiting only on
   * switch 47.
   * @param {GamePreview} preview The preview.
   * @returns {number[]} The ids of the events now showing another page; none when the preview changed nothing.
   */
  setPreview(preview: GamePreview): number[]
  {
    const changed = [ ...preview.changedKeys(this.#preview) ];
    this.#preview = preview;
    if (changed.length === 0)
    {
      return [];
    }

    const reading = [ ...this.#read.values() ].filter(entry => changed.some(key => entry.reading.reads.has(key)));
    return this.#judgeAgain(reading);
  }

  /**
   * Forgets an event that changed, so it is read again the next time it is asked about.
   * @param {number | null} id The event, or null for every event, as when the list itself changed.
   */
  forget(id: number | null): void
  {
    if (id === null)
    {
      this.#read.clear();
      this.#followingClock.clear();
      return;
    }

    this.#read.delete(id);
    this.#followingClock.delete(id);
  }

  activePage(event: RmmzMapEvent): number
  {
    if (this.#rule === null)
    {
      return event.pages.length > 0 ? 0 : -1;
    }

    return this.#entryFor(event, this.#rule).active;
  }

  shownPage(event: RmmzMapEvent): PageShown
  {
    if (this.#rule === null)
    {
      return { index: 0, faded: false };
    }

    const { active } = this.#entryFor(event, this.#rule);
    return active < 0
      ? { index: 0, faded: true }
      : { index: active, faded: false };
  }

  /**
   * The moment events are judged at: the time of day and the preview as they stand.
   * @returns {PageMoment} The moment.
   */
  #moment(): PageMoment
  {
    return { timeOfDay: this.#time, preview: this.#preview };
  }

  /**
   * Judges events again at the moment as it stands, keeping each one's new page.
   * @param {readonly ReadEvent[]} entries The events, as the table read them.
   * @returns {number[]} The ids of those now showing another page.
   */
  #judgeAgain(entries: readonly ReadEvent[]): number[]
  {
    const moment = this.#moment();
    return entries.flatMap(entry =>
    {
      const active = activePageOf(entry.reading, moment);
      if (active === entry.active)
      {
        return [];
      }

      entry.active = active;
      return [ entry.event.id ];
    });
  }

  /**
   * Finds what the table knows of an event, reading it first when it is new here, or not the object last read.
   * @param {RmmzMapEvent} event The event.
   * @param {PageRule} rule The rule.
   * @returns {ReadEvent} What the table knows.
   */
  #entryFor(event: RmmzMapEvent, rule: PageRule): ReadEvent
  {
    const known = this.#read.get(event.id);
    if (known !== undefined && known.event === event)
    {
      return known;
    }

    const reading = readEvent(event, rule);
    const entry: ReadEvent = { event, reading, active: activePageOf(reading, this.#moment()) };
    this.#read.set(event.id, entry);
    if (reading.followsClock)
    {
      this.#followingClock.add(event.id);
    }
    else
    {
      this.#followingClock.delete(event.id);
    }

    return entry;
  }
}

export { ShownPages };
export type { ActivePages, PageShown, ShownPageReader };
