import { stampContentKey, type Stamp } from './stamp.ts';

/**
 * How many stamps a window keeps: the newest, the oldest dropping off as more are copied. Enough for a session's worth
 * of things worth placing again, few enough that the panel's pictures stay quick to scan. Keeping one for good is what
 * saving it as a blueprint is for.
 */
const STAMP_HISTORY_CAP = 24;

/**
 * Hears every change to the stamps kept.
 */
type StampHistoryListener = () => void;

/**
 * Every stamp copied in one window this session, newest first: what the Stamps panel lists, what Ctrl+V places the
 * newest of, and what the stamp tool's stamps are picked from. It lasts as long as the window does, and keeps at most
 * {@link STAMP_HISTORY_CAP} stamps, the oldest dropping off first.
 *
 * - {@link stamps} returns the list, the same array until it changes, so it can be handed straight to React's
 *   {@code useSyncExternalStore} along with {@link subscribe}.
 * - {@link add} keeps a stamp as the newest. The same piece of the same map copied twice with nothing changed between
 *   is kept once: the copy kept already comes back to the front, rather than a second one joining it.
 * - {@link nextId} names a new stamp, uniquely across every window, since a stamp travels between windows on the
 *   system clipboard and each window knows by its id whether it holds it already.
 */
class StampHistory
{
  #prefix: string;

  #cap: number;

  #count = 0;

  #stamps: readonly Stamp[] = [];

  #keys = new Map<string, string>();

  #listeners = new Set<StampHistoryListener>();

  /**
   * @param {string} prefix What every id this window makes starts with: the window's own id, unique across windows.
   * @param {number} cap How many stamps to keep.
   */
  constructor(prefix: string, cap: number = STAMP_HISTORY_CAP)
  {
    if (Number.isInteger(cap) === false || cap < 1)
    {
      throw new Error(`a stamp history keeps a whole number of stamps, at least one, not ${cap}`);
    }

    this.#prefix = prefix;
    this.#cap = cap;
  }

  /**
   * The stamps kept, newest first.
   * @returns {readonly Stamp[]} The stamps; replaced, never changed, whenever they change.
   */
  get stamps(): readonly Stamp[]
  {
    return this.#stamps;
  }

  /**
   * Reads the stamps kept, for React's {@code useSyncExternalStore}.
   * @returns {readonly Stamp[]} The stamps, newest first.
   */
  getSnapshot = (): readonly Stamp[] =>
  {
    return this.#stamps;
  };

  /**
   * Finds the newest stamp: what Ctrl+V places.
   * @returns {Stamp | null} The stamp, or null before anything has been copied.
   */
  newest(): Stamp | null
  {
    return this.#stamps[0] ?? null;
  }

  /**
   * Reports whether a stamp is kept, by its id.
   * @param {string} id The stamp's id.
   * @returns {boolean} True when it is among the stamps.
   */
  has(id: string): boolean
  {
    return this.#stamps.some(stamp => stamp.id === id);
  }

  /**
   * Names a new stamp: the window's prefix and a count, never an id this window has handed out before.
   * @returns {string} The id.
   */
  nextId(): string
  {
    this.#count += 1;
    return `${this.#prefix}:${this.#count}`;
  }

  /**
   * Keeps a stamp as the newest, dropping the oldest once more than the cap are kept. A stamp kept already, by its id or
   * as the same piece of the same map with nothing changed, comes back to the front instead of being kept twice.
   * @param {Stamp} stamp The stamp.
   * @returns {Stamp} The stamp now newest: the one handed in, or the same one kept before it.
   */
  add(stamp: Stamp): Stamp
  {
    const key = stampContentKey(stamp);
    const kept = this.#stamps.find(each => each.id === stamp.id || this.#keys.get(each.id) === key) ?? stamp;

    // a stamp at the front already leaves the list as it is, so nobody re-renders for nothing.
    if (this.#stamps[0] === kept)
    {
      return kept;
    }

    const others = this.#stamps.filter(each => each !== kept);
    const next = [ kept, ...others ].slice(0, this.#cap);

    // a stamp dropped off the end takes its name with it.
    this.#keys = new Map(next.map(each => [ each.id, each === stamp ? key : this.#keys.get(each.id) as string ]));
    this.#stamps = next;
    [ ...this.#listeners ].forEach(listener => listener());
    return kept;
  }

  /**
   * Listens for changes to the stamps kept.
   * @param {StampHistoryListener} listener Called after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: StampHistoryListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };
}

export { STAMP_HISTORY_CAP, StampHistory };
export type { StampHistoryListener };
