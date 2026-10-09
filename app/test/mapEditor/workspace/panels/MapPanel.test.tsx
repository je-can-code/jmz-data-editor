/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { holdBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { blueprintMapId, MAP_INFOS_KEY, TILESETS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { TILESET_MARKS_DOCUMENT } from '../../../../src/mapEditor/core/palette/tilesetMarkEdits.ts';
import { WindowPaints, type WindowPaint } from '../../../../src/mapEditor/core/tools/WindowPaint.ts';
import type { MapPanelParams } from '../../../../src/mapEditor/core/workspace/panels.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapPanel } from '../../../../src/mapEditor/workspace/panels/MapPanel.tsx';
import { withWindowScope } from '../../../../src/mapEditor/workspace/windowScope.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { holdBlueprints } from '../../support/blueprintFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/**
 * The paint every map view the panel mounted was handed, in order.
 */
const views = vi.hoisted(() => ({ paints: [] as unknown[] }));

// the map view draws on the GPU, which a test page has none of; what the panel owes it is the paint of its window.
vi.mock('../../../../src/mapEditor/render/MapView.tsx', async () =>
{
  const { useEffect } = await import('react');

  /**
   * Stands in for the map view, recording the paint it was handed.
   * @param {{ mapId: number, paint?: unknown }} props The map and its paint.
   * @returns {React.JSX.Element} A line naming the map.
   */
  const MapView = (props: { mapId: number; paint?: unknown }) =>
  {
    const { mapId, paint } = props;
    useEffect(() =>
    {
      views.paints.push(paint);
    }, [ paint ]);

    return <div data-testid={'map-view'}>{`Map ${mapId}`}</div>;
  };

  return { MapView };
});

/*
 * A map panel paints with its window's paint. Docked in the main window, that is the page's own, which the workspace's
 * palette and layers panel pick for, and the panel carries no palette of its own. Torn out into a window of its own,
 * it carries its own palette and layers panel beside the map, picking for that window alone, so painting there needs
 * nothing from the main window: a tile or the shadow pen picked there reaches the torn-out map's tools and never the
 * main window's. A toggle on the panel's strip hides both the palette and the layers panel, kept in the panel's
 * parameters so the layout remembers it, and shows them again.
 */
describe('MapPanel', () =>
{
  const frames: HTMLIFrameElement[] = [];

  afterEach(() =>
  {
    views.paints.splice(0);
    frames.splice(0).forEach(frame => frame.remove());
  });

  /**
   * A workspace holding the cave (map 5, the 3 by 2 fixture on tileset 4), with tileset 4 naming A1, A2 and B, no
   * marks saved, and the page's own window's paint linked.
   * @returns {{ controller: WorkspaceController, paints: WindowPaints }} The workspace and every window's paint.
   */
  const buildWorkspace = () =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:5', buildMapJson() as unknown as JsonValue);
    const tileset = { id: 4, flags: new Array<number>(8192).fill(0), mode: 1, name: 'Cave', note: '', tilesetNames: [ 'A1', 'A2', '', '', '', 'B', '', '', '' ] };
    const contents: Partial<Record<DocumentKey, unknown>> = {
      [MAP_INFOS_KEY]: buildTreeRows(),
      [TILESETS_KEY]: [ null, null, null, null, tileset ],
      [TILESET_MARKS_DOCUMENT]: { schemaVersion: 1, data: { tilesets: {} } },
    };
    const openDocument = async (key: DocumentKey) => (hub.has(key) ? hub.document(key) : hub.adopt(key, contents[key] as JsonValue));
    const api = { clientId: 'window-a', loadImage: async () => null, loadEditorData: async () => contents[TILESET_MARKS_DOCUMENT] } as unknown as MapEditorApi;
    const paints = new WindowPaints(window);
    paints.main.link();
    const controller = new WorkspaceController({ hub, api, openDocument, paints, modules: { overlays: () => [] } } as unknown as MapEditorServices);
    return { controller, paints };
  };

  /**
   * A stand-in for the dock's api for the panel: it can be moved from one window to another, as tearing it out does,
   * and records every change to its parameters.
   * @returns {object} The api, a way to move the panel, and the parameters it was handed.
   */
  const buildPanel = () =>
  {
    let current: Window = window;
    const listeners = new Set<() => void>();
    const updates: object[] = [];
    const api = {
      title: '',
      isVisible: true,
      getWindow: () => current,
      setTitle: vi.fn(),
      close: vi.fn(),
      updateParameters: (params: object) => updates.push(params),
      onDidVisibilityChange: () => ({ dispose: () => undefined }),
      onDidLocationChange: (listener: () => void) =>
      {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    } as unknown as IDockviewPanelProps['api'];

    /**
     * Moves the panel to another window and says so, as dockview does once a torn-out window is wired up.
     * @param {Window} next The window.
     */
    const moveTo = (next: Window) =>
    {
      current = next;
      listeners.forEach(listener => listener());
    };

    return { api, moveTo, updates };
  };

  /**
   * Opens a second window on the test page, standing in for a torn-out panel's window.
   * @returns {Window} The window.
   */
  const openSecondWindow = (): Window =>
  {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    frames.push(frame);
    return frame.contentWindow as Window;
  };

  const ScopedPanel = withWindowScope(MapPanel as React.FunctionComponent<IDockviewPanelProps>);

  /**
   * Renders the cave's panel inside the workspace.
   * @param {WorkspaceController} controller The workspace.
   * @param {IDockviewPanelProps['api']} api The panel's api.
   * @param {MapPanelParams} params The panel's parameters.
   * @returns {React.JSX.Element} The panel.
   */
  const panelFor = (controller: WorkspaceController, api: IDockviewPanelProps['api'], params: MapPanelParams = { mapId: 5 }) =>
  {
    return (
      <WorkspaceProvider controller={controller}>
        <ScopedPanel api={api} containerApi={{} as IDockviewPanelProps['containerApi']} params={params}/>
      </WorkspaceProvider>
    );
  };

  it('paints with the page\'s own paint while docked, carrying no palette of its own', async () =>
  {
    // Arrange.
    const { controller, paints } = buildWorkspace();
    const { api } = buildPanel();

    // Act.
    render(panelFor(controller, api));
    await screen.findByTestId('map-view');

    // the map's tree and tileset load through promises the initial render kicks off but does not await, so the mocked
    // view's own effect (which notes the paint it was handed) can still be pending once the testid above appears;
    // flushing here settles it before the paint is read, rather than racing it under whatever load the suite is under.
    await act(async () => {});

    // Assert.
    expect([ views.paints.at(-1) === paints.main, screen.queryByTestId('map-palette-dock'), screen.queryByRole('button', { name: 'Hide the tiles' }) ])
      .toStrictEqual([ true, null, null ]);
  });

  it('carries its own palette and layers panel once torn out, painting with its window\'s paint alone', async () =>
  {
    // Arrange.
    const { controller, paints } = buildWorkspace();
    const { api, moveTo } = buildPanel();
    render(panelFor(controller, api));
    await screen.findByTestId('map-view');
    const popout = openSecondWindow();

    // Act: torn out, then the shadow pen picked on the palette beside the map, and layer 4 on the strip beneath it.
    act(() => moveTo(popout));
    const dock = await screen.findByTestId('map-palette-dock');
    fireEvent.click(await within(dock).findByRole('tab', { name: 'R' }));
    fireEvent.click(within(dock).getByRole('button', { name: 'Shadow pen' }));
    fireEvent.click(within(dock).getByRole('button', { name: '4' }));

    // Assert: the dock carries the whole layers panel, not just the strip; the torn-out map paints with its window's
    // paint, which has the pen, the shadow brush and layer 4, and the main window's paint has none of it.
    const own = paints.forWindow(popout);
    const settingsOf = (paint: WindowPaint) => [ paint.painting.settings.tool, paint.painting.settings.brush?.kind ?? null, paint.painting.settings.strip ];
    expect([ within(dock).queryByTestId('layers') !== null, views.paints.at(-1) === own, own === paints.main, settingsOf(own), settingsOf(paints.main) ])
      .toStrictEqual([ true, true, false, [ 'pen', 'shadows', 3 ], [ 'events', null, 'auto' ] ]);
  });

  it('hides its own palette and layers panel together from the toggle, keeping that in its parameters, and shows both again', async () =>
  {
    // Arrange: torn out, the whole dock showing.
    const { controller } = buildWorkspace();
    const { api, moveTo, updates } = buildPanel();
    const { rerender } = render(panelFor(controller, api));
    await screen.findByTestId('map-view');
    act(() => moveTo(openSecondWindow()));
    await screen.findByTestId('map-palette-dock');

    // Act: hidden, as the dock hands the panel the parameters it asked for, then shown again.
    fireEvent.click(screen.getByRole('button', { name: 'Hide the tiles' }));
    rerender(panelFor(controller, api, { mapId: 5, paletteHidden: true }));
    const whileHidden = [ screen.queryByTestId('map-palette-dock'), screen.queryByRole('button', { name: 'Show the tiles' }) !== null ];
    fireEvent.click(screen.getByRole('button', { name: 'Show the tiles' }));

    // Assert: the dock carrying both the palette and the layers panel is gone outright while hidden, not just one of them.
    expect([ updates, whileHidden ])
      .toStrictEqual([ [ { paletteHidden: true }, { paletteHidden: undefined } ], [ null, true ] ]);
  });

  /*
   * A blueprint opens in a map panel as the small map it lays out as, laid out from the blueprints when the window holds
   * it nowhere yet. Its tab and its strip name it, the strip saying it is a blueprint, and both mark it unsaved once it
   * changes. Deleted, the panel says so, and an undo in its history brings it back into the panel.
   */
  describe('showing a blueprint', () =>
  {
    /**
     * A workspace holding the blueprints, the camp (k3x9q2mf) among them, whose map opens from them when first asked for.
     * @returns {{ controller: WorkspaceController, hub: DocumentHub }} The workspace and its documents.
     */
    const buildBlueprintWorkspace = () =>
    {
      const hub = new DocumentHub({ clientId: 'window-a' });
      holdBlueprints(hub, { k3x9q2mf: { name: 'Goblin camp', stamp: stampOf({ width: 2 }) } });
      const tileset = { id: 4, flags: new Array<number>(8192).fill(0), mode: 1, name: 'Cave', note: '', tilesetNames: [ 'A1', 'A2', '', '', '', 'B', '', '', '' ] };
      const contents: Partial<Record<DocumentKey, unknown>> = {
        [MAP_INFOS_KEY]: buildTreeRows(),
        [TILESETS_KEY]: [ null, null, null, null, tileset ],
        [TILESET_MARKS_DOCUMENT]: { schemaVersion: 1, data: { tilesets: {} } },
      };
      const openDocument = async (key: DocumentKey) =>
      {
        if (key === 'blueprint-map:k3x9q2mf')
        {
          return holdBlueprintMap(hub, 'k3x9q2mf');
        }

        return hub.has(key) ? hub.document(key) : hub.adopt(key, contents[key] as JsonValue);
      };
      const api = { clientId: 'window-a', loadImage: async () => null, loadEditorData: async () => contents[TILESET_MARKS_DOCUMENT] } as unknown as MapEditorApi;
      const paints = new WindowPaints(window);
      paints.main.link();
      const controller = new WorkspaceController({ hub, api, openDocument, paints, modules: { overlays: () => [] } } as unknown as MapEditorServices);
      return { controller, hub };
    };

    it('opens the blueprint as a map named for it, marked a blueprint, and marked unsaved once it changes', async () =>
    {
      // Arrange.
      const { controller, hub } = buildBlueprintWorkspace();
      const { api } = buildPanel();
      const mapId = blueprintMapId('k3x9q2mf');
      render(panelFor(controller, api, { mapId }));
      await screen.findByTestId('map-view');
      const opened = [ vi.mocked(api.setTitle).mock.calls.at(-1)?.[0], screen.getByText('Goblin camp') !== null, screen.getByText('Blueprint') !== null ];

      // Act.
      act(() =>
      {
        hub.edit('Move event', [ mapHistoryKey(mapId) ], tx => tx.set('blueprint-map:k3x9q2mf', [ 'events', 1, 'x' ], 1));
      });

      // Assert: the mock map view names the map it was handed.
      expect([ opened, screen.getByTestId('map-view').textContent, vi.mocked(api.setTitle).mock.calls.at(-1)?.[0], screen.getByText('Unsaved') !== null ])
        .toStrictEqual([ [ 'Goblin camp', true, true ], `Map ${mapId}`, 'Goblin camp *', true ]);
    });

    it('keeps the blueprint\'s unsaved changes held when its panel closes, so opening it again shows them', async () =>
    {
      // Arrange: the camp open in a panel, its event moved.
      const { controller, hub } = buildBlueprintWorkspace();
      const { api } = buildPanel();
      const mapId = blueprintMapId('k3x9q2mf');
      const { unmount } = render(panelFor(controller, api, { mapId }));
      await screen.findByTestId('map-view');
      act(() =>
      {
        hub.edit('Move event', [ mapHistoryKey(mapId) ], tx => tx.set('blueprint-map:k3x9q2mf', [ 'events', 1, 'x' ], 1));
      });

      // Act: the panel closes, and the blueprint opens again in another.
      unmount();
      const closed = [ hub.has('blueprint-map:k3x9q2mf'), hub.isDirty('blueprint-map:k3x9q2mf') ];
      const again = buildPanel();
      render(panelFor(controller, again.api, { mapId }));
      await screen.findByTestId('map-view');

      // Assert.
      expect([ closed, hub.map('blueprint-map:k3x9q2mf').event(1)?.x, vi.mocked(again.api.setTitle).mock.calls.at(-1)?.[0], screen.getByText('Unsaved') !== null ])
        .toStrictEqual([ [ true, true ], 1, 'Goblin camp *', true ]);
    });

    it('says when the blueprint waits for a choice about a version of it found on disk, or about the blueprints, and not otherwise', async () =>
    {
      // Arrange: the camp open in the panel.
      const { controller, hub } = buildBlueprintWorkspace();
      const { api } = buildPanel();
      render(panelFor(controller, api, { mapId: blueprintMapId('k3x9q2mf') }));
      await screen.findByTestId('map-view');
      const before = screen.queryByTestId('blueprint-waiting');

      // Act: the blueprints wait for a choice, then the tab itself does too.
      act(() =>
      {
        hub.flagConflict(BLUEPRINTS_DOCUMENT, { kind: 'disk', content: null });
      });
      const blueprintsWait = screen.getByTestId('blueprint-waiting').textContent;
      act(() =>
      {
        hub.flagConflict('blueprint-map:k3x9q2mf', { kind: 'disk', content: null });
      });

      // Assert.
      expect([ before, blueprintsWait, screen.getByTestId('blueprint-waiting').textContent ])
        .toStrictEqual([ null, 'Blueprints changed elsewhere: choose below', 'Changed on disk: choose below which to keep' ]);
    });

    it('says the blueprint was deleted, and shows it again once an undo in its history brings it back', async () =>
    {
      // Arrange: the camp open in the panel.
      const { controller, hub } = buildBlueprintWorkspace();
      const { api } = buildPanel();
      render(panelFor(controller, api, { mapId: blueprintMapId('k3x9q2mf') }));
      await screen.findByTestId('map-view');

      // Act: deleted, then the delete undone.
      act(() =>
      {
        hub.edit('Delete blueprint', [ blueprintHistoryKey('k3x9q2mf') ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', 'k3x9q2mf' ], undefined));
      });
      const deleted = [ screen.getByText('This blueprint was deleted.') !== null, vi.mocked(api.setTitle).mock.calls.at(-1)?.[0] ];
      act(() =>
      {
        hub.undo(blueprintHistoryKey('k3x9q2mf'));
      });

      // Assert.
      expect([ deleted, await screen.findByTestId('map-view') !== null, vi.mocked(api.setTitle).mock.calls.at(-1)?.[0] ])
        .toStrictEqual([ [ true, 'Blueprint (deleted)' ], true, 'Goblin camp' ]);
    });
  });
});
