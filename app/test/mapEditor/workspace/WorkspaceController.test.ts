import { describe, expect, it, vi } from 'vitest';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { MapEditorApiError, type MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { apiDocumentStore } from '../../../src/mapEditor/core/api/apiDocumentStore.ts';
import { saveBlueprint } from '../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../src/mapEditor/core/blueprints/blueprints.ts';
import {
  BLUEPRINT_USES_DOCUMENT,
  forgetSpots,
  readUses,
  recordSpots,
  usesOf,
} from '../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import type { BlueprintUsesMerge } from '../../../src/mapEditor/core/blueprints/blueprintUsesWriter.ts';
import { DocumentHub, type DocumentStore } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapInfo } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { TREE_ROOT, WorkspaceController } from '../../../src/mapEditor/workspace/WorkspaceController.ts';
import { drawsFor, holdBlueprints, storedBlueprints, storedUses } from '../support/blueprintFixtures.ts';
import { buildMapJson } from '../support/fixtures.ts';
import { stampOf } from '../support/stampFixtures.ts';
import { buildTreeRows } from '../support/treeFixtures.ts';
import { mergeInto } from '../support/usesServer.ts';

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
   * A controller over a hub holding two maps, the tree on an in-memory server, and a store recording saves. The server
   * keeps editor-only documents only when given some, which it then hands over and keeps as they are written, the record
   * of where blueprints are placed merged into a map at a time; without, it has no route for them, and asking for one
   * fails, though merges are still taken, and listed.
   * @param {Record<string, JsonValue> | null} editorData The editor-only documents on the server, by name, or null for none.
   * @returns {object} The controller, the hub, the server's files, the saves and the merges.
   */
  const buildController = (editorData: Record<string, JsonValue> | null = null) =>
  {
    const merges: BlueprintUsesMerge[] = [];
    const mergeBlueprintUses = async (merge: BlueprintUsesMerge) =>
    {
      merges.push(structuredClone(merge));
      if (editorData !== null)
      {
        editorData['blueprint-uses'] = mergeInto(editorData['blueprint-uses'] ?? null, merge);
      }
    };
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
      mergeBlueprintUses,
      ...(editorData === null
        ? {}
        : {
          loadEditorData: async (name: string) => structuredClone(editorData[name] ?? null),
          saveEditorData: async (name: string, document: JsonValue) =>
          {
            editorData[name] = structuredClone(document);
          },
        }),
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

    // no event anywhere is a copy of a blueprint, counted at once, and no other window holds anything.
    const blueprintCopies = { start: () => undefined, countOf: () => ({ total: 0, maps: [] }) };
    const sync = { holders: () => [] };
    const services = { hub, api, sync, blueprintCopies, openDocument: (key: string) => hub.load(key as never) } as unknown as MapEditorServices;
    return { controller: new WorkspaceController(services), hub, api, maps, state, saves, merges };
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

    it('makes every ask for a cell a new one, centring there again when asked again, and leaves the events asked for alone', () =>
    {
      // Arrange: map 12 open, and asked for at an event.
      const { controller } = buildController();
      const dock = buildDock([ { id: 'map-12', component: 'map', params: { mapId: 12 }, group: MAIN } ]);
      controller.attach(dock.api);
      controller.openMap(12, { focusEventId: 5 });

      // Act: the middle of a placement asked for twice, then a plain open.
      controller.openMap(12, { focusCell: { x: 3, y: 4 } });
      const { 12: first } = controller.getState().cellFocus;
      controller.openMap(12, { focusCell: { x: 3, y: 4 } });
      controller.openMap(12, { focusCell: null });

      // Assert.
      expect([ first, controller.getState().cellFocus, controller.getState().eventFocus, dock.added ])
        .toStrictEqual([ { cell: { x: 3, y: 4 }, request: 2 }, { 12: { cell: { x: 3, y: 4 }, request: 3 } }, { 12: { eventId: 5, request: 1 } }, [] ]);
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

  it('names a blueprint from the blueprints, and by its id while they are not held or no longer hold it', () =>
  {
    // Arrange.
    const { controller } = buildController();
    const before = controller.blueprintName('k3x9q2mf');

    // Act.
    holdBlueprints(controller.services.hub, { k3x9q2mf: { name: 'Goblin camp', stamp: stampOf() } });

    // Assert.
    expect([ before, controller.blueprintName('k3x9q2mf'), controller.blueprintName('zz99') ])
      .toStrictEqual([ 'k3x9q2mf', 'Goblin camp', 'zz99' ]);
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

  /*
   * The workspace holds the blueprints and the record of where they are placed from the moment it opens, since every
   * edit moving a placement changes the record only while the window holds it; a tree change waits until they are asked
   * for, so a map deleted or copied the moment the window opens takes its placements with it. Each map's placements are
   * written with that map, merged into the record on the server, and the tree writes those of the maps it brings or
   * takes away; the record itself never holds anything unsaved, so Save all never counts it. No undo takes away a
   * blueprint whose tiles are still placed, in the words a delete of it is refused in.
   *
   * On the server, the camp (aa22) is placed on the cave (5), at 4, 0.
   */
  describe('blueprint placements', () =>
  {
    /**
     * The editor-only documents on the server: no blueprints yet, and the camp's placement on the cave.
     * @returns {Record<string, JsonValue>} The documents, by name.
     */
    const onServer = (): Record<string, JsonValue> => ({ 'blueprints': storedBlueprints(), 'blueprint-uses': storedUses([ { blueprintId: 'aa22', mapId: 5, x: 4, y: 0 } ]) });

    it('holds the blueprints and the record from the start, and neither in a window with no server', async () =>
    {
      // Arrange.
      const { controller, hub } = buildController(onServer());
      const serverlessHub = new DocumentHub({ clientId: 'window-b' });
      const serverless = new WorkspaceController({ hub: serverlessHub, api: null } as unknown as MapEditorServices);

      // Act.
      await Promise.all([ controller.whenPlacementsHeld(), serverless.whenPlacementsHeld() ]);

      // Assert.
      expect([ hub.has(BLUEPRINTS_DOCUMENT), hub.has(BLUEPRINT_USES_DOCUMENT), serverlessHub.documentKeys() ])
        .toStrictEqual([ true, true, [] ]);
    });

    it('waits for the record before a tree change, so a map deleted at once takes its placements with it, on disk too', async () =>
    {
      // Arrange.
      const documents = onServer();
      const { controller, hub } = buildController(documents);

      // Act.
      await controller.deleteMaps([ 5 ]);
      await controller.placements?.whenWritten();

      // Assert.
      expect([ hub.has('mapinfos'), usesOf(hub.document(BLUEPRINT_USES_DOCUMENT)), readUses((documents['blueprint-uses'] as { data: JsonValue }).data) ])
        .toStrictEqual([ true, [], [] ]);
    });

    it('copies a map to the clipboard with its placements, once the record is held', async () =>
    {
      // Arrange.
      const { controller } = buildController(onServer());

      // Act.
      await controller.copyMaps([ 5 ]);

      // Assert.
      const { clipboard } = controller.getState();
      expect(clipboard?.kind === 'copy' && clipboard.copies.map(copy => copy.spots))
        .toStrictEqual([ [ { blueprintId: 'aa22', x: 4, y: 0 } ] ]);
    });

    it('writes a map\'s placements, and no other map\'s, with the window\'s own save of the map', async () =>
    {
      // Arrange: the camp placed on maps 1 and 2 too, unsaved.
      const documents = onServer();
      const { controller, hub, saves, merges } = buildController(documents);
      await controller.whenPlacementsHeld();
      [ 1, 2 ].forEach(mapId => hub.edit('Place', [ mapHistoryKey(mapId) ], tx =>
      {
        tx.set(`map:${mapId}`, [ 'displayName' ], 'Camped');
        recordSpots(tx, hub, mapId, [ { blueprintId: 'aa22', x: 0, y: 0 } ]);
      }));

      // Act.
      await hub.save('map:1');
      await controller.placements?.whenWritten();

      // Assert: the map saved through its own route, and its placements alone merged into the record.
      expect([ saves, merges, readUses((documents['blueprint-uses'] as { data: JsonValue }).data) ])
        .toStrictEqual([
          [ 'map:1' ],
          [ { schemaVersion: 2, maps: { 1: { aa22: [ { x: 0, y: 0 } ] } } } ],
          [ { blueprintId: 'aa22', x: 0, y: 0, mapId: 1 }, { blueprintId: 'aa22', x: 4, y: 0, mapId: 5 } ],
        ]);
    });

    it('tells what Save all saved in maps, the record never among what it saves', async () =>
    {
      // Arrange: a placement forgotten, which goes to disk at once, then map 1 unsaved too.
      const { controller, hub, saves } = buildController(onServer());
      await controller.whenPlacementsHeld();
      hub.edit('Forget', [ BLUEPRINT_USES_DOCUMENT ], tx => forgetSpots(tx, hub, 5, [ { blueprintId: 'aa22', x: 4, y: 0 } ]));

      // Act.
      await controller.saveAll();
      const alone = controller.getState().notice?.text;
      hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
      await controller.saveAll();

      // Assert.
      expect([ alone, controller.getState().notice?.text, saves, hub.dirtyKeys() ])
        .toStrictEqual([ 'Everything is saved.', 'Saved 1 map.', [ 'map:1' ], [] ]);
    });

    it('refuses to undo a blueprint\'s save while its tiles are still placed, in the words a delete of it is refused in', async () =>
    {
      // Arrange: the roost (k3x9q2mf) saved here, as the step undo would take back, and placed on the cave already.
      const documents = { ...onServer(), 'blueprint-uses': storedUses([ { blueprintId: 'k3x9q2mf', mapId: 5, x: 1, y: 1 } ]) };
      const { controller, hub } = buildController(documents);
      await controller.whenPlacementsHeld();
      saveBlueprint(hub, stampOf(), 'Bat roost', drawsFor([ 'k3x9q2mf' ]));
      controller.focusHistory(blueprintHistoryKey('k3x9q2mf'));

      // Act.
      await controller.undo();

      // Assert.
      expect([ controller.getState().notice?.text, controller.blueprintName('k3x9q2mf') ])
        .toStrictEqual([ '"Save blueprint "Bat roost"" cannot be undone: "Bat roost" still has 1 copy, on Map 5 (1), so it can\'t be deleted.', 'Bat roost' ]);
    });
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
