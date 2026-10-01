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
 * that panel a little off where it sat. Once torn out, the tab's button puts it back where it came from instead, and
 * its menu offers both; a panel that already has a window to itself has nothing left to tear out of, so the menu greys
 * that choice out. The close button and a middle click close the tab.
 *
 * The start panel's tab is the exception, since the start panel holds the centre and must never leave it: no buttons,
 * no menu, and a press on it stops there, so the dock never floats or drags it. It shows only while the start panel is
 * alone in its group, standing in for the maps that are not there.
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

  /**
   * Finds the buttons on the tab in a torn-out window. That window's page has no window of its own to ask roles of,
   * so the buttons are read directly.
   * @param {FakePopout} popout The window.
   * @returns {HTMLButtonElement[]} The tab's buttons.
   */
  const buttonsIn = (popout: FakePopout): HTMLButtonElement[] =>
  {
    return Array.from(within(popout.window.document.body).getByTestId('workspace-tab').querySelectorAll('button'));
  };

  it('turns its window button into one putting it back, once torn out', async () =>
  {
    // Arrange.
    const { api, controller } = await renderDock();

    // Act.
    await act(async () =>
    {
      await controller.popouts.tearOutBeside(api.getPanel('b') as IDockviewPanel);
      await settle();
    });

    // Assert.
    expect([ buttonsIn(page.popouts[0]).map(button => button.getAttribute('aria-label')), within(tabShowing('Alpha')).getAllByRole('button').length ])
      .toStrictEqual([ [ 'Put back in the main window', 'Close tab' ], 2 ]);
  });

  it('puts its panel back where it came from from that button, closing the window it had to itself', async () =>
  {
    // Arrange.
    const { api, controller } = await renderDock();
    await act(async () =>
    {
      await controller.popouts.tearOutBeside(api.getPanel('b') as IDockviewPanel);
      await settle();
    });

    // Act: clicked with the main page's own event, since the torn-out window's page has no window to make one.
    await act(async () =>
    {
      buttonsIn(page.popouts[0])[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
    });

    // Assert.
    expect([ describeGroups(api), page.popouts[0].window.closed ])
      .toStrictEqual([ [ 'grid:a+b+c' ], true ]);
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

  describe('the start panel\'s tab', () =>
  {
    /**
     * Renders the dock with the start panel alone in a group of its own, beside the three maps.
     * @returns {Promise<DockviewApi>} The dock.
     */
    const renderWithStart = async (): Promise<DockviewApi> =>
    {
      const { api } = await renderDock();
      await act(async () =>
      {
        api.addPanel({ id: 'start', component: 'plain', title: 'Start', position: { direction: 'right' } });
        await settle();
      });

      return api;
    };

    it('shows its title alone, with no window or close button, while the start panel is alone in its group', async () =>
    {
      // Arrange.
      await renderWithStart();

      // Act.
      const tab = screen.getByTestId('start-tab');

      // Assert: the maps' tabs keep both buttons.
      expect([ tab.textContent, tab.getAttribute('data-hidden'), tab.querySelectorAll('button').length, within(tabShowing('Alpha')).getAllByRole('button').length ])
        .toStrictEqual([ 'Start', 'false', 0, 2 ]);
    });

    it('hides while anything shares its group, and shows again once nothing does', async () =>
    {
      // Arrange.
      const api = await renderWithStart();

      // Act: a map opened into the start panel's group, then closed again.
      await act(async () =>
      {
        api.addPanel({ id: 'd', component: 'plain', title: 'Delta', position: { referencePanel: 'start', direction: 'within' } });
        await settle();
      });
      const whileShared = screen.getByTestId('start-tab').getAttribute('data-hidden');
      await act(async () =>
      {
        api.getPanel('d')?.api.close();
        await settle();
      });

      // Assert.
      expect([ whileShared, screen.getByTestId('start-tab').getAttribute('data-hidden') ])
        .toStrictEqual([ 'true', 'false' ]);
    });

    it('keeps a Shift press from floating the start panel, as it floats any other tab', async () =>
    {
      // Arrange.
      const api = await renderWithStart();

      // Act.
      act(() =>
      {
        fireEvent.pointerDown(screen.getByTestId('start-tab'), { button: 0, shiftKey: true, pointerId: 3 });
        fireEvent.pointerDown(tabShowing('Alpha'), { button: 0, shiftKey: true, pointerId: 4 });
      });

      // Assert.
      expect([ api.getPanel('start')?.api.location.type, api.getPanel('a')?.api.location.type ])
        .toStrictEqual([ 'grid', 'floating' ]);
    });
  });

  describe('tabMenuItems', () =>
  {
    /**
     * A stand-in keeper that says whether a panel has a window to itself and records what it is asked to do.
     * @param {boolean} alone What it says.
     * @returns {PopoutKeeper} The keeper.
     */
    const keeperSaying = (alone: boolean) =>
    {
      return {
        isAloneInWindow: () => alone,
        tearOutBeside: vi.fn(async () => true),
        putBack: vi.fn(),
      } as unknown as PopoutKeeper & { tearOutBeside: ReturnType<typeof vi.fn>; putBack: ReturnType<typeof vi.fn> };
    };

    /**
     * A stand-in panel, docked or torn out.
     * @param {string} where Its window: 'grid' for the main window, 'popout' for a torn-out one.
     * @returns {IDockviewPanel} The panel.
     */
    const panelIn = (where: 'grid' | 'popout') => ({ id: 'b', api: { location: { type: where } } }) as unknown as IDockviewPanel;

    /**
     * Writes a menu out as text: each choice with whether it is greyed out, and the dock's own items by name.
     * @param {ReturnType<typeof tabMenuItems>} items The menu.
     * @returns {string[]} The menu as text.
     */
    const asText = (items: ReturnType<typeof tabMenuItems>) => items.map(item => (typeof item === 'string' ? item : `${item.label}:${String(item.disabled === true)}`));

    it('offers a docked panel a window of its own, then closing it', () =>
    {
      // Arrange.
      const keeper = keeperSaying(false);
      const panel = panelIn('grid');

      // Act.
      const items = tabMenuItems(keeper, panel);
      (items[0] as { action: () => void }).action();

      // Assert.
      expect([ asText(items), keeper.tearOutBeside.mock.calls ])
        .toStrictEqual([ [ 'Open in its own window:false', 'separator', 'close' ], [ [ panel ] ] ]);
    });

    it('offers the start panel no menu at all, since it never leaves the centre', () =>
    {
      // Arrange.
      const keeper = keeperSaying(false);
      const start = { id: 'start', api: { location: { type: 'grid' } } } as unknown as IDockviewPanel;

      // Act.
      const items = tabMenuItems(keeper, start);

      // Assert.
      expect(items)
        .toStrictEqual([]);
    });

    it('offers a torn-out panel a way back, greying out a window of its own once it has one', () =>
    {
      // Arrange.
      const keeper = keeperSaying(true);
      const panel = panelIn('popout');

      // Act.
      const items = tabMenuItems(keeper, panel);
      (items[1] as { action: () => void }).action();

      // Assert.
      expect([ asText(items), keeper.putBack.mock.calls ])
        .toStrictEqual([ [ 'Open in its own window:true', 'Put back in the main window:false', 'separator', 'close' ], [ [ panel ] ] ]);
    });
  });
});
