/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell, type OpenBrowserWindow } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import type { MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import type { MapCell } from '../../../src/mapEditor/core/renderer/camera.ts';
import type { OverlayState } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { PaintState } from '../../../src/mapEditor/core/tools/PaintState.ts';
import { MapEditorApp } from '../../../src/mapEditor/MapEditorApp.tsx';
import { MapView, mapIdFromQuery } from '../../../src/mapEditor/render/MapView.tsx';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { buildMapJson } from '../support/fixtures.ts';

/**
 * What the stand-in renderers and controllers record and answer: every renderer made, what each was asked to show
 * and where to look, what it was told of the view being on screen (with "mount" where it was mounted), a way to change
 * its draw state, and the maps an open lands on.
 */
const stand = vi.hoisted(() => ({
  renderers: [] as {
    overlays: OverlayState[];
    looks: { cell: MapCell; zoom: number }[];
    shown: (boolean | 'mount')[];
    announce: (state: string) => void;
  }[],
  maps: new Map<number, unknown>(),
}));

// a page under test has no GPU, so with a project server behind it the view draws through a stand-in renderer that
// records what it was asked, and opens maps through a stand-in controller that hands back the map the test set.
vi.mock('../../../src/mapEditor/render/PixiMapRenderer.ts', () =>
{
  /**
   * Stands in for the renderer, recording the overlay states and the cells it is asked to show.
   */
  class PixiMapRenderer
  {
    record = {
      overlays: [] as OverlayState[],
      looks: [] as { cell: MapCell; zoom: number }[],
      shown: [] as (boolean | 'mount')[],
      announce: (state: string) =>
      {
        this.drawListeners.forEach(listener => listener(state));
      },
    };

    drawListeners = new Set<(state: string) => void>();

    constructor()
    {
      stand.renderers.push(this.record);
    }

    mount(): void
    {
      this.record.shown.push('mount');
    }

    setVisible(visible: boolean): void
    {
      this.record.shown.push(visible);
    }

    onDrawStateChange(listener: (state: string) => void): () => void
    {
      this.drawListeners.add(listener);
      return () => this.drawListeners.delete(listener);
    }

    onCameraChange(): () => void
    {
      return () => undefined;
    }

    onFrame(): () => void
    {
      return () => undefined;
    }

    stats(): { loadingImages: number }
    {
      return { loadingImages: 0 };
    }

    whenReady(): Promise<void>
    {
      return Promise.resolve();
    }

    rendererInfo(): null
    {
      return null;
    }

    cellAt(): null
    {
      return null;
    }

    setLayerVisibility(): void
    {
      // the switches are not what these tests look at.
    }

    setOverlays(): void
    {
      // the switches are not what these tests look at.
    }

    setPassabilityRules(): void
    {
      // the switches are not what these tests look at.
    }

    setOverlayState(state: OverlayState): void
    {
      this.record.overlays.push(state);
    }

    lookAt(cell: MapCell, zoom: number): void
    {
      this.record.looks.push({ cell, zoom });
    }

    destroy(): void
    {
      // nothing to let go of.
    }
  }

  return { PixiMapRenderer };
});

vi.mock('../../../src/mapEditor/render/MapViewController.ts', () =>
{
  /**
   * Stands in for the controller, opening the maps the test set.
   */
  class MapViewController
  {
    map = null;

    async open(mapId: number): Promise<unknown>
    {
      return stand.maps.get(mapId) ?? null;
    }

    close(): void
    {
      // nothing to stop following.
    }
  }

  return { MapViewController };
});

/*
 * A map view is what the workspace mounts in each map panel, and the map editor page also opens one alone across the
 * whole window for ?map=102, in place of the workspace, which is the view the speed script and the parity check
 * measure. The view offers the switches for the overlays and the game look and a status line; without a project server
 * it says there is no map to show rather than failing. An event it is asked to pick out, such as the battler the data
 * editor asked to see, shows selected once the map is open, with the view centred on it, and so does each event picked
 * after it; with nothing picked, nothing is selected and the view stays put. The drawing itself happens on the GPU and
 * is proved by the speed script and the parity check, not here.
 *
 * A view behind another tab lets its GPU context go, so the renderer hears whether the view is on screen before it is
 * mounted (a view mounted behind a tab must make no context at all) and each time that changes. And a map that cannot
 * draw says why over the canvas, in plain words, rather than leaving it blank: every context the window may keep is
 * taken by maps on screen, the graphics card let go of it for a moment, or the window cannot draw at all.
 */
describe('MapView', () =>
{
  beforeEach(() =>
  {
    stand.renderers.splice(0);
    stand.maps.clear();
  });

  afterEach(() =>
  {
    window.history.replaceState(null, '', '/');
  });

  /**
   * Builds services with no project server behind them.
   * @returns {MapEditorServices} The services.
   */
  const serverless = (): MapEditorServices =>
  {
    const openWindow = vi.fn<OpenBrowserWindow>(() => null);
    const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow });
    const hub = new DocumentHub({ clientId: 'window-a' });
    const openDocument = vi.fn(() => Promise.reject(new Error('no documents in this test')));
    const painting = new PaintState();
    return { view: { kind: 'workspace' }, api: null, shell, hub, openDocument, painting, resolveConflict: vi.fn(() => true) } as unknown as MapEditorServices;
  };

  /**
   * Builds services with a project server behind them, and no plugin modules.
   * @returns {MapEditorServices} The services.
   */
  const served = (): MapEditorServices =>
  {
    const modules = { overlays: () => [], passabilityRules: () => [] };
    return { ...serverless(), api: {} as MapEditorApi, modules } as unknown as MapEditorServices;
  };

  describe('mapIdFromQuery', () =>
  {
    it('reads a positive whole map id, and nothing else', () =>
    {
      // Arrange.
      const searches = [ '?map=102', '?map=7&speed=1', '?map=0', '?map=-3', '?map=12a', '?view=event', '' ];

      // Act.
      const ids = searches.map(mapIdFromQuery);

      // Assert.
      expect(ids)
        .toStrictEqual([ 102, 7, null, null, null, null, null ]);
    });
  });

  it('offers the switches and says there is no map to show without a project server', () =>
  {
    // Arrange.
    const services = serverless();

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={102}/>
      </MapEditorServicesProvider>
    );

    // Assert.
    const switches = [ 'Grid', 'Regions', 'Passability', 'Animate water', 'Parallax', 'Events', 'Shadows', 'Highlight layer' ];
    expect([ ...switches.map(label => screen.getByText(label) !== null), screen.getByText('No project server is running, so there is no map to show.') !== null ])
      .toStrictEqual([ ...switches.map(() => true), true ]);
  });

  it('opens the map the page asks for alone across the window, in place of the workspace', () =>
  {
    // Arrange.
    window.history.replaceState(null, '', '/map.html?map=102');

    // Act.
    render(
      <MapEditorServicesProvider services={serverless()}>
        <MapEditorApp/>
      </MapEditorServicesProvider>
    );

    // Assert.
    expect([ screen.getByTestId('map-view') !== null, screen.getByText('Map 102') !== null, screen.queryByTestId('map-editor-workspace') ])
      .toStrictEqual([ true, true, null ]);
  });

  it('picks out the event asked for once the map is open, and each event picked after it', async () =>
  {
    // Arrange: the map holds the door at 0, 0 and the chest at 2, 1.
    stand.maps.set(5, MapDocument.fromJson('map:5', buildMapJson()));
    const services = served();
    const { rerender } = render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} pickedEventId={3}/>
      </MapEditorServicesProvider>
    );
    await waitFor(() => expect(stand.renderers[0]?.looks.length)
      .toBe(1));

    // Act.
    rerender(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} pickedEventId={1}/>
      </MapEditorServicesProvider>
    );

    // Assert.
    await waitFor(() => expect(stand.renderers[0]?.looks.length)
      .toBe(2));
    const [ renderer ] = stand.renderers;
    expect([ stand.renderers.length, renderer.overlays.map(state => state.selectedEvents), renderer.looks ])
      .toStrictEqual([ 1, [ [ 3 ], [ 1 ] ], [ { cell: { x: 2, y: 1 }, zoom: 1 }, { cell: { x: 0, y: 0 }, zoom: 1 } ] ]);
  });

  it('tells the renderer whether the view is on screen before mounting it, and again each time that changes', () =>
  {
    // Arrange: a view that opens behind another tab.
    const services = served();
    const { rerender } = render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} visible={false}/>
      </MapEditorServicesProvider>
    );

    // Act.
    rerender(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} visible={true}/>
      </MapEditorServicesProvider>
    );

    // Assert: off screen before the mount, and one renderer throughout.
    expect([ stand.renderers.length, stand.renderers[0].shown.slice(0, 2), stand.renderers[0].shown.at(-1) ])
      .toStrictEqual([ 1, [ false, 'mount' ], true ]);
  });

  it('says over the map why it is not drawing, and nothing once it draws', () =>
  {
    // Arrange.
    render(
      <MapEditorServicesProvider services={served()}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const [ renderer ] = stand.renderers;

    /**
     * Moves the renderer to a draw state and reads what the view says over the map.
     * @param {string} state The draw state.
     * @returns {string | null} The words, or null when it says nothing.
     */
    const noticeFor = (state: string): string | null =>
    {
      act(() => renderer.announce(state));
      return screen.queryByTestId('map-draw-notice')?.textContent ?? null;
    };

    // Act.
    const notices = [ 'waiting', 'drawing', 'recovering', 'starting', 'failed' ].map(noticeFor);

    // Assert.
    expect(notices)
      .toStrictEqual([
        'Too many maps are on screen at once to draw this one.Close a map, or stack it behind another tab, and this one draws.',
        null,
        'The graphics card let go of this map for a moment.Drawing it again…',
        null,
        'This window cannot draw maps with the graphics card.Restarting the editor may bring it back.',
      ]);
  });

  it('selects nothing and leaves the view where it is when no event is picked', async () =>
  {
    // Arrange.
    stand.maps.set(5, MapDocument.fromJson('map:5', buildMapJson()));

    // Act.
    render(
      <MapEditorServicesProvider services={served()}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Assert: the map opened and the view was told to select nothing, and never where to look.
    await waitFor(() => expect(stand.renderers[0]?.overlays.length)
      .toBe(1));
    expect([ stand.renderers[0].overlays.map(state => state.selectedEvents), stand.renderers[0].looks ])
      .toStrictEqual([ [ [] ], [] ]);
  });
});
