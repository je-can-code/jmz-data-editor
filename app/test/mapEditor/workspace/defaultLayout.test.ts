/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayoutStore, SavedLayout } from '../../../src/mapEditor/core/workspace/LayoutStore.ts';
import { addDefaultPanels, restoreLayout } from '../../../src/mapEditor/workspace/defaultLayout.ts';
import { createRealDock, describeGrid, type RealDock } from '../support/realDock.ts';

/*
 * The side panels hold what the author reads while working (the map tree, the map's properties, the history), so the
 * workspace never lets the maps squeeze them into a sliver: the default layout gives each its minimum width, and a
 * saved layout comes back with the minimums panels have now, so a column saved at a sliver (as one was once a torn-out
 * window's maps came back beside it) opens readable again, the maps giving up the room. Whatever else the workspace
 * keeps in the saved layout is handed on once the dock has rebuilt it; with nothing saved, the default layout is used.
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

  it('lays out the side panels with their minimum widths, and the start panel with the dock\'s', () =>
  {
    // Arrange: an empty dock the width of a desktop window.
    dock.api.layout(1920, 1032);

    // Act.
    addDefaultPanels(dock.api);

    // Assert.
    expect([ describeGrid(dock.api), widths() ])
      .toStrictEqual([
        [ 'map-tree+palette+layers', 'start', 'map-properties+quick-settings', 'history' ],
        { 'map-tree': '300/240', 'start': '1260/100', 'map-properties': '360/300', 'history': '360/240' },
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
    expect([ restored, fresh, onRestored.mock.calls, describeGrid(dock.api)[1] ])
      .toStrictEqual([ 'restored', 'default', [ [ saved ] ], 'start' ]);
  });
});
