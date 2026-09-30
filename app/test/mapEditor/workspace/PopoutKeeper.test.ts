/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { PopoutKeeper } from '../../../src/mapEditor/workspace/PopoutKeeper.ts';
import { createRealDock, describeGroups, dragTab, settle, type RealDock } from '../support/realDock.ts';

/*
 * Tearing a panel out gives that one tab a window of its own and leaves the rest of its group where it was. A tab
 * dragged beyond its window's edge and let go there is torn out where it was let go, like a browser tab; a tab let go
 * anywhere on the page is left to the dock, which moves it or leaves it be. A tab's button tears it out a little off
 * where it sat. A panel that already has a window to itself is never torn out again, since that would only swap one
 * window for another.
 *
 * The dock here is the real one, dragging with pointers as the workspace's does; only the windows it opens are faked.
 * The page is 1024 by 768, so a drag let go at x 1300 is let go beyond the window's right edge.
 */
describe('PopoutKeeper', () =>
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
   * Finds a panel the test laid out.
   * @param {DockviewApi} api The dock.
   * @param {string} id The panel's id.
   * @returns {IDockviewPanel} The panel.
   */
  const panel = (api: DockviewApi, id: string): IDockviewPanel =>
  {
    const found = api.getPanel(id);
    if (found === undefined)
    {
      throw new Error(`no panel ${id}`);
    }

    return found;
  };

  /**
   * Lays out the tree beside three maps stacked as tabs in one group, and a keeper watching the dock.
   * @returns {object} The dock, the keeper, and how to stop it watching.
   */
  const layOut = () =>
  {
    const { api } = dock;
    api.addPanel({ id: 'tree', component: 'map-tree', title: 'Maps' });
    api.addPanel({ id: 'a', component: 'map', title: 'A', position: { direction: 'right' } });
    api.addPanel({ id: 'b', component: 'map', title: 'B', position: { referencePanel: 'a', direction: 'within' } });
    api.addPanel({ id: 'c', component: 'map', title: 'C', position: { referencePanel: 'a', direction: 'within' } });
    const keeper = new PopoutKeeper({ popoutUrl: '/popout.html' });
    const detach = keeper.attach(api);
    return { api, keeper, detach };
  };

  describe('a dragged tab', () =>
  {
    it('opens alone in a window where it was let go, when let go beyond its window', async () =>
    {
      // Arrange.
      const { api } = layOut();

      // Act.
      dragTab(panel(api, 'b'), { x: 1300, y: 400 });
      await settle();

      // Assert: the window keeps the size the maps' group had, with the pointer over its tab.
      expect([ describeGroups(api), dock.popouts.map(popout => popout.bounds) ])
        .toStrictEqual([
          [ 'grid:tree', 'grid:a+c', 'popout:b' ],
          [ { left: 1252, top: 384, width: 800, height: 900 } ],
        ]);
    });

    it('stays docked when let go on the page', async () =>
    {
      // Arrange.
      const { api } = layOut();

      // Act.
      dragTab(panel(api, 'b'), { x: 600, y: 400 });
      await settle();

      // Assert.
      expect([ describeGroups(api), dock.popouts.length ])
        .toStrictEqual([ [ 'grid:tree', 'grid:a+b+c' ], 0 ]);
    });

    it('is no longer followed once the keeper stops watching', async () =>
    {
      // Arrange.
      const { api, detach } = layOut();
      detach();

      // Act.
      dragTab(panel(api, 'b'), { x: 1300, y: 400 });
      await settle();

      // Assert.
      expect([ describeGroups(api), dock.popouts.length ])
        .toStrictEqual([ [ 'grid:tree', 'grid:a+b+c' ], 0 ]);
    });
  });

  describe('tearOutBeside', () =>
  {
    it('opens one tab a little off where its group sat, leaving the rest of the group', async () =>
    {
      // Arrange.
      const { api, keeper } = layOut();
      const docked = panel(api, 'c').group.element.getBoundingClientRect();

      // Act.
      const opened = await keeper.tearOutBeside(panel(api, 'c'));
      await settle();

      // Assert.
      expect([ opened, describeGroups(api), dock.popouts.map(popout => popout.bounds) ])
        .toStrictEqual([
          true,
          [ 'grid:tree', 'grid:a+b', 'popout:c' ],
          [ { left: docked.left + 32, top: docked.top + 32, width: 800, height: 900 } ],
        ]);
    });

    it('opens no second window for a panel that already has one to itself', async () =>
    {
      // Arrange.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'c'));
      await settle();

      // Act.
      const again = await keeper.tearOutBeside(panel(api, 'c'));
      await settle();

      // Assert.
      expect([ again, keeper.isAloneInWindow(panel(api, 'c')), dock.popouts.length ])
        .toStrictEqual([ false, true, 1 ]);
    });
  });
});
