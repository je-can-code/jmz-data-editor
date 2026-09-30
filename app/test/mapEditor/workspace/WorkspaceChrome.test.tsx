/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell, type OpenBrowserWindow } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import { DocumentHub, type DocumentStore } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { NoticeBar, WorkspaceBar } from '../../../src/mapEditor/workspace/WorkspaceChrome.tsx';
import { WorkspaceController } from '../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildMapJson } from '../support/fixtures.ts';

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
});
