import { describe, expect, it, vi } from 'vitest';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { MapEditorApiError, type MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { apiDocumentStore } from '../../../src/mapEditor/core/api/apiDocumentStore.ts';
import { DocumentHub, type DocumentStore } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapInfo } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { TREE_ROOT, WorkspaceController } from '../../../src/mapEditor/workspace/WorkspaceController.ts';
import { buildMapJson } from '../support/fixtures.ts';
import { buildTreeRows } from '../support/treeFixtures.ts';

/*
 * The workspace controller is what every panel acts through, and it owes them the shell's rules. Undo follows focus:
 * a map panel hands undo its map's history and makes its map the one the properties show, the tree and the
 * properties hand undo theirs, and the history panel leaves it alone. A map asked for comes forward where it is
 * already open (bringing its torn-out window with it), and otherwise opens in the centre, the main window's group
 * holding the start panel, in front of the start panel, which stays to hold it: wherever the last map focused sits,
 * never inside a torn-out window and never beside the tree, so a map never lands in a sliver of a side column. Asked
 * to, it splits beside the centre; dropped, it opens where it landed; with no centre yet, at the dock's edge. Cut then
 * paste moves maps and keeps their ids; copy then paste makes new ones. Save saves every document with unsaved edits
 * and leaves any in conflict for the person to settle.
 *
 * The dock here is a stand-in that records what is added and activated; the tree runs on the real tree service over
 * an in-memory server.
 */
