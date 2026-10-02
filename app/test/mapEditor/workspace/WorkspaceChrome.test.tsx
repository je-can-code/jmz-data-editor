/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { IDockviewPanel } from 'dockview-react';
import { WindowShell, type OpenBrowserWindow } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import { DocumentHub, type DocumentStore } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { addDefaultPanels } from '../../../src/mapEditor/workspace/defaultLayout.ts';
import { NoticeBar, WorkspaceBar } from '../../../src/mapEditor/workspace/WorkspaceChrome.tsx';
import { WorkspaceController } from '../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildMapJson } from '../support/fixtures.ts';
import { createRealDock, type RealDock } from '../support/realDock.ts';

/*
 * The workspace's chrome owes the author three things at a glance: whether anything is unsaved, and a way to save
 * it all (Ctrl+S does the same); a way back to the data editor, opened through the window shell so under NW.js it
 * gets a window and a process of its own; and a way to put the layout back as it started. Short messages (what an
 * operation did, why an undo could not happen) show at the foot, and go when dismissed.
 */
describe('WorkspaceChrome', () =>
{
  /**
   * Renders the bar and the notices over a real controller, a hub holding two maps and a store recording saves.
   * @returns {object} The controller, the hub, the saves, the window opener and the reset spy.
   */
  const renderChrome = () =>
  {
    const saves: string[] = [];
    const store: DocumentStore = {
      load: async () => null,
      save: async key =>
      {
        saves.push(key);
      },
    };
    const hub = new DocumentHub({ clientId: 'window-a', store });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    const openWindow = vi.fn<OpenBrowserWindow>(() => null);
    const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow });
    const services = { hub, shell, api: null } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    const onResetLayout = vi.fn();
    render(
      <WorkspaceProvider controller={controller}>
        <WorkspaceBar onResetLayout={onResetLayout}/>
        <NoticeBar/>
      </WorkspaceProvider>
    );

    return { controller, hub, saves, openWindow, onResetLayout };
  };

  it('opens the data editor through the window shell', () =>
  {
    // Arrange.
    const { openWindow } = renderChrome();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Data editor' }));

    // Assert.
    expect(openWindow.mock.calls)
      .toStrictEqual([ [ '', 'jmz-data-editor', 'popup,width=1600,height=1000' ] ]);
  });

  it('opens the common events through the window shell', () =>
  {
    // Arrange.
    const { openWindow } = renderChrome();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Common events' }));

    // Assert.
    expect(openWindow.mock.calls)
      .toStrictEqual([ [ '', 'jmz-common-events', 'popup,width=1280,height=860' ] ]);
  });

  it('says everything is saved while nothing is waiting', () =>
  {
    // Arrange: nothing edited.

    // Act.
    renderChrome();

    // Assert.
    expect(screen.getByRole('button', { name: 'Saved' }))
      .toBeDisabled();
  });

  it('counts the documents waiting to be saved, and saves them all with one click', async () =>
  {
    // Arrange: one of the two maps is edited.
    const { hub, saves } = renderChrome();
    act(() =>
    {
      hub.edit('Rename map', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'displayName' ], 'Harbor'));
    });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));

    // Assert.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' }))
      .toBeDisabled());
    expect([ saves, screen.getByTestId('workspace-notice').textContent ])
      .toStrictEqual([ [ 'map:2' ], 'Saved 1 map.' ]);
  });

  it('puts the layout back on request', () =>
  {
    // Arrange.
    const { onResetLayout } = renderChrome();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));

    // Assert.
    expect(onResetLayout.mock.calls.length)
      .toBe(1);
  });

  it('keeps an alarm up, in red, long after any other message would have gone', () =>
  {
    // Arrange.
    vi.useFakeTimers();
    try
    {
      const { controller } = renderChrome();
      act(() => controller.notify('Map 2\'s file could not be written back.', 'alarm'));

      // Act: far longer than the longest any other message stays.
      act(() => vi.advanceTimersByTime(60000));

      // Assert.
      const notice = screen.getByTestId('workspace-notice');
      expect([ notice.textContent, notice.classList.contains('MuiAlert-filledError') ])
        .toStrictEqual([ 'Map 2\'s file could not be written back.', true ]);
    }
    finally
    {
      vi.useRealTimers();
    }
  });

  it('shows a message until it is dismissed', async () =>
  {
    // Arrange.
    const { controller } = renderChrome();
    act(() => controller.notify('"Delete "Cave"" cannot undo: map 5 has changed since.', 'error'));
    const shown = screen.getByTestId('workspace-notice').textContent;

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert.
    expect(shown)
      .toBe('"Delete "Cave"" cannot undo: map 5 has changed since.');
    await waitFor(() => expect(controller.getState().notice)
      .toBeNull());
  });

  describe('the Panels menu', () =>
  {
    let dock: RealDock;

    beforeEach(() =>
    {
      dock = createRealDock();
    });

    afterEach(() =>
    {
      dock.dispose();
    });

    /**
     * Renders the bar over a controller watching a real, default-laid-out dock.
     * @returns {{ controller: WorkspaceController }} The controller.
     */
    const renderWithDock = () =>
    {
      const services = { hub: new DocumentHub({ clientId: 'window-a' }), api: null } as unknown as MapEditorServices;
      const controller = new WorkspaceController(services);
      controller.attach(dock.api);
      controller.collapses.attach(dock.api);
      dock.api.layout(1920, 1032);
      addDefaultPanels(dock.api);
      render(
        <WorkspaceProvider controller={controller}>
          <WorkspaceBar onResetLayout={() => undefined}/>
        </WorkspaceProvider>
      );

      return { controller };
    };

    /**
     * Reads the Panels menu's items as text, with whether each carries the open checkmark.
     * @returns {[string, boolean][]} Each item's title and whether it is checked.
     */
    const menuItems = (): [ string, boolean ][] =>
    {
      return screen.getAllByRole('menuitem').map(item => [ item.textContent ?? '', within(item).queryByTestId('panel-open-check') !== null ]);
    };

    it('lists every side panel, a checkmark on each one open and none on one that is closed', () =>
    {
      // Arrange: history closed, as its close button would leave it.
      renderWithDock();
      (dock.api.getPanel('history') as IDockviewPanel).api.close();

      // Act.
      fireEvent.click(screen.getByRole('button', { name: 'Panels' }));

      // Assert.
      expect(menuItems())
        .toStrictEqual([
          [ 'Maps', true ],
          [ 'Tiles', true ],
          [ 'Layers', true ],
          [ 'Map properties', true ],
          [ 'Quick settings', true ],
          [ 'History', false ],
          [ 'Events', true ],
        ]);
    });

    it('opens the events list from the menu in front of the history it waits behind', () =>
    {
      // Arrange: the default layout, where the events list is a tab behind the history.
      renderWithDock();
      const { group } = dock.api.getPanel('events') as IDockviewPanel;
      const before = group.activePanel?.id;
      fireEvent.click(screen.getByRole('button', { name: 'Panels' }));

      // Act.
      fireEvent.click(screen.getByRole('menuitem', { name: 'Events' }));

      // Assert.
      expect([ before, group.activePanel?.id ])
        .toStrictEqual([ 'history', 'events' ]);
    });

    it('reopens a closed panel at its default place, and closes the menu', () =>
    {
      // Arrange.
      renderWithDock();
      (dock.api.getPanel('history') as IDockviewPanel).api.close();
      fireEvent.click(screen.getByRole('button', { name: 'Panels' }));

      // Act.
      fireEvent.click(screen.getByRole('menuitem', { name: 'History' }));

      // Assert.
      expect([ dock.api.getPanel('history') !== undefined, screen.queryAllByRole('menuitem').length ])
        .toStrictEqual([ true, 0 ]);
    });

    it('brings an open panel to the front of its group when chosen', () =>
    {
      // Arrange: quick settings is open but behind map properties, which addDefaultPanels leaves active.
      renderWithDock();
      const { group } = dock.api.getPanel('quick-settings') as IDockviewPanel;
      fireEvent.click(screen.getByRole('button', { name: 'Panels' }));

      // Act.
      fireEvent.click(screen.getByRole('menuitem', { name: 'Quick settings' }));

      // Assert.
      expect(group.activePanel?.id)
        .toBe('quick-settings');
    });
  });
});
