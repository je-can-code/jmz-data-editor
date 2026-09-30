import type { MapEditorApi } from '../api/MapEditorApi.ts';
import { EditorDataClient, LAYOUTS } from '../editorData/editorData.ts';
import { cloneJson, isJsonObject, type JsonObject } from '../model/json.ts';

/**
 * The name the workspace's own layout is kept under in the saved layouts document, beside any others.
 */
const WORKSPACE_LAYOUT_NAME = 'workspace';

/**
 * A saved workspace layout, kept opaque here: the workspace hands dockview's serialized layout in, and gets it
 * back to restore. It must at least carry dockview's grid and panels.
 */
type SavedLayout = JsonObject;

/**
 * Schedules a callback; {@code setTimeout} in the page, a stand-in in tests.
 */
type SetTimer = (callback: () => void, milliseconds: number) => unknown;

/**
 * Cancels a scheduled callback.
 */
type ClearTimer = (handle: unknown) => void;

/**
 * Options for a layout store.
 */
type LayoutStoreOptions = {
  /**
   * The server, or null when the window has none, in which case nothing is kept.
   */
  readonly api: MapEditorApi | null;

  /**
   * How long the layout must stay unchanged before it is written, in milliseconds.
   */
  readonly delayMs?: number;

  /**
   * The timer functions.
   */
  readonly setTimer?: SetTimer;
  readonly clearTimer?: ClearTimer;
};

/**
 * How long a layout must stay unchanged before it is written: long enough that dragging a splitter writes once.
 */
const DEFAULT_DELAY_MS = 800;

/**
 * Reports whether a value is a layout dockview could restore from.
 * @param {unknown} value The value.
 * @returns {boolean} True for an object with a grid and panels.
 */
const isSavedLayout = (value: unknown): value is SavedLayout =>
{
  return isJsonObject(value) && isJsonObject(value['grid']) && isJsonObject(value['panels']);
};

/**
 * Keeps the workspace's layout (which panels are where, split, stacked or torn out) in the project's saved layouts
 * document, so the workspace comes back the way it was left, torn-out windows included. It lives with the game's
 * files, versioned with them, and never in a file the game loads.
 *
 * A layout changes constantly while panels are dragged about, so writes wait until it has been still for a moment,
 * and only the latest one is written. Each write reads the document afresh and changes only the workspace's entry,
 * so any other layout kept there survives; a document that cannot be read (a newer editor's, say) is never written
 * over. A layout that cannot be read back is treated as none, and the workspace starts from its default.
 */
class LayoutStore
{
  #client: EditorDataClient | null;

  #delayMs: number;

  #setTimer: SetTimer;

  #clearTimer: ClearTimer;

  #pending: SavedLayout | null = null;

  #timer: unknown = null;

  #writing: Promise<void> = Promise.resolve();

  /**
   * @param {LayoutStoreOptions} options The server and the timing.
   */
  constructor(options: LayoutStoreOptions)
  {
    this.#client = options.api === null
      ? null
      : new EditorDataClient(options.api);
    this.#delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    this.#setTimer = options.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.#clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /**
   * Reads the saved workspace layout.
   * @returns {Promise<SavedLayout | null>} The layout, or null when none is saved or it cannot be read.
   */
  async load(): Promise<SavedLayout | null>
  {
    if (this.#client === null)
    {
      return null;
    }

    try
    {
      const saved = (await this.#readLayouts())[WORKSPACE_LAYOUT_NAME];
      return isSavedLayout(saved)
        ? cloneJson(saved)
        : null;
    }
    catch
    {
      // a document the editor cannot read means starting from the default layout, never failing to start.
      return null;
    }
  }

  /**
   * Keeps a layout, writing it once the layout has stayed unchanged for a moment.
   * @param {SavedLayout} layout The layout, as dockview serializes it.
   */
  save(layout: SavedLayout): void
  {
    if (this.#client === null)
    {
      return;
    }

    this.#pending = cloneJson(layout);
    if (this.#timer !== null)
    {
      this.#clearTimer(this.#timer);
    }

    this.#timer = this.#setTimer(() =>
    {
      this.#timer = null;
      this.flush().catch(() => undefined);
    }, this.#delayMs);
  }

  /**
   * Writes the latest layout now, if one is waiting: what the page does as it goes.
   * @returns {Promise<void>} Settles once written, or once there was nothing to write.
   */
  flush(): Promise<void>
  {
    if (this.#timer !== null)
    {
      this.#clearTimer(this.#timer);
      this.#timer = null;
    }

    const layout = this.#pending;
    this.#pending = null;
    if (layout === null || this.#client === null)
    {
      return this.#writing;
    }

    // one write at a time, in the order they were asked for.
    const client = this.#client;
    this.#writing = this.#writing
      .then(async () =>
      {
        const layouts = await this.#readLayouts();
        await client.save(LAYOUTS, { layouts: { ...layouts, [WORKSPACE_LAYOUT_NAME]: layout } });
      })
      .catch(() => undefined);
    return this.#writing;
  }

  /**
   * Reads every layout the project keeps, by name.
   * @returns {Promise<JsonObject>} The layouts.
   */
  async #readLayouts(): Promise<JsonObject>
  {
    const stored = await (this.#client as EditorDataClient).load(LAYOUTS);
    const layouts = isJsonObject(stored.data) ? stored.data['layouts'] : undefined;
    return isJsonObject(layouts)
      ? layouts
      : {};
  }
}

export { isSavedLayout, LayoutStore, WORKSPACE_LAYOUT_NAME };
export type { LayoutStoreOptions, SavedLayout };
