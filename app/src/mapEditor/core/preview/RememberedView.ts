import { isJsonObject } from '../model/json.ts';
import { MINUTES_PER_DAY } from '../time/timeOfDay.ts';
import type { WindowClock } from '../time/WindowClock.ts';
import { GamePreview } from './GamePreview.ts';
import type { WindowPreview } from './WindowPreview.ts';

/**
 * What one project remembers between sessions, on this machine, of the moment its maps are shown at: the clock's time,
 * once the author moved it, and the preview.
 */
type RememberedState = {
  /**
   * The time of day the author put the clock at, in minutes past midnight, or null while it follows the time the game
   * starts at.
   */
  readonly clock: number | null;

  /**
   * The switches, variables and the rest the author set.
   */
  readonly preview: GamePreview;
};

/**
 * Where a project's remembered state is kept: read once a window knows its project, written on every change, and heard
 * whenever another window writes it, which is how every window shares one clock and one preview live.
 */
interface ViewStore
{
  /**
   * Reads what is kept.
   * @returns {string | null} The kept text, or null when nothing is.
   */
  read(): string | null;

  /**
   * Keeps a new text, for the next session and for every other window.
   * @param {string} text The text.
   */
  write(text: string): void;

  /**
   * Listens for another window keeping a new text; a window never hears its own writes.
   * @param {(text: string | null) => void} listener Called with each text another window keeps, or null once nothing is.
   * @returns {() => void} Stops listening.
   */
  subscribe(listener: (text: string | null) => void): () => void;
}

/**
 * The shape of what is kept, so a later shape can tell an older one apart.
 */
const REMEMBERED_VERSION = 1;

/**
 * Writes the state as the text kept.
 * @param {RememberedState} state The state.
 * @returns {string} The text.
 */
const writeRemembered = (state: RememberedState): string =>
{
  return JSON.stringify({ version: REMEMBERED_VERSION, clock: state.clock, preview: state.preview.toJson() });
};

/**
 * Reads kept text back, keeping whatever of it can still be used: a clock time that is a whole minute of the day, and
 * whatever of the preview a preview could set. Nothing kept, or text that is not the kept shape, reads as nothing set
 * and the clock following the game.
 * @param {string | null} text The kept text, or null.
 * @returns {RememberedState} The state.
 */
const readRemembered = (text: string | null): RememberedState =>
{
  let kept: unknown = null;
  try
  {
    kept = text === null ? null : JSON.parse(text);
  }
  catch
  {
    // text the editor cannot read is remembered as nothing, never a reason not to start.
    kept = null;
  }

  if (isJsonObject(kept) === false)
  {
    return { clock: null, preview: GamePreview.FRESH };
  }

  const { clock } = kept;
  const onTheClock = typeof clock === 'number' && Number.isInteger(clock) && clock >= 0 && clock < MINUTES_PER_DAY;
  return { clock: onTheClock ? clock : null, preview: GamePreview.fromJson(kept['preview']) };
};

/**
 * Keeps a window's clock and preview in step with a project's remembered state: the preview and the clock's time come
 * back as they were left last session, and every window of the session shares them live, so moving the clock or
 * turning a switch on in one window shows in every map in every window at once.
 *
 * Only what the author chose is kept: a clock still following the game's starting time keeps nothing, so a game whose
 * starting time changes starts there. What another window keeps is taken without being written back, so two windows
 * never echo one change between them.
 */
class RememberedView
{
  #clock: WindowClock;

  #preview: WindowPreview;

  #last = '';

  #taking = false;

  /**
   * @param {WindowClock} clock The window's clock.
   * @param {WindowPreview} preview The window's preview.
   */
  constructor(clock: WindowClock, preview: WindowPreview)
  {
    this.#clock = clock;
    this.#preview = preview;
  }

  /**
   * Keeps the window's clock and preview in a store: what it holds is taken at once, every change made in this window is
   * written to it, and every change another window writes to it is taken. A store holding nothing takes whatever this
   * window set before it knew its project, so nothing set in the first moments is lost.
   * @param {ViewStore} store The project's store.
   * @returns {() => void} Stops keeping them.
   */
  attach(store: ViewStore): () => void
  {
    const kept = store.read();
    if (kept === null)
    {
      // nothing kept means nothing set, which needs no writing; anything this window set already does.
      this.#last = writeRemembered({ clock: null, preview: GamePreview.FRESH });
      this.#write(store);
    }
    else
    {
      this.#take(kept);
    }

    const write = () => this.#write(store);
    const stops = [
      this.#clock.subscribe(write),
      this.#preview.subscribe(write),
      store.subscribe(text => this.#take(text)),
    ];

    return () => stops.forEach(stop => stop());
  }

  /**
   * Takes a kept text: the clock moved to its time, when it has one, and its preview.
   * @param {string | null} text The kept text, or null.
   */
  #take(text: string | null): void
  {
    const state = readRemembered(text);
    this.#taking = true;
    try
    {
      if (state.clock !== null)
      {
        this.#clock.set(state.clock);
      }

      this.#preview.set(state.preview);
    }
    finally
    {
      this.#taking = false;
    }

    this.#last = this.#current();
  }

  /**
   * Writes the window's clock and preview, unless they are what was last written or taken.
   * @param {ViewStore} store The store.
   */
  #write(store: ViewStore): void
  {
    // what another window kept is already kept.
    if (this.#taking)
    {
      return;
    }

    const text = this.#current();
    if (text === this.#last)
    {
      return;
    }

    this.#last = text;
    store.write(text);
  }

  /**
   * Writes the window's clock and preview as the text kept.
   * @returns {string} The text.
   */
  #current(): string
  {
    return writeRemembered({ clock: this.#clock.moved ? this.#clock.time() : null, preview: this.#preview.preview() });
  }
}

/**
 * The name a project's remembered state is kept under in the browser's storage, which the data editor's pages share, so
 * it says whose it is and which project's.
 * @param {string} projectRoot The project's root folder.
 * @returns {string} The name.
 */
const rememberedViewKey = (projectRoot: string): string =>
{
  return `jmz-map-editor:view:${projectRoot}`;
};

/**
 * Keeps a project's remembered state in a window's local storage, which lives on this machine, outside the project and
 * its game files, and outlasts the editor closing; every window on the editor's origin reads the same storage, and hears
 * another write to it as a storage event. Storage the browser refuses, such as one turned off, keeps nothing, and the
 * editor carries on without it.
 * @param {Window} target The window.
 * @param {string} key The name the state is kept under.
 * @returns {ViewStore} The store.
 */
const localViewStore = (target: Window, key: string): ViewStore =>
{
  return {
    read: () =>
    {
      try
      {
        return target.localStorage.getItem(key);
      }
      catch
      {
        return null;
      }
    },
    write: text =>
    {
      try
      {
        target.localStorage.setItem(key, text);
      }
      catch
      {
        // a full or refused storage keeps nothing this time; the next change tries again.
      }
    },
    subscribe: listener =>
    {
      const onStorage = (event: StorageEvent) =>
      {
        if (event.key === key)
        {
          listener(event.newValue);
        }
      };
      target.addEventListener('storage', onStorage);
      return () => target.removeEventListener('storage', onStorage);
    },
  };
};

export { localViewStore, readRemembered, RememberedView, rememberedViewKey, writeRemembered };
export type { RememberedState, ViewStore };
