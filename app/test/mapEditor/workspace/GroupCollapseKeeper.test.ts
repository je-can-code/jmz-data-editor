/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel, SerializedDockview } from 'dockview-react';
import { COLLAPSED_GROUP_HEIGHT, readCollapsedGroups, withCollapsedGroups } from '../../../src/mapEditor/core/workspace/collapse.ts';
import type { JsonObject } from '../../../src/mapEditor/core/model/json.ts';
import { centreOf } from '../../../src/mapEditor/workspace/CentreKeeper.ts';
import { addDefaultPanels } from '../../../src/mapEditor/workspace/defaultLayout.ts';
import { GroupCollapseKeeper } from '../../../src/mapEditor/workspace/GroupCollapseKeeper.ts';
import { createRealDock, type RealDock } from '../support/realDock.ts';

/*
 * Collapsing a group pins its height to the tab strip's, so only the tab bar shows and whatever shares its branch
 * takes the room it gives up; toggling it again lifts the pin and puts the height back to what it was, never a
 * guess. The centre, the group the start panel holds, never collapses, the same guarantee CentreKeeper gives the
 * start panel itself against being torn out: nothing merely leaves the chevron off its tab, the keeper refuses the
 * group outright. A group's collapsed size rides along with the saved layout (see core/workspace/collapse.ts), so a
 * group collapsed when the layout was saved comes back pinned to the strip, still remembering the height to put
 * back once it is expanded again.
 *
 * The dock here is the real one, in the workspace's default layout on a 1920 by 1032 window; its windows are faked.
 */
