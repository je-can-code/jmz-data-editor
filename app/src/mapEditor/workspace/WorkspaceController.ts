import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview-react';
import { nameInSteps } from '../core/blueprints/blueprintEdits.ts';
import { blueprintsKeptGuard } from '../core/blueprints/blueprintMoves.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../core/blueprints/blueprints.ts';
import { BLUEPRINT_USES_DOCUMENT, usedCopiesOf } from '../core/blueprints/blueprintUses.ts';
import { BlueprintUsesKeeper } from '../core/blueprints/blueprintUsesKeeper.ts';
import { copiesLeftWords } from '../core/blueprints/copiesLeft.ts';
import { installCloseGuard, type CloseTarget } from '../core/closeGuard.ts';
import { EventSelection } from '../core/events/EventSelection.ts';
import { blueprintHistoryKey, mapHistoryKey, TREE_HISTORY_KEY, type HistoryKey } from '../core/history/historyKeys.ts';
import type { MapCell } from '../core/renderer/camera.ts';
import { MapTreeService, type TreeOutcome } from '../core/tree/MapTreeService.ts';
import { TREE_ROOT } from '../core/tree/MapTreeModel.ts';
import type { CopiedMap, TreePlace } from '../core/tree/treePlans.ts';
import { HistoryRouter, type HistoryOutcome } from '../core/workspace/HistoryRouter.ts';
import { LayoutStore } from '../core/workspace/LayoutStore.ts';
import {
  historyOwnedBy,
  isMapPanelParams,
  mapPanelId,
  PANEL_COMPONENTS,
  type PanelDirection,
} from '../core/workspace/panels.ts';
import {
  blueprintIdOfMap,
  blueprintMapId,
  isMappableBlueprintId,
  MAP_INFOS_KEY,
  mapDocumentKey,
  parseDocumentKey,
} from '../core/model/documentKeys.ts';
import type { RmmzMapInfo } from '../core/model/rmmzTypes.ts';
import type { MapEditorServices } from '../services/MapEditorServices.ts';
import { isStartPanel } from '../core/workspace/centre.ts';
import { documentLabel } from '../views/documentLabels.ts';
import { openEventWindow } from '../views/mapEditorViews.ts';
import { CentreKeeper, centreOf } from './CentreKeeper.ts';
import { POPOUT_URL } from './defaultLayout.ts';
import { GroupCollapseKeeper } from './GroupCollapseKeeper.ts';
import { PopoutKeeper } from './PopoutKeeper.ts';
import { SideCollapseKeeper } from './SideCollapseKeeper.ts';

/**
 * What the map tree's clipboard holds: maps copied with their files, or maps marked to move on the next paste.
 */
type MapClipboard =
  | { readonly kind: 'copy'; readonly copies: readonly CopiedMap[] }
  | { readonly kind: 'cut'; readonly mapIds: readonly number[] };

/**
 * How a notice reads: news, a refusal, or an alarm, which stays until dismissed because something on disk is short
 * of what the history holds.
 */
type NoticeSeverity = 'info' | 'error' | 'alarm';

/**
 * A short message for the author, shown at the foot of the workspace: for a moment, or until dismissed for an alarm.
 */
type Notice = {
  readonly id: number;
  readonly text: string;
  readonly severity: NoticeSeverity;
};

/**
 * Everything the workspace's panels share.
 */
type WorkspaceState = {
  /**
   * The history undo acts on: the one owned by the panel that last had focus and owns one.
   */
  readonly activeHistory: HistoryKey | null;

  /**
   * The map the properties panel shows: the last map focused in a panel or picked alone in the tree.
   */
  readonly currentMapId: number | null;

  /**
   * The map the workspace's own palette shows: the last map focused in the main window or picked alone in the tree. A
   * torn-out map has a palette of its own, so focusing one leaves this as it was.
   */
  readonly paletteMapId: number | null;

  /**
   * The maps selected in the tree, in the order they were picked.
   */
  readonly treeSelection: readonly number[];

  /**
   * The map being renamed in the tree, or null.
   */
  readonly renaming: number | null;

  /**
   * What the tree's clipboard holds, or null.
   */
  readonly clipboard: MapClipboard | null;

  /**
   * The message showing, or null.
   */
  readonly notice: Notice | null;

  /**
   * The event each map should select, by map id: what the data editor asks for when it opens a map at an event.
   * The map's view picks it out, which makes it the window's selection; the quick panel follows the selection, never
   * this.
   */
  readonly eventFocus: Readonly<Record<number, EventFocus>>;

  /**
   * The cell each map's views should centre on, by map id: what a click on a placement of a blueprint in the Blueprints
   * section asks for.
   */
  readonly cellFocus: Readonly<Record<number, CellFocus>>;
};

