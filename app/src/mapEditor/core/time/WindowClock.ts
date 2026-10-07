import { onTheClock } from './timeOfDay.ts';

/**
 * Hears every move of a clock.
 */
type ClockListener = () => void;

/**
 * The time of day one window shows, which every map view in it reads: the sky over each map is drawn at this hour,
 * whichever view shows it, torn-out windows included, so two maps side by side never show two different hours. Nothing
 * in the game's files holds it; it is the author's own, to see a map as it looks at any hour.
 *
 * - {@link time} reads the time, in minutes past midnight. It is a plain number, so it can be handed straight to React's
 *   {@code useSyncExternalStore} along with {@link subscribe}.
 * - {@link subscribe} hears every move, and returns the call that stops listening.
 * - {@link set} moves the clock, as the author does.
 * - {@link startAt} sets the time the game itself starts at, which the clock follows until the author first moves it:
 *   a starting time read again later, say from a plugin list changed on disk, never takes back the hour the author
 *   chose.
 */
class WindowClock
{
  #minutes: number;

  #moved = false;

  #listeners = new Set<ClockListener>();

  /**
   * @param {number} minutes Where the clock stands until a starting time is set: midnight unless another is given.
   */
  constructor(minutes = 0)
  {
    this.#minutes = onTheClock(minutes);
  }

  /**
   * Reads the time of day.
   * @returns {number} The time, in minutes past midnight, 0 to 1439.
   */
  time = (): number =>
  {
    return this.#minutes;
  };

  /**
   * Whether the author has moved the clock, here or in another window, so it no longer follows the time the game starts
   * at: only an hour the author chose is worth remembering.
   * @returns {boolean} True once moved.
   */
  get moved(): boolean
  {
    return this.#moved;
  }

  /**
   * Listens for every move of the clock.
   * @param {ClockListener} listener Called after each move.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: ClockListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Moves the clock to a time of day, as the author does; from then on, starting times are no longer followed.
   * @param {number} minutes The time, in minutes past midnight; brought onto the clock face to the nearest minute.
   */
  set(minutes: number): void
  {
    this.#moved = true;
    this.#moveTo(minutes);
  }

  /**
   * Follows the time the game starts at, unless the author has already moved the clock.
   * @param {number} minutes The starting time, in minutes past midnight.
   */
  startAt(minutes: number): void
  {
    if (this.#moved)
    {
      return;
    }

    this.#moveTo(minutes);
  }

  /**
   * Puts the clock at a time, and tells the listeners when that moved it.
   * @param {number} minutes The time, in minutes past midnight.
   */
  #moveTo(minutes: number): void
  {
    const next = onTheClock(minutes);
    if (next === this.#minutes)
    {
      return;
    }

    this.#minutes = next;
    this.#listeners.forEach(listener => listener());
  }
}

export { WindowClock };
export type { ClockListener };
