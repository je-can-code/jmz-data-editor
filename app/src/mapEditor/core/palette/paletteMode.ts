import type { FlagMode } from './passabilityEdits.ts';

/**
 * What a click on the palette does: picks tiles to paint with, or edits the tileset's passability.
 */
type PaletteEditing = 'tiles' | 'passability';

/**
 * The palette's mode: what a click does, and which flags the passability editor shows and edits.
 */
type PaletteModeState = {
  readonly editing: PaletteEditing;
  readonly flagMode: FlagMode;
};

/**
 * Hears every change to the palette's mode.
 */
type PaletteModeListener = (state: PaletteModeState) => void;

/**
 * The palette's mode, kept apart from the palette so every map view in its window can follow it: while the
 * passability editor is open, the window's maps show the passability overlay beside it, so each edit shows on the map
 * at once. Each window has its own, in its paint (see WindowPaint).
 */
class PaletteModeStore
{
  #state: PaletteModeState = { editing: 'tiles', flagMode: 'passage' };

  #listeners = new Set<PaletteModeListener>();

  /**
   * Reads the mode.
   * @returns {PaletteModeState} The state; replaced, never changed, on every update.
   */
  getState = (): PaletteModeState =>
  {
    return this.#state;
  };

  /**
   * Switches between picking tiles and editing passability. Switching to the mode already on tells no one.
   * @param {PaletteEditing} editing The mode.
   */
  setEditing(editing: PaletteEditing): void
  {
    if (editing !== this.#state.editing)
    {
      this.#update({ ...this.#state, editing });
    }
  }

  /**
   * Chooses which flags the passability editor shows and edits. Choosing the flags already chosen tells no one.
   * @param {FlagMode} flagMode The flags.
   */
  setFlagMode(flagMode: FlagMode): void
  {
    if (flagMode !== this.#state.flagMode)
    {
      this.#update({ ...this.#state, flagMode });
    }
  }

  /**
   * Listens for changes.
   * @param {PaletteModeListener} listener Called with the new state after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: PaletteModeListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Replaces the state and tells every listener.
   * @param {PaletteModeState} state The new state.
   */
  #update(state: PaletteModeState): void
  {
    this.#state = state;
    [ ...this.#listeners ].forEach(listener => listener(state));
  }
}

export { PaletteModeStore };
export type { PaletteEditing, PaletteModeListener, PaletteModeState };