/**
 * One ask to pick out an event: the event, and the ask's own number, which is new every time, so asking for the same
 * event again (a second click on the same link in the data editor) picks it out again, after the person has picked
 * other events or panned away.
 */
type EventFocus = {
  readonly eventId: number;
  readonly request: number;
};

/**
 * One ask to centre on a cell: the cell, and the ask's own number, new every time, so asking for the same cell again
 * after panning away centres on it again.
 */
type CellFocus = {
  readonly cell: MapCell;
  readonly request: number;
};

/**
 * Where a map opens.
 */
type OpenMapOptions = {
  /**
   * Open another view of the map even when one is open already.
   */
  readonly newView?: boolean;

  /**
   * Open it beside the centre, splitting the workspace, rather than as another tab there.
   */
  readonly beside?: boolean;

  /**
   * Open it at a group, as a drop on that group asks.
   */
  readonly at?: { readonly group: DockviewGroupPanel | undefined; readonly direction: PanelDirection };

  /**
   * The event to select once it shows.
   */
  readonly focusEventId?: number | null;

  /**
   * The cell to centre on once it shows.
   */
  readonly focusCell?: MapCell | null;
};

/**
 * The workspace's shared state and everything the shell does: which history undo acts on, which map the properties
 * show, the tree's selection and clipboard, opening maps into the dock, and every tree operation. Panels read the
 * state through {@link subscribe} and act through the methods; none of them reaches the dock, the tree service or
 * the history router itself.
 */
class WorkspaceController
{
  readonly services: MapEditorServices;

  /**
   * Keeps the record of where blueprints are placed on disk in step with the maps, a map's placements written with its
   * file (see BlueprintUsesKeeper); none in a window with no server.
   */
  readonly placements: BlueprintUsesKeeper | null;

  readonly tree: MapTreeService | null;

  readonly router: HistoryRouter;

  readonly layouts: LayoutStore;

  /**
   * The events selected in this window, on one map at a time: every map panel draws and changes it, torn-out ones
   * included, and the quick panel reads it (see {@link EventSelection} for how to read and follow it). It only ever
   * names a map this window holds: letting go of that map clears it.
   */
  readonly selection = new EventSelection();

  /**
   * Keeps the centre, the group maps open into, which never closes: the start panel holds it and shows there whenever
   * no map does.
   */
  readonly centre = new CentreKeeper();

  /**
   * Tears panels out into windows of their own, and puts them back where they came from; maps with no place of their
   * own go back to the centre. The start panel, which holds the centre, is never torn out.
   */
  readonly popouts = new PopoutKeeper({
    popoutUrl: POPOUT_URL,
    mapsGroup: () => (this.#dockview === null ? null : centreOf(this.#dockview)),
    staysDocked: panel => isStartPanel(panel.id),
  });

  /**
   * Collapses a side panel's group to just its tab bar, and restores it: what a tab's chevron, a double click on
   * it, and the Panels menu all act through.
   */
  readonly collapses = new GroupCollapseKeeper();

  /**
   * Folds a whole side of the workspace away, or brings it back: what the top bar's two edge buttons and their
   * keyboard shortcuts act through.
   */
  readonly sides = new SideCollapseKeeper();

  #dockview: DockviewApi | null = null;

  #state: WorkspaceState = {
    activeHistory: null,
    currentMapId: null,
    paletteMapId: null,
    treeSelection: [],
    renaming: null,
    clipboard: null,
    notice: null,
    eventFocus: {},
    cellFocus: {},
  };

  #listeners = new Set<() => void>();

  #noticeCount = 0;

  /**
   * Counts the asks to pick out an event or centre on a cell, for each ask's own number.
   */
  #focusRequests = 0;

  /**
   * Settles once the window has tried to hold the blueprints and the record of where they are placed, opened or not.
   */
  #placementsOpened: Promise<void>;

