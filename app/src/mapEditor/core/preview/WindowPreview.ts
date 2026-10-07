import { GamePreview } from './GamePreview.ts';

/**
 * Hears every change to a window's preview.
 */
type PreviewListener = () => void;

/**
 * The preview one window shows every map at: how far along the story the author asks to see the game, which every map
 * view in the window judges each event's pages against, torn-out windows included. It starts as a fresh save, and is
 * kept in step with every other window and remembered between sessions from outside (see {@link RememberedView}).
 *
 * - {@link preview} reads it. The same object comes back until it changes, so it can be handed straight to React's
 *   {@code useSyncExternalStore} along with {@link subscribe}.
 * - {@link subscribe} hears every change, and returns the call that stops listening.
 * - {@link set} changes it; {@link setSwitch}, {@link setVariable} and {@link reset} change one switch, one variable, or
 *   everything back to a fresh save.
 */
class WindowPreview
{
  #preview: GamePreview = GamePreview.FRESH;

  #listeners = new Set<PreviewListener>();

  /**
   * Reads the preview.
   * @returns {GamePreview} The preview.
   */
  preview = (): GamePreview =>
  {
    return this.#preview;
  };

  /**
   * Listens for every change to the preview.
   * @param {PreviewListener} listener Called after each change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: PreviewListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Takes another preview, telling the listeners when it sets anything otherwise than the one before.
   * @param {GamePreview} preview The preview.
   */
  set(preview: GamePreview): void
  {
    if (preview.equals(this.#preview))
    {
      return;
    }

    this.#preview = preview;
    this.#listeners.forEach(listener => listener());
  }

  /**
   * Turns one switch on or off.
   * @param {number} switchId The switch.
   * @param {boolean} on True for on.
   */
  setSwitch(switchId: number, on: boolean): void
  {
    this.set(this.#preview.withSwitch(switchId, on));
  }

  /**
   * Sets one variable.
   * @param {number} variableId The variable.
   * @param {number} value Its value; 0 is a fresh save's.
   */
  setVariable(variableId: number, value: number): void
  {
    this.set(this.#preview.withVariable(variableId, value));
  }

  /**
   * Puts everything back as a fresh save holds it.
   */
  reset(): void
  {
    this.set(GamePreview.FRESH);
  }
}

export { WindowPreview };
export type { PreviewListener };
