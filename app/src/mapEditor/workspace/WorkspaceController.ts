import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview-react';
import { EventSelection } from '../core/events/EventSelection.ts';
import { mapHistoryKey, TREE_HISTORY_KEY, type HistoryKey } from '../core/history/historyKeys.ts';
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
  SINGLE_PANEL_IDS,
  type PanelDirection,
} from '../core/workspace/panels.ts';
import { MAP_INFOS_KEY, mapDocumentKey } from '../core/model/documentKeys.ts';
import type { RmmzMapInfo } from '../core/model/rmmzTypes.ts';
import type { MapEditorServices } from '../services/MapEditorServices.ts';
import { documentLabel } from '../views/documentLabels.ts';
import { POPOUT_URL } from './defaultLayout.ts';
import { PopoutKeeper } from './PopoutKeeper.ts';

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
  readonly eventFocus: Readonly<Record<number, number>>;
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
   * Open it beside the maps already open, splitting the workspace, rather than as another tab among them.
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
   * Tears panels out into windows of their own, and puts them back where they came from; maps with no place of their
   * own go back among the maps.
   */
  readonly popouts = new PopoutKeeper({
    popoutUrl: POPOUT_URL,
    mapsGroup: returning => (this.#dockview === null ? null : this.#mapGroup(this.#dockview, returning)),
  });

  #dockview: DockviewApi | null = null;

  #state: WorkspaceState = {
    activeHistory: null,
    currentMapId: null,
    treeSelection: [],
    renaming: null,
    clipboard: null,
    notice: null,
    eventFocus: {},
  };

  #listeners = new Set<() => void>();

  #lastMapGroup: DockviewGroupPanel | null = null;

  #noticeCount = 0;

  /**
   * @param {MapEditorServices} services The window's services.
   */
  constructor(services: MapEditorServices)
  {
    this.services = services;
    this.tree = services.api === null
      ? null
      : new MapTreeService({ hub: services.hub, api: services.api, openDocument: key => services.openDocument(key) });
    this.router = new HistoryRouter(services.hub, this.tree);
    this.layouts = new LayoutStore({ api: services.api });

    // a map the window lets go of, such as one deleted from the tree, takes its selected events with it, so the
    // selection only ever names a map this window holds.
    services.hub.subscribe(event =>
    {
      const { mapId } = this.selection.get();
      if (event.type === 'released' && mapId !== null && event.document === mapDocumentKey(mapId))
      {
        this.selection.clear();
      }
    });
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
   * Follows focus from panel to panel: a map panel makes its map current and its history the one undo acts on;
   * the tree and the properties panel hand undo their own; the rest leave it where it was.
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
      this.#lastMapGroup = panel.group;
      this.#update({ currentMapId: panel.params.mapId, activeHistory: mapHistoryKey(panel.params.mapId) });
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

    if (options.focusEventId !== undefined && options.focusEventId !== null)
    {
      this.#update({ eventFocus: { ...this.#state.eventFocus, [mapId]: options.focusEventId } });
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

    const panel = api.addPanel({
      id: mapPanelId(mapId, api.panels.map(each => each.id)),
      component: PANEL_COMPONENTS.map,
      title: this.mapName(mapId),
      params: { mapId },
      position: this.#placeForMap(api, options),
    });

    // the start panel only holds the middle of the workspace until a map is open there.
    api.getPanel(SINGLE_PANEL_IDS.start)?.api.close();
    return panel;
  }

  /**
   * Works out where a new map panel goes: where it was dropped, beside the maps, among them, in place of the start
   * panel, or, with none of those, right of the tree.
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

    const mapGroup = this.#mapGroup(api);
    if (mapGroup !== null)
    {
      return { referenceGroup: mapGroup, direction: options.beside === true ? 'right' : 'within' };
    }

    if (api.getPanel(SINGLE_PANEL_IDS.start) !== undefined)
    {
      return { referencePanel: SINGLE_PANEL_IDS.start, direction: 'within' };
    }

    return api.getPanel(SINGLE_PANEL_IDS.mapTree) === undefined
      ? { direction: 'right' }
      : { referencePanel: SINGLE_PANEL_IDS.mapTree, direction: 'right' };
  }

  /**
   * Finds the group maps open into: in the main window, the one that last showed a focused map, or any holding a
   * map. A torn-out window was torn out for what it shows, so new maps never open inside one. Maps on their way back
   * from a closed window are passed over, since the dock may have dropped them anywhere.
   * @param {DockviewApi} api The dock.
   * @param {ReadonlySet<string>} returning The panels on their way back, by id.
   * @returns {DockviewGroupPanel | null} The group, or null when no map is open in the main window.
   */
  #mapGroup(api: DockviewApi, returning: ReadonlySet<string> = new Set()): DockviewGroupPanel | null
  {
    const groups = api.panels
      .filter(panel => panel.api.component === PANEL_COMPONENTS.map && panel.group.api.location.type === 'grid' && returning.has(panel.id) === false)
      .map(panel => panel.group);
    if (this.#lastMapGroup !== null && groups.includes(this.#lastMapGroup))
    {
      return this.#lastMapGroup;
    }

    return groups[0] ?? null;
  }

  /**
   * Reads a map's name from the tree, for titles.
   * @param {number} mapId The map.
   * @returns {string} Its name, or "Map N" while the tree is not held or lacks it.
   */
  mapName(mapId: number): string
  {
    const { hub } = this.services;
    const row = hub.has(MAP_INFOS_KEY)
      ? (hub.document(MAP_INFOS_KEY).valueAt([ mapId ]) as RmmzMapInfo | null | undefined)
      : null;
    return row === null || row === undefined
      ? documentLabel(`map:${mapId}`)
      : row.name;
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
   * Saves every document holding unsaved edits, leaving any in conflict for the person to settle first.
   * @returns {Promise<void>} Settles once every save has finished.
   */
  async saveAll(): Promise<void>
  {
    const { hub } = this.services;
    const dirty = hub.dirtyKeys();
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

    const held = dirty.length - ready.length;
    if (failed.length > 0)
    {
      this.notify(`Could not save ${failed.join(', ')}.`, 'error');
      return;
    }

    if (held > 0)
    {
      this.notify(`Saved ${ready.length}; ${held} waiting for a choice about changes made elsewhere.`, 'error');
      return;
    }

    this.notify(ready.length === 0 ? 'Everything is saved.' : `Saved ${ready.length === 1 ? '1 map' : `${ready.length} maps`}.`);
  }

  /**
   * Shows why a history could not move, unless it merely had nothing to move.
   * @param {HistoryOutcome} outcome What an undo, redo or jump came to.
   */
  #report(outcome: HistoryOutcome): void
  {
    if (outcome.ok === false && outcome.nothing === false)
    {
      this.notify(outcome.message, outcome.alarm === true ? 'alarm' : 'error');
    }
  }

  //endregion history and saving

  //region tree

  /**
   * Picks maps in the tree. Picking one alone makes it the map the properties panel shows.
   * @param {readonly number[]} mapIds The maps.
   */
  selectTreeMaps(mapIds: readonly number[]): void
  {
    this.#update(mapIds.length === 1
      ? { treeSelection: [ ...mapIds ], currentMapId: mapIds[0] }
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
   * Copies maps to the clipboard, each with its file as it stands.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<void>} Settles once copied.
   */
  async copyMaps(mapIds: readonly number[]): Promise<void>
  {
    if (this.tree === null || mapIds.length === 0)
    {
      return;
    }

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
   * Runs a tree operation, selecting what it hands back and showing why when it refuses.
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
export type { MapClipboard, Notice, NoticeSeverity, OpenMapOptions, WorkspaceState };