  /**
   * @param {MapEditorServices} services The window's services.
   */
  constructor(services: MapEditorServices)
  {
    this.services = services;

    // the placements are kept from the moment the workspace opens, before the record is held, so the keeper learns what
    // its file holds from the very read that brings it in.
    const { api } = services;
    this.placements = api === null
      ? null
      : new BlueprintUsesKeeper({
        hub: services.hub,
        api,
        holders: key => services.sync.holders(key),
        onProblem: message => this.notify(message, 'error'),
      });
    this.tree = api === null
      ? null
      : new MapTreeService({ hub: services.hub, api, openDocument: key => services.openDocument(key), placements: this.placements });

    // no undo, redo or jump takes away a blueprint whose copies still name it, its placed tiles among them, nor moves a
    // change to a blueprint whose files no longer hold what it would take back or put back.
    const { hub, blueprintCopies, blueprintWriter, pairWriter } = services;
    const usedCopies = { start: () => blueprintCopies.start(), countOf: (blueprintId: string) => usedCopiesOf(blueprintCopies, hub, blueprintId) };
    const blueprintsKept = blueprintsKeptGuard(hub, usedCopies, mapId => this.mapName(mapId));
    const leftWords = copiesLeftWords({ hub, mapName: mapId => this.mapName(mapId) });
    this.router = new HistoryRouter(
      hub,
      this.tree,
      (step, direction) => blueprintsKept(step, direction) ?? blueprintWriter?.guard(step, direction) ?? pairWriter?.guard(step, direction) ?? null,
      leftWords,
    );

    // a change to a blueprint, or a transfer pair, that could not be written says why, as anything refused does.
    blueprintWriter?.onProblem((message, alarm) => this.notify(message, alarm ? 'alarm' : 'error'));
    pairWriter?.onProblem((message, alarm) => this.notify(message, alarm ? 'alarm' : 'error'));
    this.layouts = new LayoutStore({ api: services.api });
    this.#placementsOpened = this.#holdPlacements();

    // a map the window lets go of, such as one deleted from the tree, takes its selected events with it, so the
    // selection only ever names a map this window holds; and an edit the window's checks refused, such as one taking an
    // event out of a blueprint, says why, whichever tool made it.
    services.hub.subscribe(event =>
    {
      const { mapId } = this.selection.get();
      if (event.type === 'released' && mapId !== null && event.document === mapDocumentKey(mapId))
      {
        this.selection.clear();
      }

      if (event.type === 'refused')
      {
        this.notify(event.message, 'error');
      }
    });
  }

  /**
   * Holds the blueprints and the record of where they are placed from the moment the workspace opens; the record's file
   * is kept in step with the maps from then on (see {@link placements}). Every edit that moves a placement with its tiles
   * changes the record only while the window holds it, and reads how far each placement reaches from the blueprints, so
   * both are held before the first such edit. One that cannot be read says why in the Blueprints section, which asks for
   * both too. A window with no server holds neither.
   * @returns {Promise<void>} Settles once both have been asked for, held or not; never rejects.
   */
  #holdPlacements(): Promise<void>
  {
    const { api } = this.services;
    if (api === null)
    {
      return Promise.resolve();
    }

    const asked = [ BLUEPRINTS_DOCUMENT, BLUEPRINT_USES_DOCUMENT ].map(key => Promise.resolve()
      .then(() => this.services.openDocument(key))
      .then(() => undefined, () => undefined));
    return Promise.all(asked).then(() => undefined);
  }

  /**
   * Waits until the window has asked for the blueprints and the record of where they are placed, as whatever moves a
   * placement does before it edits: the edit then finds them held, unless one could not be read.
   * @returns {Promise<void>} Settles once both have been asked for; never rejects.
   */
  whenPlacementsHeld(): Promise<void>
  {
    return this.#placementsOpened;
  }

  //region state

  /**
   * Reads the shared state.
   * @returns {WorkspaceState} The state; replaced, never changed, on every update.
   */
  getState = (): WorkspaceState =>
  {
    return this.#state;
  };