describe('GroupCollapseKeeper', () =>
{
  let dock: RealDock;

  beforeEach(() =>
  {
    dock = createRealDock();
    dock.api.layout(1920, 1032);
    addDefaultPanels(dock.api);
  });

  afterEach(() =>
  {
    dock.dispose();
  });

  /**
   * Finds the group a panel added by addDefaultPanels sits in.
   * @param {DockviewApi} api The dock.
   * @param {string} panelId The panel's id.
   * @returns {DockviewGroupPanel} Its group.
   */
  const groupOf = (api: DockviewApi, panelId: string): DockviewGroupPanel =>
  {
    return (api.getPanel(panelId) as IDockviewPanel).group;
  };

  it('collapses a group to the strip height, and restores the height it had on a second toggle', () =>
  {
    // Arrange: a keeper watching the dock, and the layers group's height before anything happens to it.
    const keeper = new GroupCollapseKeeper();
    keeper.attach(dock.api);
    const group = groupOf(dock.api, 'layers');
    const before = group.api.height;

    // Act.
    keeper.toggle(group);
    const whileCollapsed = { height: group.api.height, isCollapsed: keeper.isCollapsed(group) };
    keeper.toggle(group);

    // Assert.
    expect([ whileCollapsed, { height: group.api.height, isCollapsed: keeper.isCollapsed(group) } ])
      .toStrictEqual([
        { height: COLLAPSED_GROUP_HEIGHT, isCollapsed: true },
        { height: before, isCollapsed: false },
      ]);
  });

  it('never collapses the centre, even asked to directly', () =>
  {
    // Arrange.
    const keeper = new GroupCollapseKeeper();
    keeper.attach(dock.api);
    const centre = centreOf(dock.api) as DockviewGroupPanel;
    const before = centre.api.height;

    // Act.
    keeper.toggle(centre);

    // Assert.
    expect([ keeper.isCollapsible(centre), keeper.isCollapsed(centre), centre.api.height ])
      .toStrictEqual([ false, false, before ]);
  });

  it('reports every group but the centre as collapsible', () =>
  {
    // Arrange.
    const keeper = new GroupCollapseKeeper();
    keeper.attach(dock.api);

    // Act.
    const layers = keeper.isCollapsible(groupOf(dock.api, 'layers'));
    const centre = keeper.isCollapsible(centreOf(dock.api) as DockviewGroupPanel);

    // Assert.
    expect([ layers, centre ])
      .toStrictEqual([ true, false ]);
  });

  it('expands a collapsed group, and leaves an already-expanded one alone: what choosing it from the Panels menu does', () =>
  {
    // Arrange.
    const keeper = new GroupCollapseKeeper();
    keeper.attach(dock.api);
    const group = groupOf(dock.api, 'layers');
    const before = group.api.height;
    keeper.toggle(group);

    // Act: expanded once while collapsed, then asked again while already expanded.
    keeper.expand(group);
    const afterFirstExpand = { height: group.api.height, isCollapsed: keeper.isCollapsed(group) };
    group.api.setSize({ height: before + 40 });
    keeper.expand(group);

    // Assert: the second call left the group at the size it had just been given, not the one from before collapsing.
    expect([ afterFirstExpand, { height: group.api.height, isCollapsed: keeper.isCollapsed(group) } ])
      .toStrictEqual([
        { height: before, isCollapsed: false },
        { height: before + 40, isCollapsed: false },
      ]);
  });

  it('keeps the height to restore for every collapsed group, by id, for the saved layout', () =>
  {
    // Arrange: the layers and the map tree groups' heights, before either collapses.
    const keeper = new GroupCollapseKeeper();
    keeper.attach(dock.api);
    const layers = groupOf(dock.api, 'layers');
    const mapTree = groupOf(dock.api, 'map-tree');
    const beforeLayers = layers.api.height;
    const beforeMapTree = mapTree.api.height;

    // Act.
    keeper.toggle(layers);
    keeper.toggle(mapTree);

    // Assert: what is kept is the height to restore on expanding, not the collapsed height both now share.
    expect(Object.fromEntries([ ...keeper.collapsed ].map(([ groupId, state ]) => [ groupId, state.height ])))
      .toStrictEqual({ [layers.id]: beforeLayers, [mapTree.id]: beforeMapTree });
  });

  it('forgets a collapsed group once it is removed from the dock', () =>
  {
    // Arrange: the layers panel is the only one in its group, so closing it removes the group too.
    const keeper = new GroupCollapseKeeper();
    keeper.attach(dock.api);
    const group = groupOf(dock.api, 'layers');
    keeper.toggle(group);

    // Act.
    (dock.api.getPanel('layers') as IDockviewPanel).api.close();

    // Assert.
    expect(keeper.collapsed.size)
      .toBe(0);
  });

  describe('adopt', () =>
  {
    it('pins a group saved collapsed back to the strip height, and still restores its true size on expanding', () =>
    {
      // Arrange: layers collapsed, the layout saved with its collapsed size, and the dock cleared for a restore.
      const { api } = dock;
      const keeper = new GroupCollapseKeeper();
      keeper.attach(api);
      const before = groupOf(api, 'layers').api.height;
      keeper.toggle(groupOf(api, 'layers'));
      const saved = withCollapsedGroups(api.toJSON() as unknown as JsonObject, keeper.collapsed);
      api.clear();

      // Act: a fresh keeper rebuilding the layout, as a restart does.
      const restored = new GroupCollapseKeeper();
      restored.attach(api);
      api.fromJSON(saved as unknown as SerializedDockview);
      restored.adopt(readCollapsedGroups(saved));
      const heightOnceRestored = groupOf(api, 'layers').api.height;
      restored.toggle(groupOf(api, 'layers'));

      // Assert.
      expect([ heightOnceRestored, groupOf(api, 'layers').api.height ])
        .toStrictEqual([ COLLAPSED_GROUP_HEIGHT, before ]);
    });

    it('drops a saved size for a group the dock does not hold', () =>
    {
      // Arrange.
      const keeper = new GroupCollapseKeeper();
      keeper.attach(dock.api);

      // Act.
      keeper.adopt(new Map([ [ 'long-gone', { height: 200, minimumHeight: 100, maximumHeight: 400 } ] ]));

      // Assert.
      expect(keeper.collapsed.size)
        .toBe(0);
    });
  });
});
