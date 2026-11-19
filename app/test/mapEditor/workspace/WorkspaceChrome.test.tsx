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
import { MemoryChannelNetwork } from '../support/standIns.ts';

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

  it('opens the switches and variables through the window shell, beside the common events', () =>
  {
    // Arrange.
    const { openWindow } = renderChrome();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Switches & Variables' }));

    // Assert: the button sits right after Common events, and opens its own window.
    const labels = screen.getAllByRole('button').map(button => button.textContent);
    expect([ labels[labels.indexOf('Common events') + 1], openWindow.mock.calls ])
      .toStrictEqual([ 'Switches & Variables', [ [ '', 'jmz-switches-variables', 'popup,width=1180,height=860' ] ] ]);
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

  /*
   * Play starts the project's game, which only the NW.js shell can do, so the button is there only once the shell has
   * answered the page, however long after the bar first draws that is. The game plays what is on disk: with nothing
   * unsaved a click plays at once, and with edits not yet saved it asks first, playing only when told to. The button
   * rests while a Play is on its way, and the notice at the foot says what became of it.
   */
  describe('Play', () =>
  {
    /**
     * Renders the bar and the notices over a page's shell on an in-memory shell channel, whose NW.js end the test plays,
     * and a hub holding one map.
     * @returns {object} The network, the shell's end of the channel, the requests it heard, and the hub.
     */
    const renderWithShell = () =>
    {
      const network = new MemoryChannelNetwork();
      const relay = network.open('jmz-shell');
      const heard: { type: string; replyTo?: string }[] = [];
      relay.addEventListener('message', event => heard.push(event.data as { type: string; replyTo?: string }));
      const shell = new WindowShell({
        channel: network.open('jmz-shell'),
        origin: 'http://127.0.0.1:3000',
        openWindow: () => null,
        openChannel: name => network.open(name),
      });
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
      const services = { hub, shell, api: null } as unknown as MapEditorServices;
      render(
        <WorkspaceProvider controller={new WorkspaceController(services)}>
          <WorkspaceBar onResetLayout={() => undefined}/>
          <NoticeBar/>
        </WorkspaceProvider>
      );

      return { network, relay, heard, hub };
    };

    /**
     * Answers the page's hello as the NW.js shell does, and clears what the shell heard so far.
     * @param {ReturnType<typeof renderWithShell>} rendered The rendered bar and its channel.
     */
    const answerHello = (rendered: ReturnType<typeof renderWithShell>) =>
    {
      act(() =>
      {
        rendered.network.flush();
        rendered.relay.postMessage({ type: 'shell-ready' });
        rendered.network.flush();
      });
      rendered.heard.length = 0;
    };

    /**
     * The play requests the shell heard.
     * @param {ReturnType<typeof renderWithShell>} rendered The rendered bar and its channel.
     * @returns {{ type: string, replyTo?: string }[]} The requests.
     */
    const playRequests = (rendered: ReturnType<typeof renderWithShell>) =>
    {
      act(() =>
      {
        rendered.network.flush();
      });
      return rendered.heard.filter(request => request.type === 'play');
    };

    it('has no Play button until the NW.js shell answers, and one from then on', () =>
    {
      // Arrange: the bar drawn before the shell's answer is in.
      const rendered = renderWithShell();
      const before = screen.queryByRole('button', { name: 'Play' });

      // Act.
      answerHello(rendered);

      // Assert.
      expect([ before, screen.queryByRole('button', { name: 'Play' }) !== null ])
        .toStrictEqual([ null, true ]);
    });

    it('plays at once with nothing unsaved, resting until the shell says what became of it', async () =>
    {
      // Arrange.
      const rendered = renderWithShell();
      answerHello(rendered);

      // Act.
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      const [ request ] = playRequests(rendered);
      const restingWhileAsked = screen.getByRole('button', { name: 'Play' }).hasAttribute('disabled');
      act(() =>
      {
        rendered.network.open(request.replyTo as string).postMessage({ type: 'play-result', result: 'started' });
        rendered.network.flush();
      });

      // Assert.
      await waitFor(() => expect(screen.getByTestId('workspace-notice').textContent)
        .toBe('Playing.'));
      expect([ restingWhileAsked, screen.getByRole('button', { name: 'Play' }).hasAttribute('disabled'), screen.queryByRole('dialog') ])
        .toStrictEqual([ true, false, null ]);
    });

    it('asks before playing over unsaved edits, and plays nothing when told not to', () =>
    {
      // Arrange: the map edited and not saved.
      const rendered = renderWithShell();
      answerHello(rendered);
      act(() =>
      {
        rendered.hub.edit('Rename map', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'displayName' ], 'Harbor'));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      const question = within(screen.getByRole('dialog')).getByText('Play without your unsaved changes?') !== null;

      // Act.
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      // Assert.
      expect([ question, playRequests(rendered) ])
        .toStrictEqual([ true, [] ]);
    });

    it('puts the question away on Escape, playing nothing', async () =>
    {
      // Arrange: the map edited and not saved, and the question asked.
      const rendered = renderWithShell();
      answerHello(rendered);
      act(() =>
      {
        rendered.hub.edit('Rename map', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'displayName' ], 'Harbor'));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));

      // Act.
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

      // Assert.
      await waitFor(() => expect(screen.queryByRole('dialog'))
        .toBeNull());
      expect(playRequests(rendered))
        .toStrictEqual([]);
    });

    it('plays over unsaved edits once told to', () =>
    {
      // Arrange: the map edited and not saved, and the question asked.
      const rendered = renderWithShell();
      answerHello(rendered);
      act(() =>
      {
        rendered.hub.edit('Rename map', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'displayName' ], 'Harbor'));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      const before = playRequests(rendered).length;

      // Act.
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Play' }));

      // Assert.
      expect([ before, playRequests(rendered).length ])
        .toStrictEqual([ 0, 1 ]);
    });

    it('plays once over unsaved edits when the question\'s Play is pressed twice as the question goes', () =>
    {
      // Arrange: the map edited and not saved, and the question asked.
      const rendered = renderWithShell();
      answerHello(rendered);
      act(() =>
      {
        rendered.hub.edit('Rename map', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'displayName' ], 'Harbor'));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Play' });

      // Act: a double-click, the second press landing while the question is still fading out and can still be pressed.
      fireEvent.click(confirm);
      const stillShown = confirm.isConnected;
      fireEvent.click(confirm);

      // Assert.
      expect([ stillShown, playRequests(rendered).length ])
        .toStrictEqual([ true, 1 ]);
    });
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
      const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow: () => null });
      const services = { hub: new DocumentHub({ clientId: 'window-a' }), shell, api: null } as unknown as MapEditorServices;
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
          [ 'Stamps', true ],
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

  describe('the side fold buttons', () =>
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
     * Renders the bar over a controller watching a real, default-laid-out dock, its side keeper attached the way
     * Workspace.tsx's own onReady attaches it.
     * @returns {{ controller: WorkspaceController }} The controller.
     */
    const renderWithDock = () =>
    {
      const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow: () => null });
      const services = { hub: new DocumentHub({ clientId: 'window-a' }), shell, api: null } as unknown as MapEditorServices;
      const controller = new WorkspaceController(services);
      controller.attach(dock.api);
      controller.sides.attach(dock.api);
      dock.api.layout(1920, 1032);
      addDefaultPanels(dock.api);
      render(
        <WorkspaceProvider controller={controller}>
          <WorkspaceBar onResetLayout={() => undefined}/>
        </WorkspaceProvider>
      );

      return { controller };
    };

    it('folds the left side away and back, the button\'s label following it both ways', () =>
    {
      // Arrange.
      renderWithDock();
      const mapTree = (dock.api.getPanel('map-tree') as IDockviewPanel).group;

      // Act.
      fireEvent.click(screen.getByRole('button', { name: 'Collapse the left side' }));
      const whileCollapsed = { width: mapTree.api.width, button: screen.queryByRole('button', { name: 'Expand the left side' }) !== null };
      fireEvent.click(screen.getByRole('button', { name: 'Expand the left side' }));

      // Assert.
      expect([ whileCollapsed, { width: mapTree.api.width, button: screen.queryByRole('button', { name: 'Collapse the left side' }) !== null } ])
        .toStrictEqual([
          { width: 0, button: true },
          { width: 300, button: true },
        ]);
    });

    it('folds the right side away and back, leaving the left side\'s own width untouched', () =>
    {
      // Arrange.
      renderWithDock();
      const history = (dock.api.getPanel('history') as IDockviewPanel).group;
      const mapTree = (dock.api.getPanel('map-tree') as IDockviewPanel).group;
      const leftWidthBefore = mapTree.api.width;

      // Act.
      fireEvent.click(screen.getByRole('button', { name: 'Collapse the right side' }));
      const whileCollapsed = { right: history.api.width, left: mapTree.api.width, leftLabel: screen.queryByRole('button', { name: 'Collapse the left side' }) !== null };
      fireEvent.click(screen.getByRole('button', { name: 'Expand the right side' }));

      // Assert: the right side folded and came back, the left side's width never moved, and its own button never flipped.
      expect([ whileCollapsed, { right: history.api.width, left: mapTree.api.width } ])
        .toStrictEqual([
          { right: 0, left: leftWidthBefore, leftLabel: true },
          { right: 360, left: leftWidthBefore },
        ]);
    });
  });
});