  /**
   * Listens for state updates.
   * @param {() => void} listener Called after every update.
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
   * Replaces part of the state and tells every listener.
   * @param {Partial<WorkspaceState>} changes The parts that change.
   */
  #update(changes: Partial<WorkspaceState>): void
  {
    this.#state = { ...this.#state, ...changes };
    [ ...this.#listeners ].forEach(listener => listener());
  }

  //endregion state

  //region dock

  /**
   * Takes the dock once it is ready.
   * @param {DockviewApi} api The dockview api.
   */
  attach(api: DockviewApi): void
  {
    this.#dockview = api;
  }

  /**
   * The dock, once it is ready.
   * @returns {DockviewApi | null} The dockview api.
   */
  get dockview(): DockviewApi | null
  {
    return this.#dockview;
  }

  /**
   * Follows focus from panel to panel: a map panel makes its map current and its history the one undo acts on, and,
   * in the main window, the map the workspace's own palette shows; the tree and the properties panel hand undo their
   * own; the rest leave it where it was.
   * @param {IDockviewPanel | undefined} panel The panel that now has focus.
   */
  panelActivated(panel: IDockviewPanel | undefined): void
  {
    if (panel === undefined)
    {
      return;
    }

    const { component } = panel.api;
    if (component === PANEL_COMPONENTS.map && isMapPanelParams(panel.params))
    {
      const { mapId } = panel.params;
      this.#update(panel.api.location.type === 'popout'
        ? { currentMapId: mapId, activeHistory: mapHistoryKey(mapId) }
        : { currentMapId: mapId, paletteMapId: mapId, activeHistory: mapHistoryKey(mapId) });
      return;
    }

    const owned = historyOwnedBy(component, panel.params, this.#state.currentMapId);
    if (owned !== undefined)
    {
      this.#update({ activeHistory: owned });
    }
  }

  /**
   * Opens a map, or brings forward the view of it already open.
   * @param {number} mapId The map.
   * @param {OpenMapOptions} options Where and how.
   * @returns {IDockviewPanel | null} The panel showing the map, or null before the dock is ready.
   */
  openMap(mapId: number, options: OpenMapOptions = {}): IDockviewPanel | null
  {
    const api = this.#dockview;
    if (api === null)
    {
      return null;
    }

    // every ask is a new one, even for the event asked for last time, so the map picks it out again.
    if (options.focusEventId !== undefined && options.focusEventId !== null)
    {
      this.#focusRequests += 1;
      const focus: EventFocus = { eventId: options.focusEventId, request: this.#focusRequests };
      this.#update({ eventFocus: { ...this.#state.eventFocus, [mapId]: focus } });
    }

    // a cell asked for again is centred on again, however far the view was panned away from it.
    if (options.focusCell !== undefined && options.focusCell !== null)
    {
      this.#focusRequests += 1;
      const focus: CellFocus = { cell: options.focusCell, request: this.#focusRequests };
      this.#update({ cellFocus: { ...this.#state.cellFocus, [mapId]: focus } });
    }

    const open = api.panels.find(panel => panel.api.component === PANEL_COMPONENTS.map && isMapPanelParams(panel.params) && panel.params.mapId === mapId);
    if (open !== undefined && options.newView !== true && options.beside !== true && options.at === undefined)
    {
      // a map already open in a torn-out window brings that window forward with it.
      open.api.setActive();
      if (open.api.location.type === 'popout')
      {
        open.api.getWindow().focus();
      }

      return open;
    }

    // a new map comes to the front of wherever it opens, and the centre keeps the start panel behind it.
    return api.addPanel({
      id: mapPanelId(mapId, api.panels.map(each => each.id)),
      component: PANEL_COMPONENTS.map,
      title: this.mapName(mapId),
      params: { mapId },
      position: this.#placeForMap(api, options),
    });
  }

  /**
   * Opens a blueprint as a small map in a tab of its own, or brings forward the one already open, as the Blueprints
   * section's Open asks: its tiles painted and its events edited as a map's are, its own history beside its save and
   * renames. It opens wherever a map would. A blueprint whose id no map id can spell, which only a hand-edited blueprints
   * file holds, is said rather than opened.
   * @param {string} blueprintId The blueprint.
   * @param {OpenMapOptions} options Where and how.
   * @returns {IDockviewPanel | null} The panel showing it, or null before the dock is ready or for a blueprint that cannot
   * open.
   */
  openBlueprint(blueprintId: string, options: OpenMapOptions = {}): IDockviewPanel | null
  {
    if (isMappableBlueprintId(blueprintId) === false)
    {
      this.notify(`"${this.blueprintName(blueprintId)}" can't be opened: its id in the blueprints file is too long.`, 'error');
      return null;
    }

    return this.openMap(blueprintMapId(blueprintId), options);
  }

  /**
   * Closes every tab of a blueprint deleted on disk, lets go of the blueprint opened as a map, and says why when a tab was
   * open: nothing is left to show, and an undo here cannot bring back what the disk took away. What the workspace does
   * when the window's blueprint tabs hand one over (see BlueprintMapFollower's onDeletedOnDisk).
   * @param {string} blueprintId The blueprint.
   * @param {string} name Its last name, or nothing when it was never known.
   */
  closeBlueprintDeletedOnDisk(blueprintId: string, name: string): void
  {
    const mapId = blueprintMapId(blueprintId);
    const tabs = this.#dockview === null
      ? []
      : this.#dockview.panels.filter(panel => panel.api.component === PANEL_COMPONENTS.map && isMapPanelParams(panel.params) && panel.params.mapId === mapId);
    tabs.forEach(tab => tab.api.close());
    this.services.hub.release(mapDocumentKey(mapId));
    if (tabs.length > 0)
    {
      this.notify(name === '' ? 'A blueprint was deleted on disk, so its tab was closed.' : `"${name}" was deleted on disk, so its tab was closed.`);
    }
  }

  /**
   * Shows one event of a map, as a click on it in the events list asks: it becomes the selection, and every view of its
   * map centres on it at the zoom that view has. When no view of the map is on screen, one hidden behind another tab
   * comes to the front first, unless it shares a group with the panel asking, which would put the list itself out of
   * sight. A map with no view open at all opens in the centre with the event picked out, as one the data editor asks
   * for does.
   * @param {number} mapId The map.
   * @param {number} eventId The event.
   * @param {string} askingPanelId The panel asking, which stays on screen.
   */
  revealEvent(mapId: number, eventId: number, askingPanelId: string): void
  {
    const api = this.#dockview;
    if (api === null)
    {
      return;
    }

    const views = api.panels.filter(panel => panel.api.component === PANEL_COMPONENTS.map && isMapPanelParams(panel.params) && panel.params.mapId === mapId);
    if (views.length === 0)
    {
      this.openMap(mapId, { focusEventId: eventId });
      return;
    }

    // a view already on screen is enough; otherwise the first hidden one outside the asking panel's group comes forward.
    if (views.some(view => view.api.isVisible) === false)
    {
      const asking = api.getPanel(askingPanelId)?.group ?? null;
      views.find(view => view.group !== asking)?.api.setActive();
    }

    this.selection.reveal(mapId, eventId);
  }

  /**
   * Opens an event's full editor in its own window, or brings forward the window already editing it, as a double-click
   * on it in the events list asks; a window the page was not allowed to open is said so.
   * @param {number} mapId The map the event is on.
   * @param {number} eventId The event.
   */
  openEvent(mapId: number, eventId: number): void
  {
    if (openEventWindow(this.services.shell, mapId, eventId) === 'blocked')
    {
      this.notify('The event\'s window was blocked; allow pop-ups for the editor to open it.', 'error');
    }
  }

  /**
   * Works out where a new map panel goes: where it was dropped, split beside the centre when asked, and otherwise into
   * the centre, as a tab. A torn-out window was torn out for what it shows, so new maps never open inside one.
   * @param {DockviewApi} api The dock.
   * @param {OpenMapOptions} options Where it was asked for.
   * @returns {Parameters<DockviewApi['addPanel']>[0]['position']} The position.
   */
  #placeForMap(api: DockviewApi, options: OpenMapOptions): Parameters<DockviewApi['addPanel']>[0]['position']
  {
    if (options.at !== undefined)
    {
      return options.at.group === undefined
        ? { direction: options.at.direction === 'within' ? 'right' : options.at.direction }
        : { referenceGroup: options.at.group, direction: options.at.direction };
    }

    // the centre never closes once the dock is laid out; before then there is nowhere better than the dock's edge.
    const centre = centreOf(api);
    if (centre === null)
    {
      return { direction: 'right' };
    }

    return { referenceGroup: centre, direction: options.beside === true ? 'right' : 'within' };
  }

  /**
   * Reads a map's name from the tree, for titles; for a blueprint opened as a map, the blueprint's own.
   * @param {number} mapId The map, or the id a blueprint opened as a map takes.
   * @returns {string} Its name, or "Map N" while the tree is not held or lacks it.
   */
  mapName(mapId: number): string
  {
    const blueprintId = blueprintIdOfMap(mapId);
    if (blueprintId !== null)
    {
      return this.blueprintName(blueprintId);
    }

    const { hub } = this.services;
    const row = hub.has(MAP_INFOS_KEY)
      ? (hub.document(MAP_INFOS_KEY).valueAt([ mapId ]) as RmmzMapInfo | null | undefined)
      : null;
    return row === null || row === undefined
      ? documentLabel(`map:${mapId}`)
      : row.name;
  }

  /**
   * Reads a blueprint's name, for titles: as the blueprints hold it, or, for one they no longer hold, deleted or its save
   * undone, the name its own history last gave it, so its history keeps the name it was known by.
   * @param {string} blueprintId The blueprint.
   * @returns {string} Its name, or its id when neither the blueprints nor its history name it.
   */
  blueprintName(blueprintId: string): string
  {
    const { hub } = this.services;
    const blueprint = hub.has(BLUEPRINTS_DOCUMENT)
      ? blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId)
      : null;
    if (blueprint !== null)
    {
      return blueprint.name;
    }

    // the steps done, newest first, hold the name it last had; failing those, the next to redo, as an undone save does.
    const { rows } = hub.history(blueprintHistoryKey(blueprintId));
    const ordered = [ ...rows.filter(row => row.done).reverse(), ...rows.filter(row => row.done === false) ];
    const steps = ordered.flatMap(row => hub.knownStep(row.id) ?? []);
    return nameInSteps(steps, blueprintId) ?? blueprintId;
  }

  //endregion dock

  //region history and saving

  /**
   * Undoes the newest step of the history with focus.
   * @returns {Promise<void>} Settles once done.
   */
  async undo(): Promise<void>
  {
    const key = this.#state.activeHistory;
    if (key !== null)
    {
      this.#report(await this.router.undo(key));
    }
  }

  /**
   * Redoes the most recently undone step of the history with focus.
   * @returns {Promise<void>} Settles once done.
   */
  async redo(): Promise<void>
  {
    const key = this.#state.activeHistory;
    if (key !== null)
    {
      this.#report(await this.router.redo(key));
    }
  }

  /**
   * Hands undo to a history, as an edit made from a panel that owns none must: the stack view's fixes go to their map's
   * history, and the passability editor's edits to the tilesets', so the next undo takes back what was just done.
   * @param {HistoryKey} key The history.
   */
  focusHistory(key: HistoryKey): void
  {
    if (this.#state.activeHistory !== key)
    {
      this.#update({ activeHistory: key });
    }
  }

  /**
   * Moves a history to just after one of its steps: a click on a history panel row.
   * @param {HistoryKey} key The history.
   * @param {string | null} stepId The step, or null for before the first.
   * @returns {Promise<HistoryOutcome>} What it came to.
   */
  async jumpTo(key: HistoryKey, stepId: string | null): Promise<HistoryOutcome>
  {
    const outcome = await this.router.jumpTo(key, stepId);
    this.#report(outcome);
    return outcome;
  }

  /**
   * Makes the window ask before it closes while placements of blueprints would be lost with it, as unsaved edits are
   * asked about by the window's own guard: a write on its way, or one the server refused, waiting to be tried again with
   * the next save; or a map's unsaved placements that no other window keeping the record holds, though a window without
   * the record may share the map, as an event window does, and save its file after this one has gone. No document's
   * unsaved mark shows either, since the record is never unsaved itself, and the window's own guard lets a map shared
   * with an event window go without asking.
   * @param {CloseTarget} target The window.
   * @returns {() => void} Removes the guard.
   */
  guardClose(target: CloseTarget): () => void
  {
    const { placements } = this;
    return installCloseGuard(target, () => placements !== null
      && (placements.hasUnwritten() || placements.placementsUnsavedOnlyHere().length > 0));
  }

  /**
   * Saves every document holding unsaved edits, leaving any in conflict for the person to settle first. What was saved
   * is told in maps: the blueprints are saved along with them but are not maps, and are not counted as any. The record of
   * where blueprints are placed never holds unsaved edits of its own: each map's placements go to disk with that map.
   * Placements a refused write left waiting are tried again too, and nothing is called saved until they land; when they
   * cannot, the author has already heard why.
   *
   * A blueprint is never saved by hand: every change to one is written at once, with every copy it reached, a moment after
   * it is made (see BlueprintWriter), and so is every transfer pair (see PairWriter). Saving waits for whatever of those
   * is still on its way first, so a map holding a copy or an end of a pair is saved over what was written to it, never
   * under it. A blueprint opened as a map that still holds changes after that is one whose change could not be written,
   * which the author has heard about already; it is not called saved.
   * @returns {Promise<void>} Settles once every save has finished, the placements' and the blueprints' writes included.
   */
  async saveAll(): Promise<void>
  {
    const { hub, blueprintWriter, pairWriter } = this.services;
    await blueprintWriter?.whenWritten();
    await pairWriter?.whenWritten();
    const unsaved = hub.dirtyKeys();
    const blueprints = unsaved.filter(key => parseDocumentKey(key).kind === 'blueprint-map').length;
    const dirty = unsaved.filter(key => parseDocumentKey(key).kind !== 'blueprint-map');
    const ready = dirty.filter(key => hub.isConflicted(key) === false);
    const failed: string[] = [];
    for (const key of ready)
    {
      try
      {
        await hub.save(key);
      }
      catch
      {
        failed.push(documentLabel(key));
      }
    }

    // a save is when placements a refused write left waiting are tried again, with nothing dirty to carry them.
    this.placements?.retry();
    await this.placements?.whenWritten();
    const unwritten = this.placements?.hasUnwritten() === true;

    const held = dirty.length - ready.length;
    if (failed.length > 0)
    {
      this.notify(`Could not save ${failed.join(', ')}.`, 'error');
      return;
    }

    // the write that failed already said why, which "Everything is saved." would only cover up.
    if (unwritten)
    {
      return;
    }

    if (held > 0)
    {
      this.notify(`Saved ${ready.length}; ${held} waiting for a choice about changes made elsewhere.`, 'error');
      return;
    }

    const maps = ready.filter(key => parseDocumentKey(key).kind === 'map').length;
    const saved = maps === 1 ? 'Saved 1 map' : `Saved ${maps} maps`;
    if (blueprints > 0)
    {
      this.notify(maps === 0 ? 'A change to a blueprint is not written yet; everything else is saved.' : `${saved}; a change to a blueprint is not written yet.`);
      return;
    }

    this.notify(maps === 0 ? 'Everything is saved.' : `${saved}.`);
  }

  /**
   * Shows why a history could not move, unless it merely had nothing to move, and what a move left as it stands, when it
   * left copies of a blueprint changed since.
   * @param {HistoryOutcome} outcome What an undo, redo or jump came to.
   */
  #report(outcome: HistoryOutcome): void
  {
    if (outcome.ok && outcome.message !== undefined)
    {
      this.notify(outcome.message);
      return;
    }

    if (outcome.ok === false && outcome.nothing === false)
    {
      this.notify(outcome.message, outcome.alarm === true ? 'alarm' : 'error');
    }
  }

  //endregion history and saving

  //region tree

  /**
   * Picks maps in the tree. Picking one alone makes it the map the properties panel and the workspace's palette show.
   * @param {readonly number[]} mapIds The maps.
   */
  selectTreeMaps(mapIds: readonly number[]): void
  {
    this.#update(mapIds.length === 1
      ? { treeSelection: [ ...mapIds ], currentMapId: mapIds[0], paletteMapId: mapIds[0] }
      : { treeSelection: [ ...mapIds ] });
  }

  /**
   * Starts renaming a map in the tree, or stops.
   * @param {number | null} mapId The map, or null to stop.
   */
  setRenaming(mapId: number | null): void
  {
    this.#update({ renaming: mapId });
  }

  /**
   * Creates a map under a parent, selects it and starts renaming it.
   * @param {number} parentId The parent, or {@link TREE_ROOT}.
   * @returns {Promise<void>} Settles once done.
   */
  async createMap(parentId: number): Promise<void>
  {
    const outcome = await this.#treeCall(tree => tree.create(parentId));
    if (outcome !== null && outcome.ok)
    {
      this.#update({ renaming: outcome.selection[0] ?? null });
    }
  }

  /**
   * Renames a map.
   * @param {number} mapId The map.
   * @param {string} name The new name.
   * @returns {Promise<void>} Settles once done.
   */
  async renameMap(mapId: number, name: string): Promise<void>
  {
    this.#update({ renaming: null });
    await this.#treeCall(tree => tree.rename(mapId, name));
  }

  /**
   * Moves maps, with their branches.
   * @param {readonly number[]} mapIds The maps.
   * @param {TreePlace} place Where they land.
   * @returns {Promise<void>} Settles once done.
   */
  async moveMaps(mapIds: readonly number[], place: TreePlace): Promise<void>
  {
    await this.#treeCall(tree => tree.move(mapIds, place));
  }

  /**
   * Deletes maps, with their branches and files. One undo brings them all back.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<void>} Settles once done.
   */
  async deleteMaps(mapIds: readonly number[]): Promise<void>
  {
    const outcome = await this.#treeCall(tree => tree.remove(mapIds));
    if (outcome !== null && outcome.ok)
    {
      this.#update({ treeSelection: [] });
    }
  }

  /**
   * Copies maps to the clipboard, each with its file as it stands, and the placements of blueprints on it, once the
   * record of them is held.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<void>} Settles once copied.
   */
  async copyMaps(mapIds: readonly number[]): Promise<void>
  {
    if (this.tree === null || mapIds.length === 0)
    {
      return;
    }

    await this.#placementsOpened;
    const outcome = await this.tree.copy(mapIds);
    if (outcome.ok === false)
    {
      this.notify(outcome.message, 'error');
      return;
    }

    this.#update({ clipboard: { kind: 'copy', copies: outcome.copies } });
    this.notify(outcome.copies.length === 1 ? `Copied "${outcome.copies[0].name}".` : `Copied ${outcome.copies.length} maps.`);
  }

  /**
   * Marks maps to move on the next paste; nothing moves until then.
   * @param {readonly number[]} mapIds The maps.
   */
  cutMaps(mapIds: readonly number[]): void
  {
    if (mapIds.length > 0)
    {
      this.#update({ clipboard: { kind: 'cut', mapIds: [ ...mapIds ] } });
    }
  }

  /**
   * Forgets what the clipboard holds.
   */
  clearClipboard(): void
  {
    this.#update({ clipboard: null });
  }

  /**
   * Pastes the clipboard under a map: copies become new maps, and cut maps move there, keeping their ids so every
   * transfer to them still arrives.
   * @param {number} parentId The map to paste under, or {@link TREE_ROOT}.
   * @returns {Promise<void>} Settles once done.
   */
  async paste(parentId: number): Promise<void>
  {
    const { clipboard } = this.#state;
    if (clipboard === null)
    {
      return;
    }

    if (clipboard.kind === 'cut')
    {
      const outcome = await this.#treeCall(tree => tree.move(clipboard.mapIds, { parentId, beforeId: null }));
      if (outcome !== null && outcome.ok)
      {
        this.#update({ clipboard: null });
      }

      return;
    }

    await this.#treeCall(tree => tree.paste(clipboard.copies, parentId));
  }

  /**
   * Duplicates maps, each copy right after its original.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<void>} Settles once done.
   */
  async duplicateMaps(mapIds: readonly number[]): Promise<void>
  {
    await this.#treeCall(tree => tree.duplicate(mapIds));
  }

  /**
   * Runs a tree operation, selecting what it hands back and showing why when it refuses. It waits, first, for the
   * window to hold the record of where blueprints are placed, which a map deleted, duplicated or pasted changes in the
   * same step.
   * @param {(tree: MapTreeService) => Promise<TreeOutcome>} call The operation.
   * @returns {Promise<TreeOutcome | null>} What it came to, or null without a tree service.
   */
  async #treeCall(call: (tree: MapTreeService) => Promise<TreeOutcome>): Promise<TreeOutcome | null>
  {
    if (this.tree === null)
    {
      this.notify('The map tree needs the project\'s server to change.', 'error');
      return null;
    }

    await this.#placementsOpened;
    const outcome = await call(this.tree);
    if (outcome.ok === false)
    {
      this.notify(outcome.message, outcome.alarm === true ? 'alarm' : 'error');
      return outcome;
    }

    // the tree is where the step lives, so its history is the one undo acts on next.
    this.#update({ activeHistory: TREE_HISTORY_KEY });
    if (outcome.selection.length > 0)
    {
      this.selectTreeMaps(outcome.selection);
    }

    return outcome;
  }

  //endregion tree

  //region notices

  /**
   * Shows a short message.
   * @param {string} text The message.
   * @param {NoticeSeverity} severity How it reads.
   */
  notify(text: string, severity: NoticeSeverity = 'info'): void
  {
    this.#noticeCount += 1;
    this.#update({ notice: { id: this.#noticeCount, text, severity } });
  }

  /**
   * Hides a message, if it is still the one showing.
   * @param {number} id The message's id.
   */
  dismissNotice(id: number): void
  {
    if (this.#state.notice?.id === id)
    {
      this.#update({ notice: null });
    }
  }

  //endregion notices
}

export { TREE_ROOT, WorkspaceController };
export type { CellFocus, EventFocus, MapClipboard, Notice, NoticeSeverity, OpenMapOptions, WorkspaceState };