describe('WorkspaceController', () =>
{
  /**
   * A stand-in panel group, docked in the main window or torn out.
   */
  type FakeGroup = { id: string; api: { location: { type: string } } };

  /**
   * One panel a stand-in dock starts with: its id, kind, parameters and group, and whether it is on screen rather than
   * behind another tab, which it is unless told otherwise.
   */
  type PanelSpec = { id: string; component: string; params?: object; group: FakeGroup; visible?: boolean };

  /**
   * A stand-in dock holding panels, recording every panel added and every panel activated.
   * @param {PanelSpec[]} seeded The panels it starts with.
   * @returns {object} The dock, and what it recorded.
   */
  const buildDock = (seeded: PanelSpec[] = []) =>
  {
    const activated: string[] = [];
    const focused: string[] = [];
    const closed: string[] = [];
    const added: { id: string; position: unknown }[] = [];
    const panels: IDockviewPanel[] = [];

    /**
     * Makes one stand-in panel.
     * @param {PanelSpec} spec The panel's id, kind, parameters, group and whether it is on screen.
     * @returns {IDockviewPanel} The panel.
     */
    const makePanel = (spec: PanelSpec): IDockviewPanel =>
    {
      const panel = {
        id: spec.id,
        params: spec.params,
        group: spec.group,
        api: {
          component: spec.component,
          location: spec.group.api.location,
          isVisible: spec.visible ?? true,
          setActive: () => activated.push(spec.id),
          getWindow: () => ({ focus: () => focused.push(spec.id) }),
          close: () =>
          {
            closed.push(spec.id);
            panels.splice(panels.indexOf(panel as unknown as IDockviewPanel), 1);
          },
        },
      };
      return panel as unknown as IDockviewPanel;
    };

    seeded.forEach(spec => panels.push(makePanel(spec)));
    const api = {
      get panels()
      {
        return panels;
      },
      getPanel: (id: string) => panels.find(panel => panel.id === id),
      addPanel: (options: { id: string; component: string; params?: object; position: unknown }) =>
      {
        added.push({ id: options.id, position: options.position });
        const group: FakeGroup = { id: `group-of-${options.id}`, api: { location: { type: 'grid' } } };
        const panel = makePanel({ id: options.id, component: options.component, params: options.params, group });
        panels.push(panel);
        return panel;
      },
    } as unknown as DockviewApi;

    return { api, activated, focused, closed, added };
  };

  /**
   * A controller over a hub holding two maps, the tree on an in-memory server, and a store recording saves.
   * @returns {object} The controller, the hub, the server's files and the saves.
   */
  const buildController = () =>
  {
    const maps = new Map<number, RmmzMap>([ 1, 2, 3, 5, 6 ].map(id => [ id, { ...buildMapJson(), displayName: `file ${id}` } ]));
    const state = { infos: buildTreeRows() as (RmmzMapInfo | null)[] };
    const api = {
      clientId: 'window-a',
      loadMap: async (mapId: number) =>
      {
        const map = maps.get(mapId);
        if (map === undefined)
        {
          throw new MapEditorApiError(`GET /api/maps/${mapId} answered 404`, 404);
        }

        return structuredClone(map);
      },
      loadMapFile: async (mapId: number) => (maps.has(mapId) ? JSON.stringify(maps.get(mapId)) : null),
      saveMap: async (mapId: number, map: RmmzMap) =>
      {
        maps.set(mapId, structuredClone(map));
      },
      createMap: async (mapId: number, map: RmmzMap) =>
      {
        maps.set(mapId, structuredClone(map));
      },
      restoreMapFile: async (mapId: number, text: string) =>
      {
        maps.set(mapId, JSON.parse(text) as RmmzMap);
      },
      deleteMap: async (mapId: number) =>
      {
        maps.delete(mapId);
      },
      loadMapInfos: async () => structuredClone(state.infos),
      saveMapInfos: async (infos: readonly (RmmzMapInfo | null)[]) =>
      {
        state.infos = structuredClone([ ...infos ]);
      },
    } as unknown as MapEditorApi;
    const saves: string[] = [];
    const store: DocumentStore = {
      load: apiDocumentStore(api).load,
      save: async (key, content) =>
      {
        saves.push(key);
        if (key === 'map:2')
        {
          throw new Error('the disk is full');
        }

        await apiDocumentStore(api).save(key, content);
      },
    };
    const hub = new DocumentHub({ clientId: 'window-a', store });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    const services = { hub, api, openDocument: (key: string) => hub.load(key as never) } as unknown as MapEditorServices;
    return { controller: new WorkspaceController(services), hub, api, maps, state, saves };
  };

  const MAIN: FakeGroup = { id: 'main-maps', api: { location: { type: 'grid' } } };
  const TORN: FakeGroup = { id: 'torn-out', api: { location: { type: 'popout' } } };
  const SIDE: FakeGroup = { id: 'side', api: { location: { type: 'grid' } } };

  describe('following focus', () =>
  {
    it('hands undo to a focused map and shows its properties', () =>
    {
      // Arrange.
      const { controller } = buildController();
      const { api } = buildDock([ { id: 'map-12', component: 'map', params: { mapId: 12 }, group: MAIN } ]);

      // Act.
      controller.panelActivated(api.getPanel('map-12'));

      // Assert.
      expect([ controller.getState().activeHistory, controller.getState().currentMapId ])
        .toStrictEqual([ 'map:12', 12 ]);
    });

    it('hands undo to the tree and to the properties, and leaves it alone for the history panel', () =>
    {
      // Arrange.
      const { controller } = buildController();
      const { api } = buildDock([
        { id: 'map-tree', component: 'map-tree', group: SIDE },
        { id: 'history', component: 'history', group: SIDE },
        { id: 'map-properties', component: 'map-properties', group: SIDE },
      ]);
      controller.selectTreeMaps([ 5 ]);

      // Act.
      controller.panelActivated(api.getPanel('map-tree'));
      const afterTree = controller.getState().activeHistory;
      controller.panelActivated(api.getPanel('history'));
      const afterHistory = controller.getState().activeHistory;
      controller.panelActivated(api.getPanel('map-properties'));
      controller.panelActivated(undefined);

      // Assert.
      expect([ afterTree, afterHistory, controller.getState().activeHistory ])
        .toStrictEqual([ 'tree', 'tree', 'map:5' ]);
    });

    it('keeps the workspace\'s palette on the main window\'s map while a torn-out map has focus, the properties following both', () =>
    {
      // Arrange: a map docked in the main window, and one torn out with a palette of its own.
      const { controller } = buildController();
      const { api } = buildDock([
        { id: 'map-12', component: 'map', params: { mapId: 12 }, group: MAIN },
        { id: 'map-40', component: 'map', params: { mapId: 40 }, group: TORN },
      ]);
      controller.panelActivated(api.getPanel('map-12'));

      // Act.
      controller.panelActivated(api.getPanel('map-40'));

      // Assert.
      expect([ controller.getState().currentMapId, controller.getState().paletteMapId, controller.getState().activeHistory ])
        .toStrictEqual([ 40, 12, 'map:40' ]);
    });

    it('makes a map picked alone in the tree the one the palette shows too', () =>
    {
      // Arrange.
      const { controller } = buildController();

      // Act.
      controller.selectTreeMaps([ 3 ]);

      // Assert.
      expect([ controller.getState().currentMapId, controller.getState().paletteMapId ])
        .toStrictEqual([ 3, 3 ]);
    });

    it('makes a map picked alone in the tree the one the properties show, and not several', () =>
    {
      // Arrange.
      const { controller } = buildController();
      controller.selectTreeMaps([ 3 ]);

      // Act.
      controller.selectTreeMaps([ 1, 6 ]);

      // Assert.
      expect([ controller.getState().treeSelection, controller.getState().currentMapId ])
        .toStrictEqual([ [ 1, 6 ], 3 ]);
    });

    it('hands undo to a history an edit from a panel without one was recorded in, telling listeners once', () =>
    {
      // Arrange: a map focused, and a listener counting updates.
      const { controller } = buildController();
      const { api } = buildDock([ { id: 'map-12', component: 'map', params: { mapId: 12 }, group: MAIN } ]);
      controller.panelActivated(api.getPanel('map-12'));
      let updates = 0;
      controller.subscribe(() =>
      {
        updates += 1;
      });

      // Act: the passability editor's edit goes to the tilesets, twice over.
      controller.focusHistory('tilesets');
      controller.focusHistory('tilesets');

      // Assert: and the map the properties show stays.
      expect([ controller.getState().activeHistory, controller.getState().currentMapId, updates ])
        .toStrictEqual([ 'tilesets', 12, 1 ]);
    });
  });

  describe('opening maps', () =>
  {
    it('brings forward a map already open, and its torn-out window with it', () =>
    {
      // Arrange.
      const { controller } = buildController();
      const dock = buildDock([ { id: 'map-12', component: 'map', params: { mapId: 12 }, group: TORN } ]);
      controller.attach(dock.api);

      // Act.
      controller.openMap(12, { focusEventId: 5 });

      // Assert.
      expect([ dock.activated, dock.focused, dock.added, controller.getState().eventFocus ])
        .toStrictEqual([ [ 'map-12' ], [ 'map-12' ], [], { 12: { eventId: 5, request: 1 } } ]);
    });

    it('makes every ask for an event a new one, the same event asked for again included, and leaves other maps\' alone', () =>
    {
      // Arrange: map 40 was asked for at event 2 first.
      const { controller } = buildController();
      const dock = buildDock([ { id: 'map-12', component: 'map', params: { mapId: 12 }, group: MAIN } ]);
      controller.attach(dock.api);
      controller.openMap(40, { focusEventId: 2 });

      // Act: the same link in the data editor clicked twice, then a plain open naming no event.
      controller.openMap(12, { focusEventId: 5 });
      const { 12: first } = controller.getState().eventFocus;
      controller.openMap(12, { focusEventId: 5 });
      const { 12: second } = controller.getState().eventFocus;
      controller.openMap(12);

      // Assert.
      expect([ first, second, controller.getState().eventFocus ])
        .toStrictEqual([
          { eventId: 5, request: 2 },
          { eventId: 5, request: 3 },
          { 40: { eventId: 2, request: 1 }, 12: { eventId: 5, request: 3 } },
        ]);
    });

    it('opens a new map as a tab in the centre, not where the last map focused sits, and never in a torn-out window', () =>
    {
      // Arrange: the start panel holds the centre; a map sits in a side group of the main window, focused last, and
      // another in a torn-out window.
      const { controller } = buildController();
      const dock = buildDock([
        { id: 'start', component: 'start', group: MAIN },
        { id: 'map-12', component: 'map', params: { mapId: 12 }, group: TORN },
        { id: 'map-40', component: 'map', params: { mapId: 40 }, group: SIDE },
      ]);
      controller.attach(dock.api);
      controller.panelActivated(dock.api.getPanel('map-12'));
      controller.panelActivated(dock.api.getPanel('map-40'));

      // Act.
      controller.openMap(7);

      // Assert.
      expect(dock.added)
        .toStrictEqual([ { id: 'map-7', position: { referenceGroup: MAIN, direction: 'within' } } ]);
    });

    it('opens beside the centre on request, and another view of a map already open in the centre', () =>
    {
      // Arrange.
      const { controller } = buildController();
      const dock = buildDock([
        { id: 'start', component: 'start', group: MAIN },
        { id: 'map-40', component: 'map', params: { mapId: 40 }, group: SIDE },
      ]);
      controller.attach(dock.api);

      // Act.
      controller.openMap(7, { beside: true });
      controller.openMap(40, { newView: true });

      // Assert.
      expect(dock.added)
        .toStrictEqual([
          { id: 'map-7', position: { referenceGroup: MAIN, direction: 'right' } },
          { id: 'map-40-2', position: { referenceGroup: MAIN, direction: 'within' } },
        ]);
    });

    it('opens a map in front of the start panel, which stays to hold the centre', () =>
    {
      // Arrange.
      const { controller } = buildController();
      const dock = buildDock([ { id: 'start', component: 'start', group: MAIN }, { id: 'map-tree', component: 'map-tree', group: SIDE } ]);
      controller.attach(dock.api);

      // Act.
      controller.openMap(7);

      // Assert.
      expect([ dock.added, dock.closed, dock.api.getPanel('start') !== undefined ])
        .toStrictEqual([ [ { id: 'map-7', position: { referenceGroup: MAIN, direction: 'within' } } ], [], true ]);
    });

    it('opens at the dock\'s edge while there is no centre, never beside the tree, nor in a torn-out start panel\'s window', () =>
    {
      // Arrange: one dock with only the tree, and one whose start panel was torn out.
      const withTree = buildController();
      const treeDock = buildDock([ { id: 'map-tree', component: 'map-tree', group: SIDE } ]);
      withTree.controller.attach(treeDock.api);
      const strayed = buildController();
      const strayDock = buildDock([ { id: 'start', component: 'start', group: TORN } ]);
      strayed.controller.attach(strayDock.api);

      // Act.
      withTree.controller.openMap(7);
      strayed.controller.openMap(7);

      // Assert.
      expect([ treeDock.added[0].position, strayDock.added[0].position ])
        .toStrictEqual([ { direction: 'right' }, { direction: 'right' } ]);
    });

    it('opens a dropped map where it landed: in the group, or at the dock\'s edge', () =>
    {
      // Arrange.
      const { controller } = buildController();
      const dock = buildDock([ { id: 'map-40', component: 'map', params: { mapId: 40 }, group: MAIN } ]);
      controller.attach(dock.api);

      // Act.
      controller.openMap(7, { at: { group: MAIN as never, direction: 'below' } });
      controller.openMap(8, { at: { group: undefined, direction: 'within' } });

      // Assert.
      expect(dock.added.map(each => each.position))
        .toStrictEqual([ { referenceGroup: MAIN, direction: 'below' }, { direction: 'right' } ]);
    });

    it('opens nothing before the dock is ready', () =>
    {
      // Arrange.
      const { controller } = buildController();

      // Act.
      const panel = controller.openMap(7);

      // Assert.
      expect(panel)
        .toBeNull();
    });
  });

  describe('showing an event from the events list', () =>
  {
    /*
     * A click on a row of the events list selects its event and has every view of its map centre on it. A view already
     * on screen is enough; a view hidden behind another tab comes forward, unless it sits in the list's own group, which
     * would hide the list; and a map with no view opens at the event, as the data editor's link opens it.
     */

    /**
     * Follows the asks to bring an event into sight that a controller's selection makes.
     * @param {WorkspaceController} controller The controller.
     * @returns {string[]} The asks heard so far, as map:event, filled as they come.
     */
    const revealsOf = (controller: WorkspaceController): string[] =>
    {
      const heard: string[] = [];
      controller.selection.onReveal(request => heard.push(`${request.mapId}:${request.eventId}`));
      return heard;
    };

    it('selects the event and has its map\'s views centre on it, bringing nothing forward while one shows', () =>
    {
      // Arrange: map 12 on screen in the centre, and a hidden view of it in the list's group.
      const { controller } = buildController();
      const dock = buildDock([
        { id: 'map-12', component: 'map', params: { mapId: 12 }, group: MAIN },
        { id: 'map-12-2', component: 'map', params: { mapId: 12 }, group: TORN, visible: false },
        { id: 'events', component: 'events', group: SIDE },
      ]);
      controller.attach(dock.api);
      const heard = revealsOf(controller);

      // Act.
      controller.revealEvent(12, 5, 'events');

      // Assert.
      expect([ controller.selection.get(), heard, dock.activated, dock.added ])
        .toStrictEqual([ { mapId: 12, eventIds: [ 5 ] }, [ '12:5' ], [], [] ]);
    });

    it('brings forward a hidden view of the map, passing over one hidden in the list\'s own group', () =>
    {
      // Arrange: two views of map 12, both behind other tabs: one in the list's group, then one in the centre.
      const { controller } = buildController();
      const dock = buildDock([
        { id: 'map-12', component: 'map', params: { mapId: 12 }, group: SIDE, visible: false },
        { id: 'map-12-2', component: 'map', params: { mapId: 12 }, group: MAIN, visible: false },
        { id: 'map-40', component: 'map', params: { mapId: 40 }, group: MAIN, visible: true },
        { id: 'events', component: 'events', group: SIDE },
      ]);
      controller.attach(dock.api);
      const heard = revealsOf(controller);

      // Act.
      controller.revealEvent(12, 5, 'events');

      // Assert: map 40 showing is no view of map 12.
      expect([ dock.activated, heard ])
        .toStrictEqual([ [ 'map-12-2' ], [ '12:5' ] ]);
    });

    it('leaves the map\'s only view behind its tab when it shares the list\'s group, selecting the event all the same', () =>
    {
      // Arrange: map 12's one view is a tab behind the list.
      const { controller } = buildController();
      const dock = buildDock([
        { id: 'map-12', component: 'map', params: { mapId: 12 }, group: SIDE, visible: false },
        { id: 'events', component: 'events', group: SIDE },
      ]);
      controller.attach(dock.api);
      const heard = revealsOf(controller);

      // Act.
      controller.revealEvent(12, 5, 'events');

      // Assert.
      expect([ dock.activated, controller.selection.get(), heard ])
        .toStrictEqual([ [], { mapId: 12, eventIds: [ 5 ] }, [ '12:5' ] ]);
    });

    it('opens a map with no view at the event, as the data editor\'s link does, leaving the pick to its view', () =>
    {
      // Arrange: the centre, with map 40 open but not map 12.
      const { controller } = buildController();
      const dock = buildDock([
        { id: 'start', component: 'start', group: MAIN },
        { id: 'map-40', component: 'map', params: { mapId: 40 }, group: MAIN },
        { id: 'events', component: 'events', group: SIDE },
      ]);
      controller.attach(dock.api);
      const heard = revealsOf(controller);

      // Act.
      controller.revealEvent(12, 5, 'events');

      // Assert.
      expect([ dock.added, controller.getState().eventFocus, controller.selection.get(), heard ])
        .toStrictEqual([
          [ { id: 'map-12', position: { referenceGroup: MAIN, direction: 'within' } } ],
          { 12: { eventId: 5, request: 1 } },
          { mapId: null, eventIds: [] },
          [],
        ]);
    });

    it('does nothing before the dock is ready', () =>
    {
      // Arrange.
      const { controller } = buildController();
      const heard = revealsOf(controller);

      // Act.
      controller.revealEvent(12, 5, 'events');

      // Assert.
      expect([ controller.selection.get(), heard ])
        .toStrictEqual([ { mapId: null, eventIds: [] }, [] ]);
    });
  });

  describe('opening an event\'s window', () =>
  {
    /**
     * Builds a controller whose shell answers every window it is asked to open with the same result.
     * @param {string} result What the shell answers.
     * @returns {{ controller: WorkspaceController, opened: unknown[] }} The controller, and the windows asked for.
     */
    const withShell = (result: string) =>
    {
      const { hub, api } = buildController();
      const opened: unknown[] = [];
      const shell = {
        open: (request: unknown) =>
        {
          opened.push(request);
          return result;
        },
      };
      const services = { hub, api, shell, openDocument: (key: string) => hub.load(key as never) } as unknown as MapEditorServices;
      return { controller: new WorkspaceController(services), opened };
    };

    it('opens the event\'s window through the shell, saying nothing when it opens', () =>
    {
      // Arrange.
      const { controller, opened } = withShell('opened');

      // Act.
      controller.openEvent(12, 5);

      // Assert.
      expect([ opened, controller.getState().notice ])
        .toStrictEqual([ [ { path: '/map.html?view=event&map=12&event=5', name: 'jmz-event-12-5', width: 1240, height: 820 } ], null ]);
    });

    it('says so when the page was not allowed to open the window', () =>
    {
      // Arrange.
      const { controller } = withShell('blocked');

      // Act.
      controller.openEvent(12, 5);

      // Assert.
      expect([ controller.getState().notice?.text, controller.getState().notice?.severity ])
        .toStrictEqual([ 'The event\'s window was blocked; allow pop-ups for the editor to open it.', 'error' ]);
    });
  });

  describe('the tree', () =>
  {
    it('moves cut maps on paste, keeping their ids, and empties the clipboard', async () =>
    {
      // Arrange.
      const { controller, state } = buildController();
      controller.cutMaps([ 5 ]);

      // Act.
      await controller.paste(6);

      // Assert.
      expect([ state.infos[5]?.parentId, controller.getState().clipboard, controller.getState().activeHistory, controller.getState().treeSelection ])
        .toStrictEqual([ 6, null, 'tree', [ 5 ] ]);
    });

    it('pastes copied maps as new maps and keeps the clipboard for another paste', async () =>
    {
      // Arrange.
      const { controller, state, maps } = buildController();
      await controller.copyMaps([ 5 ]);

      // Act.
      await controller.paste(TREE_ROOT);

      // Assert.
      expect([ state.infos[4]?.name, maps.get(4)?.displayName, controller.getState().clipboard?.kind, controller.getState().notice?.text ])
        .toStrictEqual([ 'Cave', 'file 5', 'copy', 'Copied "Cave".' ]);
    });

    it('starts renaming a new map, and clears the selection after a delete', async () =>
    {
      // Arrange.
      const { controller, state } = buildController();

      // Act.
      await controller.createMap(1);
      const { renaming } = controller.getState();
      await controller.renameMap(4, 'Well');
      await controller.deleteMaps([ 4 ]);

      // Assert.
      expect([ renaming, controller.getState().renaming, state.infos[4], controller.getState().treeSelection ])
        .toStrictEqual([ 4, null, null, [] ]);
    });

    it('shows why the tree refused, and says nothing needs a server where there is none', async () =>
    {
      // Arrange.
      const { controller } = buildController();
      const serverless = new WorkspaceController({ hub: new DocumentHub({ clientId: 'window-b' }), api: null } as unknown as MapEditorServices);

      // Act.
      await controller.moveMaps([ 1 ], { parentId: 3, beforeId: null });
      const refused = controller.getState().notice?.text;
      await serverless.createMap(TREE_ROOT);

      // Assert.
      expect([ refused, serverless.getState().notice?.text ])
        .toStrictEqual([ 'A map cannot move inside itself.', 'The map tree needs the project\'s server to change.' ]);
    });
  });

  describe('undo and saving', () =>
  {
    it('raises an alarm, not a passing notice, when a failed delete cannot be put back', async () =>
    {
      // Arrange: the inn's file cannot be removed, and then no removed file can be written back.
      const { controller, api, state } = buildController();
      const { deleteMap } = api;
      api.deleteMap = async (mapId: number) =>
      {
        if (mapId === 3)
        {
          throw new MapEditorApiError('the disk is full', 500);
        }

        await deleteMap(mapId);
      };
      const diskFull = async () =>
      {
        throw new MapEditorApiError('the disk is full', 500);
      };
      api.restoreMapFile = diskFull;
      api.saveMap = diskFull;

      // Act.
      await controller.deleteMaps([ 2 ]);

      // Assert.
      expect([ controller.getState().notice?.severity, state.infos[2] ])
        .toStrictEqual([ 'alarm', null ]);
    });

    it('undoes and redoes the history with focus, and stays quiet with nothing to undo', async () =>
    {
      // Arrange.
      const { controller, hub } = buildController();
      const dock = buildDock([ { id: 'map-1', component: 'map', params: { mapId: 1 }, group: MAIN } ]);
      controller.panelActivated(dock.api.getPanel('map-1'));
      hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));

      // Act.
      await controller.undo();
      const afterUndo = hub.map('map:1').property('displayName');
      await controller.redo();
      await controller.redo();

      // Assert.
      expect([ afterUndo, hub.map('map:1').property('displayName'), controller.getState().notice ])
        .toStrictEqual([ 'Test Town', 'Harbor', null ]);
    });

    it('does nothing on undo before anything has focus', async () =>
    {
      // Arrange.
      const { controller, hub } = buildController();
      hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));

      // Act.
      await controller.undo();

      // Assert.
      expect(hub.map('map:1').property('displayName'))
        .toBe('Harbor');
    });

    it('saves every document with unsaved edits, and says which could not be saved', async () =>
    {
      // Arrange: map 2's save fails.
      const { controller, hub, saves } = buildController();
      hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
      hub.edit('Rename map', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'displayName' ], 'Port'));

      // Act.
      await controller.saveAll();

      // Assert.
      expect([ saves, hub.isDirty('map:1'), hub.isDirty('map:2'), controller.getState().notice?.text ])
        .toStrictEqual([ [ 'map:1', 'map:2' ], false, true, 'Could not save Map 2.' ]);
    });

    it('leaves a document in conflict unsaved, and says so', async () =>
    {
      // Arrange.
      const { controller, hub, saves } = buildController();
      hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
      hub.flagConflict('map:1', { kind: 'disk', content: null });

      // Act.
      await controller.saveAll();

      // Assert.
      expect([ saves, controller.getState().notice?.text ])
        .toStrictEqual([ [], 'Saved 0; 1 waiting for a choice about changes made elsewhere.' ]);
    });

    it('says everything is saved when nothing was waiting', async () =>
    {
      // Arrange: nothing edited.
      const { controller } = buildController();
      const listener = vi.fn();
      controller.subscribe(listener);

      // Act.
      await controller.saveAll();

      // Assert.
      expect([ controller.getState().notice?.text, listener.mock.calls.length ])
        .toStrictEqual([ 'Everything is saved.', 1 ]);
    });
  });

  it('names a map from the tree, and by its number while the tree is not held', async () =>
  {
    // Arrange.
    const { controller } = buildController();
    const before = controller.mapName(5);

    // Act.
    await controller.tree?.tree();

    // Assert.
    expect([ before, controller.mapName(5), controller.mapName(99) ])
      .toStrictEqual([ 'Map 5', 'Cave', 'Map 99' ]);
  });

  it('dismisses only the notice still showing', () =>
  {
    // Arrange.
    const { controller } = buildController();
    controller.notify('first');
    const first = controller.getState().notice?.id ?? 0;
    controller.notify('second', 'error');

    // Act.
    controller.dismissNotice(first);
    const afterStale = controller.getState().notice?.text;
    controller.dismissNotice(first + 1);

    // Assert.
    expect([ afterStale, controller.getState().notice ])
      .toStrictEqual([ 'second', null ]);
  });

  describe('the event selection', () =>
  {
    it('clears the selection when the window lets go of its map, and keeps it when another map goes', () =>
    {
      // Arrange: events selected on map 1; the window holds maps 1 and 2.
      const { controller, hub } = buildController();
      controller.selection.select(1, [ 3 ]);

      // Act: map 2 goes first, then map 1.
      hub.release('map:2');
      const afterOther = controller.selection.get();
      hub.release('map:1');

      // Assert.
      expect([ afterOther, controller.selection.get() ])
        .toStrictEqual([ { mapId: 1, eventIds: [ 3 ] }, { mapId: null, eventIds: [] } ]);
    });
  });
});
