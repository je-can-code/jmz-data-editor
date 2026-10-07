/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell, type OpenBrowserWindow } from '../../src/core/infrastructure/shell/WindowShell.ts';
import { CommandCatalog } from '../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { PluginHeaderStore } from '../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { DocumentHub } from '../../src/mapEditor/core/history/DocumentHub.ts';
import { LocationPicks } from '../../src/mapEditor/core/locations/LocationPicks.ts';
import { MapEditorApp } from '../../src/mapEditor/MapEditorApp.tsx';
import type { MapEditorServices } from '../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider, useMapEditorServices } from '../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { documentLabel } from '../../src/mapEditor/views/documentLabels.ts';
import type { MapEditorView } from '../../src/mapEditor/views/mapEditorViews.ts';
import { buildMapJson } from './support/fixtures.ts';

// the workspace lays itself out with a docking engine a test page cannot measure; its own tests cover it.
vi.mock('../../src/mapEditor/workspace/Workspace.tsx', () => ({
  Workspace: () => <div data-testid={'map-editor-workspace'}>The workspace</div>,
}));

/*
 * The map editor's window shows one of three things, decided by its URL: the workspace, one event's window, or the
 * common events. The app owes the window the right one, and a loud failure for any component that reaches for the
 * services outside their provider.
 *
 * Above every view it owes the author every conflict, visibly and at once: a document whose two copies disagree
 * (the file on disk and this window's, or another window's and this one's) is shown with both choices, and
 * nothing is settled until one is picked. A removed file offers nothing to take.
 *
 * And whichever view it shows, it owes every editor in the window a picker for a place on a map, shown the moment
 * an editor asks for one.
 */
