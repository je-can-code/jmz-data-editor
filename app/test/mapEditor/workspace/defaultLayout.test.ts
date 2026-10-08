/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDockviewPanel } from 'dockview-react';
import type { LayoutStore, SavedLayout } from '../../../src/mapEditor/core/workspace/LayoutStore.ts';
import { addDefaultPanels, openSidePanel, restoreLayout, SIDE_PANEL_SPECS } from '../../../src/mapEditor/workspace/defaultLayout.ts';
import { GroupCollapseKeeper } from '../../../src/mapEditor/workspace/GroupCollapseKeeper.ts';
import { PopoutKeeper } from '../../../src/mapEditor/workspace/PopoutKeeper.ts';
import { createRealDock, describeGrid, type RealDock } from '../support/realDock.ts';

/*
 * The side panels hold what the author reads while working (the map tree, the map's properties, the history), so the
 * workspace never lets the maps squeeze them into a sliver: the default layout gives each its minimum width, with the
 * map tree, the palette and the layers stacked down the left so all three show at once, and a saved layout comes back
 * with the minimums panels have now, so a column saved at a sliver (as one was once a torn-out window's maps came back
 * beside it) opens readable again, the maps giving up the room. Whatever else the workspace keeps in the saved layout
 * is handed on once the dock has rebuilt it; with nothing saved, the default layout is used.
 *
 * A side panel chosen from the Panels menu comes back in front, as near where a reset would put it as the panels still
 * open allow: with the panel a reset stacks it with, whichever of the two closed first, and where a closed panel its
 * place is given by would go, since the dock refuses outright a place naming a panel it does not hold.
 *
 * The dock here is the real one; its windows are faked.
 */
