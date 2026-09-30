/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell, type OpenBrowserWindow } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { MapEditorApp } from '../../../src/mapEditor/MapEditorApp.tsx';
import { MapView, mapIdFromQuery } from '../../../src/mapEditor/render/MapView.tsx';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../src/mapEditor/services/MapEditorServicesContext.tsx';

/*
 * A map view is what the workspace shell will mount in its panels, and until it does, the map editor page opens one
 * across the whole window for ?map=102. The view offers the switches for the overlays and the game look and a status
 * line; without a project server it says there is no map to show rather than failing. The drawing itself happens on
 * the GPU and is proved by the speed script and the parity check, not here.
 */
describe('MapView', () =>
{
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
    return { view: { kind: 'workspace' }, api: null, shell, hub, resolveConflict: vi.fn(() => true) } as unknown as MapEditorServices;
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

  it('opens the map the page asks for across the window, in place of the empty workspace', () =>
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
    expect([ screen.getByTestId('map-view') !== null, screen.getByText('Map 102') !== null, screen.queryByText('No map open') ])
      .toStrictEqual([ true, true, null ]);
  });
});
