import { EventDragPreview, type DragFrame } from '../core/events/eventDragPreview.ts';
import { createEvent, deleteEvents, duplicateEvents, type EventEditOutcome } from '../core/events/eventEdits.ts';
import { EventGesture, type GestureBox, type GestureStep } from '../core/events/eventGesture.ts';
import { eventKeyFor } from '../core/events/eventKeys.ts';
import { moveEvents } from '../core/events/eventMoves.ts';
import { isOnMap } from '../core/events/eventPlacement.ts';
import { NO_EVENTS, type EventSelection } from '../core/events/EventSelection.ts';
import { boxCells, boxSelection, eventsInCells, modifiersOf } from '../core/events/selectionRules.ts';
import type { DocumentHub } from '../core/history/DocumentHub.ts';
import type { DocumentChange } from '../core/model/EditorDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import { screenToWorld, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from '../core/renderer/camera.ts';
import type { CellRect, GhostEvent, GhostTile, MapContextMenu, OverlayState, WorldRect } from '../core/renderer/MapRenderer.ts';
import { precisePoint } from '../core/renderer/precisePoint.ts';
import { shortcutFor, type KeyTarget } from '../core/workspace/shortcuts.ts';

/**
 * What the event tools need from the renderer: its canvas and camera, the event under a point, the overlay state it
 * draws, its still right clicks, and every move of its camera.
 */
type EventToolsRenderer = {
  readonly canvas: HTMLCanvasElement | null;
  readonly camera: Camera;
  eventAt(point: ScreenPoint): number | null;
  setOverlayState(state: OverlayState): void;
  onContextMenu(listener: (menu: MapContextMenu) => void): () => void;
  onCameraChange(listener: (camera: Camera) => void): () => void;
};

/**
 * How a message to the author reads: news, or a refusal saying why nothing happened.
 */
type EventNoticeSeverity = 'info' | 'error';

/**
 * A right click that did not move, for the view to open the map's menu at: where, in the view's window, and what is
 * there.
 */
type EventMenuRequest = {
  readonly x: number;
  readonly y: number;
  readonly cell: MapCell | null;
  readonly eventId: number | null;
};

/**
 * What the event tools are built from.
 */
type MapEventToolsOptions = {
  readonly renderer: EventToolsRenderer;

  /**
   * The element keys reach while the map has focus: the view around the canvas, made focusable.
   */
  readonly host: HTMLElement;
  readonly hub: DocumentHub;
  readonly selection: EventSelection;

  /**
   * Opens an event's full editor in its own window, or brings forward the one editing it.
   */
  readonly openEvent: (mapId: number, eventId: number) => void;
  readonly notify: (text: string, severity: EventNoticeSeverity) => void;
  readonly openMenu: (request: EventMenuRequest) => void;

  /**
   * Says why a map may hold no copy of a blueprint, or null when it may: a duplicate of copies is refused there.
   */
  readonly linkRefusal: (mapId: number) => string | null;
};

/**
 * What the tools have done, for the speed script to check that a measured interaction really happened.
 */
type EventToolsState = {
  readonly selected: number;
  readonly moving: boolean;
  readonly ghosts: number;
  readonly drops: number;
  readonly refusedDrops: number;
};

/**
 * No ghost tiles, no ghost events and no blocked tiles: shared, so the renderer sees nothing change while none show.
 */
const NO_GHOST_TILES: readonly GhostTile[] = Object.freeze([]);
const NO_GHOST_EVENTS: readonly GhostEvent[] = Object.freeze([]);
const NO_CELLS: readonly MapCell[] = Object.freeze([]);