describe('defaultLayout', () =>
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
   * A layout as the workspace saved it before side panels had minimums, 1920 wide: a map, the tree, another map, and
   * the properties above the history squeezed to 100 pixels at the right.
   * @returns {SavedLayout} The layout.
   */
  const squeezedLayout = (): SavedLayout =>
  {
    const leaf = (views: string[], id: string, size: number) => ({ type: 'leaf', data: { views, activeView: views[0], id }, size });
    const panel = (id: string, contentComponent: string, params?: object) => ({ id, contentComponent, title: id, ...(params === undefined ? {} : { params }) });
    return {
      grid: {
        root: {
          type: 'branch',
          data: [
            leaf([ 'map-301' ], '17', 640),
            leaf([ 'map-tree', 'palette', 'layers' ], '1', 540),
            leaf([ 'map-324' ], '12', 640),
            { type: 'branch', data: [ leaf([ 'map-properties', 'quick-settings' ], '3', 515), leaf([ 'history' ], '4', 517) ], size: 100 },
          ],
          size: 1032,
        },
        width: 1920,
        height: 1032,
        orientation: 'HORIZONTAL',
      },
      panels: {
        'map-tree': panel('map-tree', 'map-tree'),
        'palette': panel('palette', 'palette'),
        'layers': panel('layers', 'layers'),
        'map-properties': panel('map-properties', 'map-properties'),
        'quick-settings': panel('quick-settings', 'quick-settings'),
        'history': panel('history', 'history'),
        'map-324': panel('map-324', 'map', { mapId: 324 }),
        'map-301': panel('map-301', 'map', { mapId: 301 }),
      },
      activeGroup: '17',
    } as unknown as SavedLayout;
  };

  /**
   * A layout store holding one saved layout, or none.
   * @param {SavedLayout | null} saved What it holds.
   * @returns {LayoutStore} The store.
   */
  const storeHolding = (saved: SavedLayout | null): LayoutStore =>
  {
    return { load: async () => saved } as unknown as LayoutStore;
  };

  /**
   * Reads each group's width and minimum, by the panel it shows.
   * @returns {Record<string, string>} Each group as "width/minimum", by its active panel.
   */
  const widths = (): Record<string, string> =>
  {
    return Object.fromEntries(dock.api.groups
      .filter(group => group.activePanel !== undefined)
      .map(group => [ group.activePanel?.id, `${Math.round(group.api.width)}/${group.minimumWidth}` ]));
  };

  it('stacks the tree, the palette and the layers down the left, each side panel at its minimum width, and the start panel with the dock\'s', () =>
  {
    // Arrange: an empty dock the width of a desktop window.
    dock.api.layout(1920, 1032);

    // Act.
    addDefaultPanels(dock.api);

    // Assert: the stamps wait behind the palette, and the events list behind the history.
    expect([ describeGrid(dock.api), widths() ])
      .toStrictEqual([
        [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ],
        {
          'map-tree': '300/240',
          'palette': '300/240',
          'layers': '300/240',
          'start': '1260/100',
          'map-properties': '360/300',
          'history': '360/240',
        },
      ]);
  });

  it('brings a side column saved at a sliver back to its minimum width, the maps giving up the room', async () =>
  {
    // Arrange.
    dock.api.layout(1920, 1032);

    // Act.
    const outcome = await restoreLayout(dock.api, storeHolding(squeezedLayout()), () => true);

    // Assert.
    expect([ outcome, widths() ])
      .toStrictEqual([
        'restored',
        { 'map-301': '640/100', 'map-tree': '540/240', 'map-324': '440/100', 'map-properties': '300/300', 'history': '300/240' },
      ]);
  });

  it('gives a layout saved before the centre was permanent a centre, the start panel joining its roomiest maps behind them', async () =>
  {
    // Arrange.
    dock.api.layout(1920, 1032);

    // Act.
    const outcome = await restoreLayout(dock.api, storeHolding(squeezedLayout()), () => true);

    // Assert: map 301 takes the most room, and stays in front of the start panel.
    const group = dock.api.getPanel('start')?.group;
    expect([ outcome, describeGrid(dock.api), group?.activePanel?.id ])
      .toStrictEqual([
        'restored',
        [ 'start+map-301', 'map-tree+palette+layers', 'map-324', 'map-properties+quick-settings', 'history' ],
        'map-301',
      ]);
  });

  it('lays out afresh a saved layout with neither the start panel nor a map in the main window, as one closed to its side panels was', async () =>
  {
    // Arrange: the squeezed layout with both maps gone, as the dock saved it once the last map closed.
    const saved = squeezedLayout() as unknown as { grid: { root: { data: unknown[] } }; panels: Record<string, unknown>; activeGroup: string };
    saved.grid.root.data = saved.grid.root.data.filter((_node, index) => index === 1 || index === 3);
    delete saved.panels['map-301'];
    delete saved.panels['map-324'];
    saved.activeGroup = '1';
    const onRestored = vi.fn();
    dock.api.layout(1920, 1032);

    // Act.
    const outcome = await restoreLayout(dock.api, storeHolding(saved as unknown as SavedLayout), () => true, onRestored);

    // Assert.
    expect([ outcome, describeGrid(dock.api), onRestored.mock.calls.length ])
      .toStrictEqual([ 'default', [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ], 0 ]);
  });

  it('hands the saved layout on once rebuilt, and lays out afresh when nothing is saved', async () =>
  {
    // Arrange.
    const saved = squeezedLayout();
    const onRestored = vi.fn();
    dock.api.layout(1920, 1032);

    // Act.
    const restored = await restoreLayout(dock.api, storeHolding(saved), () => true, onRestored);
    dock.api.clear();
    const fresh = await restoreLayout(dock.api, storeHolding(null), () => true, onRestored);

    // Assert.
    expect([ restored, fresh, onRestored.mock.calls, describeGrid(dock.api) ])
      .toStrictEqual([ 'restored', 'default', [ [ saved ] ], [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ] ]);
  });

  describe('SIDE_PANEL_SPECS', () =>
  {
    it('lists every side panel the Panels menu offers, never a map and never the start panel', () =>
    {
      // Arrange: the dock laid out, so every id named below is a real panel.
      dock.api.layout(1920, 1032);
      addDefaultPanels(dock.api);

      // Act.
      const ids = SIDE_PANEL_SPECS.map(spec => spec.id);
      const titles = SIDE_PANEL_SPECS.map(spec => spec.title);

      // Assert.
      expect([ ids, titles ])
        .toStrictEqual([
          [ 'map-tree', 'palette', 'stamps', 'layers', 'map-properties', 'quick-settings', 'history', 'events' ],
          [ 'Maps', 'Tiles', 'Stamps', 'Layers', 'Map properties', 'Quick settings', 'History', 'Events' ],
        ]);
    });
  });

  describe('openSidePanel', () =>
  {
    /**
     * A collapse keeper watching the dock, for openSidePanel's own tests.
     * @returns {GroupCollapseKeeper} The keeper.
     */
    const collapsesFor = (): GroupCollapseKeeper =>
    {
      const keeper = new GroupCollapseKeeper();
      keeper.attach(dock.api);
      return keeper;
    };

    beforeEach(() =>
    {
      dock.api.layout(1920, 1032);
      addDefaultPanels(dock.api);
    });

    it('adds a closed panel back at its default place, in front', () =>
    {
      // Arrange: the layers closed, as their close button would leave them.
      (dock.api.getPanel('layers') as IDockviewPanel).api.close();

      // Act.
      openSidePanel(dock.api, collapsesFor(), 'layers');

      // Assert: back where addDefaultPanels put them, below the palette.
      expect([ describeGrid(dock.api), dock.api.getPanel('layers')?.group.activePanel?.id ])
        .toStrictEqual([ [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ], 'layers' ]);
    });

    it('puts the stamps back behind the palette, in front of it, and in the palette\'s place when that is closed too', () =>
    {
      // Arrange: the stamps closed, as their close button would leave them.
      (dock.api.getPanel('stamps') as IDockviewPanel).api.close();

      // Act: the stamps chosen from the menu; then, with the palette and the stamps both closed, the stamps alone.
      openSidePanel(dock.api, collapsesFor(), 'stamps');
      const besideThePalette = [ describeGrid(dock.api), dock.api.getPanel('stamps')?.group.activePanel?.id ];
      [ 'palette', 'stamps' ].forEach(id => (dock.api.getPanel(id) as IDockviewPanel).api.close());
      openSidePanel(dock.api, collapsesFor(), 'stamps');

      // Assert: alone, they go where the palette would, below the map tree.
      expect([ besideThePalette, describeGrid(dock.api) ])
        .toStrictEqual([
          [ [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ], 'stamps' ],
          [ 'map-tree', 'stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ],
        ]);
    });

    it('brings a panel a reset leaves behind another to the front when it is reopened on its own', () =>
    {
      // Arrange: quick settings closed, while map properties stays open in front of where it was.
      (dock.api.getPanel('quick-settings') as IDockviewPanel).api.close();

      // Act.
      openSidePanel(dock.api, collapsesFor(), 'quick-settings');

      // Assert.
      expect([ describeGrid(dock.api), dock.api.getPanel('quick-settings')?.group.activePanel?.id ])
        .toStrictEqual([ [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ], 'quick-settings' ]);
    });

    it('puts a panel back with the open panel a reset stacks with it, whichever of the two closed', () =>
    {
      // Arrange: the history closed, leaving the events list alone in their group.
      (dock.api.getPanel('history') as IDockviewPanel).api.close();

      // Act.
      openSidePanel(dock.api, collapsesFor(), 'history');

      // Assert: back in the events list's group, in front of it, rather than in a group of its own.
      expect([ describeGrid(dock.api), dock.api.getPanel('history')?.group.activePanel?.id ])
        .toStrictEqual([ [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'events+history' ], 'history' ]);
    });

    it('puts a panel whose spec names a closed panel where that panel would go, rather than refusing', () =>
    {
      // Arrange: the history and the events list both closed.
      [ 'history', 'events' ].forEach(id => (dock.api.getPanel(id) as IDockviewPanel).api.close());

      // Act: the events list, whose spec names the history; then, with the properties closed as well, quick settings,
      // whose spec names the properties.
      openSidePanel(dock.api, collapsesFor(), 'events');
      const eventsBack = describeGrid(dock.api);
      [ 'events', 'map-properties', 'quick-settings' ].forEach(id => (dock.api.getPanel(id) as IDockviewPanel).api.close());
      openSidePanel(dock.api, collapsesFor(), 'quick-settings');

      // Assert: the events list where the history would be, below the properties; quick settings where the properties
      // would be, at the right.
      expect([ eventsBack, describeGrid(dock.api) ])
        .toStrictEqual([
          [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'events' ],
          [ 'map-tree', 'palette+stamps', 'layers', 'start', 'quick-settings' ],
        ]);
    });

    it('brings an open panel to the front of its group, leaving the rest of the group where it is', () =>
    {
      // Arrange: quick settings is open but behind map properties, which addDefaultPanels leaves active.
      const { group } = dock.api.getPanel('quick-settings') as IDockviewPanel;

      // Act.
      openSidePanel(dock.api, collapsesFor(), 'quick-settings');

      // Assert.
      expect([ group.activePanel?.id, describeGrid(dock.api) ])
        .toStrictEqual([ 'quick-settings', [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ] ]);
    });

    it('expands an open panel\'s group if choosing it found it collapsed', () =>
    {
      // Arrange.
      const collapses = collapsesFor();
      const { group } = dock.api.getPanel('layers') as IDockviewPanel;
      const before = group.api.height;
      collapses.toggle(group);

      // Act.
      openSidePanel(dock.api, collapses, 'layers');

      // Assert.
      expect([ collapses.isCollapsed(group), group.api.height ])
        .toStrictEqual([ false, before ]);
    });

    it('focuses a torn-out panel\'s own window when choosing it', async () =>
    {
      // Arrange.
      const popouts = new PopoutKeeper({ popoutUrl: '/popout.html', mapsGroup: () => null });
      popouts.attach(dock.api);
      await popouts.tearOutBeside(dock.api.getPanel('history') as IDockviewPanel);
      const torn = dock.api.getPanel('history') as IDockviewPanel;
      const focus = vi.spyOn(torn.api.getWindow(), 'focus');

      // Act.
      openSidePanel(dock.api, collapsesFor(), 'history');

      // Assert.
      expect(focus.mock.calls.length)
        .toBe(1);
    });

    it('does nothing for a panel id it does not recognize', () =>
    {
      // Arrange.
      const before = describeGrid(dock.api);

      // Act.
      openSidePanel(dock.api, collapsesFor(), 'not-a-panel');

      // Assert.
      expect(describeGrid(dock.api))
        .toStrictEqual(before);
    });
  });
});