describe('MapEditorApp', () =>
{
  /**
   * Renders the app for a view, over a real hub and a shell whose browser fallback is a spy.
   * @param {MapEditorView} view What the window shows.
   * @returns {object} The window opener, the hub, the conflict settler and the window's asks for a place on a map.
   */
  const renderApp = (view: MapEditorView) =>
  {
    const openWindow = vi.fn<OpenBrowserWindow>(() => null);
    const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow });
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as never);
    hub.adopt('map:2', buildMapJson() as never);
    const resolveConflict = vi.fn(() => true);
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const locationPicks = new LocationPicks();

    // an event window's command list reads the catalog and editors; the window holds its map already, so it opens nothing.
    const services = {
      view,
      shell,
      hub,
      resolveConflict,
      catalog,
      commandEditors: new CommandEditorRegistry(),
      api: null,
      pluginHeaders: new PluginHeaderStore(),
      locationPicks,
      loadCommandResources: async () => undefined,
    } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapEditorApp/>
      </MapEditorServicesProvider>
    );
    return { openWindow, hub, resolveConflict, locationPicks };
  };

  it('shows the workspace for a workspace view, and no conflict', () =>
  {
    // Arrange: nothing beyond the render below.

    // Act.
    renderApp({ kind: 'workspace' });

    // Assert.
    expect([ screen.getByTestId('map-editor-workspace').textContent, screen.queryByTestId('document-conflict') ])
      .toStrictEqual([ 'The workspace', null ]);
  });

  it('shows an event window for an event view, editing that event', () =>
  {
    // Arrange: event 3 of map 1 is the fixture's chest.

    // Act.
    renderApp({ kind: 'event', mapId: 1, eventId: 3 });

    // Assert.
    expect([ screen.getByLabelText('Name'), screen.getByRole('tab', { name: 'Page 1' }) !== null, screen.queryByTestId('map-editor-workspace') ])
      .toStrictEqual([ expect.objectContaining({ value: 'Chest' }), true, null ]);
  });

  it('shows the common events for a common events view', () =>
  {
    // Arrange: a window holding the common events, with the catalog the list reads with.
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('common-events', [ null, { id: 1, list: [ { code: 230, indent: 0, parameters: [ 30 ] }, { code: 0, indent: 0, parameters: [] } ], name: 'Heal Party', switchId: 1, trigger: 0 } ]);
    const services = {
      view: { kind: 'common-events' },
      hub,
      catalog,
      commandEditors: new CommandEditorRegistry(),
      api: null,
      pluginHeaders: new PluginHeaderStore(),
      locationPicks: new LocationPicks(),
      loadCommandResources: async () => undefined,
      resolveConflict: vi.fn(),
    } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <MapEditorApp/>
      </MapEditorServicesProvider>
    );

    // Assert.
    expect([ screen.queryByText('Wait 30 frames') !== null, screen.queryByTestId('map-editor-workspace') ])
      .toStrictEqual([ true, null ]);
  });

  it('shows the location picker over the view the moment an editor in the window asks for a place on a map', () =>
  {
    // Arrange: an event window, which is where the transfer editor asks from.
    const { locationPicks } = renderApp({ kind: 'event', mapId: 1, eventId: 3 });
    const before = screen.queryByRole('dialog');

    // Act.
    act(() =>
    {
      locationPicks.pick({ mapId: 2, x: 1, y: 0 }).catch(() => undefined);
    });

    // Assert: the picker shows, starting where the ask starts, over the event window.
    expect([ before, screen.getByRole('dialog', { name: 'Choose the destination' }) !== null, screen.getByText('Lands on 1, 0') !== null, screen.getByLabelText('Name') ])
      .toStrictEqual([ null, true, true, expect.objectContaining({ value: 'Chest' }) ]);
  });

  it('shows a conflict with another window the moment it is flagged, and settles it only as the author picks', () =>
  {
    // Arrange.
    const { hub, resolveConflict } = renderApp({ kind: 'workspace' });

    // Act.
    act(() => hub.flagConflict('map:2', { kind: 'window', peer: 'window-b', theirs: hub.snapshot('map:2') }));
    const shown = screen.getByTestId('document-conflict').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Keep this window\'s version' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the other window\'s version' }));

    // Assert: both choices reach the settler, and the banner stays until the hub clears the conflict.
    expect([ shown, resolveConflict.mock.calls, screen.queryAllByTestId('document-conflict').length ])
      .toStrictEqual([
        'Map 2 was changed in another window at the same time as this one.Keep this window\'s versionUse the other window\'s version',
        [ [ 'map:2', 'mine' ], [ 'map:2', 'theirs' ] ],
        1,
      ]);
  });

  it('takes the conflict away once it is cleared', () =>
  {
    // Arrange.
    const { hub } = renderApp({ kind: 'workspace' });
    act(() => hub.flagConflict('map:1', { kind: 'disk', content: buildMapJson() as never }));

    // Act.
    act(() => hub.clearConflict('map:1'));

    // Assert.
    expect(screen.queryByTestId('document-conflict'))
      .toBeNull();
  });

  it('offers only keeping this window\'s edits when the file was removed from disk', () =>
  {
    // Arrange.
    const { hub } = renderApp({ kind: 'workspace' });

    // Act.
    act(() =>
    {
      hub.flagConflict('map:1', { kind: 'disk', content: null });
      hub.flagConflict('map:2', { kind: 'disk', content: buildMapJson() as never });
    });

    // Assert.
    expect(screen.getAllByTestId('document-conflict').map(alert => alert.textContent))
      .toStrictEqual([
        'Map 1 was removed from disk while it had unsaved edits here.Keep my edits',
        'Map 2 changed on disk while it had unsaved edits here.Keep my editsLoad the version on disk',
      ]);
  });

  it('names every kind of document in the author\'s words', () =>
  {
    // Arrange: one key of each kind, and an editor-data key it does not know.

    // Act.
    const labels = [ 'map:12', 'mapinfos', 'tilesets', 'common-events', 'system', 'editor-data:blueprints', 'editor-data:tileset-marks', 'editor-data:layouts', 'editor-data:other' ]
      .map(key => documentLabel(key as never));

    // Assert.
    expect(labels)
      .toStrictEqual([ 'Map 12', 'The map tree', 'The tilesets', 'The common events', 'The switch and variable names', 'Blueprints', 'Tileset marks', 'Saved layouts', 'other' ]);
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
