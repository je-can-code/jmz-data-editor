/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel, SerializedDockview } from 'dockview-react';
import type { JsonObject } from '../../../src/mapEditor/core/model/json.ts';
import { readCollapsedSides, withCollapsedSides } from '../../../src/mapEditor/core/workspace/sideCollapse.ts';
import { centreOf } from '../../../src/mapEditor/workspace/CentreKeeper.ts';
import { addDefaultPanels } from '../../../src/mapEditor/workspace/defaultLayout.ts';
import { SideCollapseKeeper } from '../../../src/mapEditor/workspace/SideCollapseKeeper.ts';
import { createRealDock, type RealDock } from '../support/realDock.ts';

/*
 * Collapsing a side pins every group it holds to zero width, so the centre takes the room they give up, exactly as
 * closing them would share it out; toggling the side again lifts every pin and puts each group back at the width it
 * had, never a guess. Which groups a side holds is read fresh off the grid every time, by where its root-level
 * columns sit relative to the centre, so a side's toggle always catches everything there, however far it has been
 * dragged from the default; the centre's own column can never be one of them, so it never folds. A side's collapsed
 * sizes ride along with the saved layout (see core/workspace/sideCollapse.ts), so a side collapsed when the layout
 * was saved comes back pinned to zero, still remembering each group's width to put back once it expands again.
 *
 * The dock here is the real one, in the workspace's default layout on a 1920 by 1032 window; its windows are faked.
 */
