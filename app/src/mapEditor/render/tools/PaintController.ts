import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import { screenToWorld, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from '../../core/renderer/camera.ts';
import type { TilesetLayering } from '../../core/tiles/layering.ts';
import { shadowQuarterAt } from '../../core/tools/paintPlan.ts';
import { isPaintingTool, type PaintState } from '../../core/tools/PaintState.ts';
import { ToolSession, type ToolOverlay, type ToolPointer } from '../../core/tools/ToolSession.ts';
import { isTextEntry, type KeyTarget } from '../../core/workspace/shortcuts.ts';

/**
 * The key held for the one-stroke override, as a keyboard event names it: the space bar. It is free in every one of
 * the baseline interactions (copy, paste, delete, rename, open, deselect, the arrow keys, the wheel, the right
 * button) and in Shift and the wheel together, and it sits under the thumb while the other hand holds the mouse, so
 * Space and Shift together lay one exact tile on the chosen layer.
 */
const OVERRIDE_KEY_CODE = 'Space';

/**
 * What the controller needs from the renderer: the canvas to listen on, the camera, and the cell under a point.
 */
type PaintSurface = {
  readonly canvas: HTMLCanvasElement | null;
  readonly camera: Camera;
  cellAt(point: ScreenPoint): MapCell | null;
};

/**
 * Everything a map view's painting is wired to.
 */
type PaintControllerOptions = {
  /**
   * The renderer drawing the map.
   */
  readonly surface: PaintSurface;

  /**
   * The window's documents and histories.
   */
  readonly hub: DocumentHub;

  /**
   * The map on show, or null before one is open.
   */
  readonly map: () => MapDocument | null;

  /**
   * How the map's tileset layers.
   */
  readonly layering: (map: MapDocument) => TilesetLayering;

  /**
   * The window's painting settings.
   */
  readonly painting: PaintState;

  /**
   * Hands the tools' part of the overlay to the view.
   */
  readonly overlay: (overlay: ToolOverlay) => void;
};

/**
 * The keys the tools read: Shift (exact tiles), Ctrl or Cmd (the select tool copies), and the override's key.
 */
type HeldKeys = {
  shift: boolean;
  copy: boolean;
  override: boolean;
};

/**
 * Wires one map view's painting to the page: the left button on the canvas drives the tool in hand, the keys held
 * (Shift, Ctrl, the space bar) change what it does, Escape abandons what it is doing, and the view is told what to
 * show after every change. The right button and the wheel stay the renderer's, for panning and zooming.
 *
 * A stroke never outlives the gesture that made it: losing the pointer or the window's focus ends it, keeping what it
 * painted, and so does any Ctrl shortcut pressed mid-stroke, so an undo pressed while drawing takes back the whole
 * stroke rather than finding it still open.
 */
class PaintController
{
  #options: PaintControllerOptions;

  #session: ToolSession;

  #keys: HeldKeys = { shift: false, copy: false, override: false };

  #hovering = false;

  #lastSpot = '';

  #paintedInputs = 0;

  #stops: (() => void)[] = [];

  /**
   * @param {PaintControllerOptions} options What the painting is wired to.
   */
  constructor(options: PaintControllerOptions)
  {
    this.#options = options;
    const { hub, map, layering, painting } = options;
    this.#session = new ToolSession({
      hub,
      map,
      layering,
      settings: () => painting.settings,
      pickBrush: brush => painting.setBrush(brush),
      pickTool: tool => painting.setTool(tool),
    });
  }

  /**
   * The tool session, for anything that drives the tools without a pointer.
   * @returns {ToolSession} The session.
   */
  get session(): ToolSession
  {
    return this.#session;
  }

  /**
   * How many pointer events changed the map since counting last started: the proof the speed script asks for that a
   * stroke really painted at every step.
   * @returns {number} The count.
   */
  get paintedInputs(): number
  {
    return this.#paintedInputs;
  }

  /**
   * Starts counting pointer events that changed the map afresh.
   */
  resetPaintedInputs(): void
  {
    this.#paintedInputs = 0;
  }

  /**
   * Starts listening: on the canvas for the pointer, on its window for the keys, and to the painting settings. A
   * renderer with no canvas yet has nothing to listen on.
   * @returns {() => void} Stops listening, ending any stroke in progress first.
   */
  attach(): () => void
  {
    const canvas = this.#options.surface.canvas ?? null;
    const view = canvas?.ownerDocument.defaultView ?? null;
    if (canvas === null || view === null)
    {
      return () => undefined;
    }

    // the canvas can hold the keyboard's focus, without drawing a focus ring over the map.
    canvas.tabIndex = -1;
    canvas.style.outline = 'none';
    this.#listenOnCanvas(canvas);
    this.#listenForKeys(view);
    this.#stops.push(this.#options.painting.subscribe(settings =>
    {
      this.#session.toolChanged(settings.tool);
      this.#show();
    }));

    return () =>
    {
      this.#session.interrupt();
      this.#stops.splice(0).forEach(stop => stop());
    };
  }

  /**
   * Listens on the canvas for the left button and the pointer's comings and goings.
   * @param {HTMLCanvasElement} canvas The canvas.
   */
  #listenOnCanvas(canvas: HTMLCanvasElement): void
  {
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) =>
    {
      canvas.addEventListener(type, handler);
      this.#stops.push(() => canvas.removeEventListener(type, handler));
    };

    listen('pointerdown', event =>
    {
      // with the events in hand the left button is the event tools', focus and pointer capture included.
      if (event.button !== 0 || this.#paints() === false)
      {
        return;
      }

      // a press on the map takes the keys from wherever they were, a text field included, so the space bar, Shift and
      // Escape that follow are the map's.
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      this.#counted(() => this.#session.press(this.#pointerFor(event)));
    });
    listen('pointermove', event => this.#onMove(event));
    listen('pointerup', event =>
    {
      // a release ends a stroke whatever is in hand by then, but one with the events in hand that started nothing here
      // is the event tools' to answer.
      if (event.button !== 0 || (this.#paints() === false && this.#session.isActive === false))
      {
        return;
      }

      this.#session.release(this.#pointerFor(event));
      if (canvas.hasPointerCapture(event.pointerId))
      {
        canvas.releasePointerCapture(event.pointerId);
      }

      this.#show();
    });
    listen('pointercancel', () => this.#interrupt());
    listen('lostpointercapture', () =>
    {
      if (this.#session.isActive)
      {
        this.#interrupt();
      }
    });
    listen('pointerenter', () =>
    {
      this.#hovering = true;
    });
    listen('pointerleave', () =>
    {
      this.#hovering = false;
      this.#lastSpot = '';
      this.#session.leave();
      this.#show();
    });
  }

  /**
   * Follows the pointer. While nothing is being dragged, a move that stays in the same quarter of the same cell with
   * the same keys changes nothing the tools show, so it is let go without working anything out.
   * @param {PointerEvent} event The move.
   */
  #onMove(event: PointerEvent): void
  {
    this.#hovering = true;
    const pointer = this.#pointerFor(event);
    const spot = this.#spotOf(pointer);
    if (spot === this.#lastSpot)
    {
      return;
    }

    this.#lastSpot = spot;
    this.#counted(() => this.#session.move(pointer));
  }

  /**
   * Runs a pointer step of the tools and shows the result, counting the step when it changed the map.
   * @param {() => void} step The step.
   */
  #counted(step: () => void): void
  {
    const map = this.#options.map();
    const before = map?.revision ?? -1;
    step();
    if (map !== null && map.revision !== before)
    {
      this.#paintedInputs += 1;
    }

    this.#show();
  }

  /**
   * Listens on the canvas's window for the keys the tools read, and for the window losing focus.
   * @param {Window} view The window.
   */
  #listenForKeys(view: Window): void
  {
    const onKeyDown = (event: KeyboardEvent) => this.#onKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => this.#onKey(event, false);
    const onBlur = () =>
    {
      this.#keys = { shift: false, copy: false, override: false };
      this.#interrupt();
    };

    // capture, so a Ctrl shortcut pressed mid-stroke finds the stroke already ended.
    view.addEventListener('keydown', onKeyDown, true);
    view.addEventListener('keyup', onKeyUp, true);
    view.addEventListener('blur', onBlur);
    this.#stops.push(
      () => view.removeEventListener('keydown', onKeyDown, true),
      () => view.removeEventListener('keyup', onKeyUp, true),
      () => view.removeEventListener('blur', onBlur),
    );
  }

  /**
   * Takes up a key going down or up.
   * @param {KeyboardEvent} event The key.
   * @param {boolean} down True when it went down.
   */
  #onKey(event: KeyboardEvent, down: boolean): void
  {
    // the keys are the tools' while the pointer is over the map with a painting tool in hand, or a stroke goes on.
    const session = this.#session;
    const mine = (this.#hovering && this.#paints()) || session.isActive;
    if (down && (event.ctrlKey || event.metaKey) && session.isActive && event.key !== 'Control' && event.key !== 'Meta')
    {
      session.interrupt();
    }

    if (event.code === OVERRIDE_KEY_CODE)
    {
      this.#onOverrideKey(event, down, mine);
      return;
    }

    if (down && event.key === 'Escape' && mine && (session.isActive || session.selection !== null))
    {
      event.preventDefault();
      session.escape();
      this.#show();
      return;
    }

    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Meta')
    {
      this.#setKeys({ ...this.#keys, shift: event.shiftKey, copy: event.ctrlKey || event.metaKey });
    }
  }

  /**
   * Takes up the override's key. Pressed, it is the override's only over the map and never in a text field, and is
   * kept from the page there, which would otherwise scroll or press a focused button. Released, it always lets the
   * override go, wherever the pointer has wandered since.
   * @param {KeyboardEvent} event The key.
   * @param {boolean} down True when it went down.
   * @param {boolean} mine Whether the pointer is over the map or a drag is in progress.
   */
  #onOverrideKey(event: KeyboardEvent, down: boolean, mine: boolean): void
  {
    const typing = isTextEntry(event.target as unknown as KeyTarget);
    if (mine && typing === false)
    {
      event.preventDefault();
    }

    if (down === false)
    {
      this.#setKeys({ ...this.#keys, override: false });
      return;
    }

    if (mine && typing === false)
    {
      this.#setKeys({ ...this.#keys, override: true });
    }
  }

  /**
   * Takes up new keys, and shows what they change.
   * @param {HeldKeys} keys The keys held now.
   */
  #setKeys(keys: HeldKeys): void
  {
    const { shift, copy, override } = this.#keys;
    if (keys.shift === shift && keys.copy === copy && keys.override === override)
    {
      return;
    }

    this.#keys = keys;
    this.#session.keys(keys);
    this.#show();
  }

  /**
   * Ends whatever the tools are doing without the release that should have ended it.
   */
  #interrupt(): void
  {
    this.#session.interrupt();
    this.#show();
  }

  /**
   * Turns a pointer event into what the tools read: the cell and the quarter under it, and the keys held with it.
   * @param {PointerEvent} event The event.
   * @returns {ToolPointer} The pointer.
   */
  #pointerFor(event: PointerEvent): ToolPointer
  {
    const { surface } = this.#options;
    const point = { x: event.offsetX, y: event.offsetY };
    const world = screenToWorld(surface.camera, point);
    this.#keys = { ...this.#keys, shift: event.shiftKey, copy: event.ctrlKey || event.metaKey };
    return {
      cell: surface.cellAt(point),
      quarter: shadowQuarterAt(world.x, world.y, TILE_SIZE),
      ...this.#keys,
    };
  }

  /**
   * Names where a pointer is and the keys held with it, to tell a move that changes something from one that does not.
   * Only the shadow pen reads which quarter of a cell the pointer is in; every other tool reads the cell.
   * @param {ToolPointer} pointer The pointer.
   * @returns {string} The name.
   */
  #spotOf(pointer: ToolPointer): string
  {
    const { cell, quarter, shift, copy, override } = pointer;
    const { brush } = this.#options.painting.settings;
    const byQuarter = brush !== null && brush.kind === 'shadows';
    let where = 'off';
    if (cell !== null)
    {
      where = byQuarter ? `${quarter.x},${quarter.y},${quarter.quarter}` : `${cell.x},${cell.y}`;
    }

    return `${where}|${shift}|${copy}|${override}`;
  }

  /**
   * Reports whether the tool in hand paints, rather than leaving the left button to the event tools.
   * @returns {boolean} True for every tool but the events.
   */
  #paints(): boolean
  {
    return isPaintingTool(this.#options.painting.settings.tool);
  }

  /**
   * Hands the view what the tools show now.
   */
  #show(): void
  {
    this.#options.overlay(this.#session.overlay());
  }
}

export { OVERRIDE_KEY_CODE, PaintController };
export type { PaintControllerOptions, PaintSurface };
