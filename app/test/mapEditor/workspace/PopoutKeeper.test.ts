/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel, SerializedDockview } from 'dockview-react';
import { readOrigins, withOrigins } from '../../../src/mapEditor/core/workspace/tearOut.ts';
import type { JsonObject } from '../../../src/mapEditor/core/model/json.ts';
import { PopoutKeeper } from '../../../src/mapEditor/workspace/PopoutKeeper.ts';
import { createRealDock, describeGrid, describeGroups, dragTab, settle, type RealDock } from '../support/realDock.ts';

/*
 * Tearing a panel out gives that one tab a window of its own and leaves the rest of its group where it was. A tab
 * dragged beyond its window's edge and let go there is torn out where it was let go, like a browser tab; a tab let go
 * anywhere on the page is left to the dock, which moves it or leaves it be. A tab's button tears it out a little off
 * where it sat. A panel that already has a window to itself is never torn out again, since that would only swap one
 * window for another.
 *
 * Closing a torn-out window brings every panel in it back where it came from, as a tab in the group it left and at its
 * old place among the tabs, however the panels were laid out inside the window. Left to itself the dock returns only a
 * window's first group to where it was torn from, and drops any group made inside the window at the main window's far
 * edge, beside whatever happens to be there: exactly how maps split side by side in a torn-out window ended up on
 * either side of the map tree. A panel whose group has gone joins the panels it sat beside, and a map opened straight
 * into a torn-out window joins the maps. A torn-out tab can also be put back on its own. Where each panel came from is
 * kept with the saved layout, so a torn-out window that comes back with it still brings its panels home.
 *
 * The dock here is the real one, dragging with pointers as the workspace's does; only the windows it opens are faked,
 * and each can be closed by hand the way a person closes a window. The page is 1024 by 768, so a drag let go at x 1300
 * is let go beyond the window's right edge.
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
   * Makes a keeper for a dock, sending maps with no place of their own to the first main-window group holding a map
   * that is not itself on its way back, as the workspace does.
   * @param {DockviewApi} api The dock.
   * @returns {PopoutKeeper} The keeper, not yet watching.
   */
  const keeperFor = (api: DockviewApi): PopoutKeeper =>
  {
    return new PopoutKeeper({
      popoutUrl: '/popout.html',
      mapsGroup: returning => api.groups.find(group => group.api.location.type === 'grid'
        && group.panels.some(each => each.api.component === 'map' && returning.has(each.id) === false)) ?? null,
    });
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
    const keeper = keeperFor(api);
    const detach = keeper.attach(api);
    return { api, keeper, detach };
  };

  /**
   * Finds the group a torn-out panel sits in.
   * @param {DockviewApi} api The dock.
   * @param {string} id The panel's id.
   * @returns {DockviewGroupPanel} Its group.
   */
  const groupOf = (api: DockviewApi, id: string): DockviewGroupPanel =>
  {
    return panel(api, id).group;
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

  describe('closing a torn-out window', () =>
  {
    it('puts a torn-out tab back in the group it left, at its old place among the tabs', async () =>
    {
      // Arrange: the dock alone would put B back last, after C.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();

      // Act.
      dock.popouts[0].closeByHand();
      await settle();

      // Assert.
      expect([ describeGroups(api), keeper.origins.size ])
        .toStrictEqual([ [ 'grid:tree', 'grid:a+b+c' ], 0 ]);
    });

    it('brings back maps split side by side in a window torn out whole, as tabs in the group they left', async () =>
    {
      // Arrange: the maps' group torn out whole, then A dragged to the torn-out window's left edge beside B.
      const { api } = dock;
      api.addPanel({ id: 'tree', component: 'map-tree', title: 'Maps' });
      api.addPanel({ id: 'a', component: 'map', title: 'A', position: { direction: 'right' } });
      api.addPanel({ id: 'b', component: 'map', title: 'B', position: { referencePanel: 'a', direction: 'within' } });
      api.addPanel({ id: 'props', component: 'map-properties', title: 'Map properties', position: { direction: 'right' } });
      keeperFor(api).attach(api);
      await api.addPopoutGroup(groupOf(api, 'a'), { popoutUrl: '/popout.html' });
      await settle();
      panel(api, 'a').api.moveTo({ group: groupOf(api, 'b'), position: 'left' });
      const split = describeGroups(api);

      // Act.
      dock.popouts[0].closeByHand();
      await settle();

      // Assert: both maps back between the tree and the properties, where they came from, nothing at the far edge.
      expect([ split, describeGrid(api), api.groups.filter(group => group.api.location.type === 'grid').length ])
        .toStrictEqual([
          [ 'grid:tree', 'grid:props', 'popout:b', 'popout:a' ],
          [ 'tree', 'b+a', 'props' ],
          3,
        ]);
    });

    it('brings a map moved into the window as a split back into the group it left, after the one torn out', async () =>
    {
      // Arrange: B torn out, then C moved from the main window into B's window, split beside it.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();
      panel(api, 'c').api.moveTo({ group: groupOf(api, 'b'), position: 'right' });

      // Act.
      dock.popouts[0].closeByHand();
      await settle();

      // Assert.
      expect(describeGroups(api))
        .toStrictEqual([ 'grid:tree', 'grid:a+b+c' ]);
    });

    it('brings a map opened straight into the window back among the maps', async () =>
    {
      // Arrange: D opened inside B's window, then split beside it, so it never sat in the main window.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();
      api.addPanel({ id: 'd', component: 'map', title: 'D', position: { referenceGroup: groupOf(api, 'b'), direction: 'within' } });
      panel(api, 'd').api.moveTo({ group: groupOf(api, 'b'), position: 'right' });
      const before = describeGroups(api);

      // Act.
      dock.popouts[0].closeByHand();
      await settle();

      // Assert.
      expect([ before, describeGroups(api) ])
        .toStrictEqual([ [ 'grid:tree', 'grid:a+c', 'popout:b', 'popout:d' ], [ 'grid:tree', 'grid:a+b+c+d' ] ]);
    });

    it('brings a tab whose group has gone back beside the panels it sat with', async () =>
    {
      // Arrange: B torn out, then A and C moved into a new group beside the tree, so B's own group went.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();
      panel(api, 'a').api.moveTo({ group: groupOf(api, 'tree'), position: 'bottom' });
      panel(api, 'c').api.moveTo({ group: groupOf(api, 'a'), position: 'center' });
      const before = describeGroups(api);

      // Act.
      dock.popouts[0].closeByHand();
      await settle();

      // Assert.
      expect([ before, describeGroups(api) ])
        .toStrictEqual([ [ 'grid:tree', 'grid:a+c', 'popout:b' ], [ 'grid:tree', 'grid:a+c+b' ] ]);
    });

    it('brings a torn-out window saved with the layout home once it comes back with it', async () =>
    {
      // Arrange: B torn out, the layout saved with where B came from, and a fresh dock restoring it.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();
      const saved = withOrigins(api.toJSON() as unknown as JsonObject, keeper.origins);
      api.clear();
      const restored = keeperFor(api);
      restored.attach(api);
      api.fromJSON(saved as unknown as SerializedDockview);
      restored.adopt(readOrigins(saved));
      await settle(8);
      const reopened = describeGroups(api);

      // Act.
      dock.popouts[dock.popouts.length - 1].closeByHand();
      await settle();

      // Assert.
      expect([ reopened, describeGroups(api) ])
        .toStrictEqual([ [ 'grid:tree', 'grid:a+c', 'popout:b' ], [ 'grid:tree', 'grid:a+b+c' ] ]);
    });
  });

  describe('a layout saved with a torn-out window', () =>
  {
    /**
     * Tears B out, saves the layout with where B came from, and clears the dock for a restore, as a restart does.
     * @returns {Promise<{ api: DockviewApi, saved: JsonObject }>} The dock, cleared, and the saved layout.
     */
    const saveWithBTornOut = async () =>
    {
      const { api, keeper, detach } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();
      const saved = withOrigins(api.toJSON() as unknown as JsonObject, keeper.origins);
      detach();
      api.clear();
      return { api, saved };
    };

    it('leaves a panel alone while the window it is being reopened in loads', async () =>
    {
      // Arrange: the layout restored, its window asked for but not yet loaded.
      const { api, saved } = await saveWithBTornOut();
      const keeper = keeperFor(api);
      keeper.attach(api);
      api.fromJSON(saved as unknown as SerializedDockview);
      keeper.adopt(readOrigins(saved));
      await api.popoutRestorationPromise;

      // Act.
      keeper.returnStrays();
      await settle();

      // Assert.
      expect(describeGroups(api))
        .toStrictEqual([ 'grid:tree', 'grid:a+c', 'popout:b' ]);
    });

    it('puts a panel back at its old place when its window cannot be reopened', async () =>
    {
      // Arrange: the next window asked for is refused, as a browser blocks windows a page opens on its own.
      const { api, saved } = await saveWithBTornOut();
      const keeper = keeperFor(api);
      keeper.attach(api);
      const refused = window.open as unknown as { mockImplementationOnce: (stand: () => null) => void };
      refused.mockImplementationOnce(() => null);

      // Act.
      api.fromJSON(saved as unknown as SerializedDockview);
      keeper.adopt(readOrigins(saved));
      await settle(8);

      // Assert: the dock alone would have put B last.
      expect(describeGroups(api))
        .toStrictEqual([ 'grid:tree', 'grid:a+b+c' ]);
    });
  });

  describe('putBack', () =>
  {
    it('puts one torn-out tab back where it came from, leaving the rest of its window', async () =>
    {
      // Arrange: B torn out, and C stacked with it in its window.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();
      panel(api, 'c').api.moveTo({ group: groupOf(api, 'b'), position: 'center' });

      // Act.
      keeper.putBack(panel(api, 'c'));
      await settle();

      // Assert.
      expect(describeGroups(api))
        .toStrictEqual([ 'grid:tree', 'grid:a+c', 'popout:b' ]);
    });

    it('puts back the last tab in a window by closing the window', async () =>
    {
      // Arrange.
      const { api, keeper } = layOut();
      await keeper.tearOutBeside(panel(api, 'b'));
      await settle();

      // Act.
      keeper.putBack(panel(api, 'b'));
      await settle();

      // Assert.
      expect([ describeGroups(api), dock.popouts[0].window.closed ])
        .toStrictEqual([ [ 'grid:tree', 'grid:a+b+c' ], true ]);
    });

    it('leaves a docked panel where it is', async () =>
    {
      // Arrange.
      const { api, keeper } = layOut();

      // Act.
      keeper.putBack(panel(api, 'b'));
      await settle();

      // Assert.
      expect(describeGroups(api))
        .toStrictEqual([ 'grid:tree', 'grid:a+b+c' ]);
    });
  });
});
