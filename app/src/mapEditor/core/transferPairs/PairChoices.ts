import type { DoorLook } from './doorSprites.ts';

/**
 * What the author last chose for the transfers they place: the door's picture, the door's creak as it opens, and the
 * sound of passing through, each a sound's name in {@code audio/se} or empty for none.
 */
type PairChoices = {
  /**
   * The door's picture, or null for the one the project's doors use most.
   */
  readonly doorLook: DoorLook | null;
  readonly doorSound: string;
  readonly movementSound: string;
};

/**
 * What a transfer starts with when nothing has been chosen: the picture the project's doors use most, the creak every
 * shipped door plays, Open1, and no sound of passing through, as Jeremy asked.
 */
const DEFAULT_PAIR_CHOICES: PairChoices = { doorLook: null, doorSound: 'Open1', movementSound: '' };

/**
 * Remembers the author's last choices for the transfers they place for as long as the window is open, Jeremy's own words
 * being "you just chose this move sound so now this is the default till you close the map editor", and starts from the
 * defaults in every window opened afresh. {@link current} returns the same object until something is chosen, so it can be
 * handed straight to React's {@code useSyncExternalStore} along with {@link subscribe}.
 */
class PairChoiceMemory
{
  #choices: PairChoices = DEFAULT_PAIR_CHOICES;

  #listeners = new Set<() => void>();

  /**
   * Reads the choices as they stand.
   * @returns {PairChoices} The choices.
   */
  current = (): PairChoices =>
  {
    return this.#choices;
  };

  /**
   * Listens for a choice made.
   * @param {() => void} listener Called after each.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Keeps what the author just chose, as what the next transfer starts with.
   * @param {Partial<PairChoices>} chosen The choices made; the others stay as they were.
   */
  remember(chosen: Partial<PairChoices>): void
  {
    this.#choices = { ...this.#choices, ...chosen };
    [ ...this.#listeners ].forEach(listener => listener());
  }
}

export { DEFAULT_PAIR_CHOICES, PairChoiceMemory };
export type { PairChoices };
