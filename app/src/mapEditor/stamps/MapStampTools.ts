import { blueprintLinkOf } from '../core/blueprints/blueprintLink.ts';
import { BLUEPRINTS_DOCUMENT } from '../core/blueprints/blueprints.ts';
import { isOnMap } from '../core/events/eventPlacement.ts';
import type { EventSelection } from '../core/events/EventSelection.ts';
import type { DocumentHub } from '../core/history/DocumentHub.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import { screenToWorld, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from '../core/renderer/camera.ts';
import type { CellRect } from '../core/renderer/MapRenderer.ts';
import { captureAreaStamp, captureEventsStamp, stampContents, type Stamp } from '../core/stamps/stamp.ts';
import { decodeStampClipboard, encodeStampClipboard } from '../core/stamps/stampClipboard.ts';
import type { StampHistory } from '../core/stamps/StampHistory.ts';
import { cutStampSource, placeStamp, type StampOutcome, type StampPlacement } from '../core/stamps/stampPlacement.ts';
import type { PaintState } from '../core/tools/PaintState.ts';
import { isTextEntry, type KeyTarget } from '../core/workspace/shortcuts.ts';
import type { EventNoticeSeverity } from '../events/MapEventTools.ts';

/**
 * What the stamp tools need from the renderer: its canvas and camera, to know the tile under the pointer, and every move
 * of its camera, which puts another tile under a pointer that stays still.
 */
type StampToolsRenderer = {
  readonly canvas: HTMLCanvasElement | null;
  readonly camera: Camera;
  onCameraChange(listener: (camera: Camera) => void): () => void;
};

/**
 * What the stamp tools are built from.
 */
type MapStampToolsOptions = {
  readonly renderer: StampToolsRenderer;

  /**
   * The element that holds the focus while the map has it: the view around the canvas.
   */
  readonly host: HTMLElement;
  readonly hub: DocumentHub;

  /**
   * The window's stamps, which every copy joins and every paste reads.
   */
  readonly stamps: StampHistory;

  /**
   * The window's event selection, which a copy of events reads and a placement's events take.
   */
  readonly selection: EventSelection;

  /**
   * The window's painting settings: the tool in hand, and the layer strip's choice, which decides what a piece of the
   * map carries.
   */
  readonly painting: PaintState;

  /**
   * The area the select tool holds on this map, or null when it holds none.
   */
  readonly tileArea: () => CellRect | null;

  /**
   * Whether a drag, a box or a stroke is in hand, while which nothing may change the map under it.
   */
  readonly busy: () => boolean;

  /**
   * The mode of a map's tileset, which autotile shapes read.
   */
  readonly tilesetMode: (map: MapDocument) => number;

  /**
   * Reads the system clipboard's text for the menu's Paste, which has no clipboard event to carry it: the window
   * shell's read of the stamp clipboard, which asks the NW.js shell where the page itself may not read, and comes back
   * empty when the clipboard holds anything else. Null when it could not be read.
   */
  readonly readClipboard: () => Promise<string | null>;
  readonly notify: (text: string, severity: EventNoticeSeverity) => void;

  /**
   * Says why a map may hold no copy of a blueprint, or null when it may: a paste carrying copies of one is refused there.
   */
  readonly linkRefusal: (mapId: number) => string | null;

  /**
   * Has the window hold the blueprints, as the Stamps panel does: a paste carrying copies of blueprints waits for them, so
   * a copy of one no longer there can be told and go down plain. Settles once held, or rejects when they cannot be.
   */
  readonly openBlueprints: () => Promise<unknown>;
};

