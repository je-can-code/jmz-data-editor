import { onTheClock } from './timeOfDay.ts';

/**
 * Hears every move of a clock.
 */
type ClockListener = () => void;

/**
 * What the author picked the sky to be doing: a condition the sky can be in and a strength, each by the name the plugin
 * driving the sky gives it, such as rain and heavy.
 */
type SkyPick = {
  readonly condition: string;
  readonly strength: string;
};

/**
 * Reports whether two picks of the sky are the same: the same condition at the same strength, or both none.
 * @param {SkyPick | null} left One pick, or null for none.
 * @param {SkyPick | null} right The other.
 * @returns {boolean} True when they are the same.
 */
const isSameSkyPick = (left: SkyPick | null, right: SkyPick | null): boolean =>
{
  if (left === null || right === null)
  {
    return left === right;
  }

  return left.condition === right.condition && left.strength === right.strength;
};

/**
 * The time of day one window shows, the season, and the sky, which every map view in it reads: the sky over each map is
 * drawn at this hour, its weather as the author picked it, and each event's page judged at this hour and season,
 * whichever view shows it, torn-out windows included, so two maps side by side never show two different moments. Nothing
 * in the game's files holds any of them; they are the author's own, to see a map as it looks at any hour of any season,
 * under any sky.
 *
 * - {@link time} reads the time, in minutes past midnight. It is a plain number, so it can be handed straight to React's
 *   {@code useSyncExternalStore} along with {@link subscribe}.
 * - {@link season} reads the season the author picked, likewise, or null while the clock stays in the season the game
 *   starts in. The clock only holds it: what a season means, the date it moves the game's calendar to, is the business
 *   of the module that offers the clock.
 * - {@link sky} reads the sky the author picked, a condition and a strength, or null while none is picked, as on a new
 *   game, whose sky is random. The clock only holds it too: what the sky looks like at the clock's hour and season is
 *   the business of the module that offers the sky.
 * - {@link subscribe} hears every move, of the time, the season or the sky, and returns the call that stops listening.
 * - {@link set} moves the clock, as the author does, {@link chooseSeason} picks its season and {@link chooseSky} its sky.
 * - {@link startAt} sets the time the game itself starts at, which the clock follows until the author first moves it:
 *   a starting time read again later, say from a plugin list changed on disk, never takes back the hour the author
 *   chose.
 */
class WindowClock
{
  #minutes: number;

  #moved = false;

  #season: number | null = null;

  #sky: SkyPick | null = null;

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
   * Reads the season the author picked, here or in another window.
   * @returns {number | null} The season, as the module offering the clock numbers them, or null while the clock stays in
   * the season the game starts in.
   */
  season = (): number | null =>
  {
    return this.#season;
  };

  /**
   * Reads the sky the author picked, here or in another window.
   * @returns {SkyPick | null} The sky, the same object until another is picked, or null while none is.
   */
  sky = (): SkyPick | null =>
  {
    return this.#sky;
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
   * Listens for every move of the clock, of its time or its season.
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
   * Picks the clock's season, as the author does, and tells the listeners when that changed it. Once picked, the season
   * is the author's, even the one the game starts in: a game whose start moves to another season later keeps the season
   * picked here.
   * @param {number} season The season, as the module offering the clock numbers them.
   */
  chooseSeason(season: number): void
  {
    if (season === this.#season)
    {
      return;
    }

    this.#season = season;
    this.#listeners.forEach(listener => listener());
  }

  /**
   * Picks what the sky is doing, as the author does, or picks none again with null, and tells the listeners when that
   * changed it: the same condition at the same strength changes nothing.
   * @param {SkyPick | null} pick The condition and the strength, or null for no sky.
   */
  chooseSky(pick: SkyPick | null): void
  {
    if (isSameSkyPick(pick, this.#sky))
    {
      return;
    }

    // a copy of its own, so nothing the caller does to its object later can move the clock behind the listeners' backs.
    this.#sky = pick === null
      ? null
      : { condition: pick.condition, strength: pick.strength };
    this.#listeners.forEach(listener => listener());
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

export { isSameSkyPick, WindowClock };
export type { ClockListener, SkyPick };
