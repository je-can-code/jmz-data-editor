/**
 * How long the author's typing has to pause, in milliseconds, before what they typed lands as a step of its own. Long
 * enough that the gaps between keys inside a word or a sentence never end a burst; short enough that stopping to think
 * leaves a step behind, so one undo takes back the last thing typed rather than everything since the box was opened.
 */
const TYPING_PAUSE_MS = 1000;

/**
 * Gathers the author's typing into bursts, so a run of keys lands in history as one step rather than one per key. Each
 * change typed is held rather than handed on; a burst ends, and the last value held is handed on once, when the typing
 * pauses for {@link TYPING_PAUSE_MS}, or when the box is left ({@link finish}). A change arriving from elsewhere, such as
 * an undo or another window, wins over what is held ({@link drop}).
 *
 * It holds a value and a timer, nothing else, so a box of any kind can use it: a text box hands it text, a number box
 * the numbers typed.
 */
class TypingBurst<T>
{
  #handOn: (value: T) => void;

  #held: { readonly value: T } | null = null;

  #timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param {(value: T) => void} handOn Where each burst's value goes, once the burst ends.
   */
  constructor(handOn: (value: T) => void)
  {
    this.#handOn = handOn;
  }

  /**
   * Reports whether a value typed is waiting for its burst to end.
   * @returns {boolean} True while the author is in the middle of a burst.
   */
  get typing(): boolean
  {
    return this.#held !== null;
  }

  /**
   * Holds a value just typed, as the newest of its burst, and waits for the typing to pause again.
   * @param {T} value The value as it now stands.
   */
  type(value: T): void
  {
    this.#held = { value };
    this.#stopTimer();
    this.#timer = setTimeout(() => this.finish(), TYPING_PAUSE_MS);
  }

  /**
   * Ends the burst now, handing on the value held, if any: what leaving the box does, and what a pause in the typing
   * does once it has lasted long enough.
   */
  finish = (): void =>
  {
    this.#stopTimer();
    const held = this.#held;
    this.#held = null;
    if (held !== null)
    {
      this.#handOn(held.value);
    }
  };

  /**
   * Forgets the value held without handing it on: a change from elsewhere has replaced what was typed.
   */
  drop(): void
  {
    this.#stopTimer();
    this.#held = null;
  }

  /**
   * Stops waiting for a pause.
   */
  #stopTimer(): void
  {
    if (this.#timer !== null)
    {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}

export { TYPING_PAUSE_MS, TypingBurst };