/**
 * Copying, cutting and pasting on one map view, with Ctrl+C, X and V and the map's right-click menu, every copy a
 * stamp. Whatever is copied joins the window's stamps, which the Stamps panel lists, and goes on the system clipboard
 * too, so another window can paste it.
 *
 * - A copy takes the select tool's area, with that tool in hand and an area held: every layer and the events standing
 *   there under automatic layering, or the chosen layer alone. Otherwise it takes the events selected on this map,
 *   whatever tool is in hand.
 * - A cut copies the same, then takes it away from the map as one step: the events, and the area's carried layers.
 * - A paste places the newest stamp, with its top-left corner on the tile under the pointer, or where it was copied from
 *   when the pointer is off the map; a stamp copied in another window, read off the system clipboard, joins this
 *   window's stamps first, as the newest. The placed events take the selection. The tile under the pointer follows the
 *   camera, so a zoom under a still pointer moves the paste with it.
 * - Each answers only while the view has focus and no text field inside it does, and a cut or a paste waits, like every
 *   edit, until no drag, box or stroke is in hand.
 *
 * Nothing here goes through React: the tools listen on the canvas and the document themselves, which also keeps them
 * working in a torn-out window.
 */
class MapStampTools
{
  #options: MapStampToolsOptions;

  #map: MapDocument | null = null;

  /**
   * Where the pointer last was over the canvas, or null once it left: what the hover follows when the camera moves.
   */
  #pointer: ScreenPoint | null = null;

  #hover: MapCell | null = null;

  #stops: (() => void)[] = [];

  /**
   * @param {MapStampToolsOptions} options The renderer, the view, the window's hub, stamps, selection and paint, and how
   * to read the select tool's area, whether anything is in hand, a tileset's mode and the clipboard, and tell the author
   * things.
   */
  constructor(options: MapStampToolsOptions)
  {
    this.#options = options;
    const { renderer, host } = options;
    this.#stops.push(renderer.onCameraChange(() => this.#follow()));
    const { canvas } = renderer;
    if (canvas !== null)
    {
      this.#listen(canvas, 'pointermove', this.#onPointerMove);
      this.#listen(canvas, 'pointerleave', this.#onPointerLeave);
    }

    // the clipboard's events reach the view's document, whose body they fire on.
    const { ownerDocument } = host;
    this.#listen(ownerDocument, 'copy', this.#onCopy);
    this.#listen(ownerDocument, 'cut', this.#onCut);
    this.#listen(ownerDocument, 'paste', this.#onPaste);
  }

  /**
   * The tile under the pointer, where a paste lands.
   * @returns {MapCell | null} The tile, or null with the pointer off the map.
   */
  get hover(): MapCell | null
  {
    return this.#hover;
  }

  /**
   * Works on another map.
   * @param {MapDocument | null} map The map, or null for none.
   */
  setMap(map: MapDocument | null): void
  {
    this.#map = map;
    this.#follow();
  }

  //region actions

  /**
   * Copies what is selected into a stamp, as the menu's Copy does: it joins the window's stamps, and goes on the system
   * clipboard where the clipboard can be written. Ctrl+C goes through the browser's own copy instead.
   * @returns {Promise<void>} Settles once written, or once it could not be.
   */
  async copyToClipboard(): Promise<void>
  {
    const captured = this.#capture();
    if (captured === null)
    {
      return;
    }

    const stamp = this.#options.stamps.add(captured);
    const written = await this.#writeClipboard(stamp);
    const words = stampContents(stamp);
    this.#options.notify(written ? `Copied ${words}.` : `Copied ${words} as a stamp; press Ctrl+C to copy it for other windows too.`, 'info');
  }