describe('SideCollapseKeeper', () =>
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

  it('collapses the left side to zero width, and restores every one of its groups\' widths on a second toggle', () =>
  {
    // Arrange: a keeper watching the dock, and the left column's groups' widths before anything happens to them.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    const groups = [ 'map-tree', 'palette', 'layers' ].map(id => groupOf(dock.api, id));
    const before = groups.map(group => group.api.width);

    // Act.
    keeper.toggle('left');
    const whileCollapsed = { widths: groups.map(group => group.api.width), isCollapsed: keeper.isCollapsed('left') };
    keeper.toggle('left');

    // Assert.
    expect([ whileCollapsed, { widths: groups.map(group => group.api.width), isCollapsed: keeper.isCollapsed('left') } ])
      .toStrictEqual([
        { widths: [ 0, 0, 0 ], isCollapsed: true },
        { widths: before, isCollapsed: false },
      ]);
  });

  it('collapses the right side to zero width, and restores it too', () =>
  {
    // Arrange.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    const groups = [ 'map-properties', 'history' ].map(id => groupOf(dock.api, id));
    const before = groups.map(group => group.api.width);

    // Act.
    keeper.toggle('right');
    const whileCollapsed = { widths: groups.map(group => group.api.width), isCollapsed: keeper.isCollapsed('right') };
    keeper.toggle('right');

    // Assert.
    expect([ whileCollapsed, { widths: groups.map(group => group.api.width), isCollapsed: keeper.isCollapsed('right') } ])
      .toStrictEqual([
        { widths: [ 0, 0 ], isCollapsed: true },
        { widths: before, isCollapsed: false },
      ]);
  });

  it('never touches the centre\'s own constraints while folding both sides away', () =>
  {
    // Arrange.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    const centre = centreOf(dock.api) as DockviewGroupPanel;
    const before = { minimumWidth: centre.minimumWidth, maximumWidth: centre.maximumWidth };

    // Act.
    keeper.toggle('left');
    keeper.toggle('right');

    // Assert.
    expect({ minimumWidth: centre.minimumWidth, maximumWidth: centre.maximumWidth })
      .toStrictEqual(before);
  });

  it('keeps each group\'s own limits to restore, not a limit they happen to share while collapsed', () =>
  {
    // Arrange: the properties group keeps a wider minimum than history (see PANEL_MIN_WIDTHS), though both share the
    // right column's width.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    const properties = groupOf(dock.api, 'map-properties');
    const history = groupOf(dock.api, 'history');

    // Act.
    keeper.toggle('right');

    // Assert.
    const kept = keeper.collapsed.get('right');
    expect([ kept?.get(properties.id)?.minimumWidth, kept?.get(history.id)?.minimumWidth ])
      .toStrictEqual([ 300, 240 ]);
  });

  it('does nothing when asked to collapse a side before the dock has a centre', () =>
  {
    // Arrange: a bare dock, nothing laid out into it yet.
    const bare = createRealDock();
    bare.api.layout(1920, 1032);
    const keeper = new SideCollapseKeeper();
    keeper.attach(bare.api);

    // Act.
    keeper.toggle('left');

    // Assert.
    expect(keeper.isCollapsed('left'))
      .toBe(false);
    bare.dispose();
  });

  it('does nothing once detached, rather than reaching for a dock it no longer has', () =>
  {
    // Arrange: collapsed, then detached while still collapsed.
    const keeper = new SideCollapseKeeper();
    const detach = keeper.attach(dock.api);
    keeper.toggle('left');
    detach();

    // Act: asked to restore with no dock to restore anything on.
    keeper.toggle('left');

    // Assert: the side still reads as collapsed, since nothing was able to lift it.
    expect(keeper.isCollapsed('left'))
      .toBe(true);
  });

  it('does nothing when asked to collapse a side that was never collapsed, once detached', () =>
  {
    // Arrange: detached before ever being asked to collapse anything.
    const keeper = new SideCollapseKeeper();
    const detach = keeper.attach(dock.api);
    detach();

    // Act.
    keeper.toggle('left');

    // Assert.
    expect(keeper.isCollapsed('left'))
      .toBe(false);
  });

  it('keeps the live dock when an older attachment\'s own detach runs after a newer one replaced it', () =>
  {
    // Arrange: a second, real dock standing in for one that replaced the first, as Workspace.tsx's onReady can build
    // when the page's first render is discarded for the one that stays.
    const replacement = createRealDock();
    replacement.api.layout(1920, 1032);
    addDefaultPanels(replacement.api);
    const keeper = new SideCollapseKeeper();
    const detachFirst = keeper.attach(dock.api);
    keeper.attach(replacement.api);

    // Act: the first attachment's detach runs after the second has already taken over.
    detachFirst();
    keeper.toggle('left');

    // Assert: the replacement's own left side folded; the stale detach left the live attachment alone.
    expect(groupOf(replacement.api, 'map-tree').api.width)
      .toBe(0);
    replacement.dispose();
  });

  it('tells every subscriber once a side is toggled, and stops once unsubscribed', () =>
  {
    // Arrange.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    const heard = vi.fn();
    const stop = keeper.subscribe(heard);

    // Act.
    keeper.toggle('left');
    stop();
    keeper.toggle('left');

    // Assert: one call, from the toggle made before unsubscribing.
    expect(heard.mock.calls.length)
      .toBe(1);
  });

  it('forgets one collapsed group once it is removed from the dock, keeping the rest of the side collapsed', () =>
  {
    // Arrange: the palette and the stamps share a group, so closing both removes the group too.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    keeper.toggle('left');

    // Act.
    [ 'palette', 'stamps' ].forEach(id => (dock.api.getPanel(id) as IDockviewPanel).api.close());

    // Assert: map-tree and layers are still kept, palette is not.
    expect([ keeper.isCollapsed('left'), keeper.collapsed.get('left')?.size ])
      .toStrictEqual([ true, 2 ]);
  });

  it('leaves another collapsed side alone when a group that is not its own closes', () =>
  {
    // Arrange: both sides collapsed, so forgetting a left-column group also asks the right column's own kept sizes.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    keeper.toggle('left');
    keeper.toggle('right');

    // Act: the palette's whole group closed.
    [ 'palette', 'stamps' ].forEach(id => (dock.api.getPanel(id) as IDockviewPanel).api.close());

    // Assert: the right side keeps both of its groups, untouched by a closing that was never one of its own.
    expect(keeper.collapsed.get('right')?.size)
      .toBe(2);
  });

  it('forgets a side entirely once every group it caught is gone', () =>
  {
    // Arrange: the whole left column collapsed.
    const keeper = new SideCollapseKeeper();
    keeper.attach(dock.api);
    keeper.toggle('left');

    // Act.
    [ 'map-tree', 'palette', 'stamps', 'layers' ].forEach(id => (dock.api.getPanel(id) as IDockviewPanel).api.close());

    // Assert.
    expect(keeper.isCollapsed('left'))
      .toBe(false);
  });

  describe('adopt', () =>
  {
    it('pins a side saved collapsed back to zero width, and still restores every group\'s true width on expanding', () =>
    {
      // Arrange: the left side collapsed, the layout saved with its collapsed sizes, and the dock cleared for a restore.
      const { api } = dock;
      const keeper = new SideCollapseKeeper();
      keeper.attach(api);
      const before = [ 'map-tree', 'palette', 'layers' ].map(id => groupOf(api, id).api.width);
      keeper.toggle('left');
      const saved = withCollapsedSides(api.toJSON() as unknown as JsonObject, keeper.collapsed);
      api.clear();

      // Act: a fresh keeper rebuilding the layout, as a restart does.
      const restored = new SideCollapseKeeper();
      restored.attach(api);
      api.fromJSON(saved as unknown as SerializedDockview);
      restored.adopt(readCollapsedSides(saved));
      const widthsOnceRestored = [ 'map-tree', 'palette', 'layers' ].map(id => groupOf(api, id).api.width);
      restored.toggle('left');

      // Assert.
      expect([ widthsOnceRestored, [ 'map-tree', 'palette', 'layers' ].map(id => groupOf(api, id).api.width) ])
        .toStrictEqual([ [ 0, 0, 0 ], before ]);
    });

    it('does nothing when asked to adopt before the keeper is attached to a dock', () =>
    {
      // Arrange: a keeper never attached to any dock.
      const keeper = new SideCollapseKeeper();

      // Act.
      keeper.adopt(new Map([ [ 'left', new Map([ [ '1', { width: 300, minimumWidth: 240, maximumWidth: 400 } ] ]) ] ]));

      // Assert.
      expect(keeper.collapsed.size)
        .toBe(0);
    });

    it('drops a saved width for a side whose groups the dock does not hold', () =>
    {
      // Arrange.
      const keeper = new SideCollapseKeeper();
      keeper.attach(dock.api);

      // Act.
      keeper.adopt(new Map([ [ 'left', new Map([ [ 'long-gone', { width: 300, minimumWidth: 240, maximumWidth: 400 } ] ]) ] ]));

      // Assert.
      expect(keeper.collapsed.size)
        .toBe(0);
    });

    it('tells every subscriber once a saved layout is adopted', () =>
    {
      // Arrange.
      const keeper = new SideCollapseKeeper();
      keeper.attach(dock.api);
      const heard = vi.fn();
      keeper.subscribe(heard);

      // Act.
      keeper.adopt(new Map());

      // Assert.
      expect(heard.mock.calls.length)
        .toBe(1);
    });
  });
});