/**
 * Selecting, moving, creating, deleting and duplicating events on one map view, with the mouse, the keyboard and the
 * right-click menu. Every change goes through the event services, as one step in the map's history, and the selection
 * lives in the window's {@link EventSelection}, which the quick panel reads. Copying, cutting and pasting the selection
 * are the stamp tools' (see MapStampTools), since whatever is copied off a map becomes a stamp.
 *
 * - Click an event to select it; Shift adds and Ctrl toggles; a click on the ground selects nothing.
 * - Drag from the ground, or from beside the map, to box-select; Shift and Ctrl add and toggle here too.
 * - Drag a selected event to move the whole selection: ghosts show where it would land, red where another event is in
 *   the way, and the drop moves it. The arrow keys nudge it a tile.
 * - Double-click an event to open its window; double-click the ground to place a new event there and open it.
 * - Delete, Ctrl+D, Ctrl+A, Enter and Esc delete, duplicate, select all, open and deselect. A key another tool took
 *   first, such as the Esc that puts a stamp down, is left alone.
 * - While the left button is down, only Esc acts: the arrows, Delete, Ctrl+D, Ctrl+X, Ctrl+V, Ctrl+Z and the rest wait
 *   until it comes up, since each would change the map under a drag or a box still in hand.
 *
 * Nothing here goes through React: the tools listen on the canvas and the view themselves, which also keeps them
 * working in a torn-out window, and hand the renderer its overlay state directly. While another tool owns the left
 * button, such as a paint tool, {@link setEnabled} stands them down.
 */
class MapEventTools
{
  #options: MapEventToolsOptions;

  #map: MapDocument | null = null;

  #enabled = true;

  #gesture = new EventGesture();

  #drag: EventDragPreview | null = null;

  #dragFrame: DragFrame | null = null;

  #hover: CellRect | null = null;

  /**
   * Where the pointer last was over the canvas, or null once it left: what the hover follows when the camera moves.
   */
  #pointer: ScreenPoint | null = null;

  /**
   * Where the last press of the left button landed, as precisely as the pointer reported it: where a double-click
   * really happened, since the double-click itself reports whole pixels.
   */
  #press: ScreenPoint | null = null;

  #box: WorldRect | null = null;

  #boxPreview: readonly number[] | null = null;

  #selected: readonly number[] = NO_EVENTS;

  #drops = 0;

  #refusedDrops = 0;

  #pruneQueued = false;

  #stops: (() => void)[] = [];

  #stopMap: (() => void) | null = null;