  /**
   * Cuts what is selected, as the menu's Cut does: it is copied into a stamp first, so the Stamps panel holds it, then
   * taken away from the map as one step, whether or not the system clipboard could be written.
   * @returns {Promise<void>} Settles once done.
   */
  async cutToClipboard(): Promise<void>
  {
    const map = this.#map;
    const captured = this.#capture();
    if (map === null || captured === null)
    {
      return;
    }

    const stamp = this.#options.stamps.add(captured);
    await this.#writeClipboard(stamp);
    this.settle(cutStampSource(this.#options.hub, map.mapId, captured, this.#options.tilesetMode(map)));
  }

  /**
   * Pastes the newest stamp, as the menu's Paste does: a stamp on the system clipboard copied in another window joins
   * this window's stamps first, and a clipboard that cannot be read leaves this window's newest to paste.
   * @param {MapCell | null} target The tile the stamp's top-left corner goes to, or null for where it was copied from.
   * @returns {Promise<void>} Settles once done.
   */
  async pasteFromClipboard(target: MapCell | null): Promise<void>
  {
    const text = await this.#options.readClipboard();
    const stamp = this.#newestWith(text ?? '');
    if (stamp === null)
    {
      this.#options.notify('There is nothing to paste yet; copy part of a map first.', 'error');
      return;
    }

    this.#place(stamp, target);
  }

  /**
   * Takes what a placement came to: its events become the selection, and the author hears what it left out, or why it
   * was refused. What the stamp tool's clicks hand over, as much as the pastes here.
   * @param {StampOutcome} outcome The outcome.
   */
  settle(outcome: StampOutcome): void
  {
    const map = this.#map;
    if (outcome.ok === false)
    {
      this.#options.notify(outcome.message, 'error');
      return;
    }

    if (map !== null)
    {
      this.#options.selection.select(map.mapId, outcome.eventIds);
    }

    if (outcome.notes.length > 0)
    {
      this.#options.notify(outcome.notes.join(' '), 'info');
    }
  }

  //endregion actions

  /**
   * Stops listening, and lets go of the map.
   */
  destroy(): void
  {
    this.#stops.splice(0).forEach(stop => stop());
    this.#map = null;
  }

  //region input

  #onPointerMove = (event: PointerEvent): void =>
  {
    this.#pointer = { x: event.offsetX, y: event.offsetY };
    this.#follow();
  };

  #onPointerLeave = (): void =>
  {
    this.#pointer = null;
    this.#hover = null;
  };

  #onCopy = (event: ClipboardEvent): void =>
  {
    const captured = this.#ownsClipboard() ? this.#capture() : null;
    if (captured === null || event.clipboardData === null)
    {
      return;
    }

    const stamp = this.#options.stamps.add(captured);
    event.clipboardData.setData('text/plain', encodeStampClipboard(stamp));
    event.preventDefault();
    this.#options.notify(`Copied ${stampContents(stamp)}.`, 'info');
  };

  #onCut = (event: ClipboardEvent): void =>
  {
    // a cut takes things away, which waits, like every edit, until nothing is in hand.
    const map = this.#map;
    const captured = this.#ownsClipboard() && this.#options.busy() === false ? this.#capture() : null;
    if (map === null || captured === null || event.clipboardData === null)
    {
      return;
    }

    const stamp = this.#options.stamps.add(captured);
    event.clipboardData.setData('text/plain', encodeStampClipboard(stamp));
    event.preventDefault();
    this.settle(cutStampSource(this.#options.hub, map.mapId, captured, this.#options.tilesetMode(map)));
  };

  #onPaste = (event: ClipboardEvent): void =>
  {
    // a paste places things, which waits, like every edit, until nothing is in hand.
    const stamp = this.#ownsClipboard() && this.#options.busy() === false && event.clipboardData !== null
      ? this.#newestWith(event.clipboardData.getData('text/plain'))
      : null;
    if (stamp === null)
    {
      return;
    }

    event.preventDefault();
    this.#place(stamp, this.#hover);
  };

  //endregion input

  //region internals

  /**
   * Adds a listener for as long as the tools live.
   * @param {EventTarget} target Where to listen.
   * @param {string} type The event.
   * @param {(event: never) => void} handler The listener.
   */
  #listen(target: EventTarget, type: string, handler: (event: never) => void): void
  {
    const listener = handler as unknown as EventListener;
    target.addEventListener(type, listener);
    this.#stops.push(() => target.removeEventListener(type, listener));
  }

  /**
   * Finds the tile under the pointer again, as it stands now: after it moved, or after the camera did under it.
   */
  #follow(): void
  {
    const map = this.#map;
    const point = this.#pointer;
    if (map === null || point === null)
    {
      this.#hover = null;
      return;
    }

    const world = screenToWorld(this.#options.renderer.camera, point);
    const cell = { x: Math.floor(world.x / TILE_SIZE), y: Math.floor(world.y / TILE_SIZE) };
    this.#hover = isOnMap(cell, map) ? cell : null;
  }

  /**
   * Captures what a copy takes: the select tool's area while that tool is in hand and holds one, and otherwise the
   * events selected on this map.
   * @returns {Stamp | null} The stamp, or null with nothing to take.
   */
  #capture(): Stamp | null
  {
    const map = this.#map;
    if (map === null)
    {
      return null;
    }

    const { painting, stamps, selection } = this.#options;
    const { tool, strip } = painting.settings;
    const area = tool === 'select' ? this.#options.tileArea() : null;
    if (area !== null)
    {
      return captureAreaStamp(map, area, strip, this.#options.tilesetMode(map), stamps.nextId());
    }

    const eventIds = selection.eventsOn(map.mapId);
    return eventIds.length === 0
      ? null
      : captureEventsStamp(map, eventIds, stamps.nextId());
  }

  /**
   * Finds the stamp a paste places: the newest, once a stamp the clipboard's text carries, copied in another window,
   * has joined the window's stamps.
   * @param {string} text The clipboard's text.
   * @returns {Stamp | null} The stamp, or null while the window has none.
   */
  #newestWith(text: string): Stamp | null
  {
    const { stamps } = this.#options;
    const copied = decodeStampClipboard(text);
    if (copied !== null && stamps.has(copied.id) === false)
    {
      stamps.add(copied);
    }

    return stamps.newest();
  }

  /**
   * Places a stamp on the map as one step, as a paste: its top-left corner on a tile, or where it was copied from. A
   * stamp carrying copies of blueprints, in a window not holding the blueprints yet, waits for them first, so a copy of
   * one no longer there goes down plain; should they not open, every link goes down as it is.
   * @param {Stamp} stamp The stamp.
   * @param {MapCell | null} target The tile, or null for where it was copied from.
   */
  #place(stamp: Stamp, target: MapCell | null): void
  {
    const map = this.#map;
    if (map === null)
    {
      return;
    }

    const linked = stamp.events.some(event => blueprintLinkOf(event.note) !== null);
    if (linked && this.#options.hub.has(BLUEPRINTS_DOCUMENT) === false)
    {
      // placed once the blueprints are open, or, should they not open, with every link as it is.
      const place = () => this.#placeOn(map, stamp, target);
      this.#options.openBlueprints().then(place, place);
      return;
    }

    this.#placeOn(map, stamp, target);
  }

  /**
   * Places a stamp on a map as one step, as a paste, and takes what came of it.
   * @param {MapDocument} map The map.
   * @param {Stamp} stamp The stamp.
   * @param {MapCell | null} target The tile its top-left corner goes to, or null for where it was copied from.
   */
  #placeOn(map: MapDocument, stamp: Stamp, target: MapCell | null): void
  {
    const at = target ?? stamp.origin;
    const placement: StampPlacement = { at, shaping: 'auto', mode: this.#options.tilesetMode(map), linkRefusal: this.#options.linkRefusal(map.mapId) };
    this.settle(placeStamp(this.#options.hub, map.mapId, stamp, placement, 'Paste'));
  }

  /**
   * Writes a stamp to the system clipboard.
   * @param {Stamp} stamp The stamp.
   * @returns {Promise<boolean>} True once written; false when the clipboard could not be written here.
   */
  async #writeClipboard(stamp: Stamp): Promise<boolean>
  {
    const clipboard = this.#options.host.ownerDocument.defaultView?.navigator.clipboard;
    return clipboard === undefined
      ? false
      : clipboard.writeText(encodeStampClipboard(stamp)).then(() => true, () => false);
  }

  /**
   * Reports whether a clipboard event is the map's to answer: there is a map, the view has focus, and no text field
   * inside it does.
   * @returns {boolean} True when the tools should answer it.
   */
  #ownsClipboard(): boolean
  {
    const { host } = this.#options;
    const { activeElement: active } = host.ownerDocument;
    return this.#map !== null
      && active !== null
      && host.contains(active)
      && isTextEntry(active as unknown as KeyTarget) === false;
  }

  //endregion internals
}

export { MapStampTools };
export type { MapStampToolsOptions, StampToolsRenderer };
