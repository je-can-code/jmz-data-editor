/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell, type OpenBrowserWindow } from '../../src/core/infrastructure/shell/WindowShell.ts';
import { MapEditorApp } from '../../src/mapEditor/MapEditorApp.tsx';
import type { MapEditorServices } from '../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider, useMapEditorServices } from '../../src/mapEditor/services/MapEditorServicesContext.tsx';
import type { MapEditorView } from '../../src/mapEditor/views/mapEditorViews.ts';

/*
 * The map editor's window shows one of two things, decided by its URL: the workspace, empty until the workspace
 * shell arrives, or one event's window. The app owes the window the right one, a way back to the data editor from
 * the workspace (opened through the window shell, so under NW.js it gets its own process), and a loud failure for
 * any component that reaches for the services outside their provider rather than a silent undefined.
 */
describe('MapEditorApp', () =>
{
  /**
   * Renders the app for a view, over a shell whose browser fallback is a spy.
   * @param {MapEditorView} view What the window shows.
   * @returns {ReturnType<typeof vi.fn<OpenBrowserWindow>>} The browser window opener the shell falls back to.
   */
  const renderApp = (view: MapEditorView) =>
  {
    const openWindow = vi.fn<OpenBrowserWindow>(() => null);
    const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow });
    const services = { view, shell } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapEditorApp/>
      </MapEditorServicesProvider>
    );
    return openWindow;
  };

  it('shows the empty workspace under the app\'s name', () =>
  {
    // Arrange: nothing beyond the render below.

    // Act.
    renderApp({ kind: 'workspace' });

    // Assert.
    expect(screen.getByText('jmz-map-editor'))
      .toBeInTheDocument();
    expect(screen.getByTestId('map-editor-workspace'))
      .toHaveTextContent('No map open');
  });

  it('opens the data editor from the workspace through the window shell', () =>
  {
    // Arrange.
    const openWindow = renderApp({ kind: 'workspace' });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Data editor' }));

    // Assert.
    expect(openWindow.mock.calls)
      .toStrictEqual([ [ '', 'jmz-data-editor', 'popup,width=1600,height=1000' ] ]);
  });

  it('shows an event window for an event view', () =>
  {
    // Arrange: nothing beyond the render below.

    // Act.
    renderApp({ kind: 'event', mapId: 12, eventId: 5 });

    // Assert.
    expect([ screen.getByText('Event 5').textContent, screen.getByText('Map 12').textContent, screen.queryByTestId('map-editor-workspace') ])
      .toStrictEqual([ 'Event 5', 'Map 12', null ]);
  });

  it('refuses to hand out services outside their provider', () =>
  {
    // Arrange: a component reaching for the services with no provider above it.
    const Reader = () =>
    {
      useMapEditorServices();
      return null;
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act.
    const renderAlone = () => render(<Reader/>);

    // Assert.
    expect(renderAlone)
      .toThrow(/render inside MapEditorServicesProvider/u);
    quiet.mockRestore();
  });
});
