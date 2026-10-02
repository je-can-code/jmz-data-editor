/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { MAP_INFOS_KEY, TILESETS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { TILESET_MARKS_DOCUMENT } from '../../../../src/mapEditor/core/palette/tilesetMarkEdits.ts';
import { WindowPaints, type WindowPaint } from '../../../../src/mapEditor/core/tools/WindowPaint.ts';
import type { MapPanelParams } from '../../../../src/mapEditor/core/workspace/panels.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapPanel } from '../../../../src/mapEditor/workspace/panels/MapPanel.tsx';
import { withWindowScope } from '../../../../src/mapEditor/workspace/windowScope.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildMapJson } from '../../support/fixtures.ts';
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
 * palette and layer strip pick for, and the panel carries no palette of its own. Torn out into a window of its own, it
 * carries its own palette and layer strip beside the map, picking for that window alone, so painting there needs
 * nothing from the main window: a tile or the shadow pen picked there reaches the torn-out map's tools and never the
 * main window's. A toggle on the panel's strip hides that palette, kept in the panel's parameters so the layout
 * remembers it, and shows it again.
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

  it('carries its own palette and layer strip once torn out, painting with its window\'s paint alone', async () =>
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

    // Assert: the torn-out map paints with its window's paint, which has the pen, the shadow brush and layer 4, and the
    // main window's paint has none of it.
    const own = paints.forWindow(popout);
    const settingsOf = (paint: WindowPaint) => [ paint.painting.settings.tool, paint.painting.settings.brush?.kind ?? null, paint.painting.settings.strip ];
    expect([ views.paints.at(-1) === own, own === paints.main, settingsOf(own), settingsOf(paints.main) ])
      .toStrictEqual([ true, false, [ 'pen', 'shadows', 3 ], [ 'events', null, 'auto' ] ]);
  });

  it('hides its own palette from the toggle, keeping that in its parameters, and shows it again', async () =>
  {
    // Arrange: torn out, palette showing.
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

    // Assert.
    expect([ updates, whileHidden ])
      .toStrictEqual([ [ { paletteHidden: true }, { paletteHidden: undefined } ], [ null, true ] ]);
  });
});
