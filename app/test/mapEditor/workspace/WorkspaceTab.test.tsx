/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DockviewReact, type DockviewApi, type IDockviewPanel } from 'dockview-react';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import type { PopoutKeeper } from '../../../src/mapEditor/workspace/PopoutKeeper.ts';
import { WorkspaceController } from '../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { tabMenuItems, WorkspaceTab } from '../../../src/mapEditor/workspace/WorkspaceTab.tsx';
import { describeGroups, installDockPage, settle, type FakePopout } from '../support/realDock.ts';

/*
 * Every tab carries its own way into a window of its own, so tearing out one map never takes the maps stacked with it:
 * a button on the tab, beside its close button, and the same choice on the tab's right-click menu, each opening just
 * that panel a little off where it sat. A panel that already has a window to itself has nothing left to tear out of:
 * its tab drops the button and its menu greys the choice out. The close button and a middle click close the tab.
 *
 * The dock here is the real one, rendering the real tabs; only the windows it opens are faked.
 */
describe('WorkspaceTab', () =>
{
  let page: { popouts: FakePopout[]; restore: () => void };

  beforeEach(() =>
  {
    page = installDockPage();
  });

  afterEach(() =>
  {
    page.restore();
  });

  /**
   * Renders the workspace's dock with the workspace's tabs, holding three maps stacked in one group.
   * @returns {Promise<{ api: DockviewApi, controller: WorkspaceController }>} The dock and the controller.
   */
  const renderDock = async () =>
  {
    const services = { hub: new DocumentHub({ clientId: 'window-a' }), api: null, openDocument: async () => undefined };
    const controller = new WorkspaceController(services as unknown as MapEditorServices);
    const components = { plain: () => <div/> };
    const ready: { api: DockviewApi | null } = { api: null };
    render(
      <WorkspaceProvider controller={controller}>
        <DockviewReact
          components={components}
          dndStrategy={'pointer'}
          popoutUrl={'/popout.html'}
          defaultTabComponent={WorkspaceTab}
          getTabContextMenuItems={params => tabMenuItems(controller.popouts, params.panel)}
          onReady={event =>
          {
            ready.api = event.api;
          }}
        />
      </WorkspaceProvider>
    );

    const api = ready.api as unknown as DockviewApi;
    await act(async () =>
    {
      controller.attach(api);
      controller.popouts.attach(api);
      api.layout(1600, 900);
      api.addPanel({ id: 'a', component: 'plain', title: 'Alpha' });
      api.addPanel({ id: 'b', component: 'plain', title: 'Bravo', position: { referencePanel: 'a', direction: 'within' } });
      api.addPanel({ id: 'c', component: 'plain', title: 'Charlie', position: { referencePanel: 'a', direction: 'within' } });
      await settle();
    });

    return { api, controller };
  };

  /**
   * Finds the tab showing a title, in the main window.
   * @param {string} title The tab's title.
   * @returns {HTMLElement} The tab.
   */
  const tabShowing = (title: string): HTMLElement =>
  {
    return screen.getAllByTestId('workspace-tab').find(tab => tab.textContent === title) as HTMLElement;
  };

  it('opens just its own panel in a window of its own from its button', async () =>
  {
    // Arrange.
    const { api } = await renderDock();

    // Act.
    await act(async () =>
    {
      fireEvent.click(within(tabShowing('Bravo')).getByRole('button', { name: 'Open in its own window' }));
      await settle();
    });

    // Assert: the window opens a little off where the group sat, at the group's size.
    expect([ describeGroups(api), page.popouts.map(popout => popout.bounds) ])
      .toStrictEqual([ [ 'grid:a+c', 'popout:b' ], [ { left: 32, top: 32, width: 1600, height: 900 } ] ]);
  });

  it('drops the button once its panel has a window to itself, keeping the close button', async () =>
  {
    // Arrange.
    const { api, controller } = await renderDock();

    // Act.
    await act(async () =>
    {
      await controller.popouts.tearOutBeside(api.getPanel('b') as IDockviewPanel);
      await settle();
    });

    // Assert: the torn-out window's page has no window of its own to ask roles of, so its buttons are read directly.
    const tornOut = within(page.popouts[0].window.document.body).getByTestId('workspace-tab');
    const labels = Array.from(tornOut.querySelectorAll('button')).map(button => button.getAttribute('aria-label'));
    expect([ labels, within(tabShowing('Alpha')).getAllByRole('button').length ])
      .toStrictEqual([ [ 'Close tab' ], 2 ]);
  });

  it('opens just its own panel in a window of its own from its right-click menu', async () =>
  {
    // Arrange.
    const { api } = await renderDock();
    fireEvent.contextMenu(tabShowing('Charlie'));

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Open in its own window' }));
      await settle();
    });

    // Assert.
    expect(describeGroups(api))
      .toStrictEqual([ 'grid:a+b', 'popout:c' ]);
  });

  it('closes just its own panel from its close button, or a middle click', async () =>
  {
    // Arrange.
    const { api } = await renderDock();

    // Act.
    act(() =>
    {
      fireEvent.click(within(tabShowing('Bravo')).getByRole('button', { name: 'Close tab' }));
    });
    act(() =>
    {
      fireEvent.pointerDown(tabShowing('Charlie'), { button: 1 });
      fireEvent.pointerUp(tabShowing('Charlie'), { button: 1 });
    });

    // Assert.
    expect(describeGroups(api))
      .toStrictEqual([ 'grid:a' ]);
  });

  describe('tabMenuItems', () =>
  {
    /**
     * A stand-in keeper that says whether a panel has a window to itself and records tear-outs.
     * @param {boolean} alone What it says.
     * @returns {PopoutKeeper} The keeper.
     */
    const keeperSaying = (alone: boolean) =>
    {
      return { isAloneInWindow: () => alone, tearOutBeside: vi.fn(async () => true) } as unknown as PopoutKeeper & { tearOutBeside: ReturnType<typeof vi.fn> };
    };

    it('offers the panel a window of its own, then closing it', () =>
    {
      // Arrange.
      const keeper = keeperSaying(false);
      const panel = { id: 'b' } as unknown as IDockviewPanel;

      // Act.
      const items = tabMenuItems(keeper, panel);
      (items[0] as { action: () => void }).action();

      // Assert.
      expect([ items.map(item => (typeof item === 'string' ? item : `${item.label}:${String(item.disabled)}`)), keeper.tearOutBeside.mock.calls ])
        .toStrictEqual([ [ 'Open in its own window:false', 'separator', 'close' ], [ [ panel ] ] ]);
    });

    it('greys the choice out for a panel that already has a window to itself', () =>
    {
      // Arrange.
      const keeper = keeperSaying(true);

      // Act.
      const [ first ] = tabMenuItems(keeper, { id: 'b' } as unknown as IDockviewPanel);

      // Assert.
      expect(first)
        .toMatchObject({ label: 'Open in its own window', disabled: true });
    });
  });
});