  /**
   * @param {MapEventToolsOptions} options The renderer, the view, the window's hub and selection, and how to open event
   * windows, tell the author things and open the menu.
   */
  constructor(options: MapEventToolsOptions)
  {
    this.#options = options;
    const { selection, renderer, host } = options;
    this.#stops.push(
      selection.subscribe(() => this.#selectionChanged()),
      renderer.onContextMenu(menu => this.#contextMenu(menu)),
      renderer.onCameraChange(() => this.#cameraMoved()),
    );

    const { canvas } = renderer;
    if (canvas !== null)
    {
      this.#listen(canvas, 'pointerdown', this.#onPointerDown);
      this.#listen(canvas, 'pointermove', this.#onPointerMove);
      this.#listen(canvas, 'pointerup', this.#onPointerUp);
      this.#listen(canvas, 'pointercancel', this.#onPointerCancel);
      this.#listen(canvas, 'lostpointercapture', this.#onPointerCancel);
      this.#listen(canvas, 'pointerleave', this.#onPointerLeave);
      this.#listen(canvas, 'dblclick', this.#onDoubleClick);
    }

    // keys reach the focused view.
    this.#listen(host, 'keydown', this.#onKeyDown);
  }

  /**
   * The map the tools work on.
   * @returns {MapDocument | null} The map, or null before one is open.
   */
  get map(): MapDocument | null
  {
    return this.#map;
  }

  /**
   * Whether the tools answer the left button and the keys.
   * @returns {boolean} False while another tool owns them.
   */
  get enabled(): boolean
  {
    return this.#enabled;
  }

  /**
   * Whether a drag or a box is in hand, while which nothing else may change the map under it.
   * @returns {boolean} True between a press that started one and its release.
   */
  get busy(): boolean
  {
    return this.#gesture.isActive;
  }

  /**
   * Reports what the tools have done so far.
   * @returns {EventToolsState} The counts.
   */
  state(): EventToolsState
  {
    return {
      selected: this.#selected.length,
      moving: this.#gesture.isMoving,
      ghosts: this.#dragFrame?.ghosts.length ?? 0,
      drops: this.#drops,
      refusedDrops: this.#refusedDrops,
    };
  }

  /**
   * Works on another map, dropping any drag or box on show.
   * @param {MapDocument | null} map The map, or null for none.
   */
  setMap(map: MapDocument | null): void
  {
    this.#stopMap?.();
    this.#stopMap = null;
    this.#map = map;
    this.#endMoving();
    if (map !== null)
    {
      this.#stopMap = map.subscribe(change => this.#documentChanged(change));
    }

    this.#selected = map === null ? NO_EVENTS : this.#options.selection.eventsOn(map.mapId);
    this.#push();
  }

  /**
   * Stands the tools down while another tool owns the left button, or brings them back. Standing down drops any drag or
   * box on show; the selection stays.
   * @param {boolean} enabled True to answer input.
   */
  setEnabled(enabled: boolean): void
  {
    this.#enabled = enabled;
    if (enabled === false)
    {
      this.#endMoving();
      this.#hover = null;
      this.#push();
    }
  }

  /**
   * Picks out one event, as when the data editor opens the map at a battler: it becomes the selection.
   * @param {number} eventId The event.
   * @returns {MapCell | null} Where it stands, for the view to look at, or null when the map does not hold it.
   */
  pick(eventId: number): MapCell | null
  {
    const map = this.#map;
    const event = map?.event(eventId) ?? null;
    if (map === null || event === null)
    {
      return null;
    }

    this.#options.selection.select(map.mapId, [ eventId ]);
    return { x: event.x, y: event.y };
  }

  //region actions

  /**
   * Selects every event on the map.
   */
  selectAll(): void
  {
    const map = this.#map;
    if (map !== null)
    {
      this.#options.selection.select(map.mapId, map.eventIds());
    }
  }

  /**
   * Places a new event on a tile and selects it.
   * @param {MapCell} cell The tile.
   * @returns {number | null} The new event's id, or null when it could not be placed.
   */
  createAt(cell: MapCell): number | null
  {
    const map = this.#map;
    if (map === null)
    {
      return null;
    }

    const outcome = createEvent(this.#options.hub, map.mapId, cell);
    this.#settle(outcome);
    return outcome.ok ? outcome.eventIds[0] ?? null : null;
  }

  /**
   * Opens an event's window.
   * @param {number} eventId The event.
   */
  open(eventId: number): void
  {
    const map = this.#map;
    if (map !== null)
    {
      this.#options.openEvent(map.mapId, eventId);
    }
  }

  /**
   * Deletes the selected events.
   */
  deleteSelected(): void
  {
    this.#onSelection(mapId => deleteEvents(this.#options.hub, mapId, this.#selected));
  }

  /**
   * Duplicates the selected events beside themselves, selecting the copies; copies of a blueprint among them are refused
   * on a map that may hold no link, with the map's reason.
   */
  duplicateSelected(): void
  {
    this.#onSelection(mapId => duplicateEvents(this.#options.hub, mapId, this.#selected, this.#options.linkRefusal(mapId)));
  }

  //endregion actions

  /**
   * Stops listening, and lets go of the map.
   */
  destroy(): void
  {
    this.#stops.splice(0).forEach(stop => stop());
    this.#stopMap?.();
    this.#stopMap = null;
    this.#map = null;
  }

  //region input

  #onPointerDown = (event: PointerEvent): void =>
  {
    // any press gives the map the keys, so Delete and the arrows act on what was just picked.
    this.#options.host.focus({ preventScroll: true });
    const map = this.#map;
    if (event.button !== 0 || this.#enabled === false || map === null)
    {
      return;
    }

    const point = { x: event.offsetX, y: event.offsetY };
    const press = { point, cell: this.#cellAt(point), eventId: this.#options.renderer.eventAt(point), modifiers: modifiersOf(event) };
    this.#pointer = point;
    this.#press = point;
    this.#options.renderer.canvas?.setPointerCapture(event.pointerId);
    this.#apply(this.#gesture.press(press, this.#selected));
  };

  #onPointerMove = (event: PointerEvent): void =>
  {
    this.#pointer = { x: event.offsetX, y: event.offsetY };
    this.#pointAt(this.#pointer);
  };

  #onPointerUp = (event: PointerEvent): void =>
  {
    if (event.button !== 0 || this.#gesture.isActive === false)
    {
      return;
    }

    this.#apply(this.#gesture.release(this.#cellAt({ x: event.offsetX, y: event.offsetY })));
  };

  #onPointerCancel = (): void =>
  {
    if (this.#gesture.isActive)
    {
      this.#apply(this.#gesture.cancel());
    }
  };

  #onPointerLeave = (): void =>
  {
    // a drag or a box keeps the pointer captured, and keeps its hover, until the button comes up.
    if (this.#gesture.isActive)
    {
      return;
    }

    this.#pointer = null;
    if (this.#hoverOver(null))
    {
      this.#push();
    }
  };

  #onDoubleClick = (event: MouseEvent): void =>
  {
    const map = this.#map;
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || this.#enabled === false || map === null)
    {
      return;
    }

    // a double-click reports whole pixels, which at a device pixel ratio such as 1.5 can lie on the tile beside the one
    // its presses landed on, so the press says where it happened: the event it selected is the event it opens.
    const point = precisePoint({ x: event.offsetX, y: event.offsetY }, this.#press);
    const eventId = this.#options.renderer.eventAt(point);
    if (eventId !== null)
    {
      this.open(eventId);
      return;
    }

    // a double-click on the ground places an event there and opens it, as MZ opens a new event.
    const cell = this.#cellAt(point);
    const created = isOnMap(cell, map) ? this.createAt(cell) : null;
    if (created !== null)
    {
      this.open(created);
    }
  };

  #onKeyDown = (event: KeyboardEvent): void =>
  {
    // a key another tool took first, such as the Esc that puts a stamp down, is not the event tools' to answer too.
    const map = this.#map;
    if (this.#enabled === false || map === null || event.defaultPrevented)
    {
      return;
    }

    // a drag or a box still in hand would have the map changed under it, so every key but Esc waits for the button.
    if (this.#gesture.isActive)
    {
      this.#holdDuringGesture(event);
      return;
    }

    const action = eventKeyFor(event, event.target as unknown as KeyTarget);
    if (action === null)
    {
      return;
    }

    // the arrows scroll the page when there is nothing to nudge.
    if (action.kind === 'nudge' && this.#selected.length === 0)
    {
      return;
    }

    event.preventDefault();
    switch (action.kind)
    {
      case 'nudge':
        this.#settle(moveEvents(this.#options.hub, map.mapId, this.#selected, action.dx, action.dy));
        break;
      case 'select-all':
        this.selectAll();
        break;
      case 'duplicate':
        this.duplicateSelected();
        break;
      case 'delete':
        this.deleteSelected();
        break;
      case 'open':
        this.#openPicked();
        break;
      case 'escape':
        this.#escape();
        break;
    }
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
   * Finds the tile under a point in the view, on the map or beside it.
   * @param {ScreenPoint} point The point.
   * @returns {MapCell} The tile, which may lie off the map.
   */
  #cellAt(point: ScreenPoint): MapCell
  {
    const world = screenToWorld(this.#options.renderer.camera, point);
    return { x: Math.floor(world.x / TILE_SIZE), y: Math.floor(world.y / TILE_SIZE) };
  }

  /**
   * Follows the pointer to a point in the view: the tile under it becomes the hover (where a paste lands), and a drag
   * or a box in hand moves with it.
   * @param {ScreenPoint} point The point.
   */
  #pointAt(point: ScreenPoint): void
  {
    const map = this.#map;
    if (this.#enabled === false || map === null)
    {
      return;
    }

    const cell = this.#cellAt(point);
    const hoverMoved = this.#hoverOver(isOnMap(cell, map) ? cell : null);
    const step = this.#gesture.isActive
      ? this.#gesture.move(point, cell)
      : { kind: 'none' as const };
    if (step.kind !== 'none')
    {
      this.#apply(step);
      return;
    }

    if (hoverMoved)
    {
      this.#push();
    }
  }

  /**
   * Follows the camera: a zoom or a pan under a pointer that stays still puts another tile under it, so the hover, and
   * any drag or box in hand, follow as if the pointer had moved there.
   */
  #cameraMoved(): void
  {
    const point = this.#pointer;
    if (point !== null)
    {
      this.#pointAt(point);
    }
  }

  /**
   * Answers a key pressed while the left button is down: Esc drops the drag or box in hand, and every other key the
   * map or the workspace would act on is held back, the workspace's undo and redo included, since they would change
   * the map under the drag. Saving still goes through, since it changes nothing.
   * @param {KeyboardEvent} event The key press.
   */
  #holdDuringGesture(event: KeyboardEvent): void
  {
    const action = eventKeyFor(event, event.target as unknown as KeyTarget);
    if (action !== null && action.kind === 'escape')
    {
      event.preventDefault();
      this.#escape();
      return;
    }

    const command = shortcutFor(event);
    if (action !== null || (command !== null && command !== 'save'))
    {
      event.preventDefault();
    }
  }

  /**
   * Notes the tile under the pointer.
   * @param {MapCell | null} cell The tile on the map, or null off it.
   * @returns {boolean} True when that is another tile than before.
   */
  #hoverOver(cell: MapCell | null): boolean
  {
    const current = this.#hover;
    if ((cell === null && current === null) || (cell !== null && current !== null && cell.x === current.x && cell.y === current.y))
    {
      return false;
    }

    this.#hover = cell === null ? null : { x: cell.x, y: cell.y, width: 1, height: 1 };
    return true;
  }

  /**
   * Carries out what a step of the left button's gesture asks for.
   * @param {GestureStep} step The step.
   */
  #apply(step: GestureStep): void
  {
    const map = this.#map;
    if (map === null)
    {
      return;
    }

    switch (step.kind)
    {
      case 'none':
        return;
      case 'select':
        this.#options.selection.select(map.mapId, step.eventIds);
        return;
      case 'drag':
        this.#drag ??= new EventDragPreview(map, this.#selected);
        this.#dragFrame = this.#drag.at(step.dx, step.dy);
        break;
      case 'drop':
        this.#drop(map, step.dx, step.dy);
        break;
      case 'box':
        this.#showBox(map, step);
        break;
      case 'boxed':
        this.#endMoving();
        this.#options.selection.select(map.mapId, boxSelection(step.before, eventsInCells(map, boxCells(step.from, step.to, map)), step.modifiers));
        break;
      case 'cancel':
        this.#endMoving();
        break;
    }

    this.#push();
  }

  /**
   * Drops a drag: moves the dragged events by the shift the ghosts showed, or says why they cannot go there.
   * @param {MapDocument} map The map.
   * @param {number} dx The shift across the pointer asked for.
   * @param {number} dy The shift down the pointer asked for.
   */
  #drop(map: MapDocument, dx: number, dy: number): void
  {
    const drag = this.#drag;
    this.#endMoving();
    if (drag === null)
    {
      return;
    }

    const frame = drag.at(dx, dy);
    if (frame.ok === false)
    {
      this.#refusedDrops += 1;
      this.#options.notify('Another event is in the way.', 'error');
      return;
    }

    this.#drops += 1;
    this.#settle(moveEvents(this.#options.hub, map.mapId, drag.eventIds, frame.dx, frame.dy));
  }

  /**
   * Shows a box being drawn, and what it would select.
   * @param {MapDocument} map The map.
   * @param {GestureBox} step The box.
   */
  #showBox(map: MapDocument, step: GestureBox): void
  {
    const rect = boxCells(step.from, step.to, map);
    this.#box = rect === null
      ? null
      : { x: rect.x * TILE_SIZE, y: rect.y * TILE_SIZE, width: rect.width * TILE_SIZE, height: rect.height * TILE_SIZE };
    this.#boxPreview = boxSelection(step.before, eventsInCells(map, rect), step.modifiers);
  }

  /**
   * Forgets any drag or box on show.
   */
  #endMoving(): void
  {
    this.#drag = null;
    this.#dragFrame = null;
    this.#box = null;
    this.#boxPreview = null;
  }

  /**
   * Hands the renderer everything the tools show.
   */
  #push(): void
  {
    const frame = this.#dragFrame;
    this.#options.renderer.setOverlayState({
      hover: this.#hover,
      selectedEvents: this.#boxPreview ?? this.#selected,
      selectedCells: null,
      selectionBox: this.#box,
      ghostTiles: NO_GHOST_TILES,
      ghostEvents: frame?.ghosts ?? NO_GHOST_EVENTS,
      blockedCells: frame === null || frame.blocked.length === 0 ? NO_CELLS : frame.blocked,
    });
  }

  /**
   * Follows the window's selection onto this map.
   */
  #selectionChanged(): void
  {
    const map = this.#map;
    const next = map === null ? NO_EVENTS : this.#options.selection.eventsOn(map.mapId);
    if (next !== this.#selected)
    {
      this.#selected = next;
      this.#push();
    }
  }

  /**
   * Hears the map change. An event removed, by an undo or in another window, leaves the selection once the change is
   * done: a drop moving hundreds of events arrives as hundreds of changes, and the check runs once for all of them.
   * @param {DocumentChange} change The change.
   */
  #documentChanged(change: DocumentChange): void
  {
    const touchesEvents = change.kind === 'replaced' || (change.patch.kind !== 'tiles' && change.patch.kind !== 'resize' && change.patch.path[0] === 'events');
    if (touchesEvents === false || this.#pruneQueued)
    {
      return;
    }

    this.#pruneQueued = true;
    queueMicrotask(() =>
    {
      this.#pruneQueued = false;
      const map = this.#map;
      if (map !== null)
      {
        this.#options.selection.keepExisting(map.mapId, id => map.event(id) !== null);
      }
    });
  }

  /**
   * Opens the map's menu for a still right click, selecting the event clicked when it was not already selected.
   * @param {MapContextMenu} menu Where the click landed and what is there.
   */
  #contextMenu(menu: MapContextMenu): void
  {
    const map = this.#map;
    const { canvas } = this.#options.renderer;
    if (this.#enabled === false || map === null || canvas === null)
    {
      return;
    }

    if (menu.eventId !== null && this.#selected.includes(menu.eventId) === false)
    {
      this.#options.selection.select(map.mapId, [ menu.eventId ]);
    }

    const bounds = canvas.getBoundingClientRect();
    this.#options.openMenu({ x: bounds.left + menu.point.x, y: bounds.top + menu.point.y, cell: menu.cell, eventId: menu.eventId });
  }

  /**
   * Runs an edit on the selection, when there is one on this map.
   * @param {(mapId: number) => EventEditOutcome} edit The edit.
   */
  #onSelection(edit: (mapId: number) => EventEditOutcome): void
  {
    const map = this.#map;
    if (map !== null && this.#selected.length > 0)
    {
      this.#settle(edit(map.mapId));
    }
  }

  /**
   * Takes what an edit came to: its events become the selection, or the author hears why it was refused.
   * @param {EventEditOutcome} outcome The outcome.
   */
  #settle(outcome: EventEditOutcome): void
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
  }

  /**
   * Opens the window of the event picked last.
   */
  #openPicked(): void
  {
    const picked = this.#selected[this.#selected.length - 1];
    if (picked !== undefined)
    {
      this.open(picked);
    }
  }

  /**
   * Drops a drag or a box on show, or else selects nothing on this map.
   */
  #escape(): void
  {
    if (this.#gesture.isMoving)
    {
      this.#apply(this.#gesture.cancel());
      return;
    }

    if (this.#selected.length > 0)
    {
      this.#options.selection.clear();
    }
  }

  //endregion internals
}

export { MapEventTools };
export type { EventMenuRequest, EventNoticeSeverity, EventToolsRenderer, EventToolsState, MapEventToolsOptions };
