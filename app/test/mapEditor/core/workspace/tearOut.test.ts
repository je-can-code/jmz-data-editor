import { describe, expect, it } from 'vitest';
import {
  originIn,
  planReturns,
  readOrigins,
  releasedOutside,
  windowAtDrop,
  windowBeside,
  withOrigins,
  type DockGroupState,
  type PanelOrigin,
} from '../../../../src/mapEditor/core/workspace/tearOut.ts';

/*
 * A tab dragged beyond its window's edge and let go there opens in a window of its own, the way a browser tab does,
 * so these rules decide whether a release counts as outside and where the new window goes. Outside is anywhere past
 * the page's edges: its own frame, another window, the desktop. The new window opens with the pointer over its tab
 * where the drag was let go; one opened with a button opens a little off where its panel sat. Either way it keeps the
 * size its panel had while docked, never smaller than a comfortable minimum or larger than the screen, and it stays
 * wholly on the screen, so a drop near an edge never opens a window partly out of reach.
 *
 * The screen here is 2560 by 1440, with a 40 pixel bar across the top that windows may not use.
 *
 * Panels coming back into the main window, when a torn-out window closes, go where they came from: the group each
 * left, at its old place among the tabs; the group now holding its old neighbours when its own has gone; and among the
 * maps for a map that never sat in the main window. Nothing is left where the dock happened to drop it, which is how
 * maps once came back on either side of the map tree. Where each came from is kept with the saved layout.
 */
describe('tearOut', () =>
{
  const screen = { left: 0, top: 40, width: 2560, height: 1400 };

  describe('releasedOutside', () =>
  {
    it('counts a release on the page, its edges included, as inside', () =>
    {
      // Arrange: the page's corners, and a spot in the middle.
      const page = { width: 1920, height: 1080 };
      const points = [ { x: 0, y: 0 }, { x: 1919, y: 1079 }, { x: 960, y: 540 } ];

      // Act.
      const answers = points.map(point => releasedOutside(point, page));

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false ]);
    });

    it('counts a release a pixel past any edge as outside', () =>
    {
      // Arrange: one past the left, top, right and bottom edges.
      const page = { width: 1920, height: 1080 };
      const points = [ { x: -1, y: 540 }, { x: 960, y: -1 }, { x: 1920, y: 540 }, { x: 960, y: 1080 } ];

      // Act.
      const answers = points.map(point => releasedOutside(point, page));

      // Assert.
      expect(answers)
        .toStrictEqual([ true, true, true, true ]);
    });
  });

  describe('windowAtDrop', () =>
  {
    it('opens with the pointer over its tab, at the size its panel had', () =>
    {
      // Arrange.
      const drop = { x: 1000, y: 300 };

      // Act.
      const bounds = windowAtDrop(drop, { width: 900, height: 700 }, screen);

      // Assert.
      expect(bounds)
        .toStrictEqual({ left: 952, top: 284, width: 900, height: 700 });
    });

    it('grows a small panel to the smallest a window opens, and shrinks a huge one to the screen', () =>
    {
      // Arrange: a sliver of a panel, and one larger than the screen.
      const drop = { x: 100, y: 100 };

      // Act.
      const small = windowAtDrop(drop, { width: 90, height: 1000 }, screen);
      const huge = windowAtDrop(drop, { width: 4000, height: 3000 }, screen);

      // Assert.
      expect([ small, huge ])
        .toStrictEqual([
          { left: 52, top: 84, width: 720, height: 1000 },
          { left: 0, top: 40, width: 2560, height: 1400 },
        ]);
    });

    it('keeps a window dropped near the right and bottom edges wholly on the screen', () =>
    {
      // Arrange.
      const drop = { x: 2500, y: 1420 };

      // Act.
      const bounds = windowAtDrop(drop, { width: 800, height: 600 }, screen);

      // Assert.
      expect(bounds)
        .toStrictEqual({ left: 1760, top: 840, width: 800, height: 600 });
    });

    it('keeps a window dropped near the top left clear of what windows may not use', () =>
    {
      // Arrange: dropped over the bar across the top.
      const drop = { x: 10, y: 5 };

      // Act.
      const bounds = windowAtDrop(drop, { width: 800, height: 600 }, screen);

      // Assert.
      expect(bounds)
        .toStrictEqual({ left: 0, top: 40, width: 800, height: 600 });
    });
  });

  describe('windowBeside', () =>
  {
    it('opens a little off where its panel sat, at its size', () =>
    {
      // Arrange.
      const docked = { left: 400, top: 120, width: 1000, height: 800 };

      // Act.
      const bounds = windowBeside(docked, screen);

      // Assert.
      expect(bounds)
        .toStrictEqual({ left: 432, top: 152, width: 1000, height: 800 });
    });

    it('keeps a window beside a panel at the screen\'s far corner on the screen', () =>
    {
      // Arrange.
      const docked = { left: 2200, top: 1100, width: 360, height: 340 };

      // Act.
      const bounds = windowBeside(docked, screen);

      // Assert.
      expect(bounds)
        .toStrictEqual({ left: 1840, top: 900, width: 720, height: 540 });
    });
  });

  it('records a panel\'s group, its place among the tabs, and the panels beside it', () =>
  {
    // Arrange.
    const group: DockGroupState = { id: 'maps', inMainWindow: true, panelIds: [ 'a', 'b', 'c' ] };

    // Act.
    const origin = originIn(group, 'b');

    // Assert.
    expect(origin)
      .toStrictEqual({ groupId: 'maps', index: 1, siblings: [ 'a', 'c' ] });
  });

  describe('planReturns', () =>
  {
    /**
     * Builds a group of the dock.
     * @param {string} id The group.
     * @param {string[]} panelIds Its panels in tab order.
     * @param {boolean} inMainWindow Whether it is in the main window.
     * @returns {DockGroupState} The group.
     */
    const group = (id: string, panelIds: string[], inMainWindow = true): DockGroupState => ({ id, inMainWindow, panelIds });

    it('sends a panel back into the group it left, at its old place, even a group holding nothing but returning panels', () =>
    {
      // Arrange: the maps' group was torn out whole and got its first map back; C was split off inside the window.
      const origin: PanelOrigin = { groupId: 'maps', index: 1, siblings: [ 'b' ] };
      const groups = [ group('tree', [ 'tree' ]), group('maps', [ 'b' ]), group('stray', [ 'c' ]) ];

      // Act.
      const plan = planReturns([ { id: 'b', isMap: true, origin: { groupId: 'maps', index: 0, siblings: [ 'c' ] } }, { id: 'c', isMap: true, origin } ], groups, null);

      // Assert.
      expect(Object.fromEntries(plan))
        .toStrictEqual({ b: { groupId: 'maps', index: 0 }, c: { groupId: 'maps', index: 1 } });
    });

    it('sends a panel whose group has gone to a settled group holding a panel it sat beside, last among its tabs', () =>
    {
      // Arrange: A and C now sit below the tree; the stray group holds only returning panels, so it never counts.
      const origin: PanelOrigin = { groupId: 'gone', index: 1, siblings: [ 'a', 'c', 'd' ] };
      const groups = [ group('stray', [ 'b', 'd' ]), group('below', [ 'a', 'c' ]), group('away', [ 'x' ], false) ];

      // Act.
      const plan = planReturns([ { id: 'b', isMap: false, origin }, { id: 'd', isMap: false, origin: undefined } ], groups, null);

      // Assert.
      expect(Object.fromEntries(plan))
        .toStrictEqual({ b: { groupId: 'below', index: null } });
    });

    it('never sends a panel into a group in another window, even the one it left', () =>
    {
      // Arrange: its group is torn out now, and its neighbours with it.
      const origin: PanelOrigin = { groupId: 'maps', index: 0, siblings: [ 'a' ] };
      const groups = [ group('maps', [ 'a' ], false), group('tree', [ 'tree' ]) ];

      // Act.
      const plan = planReturns([ { id: 'b', isMap: false, origin } ], groups, null);

      // Assert.
      expect(plan.size)
        .toBe(0);
    });

    it('sends a map with nowhere of its own to the maps\' group, and anything else nowhere', () =>
    {
      // Arrange.
      const groups = [ group('maps', [ 'a' ]), group('stray', [ 'd', 'history' ]) ];

      // Act.
      const plan = planReturns([ { id: 'd', isMap: true, origin: undefined }, { id: 'history', isMap: false, origin: undefined } ], groups, 'maps');

      // Assert.
      expect(Object.fromEntries(plan))
        .toStrictEqual({ d: { groupId: 'maps', index: null } });
    });

    it('sends a map with nowhere of its own after another returning map when no group holds maps', () =>
    {
      // Arrange: every map was torn out, so the only maps' group is the one B's window is returning to.
      const origin: PanelOrigin = { groupId: 'maps', index: 0, siblings: [] };
      const groups = [ group('tree', [ 'tree' ]), group('maps', [ 'b' ]), group('stray', [ 'd' ]) ];

      // Act.
      const plan = planReturns([ { id: 'd', isMap: true, origin: undefined }, { id: 'b', isMap: true, origin } ], groups, null);

      // Assert.
      expect(Object.fromEntries(plan))
        .toStrictEqual({ b: { groupId: 'maps', index: 0 }, d: { groupId: 'maps', index: null } });
    });
  });

  describe('saved origins', () =>
  {
    it('rides along with a saved layout and reads back the same', () =>
    {
      // Arrange.
      const origins = new Map<string, PanelOrigin>([
        [ 'map-301', { groupId: '12', index: 1, siblings: [ 'map-324' ] } ],
        [ 'history', { groupId: '4', index: null, siblings: [] } ],
      ]);

      // Act.
      const saved = withOrigins({ grid: {}, panels: {} }, origins);

      // Assert.
      expect([ Object.keys(saved), Object.fromEntries(readOrigins(saved)) ])
        .toStrictEqual([
          [ 'grid', 'panels', 'tornOut' ],
          {
            'map-301': { groupId: '12', index: 1, siblings: [ 'map-324' ] },
            'history': { groupId: '4', index: null, siblings: [] },
          },
        ]);
    });

    it('leaves a layout with nothing torn out as it was', () =>
    {
      // Arrange.
      const layout = { grid: {}, panels: {} };

      // Act.
      const saved = withOrigins(layout, new Map());

      // Assert.
      expect(saved)
        .toBe(layout);
    });

    it('skips saved entries that do not read as origins, and odd parts of those that do', () =>
    {
      // Arrange: a layout saved by hand or by a future editor.
      const saved = {
        grid: {},
        panels: {},
        tornOut: {
          'good': { groupId: '3', index: 2.5, siblings: [ 'a', 7 ] },
          'no-group': { index: 1 },
          'not-an-object': 'map-1',
        },
      };

      // Act.
      const origins = readOrigins(saved);

      // Assert.
      expect(Object.fromEntries(origins))
        .toStrictEqual({ good: { groupId: '3', index: null, siblings: [ 'a' ] } });
    });
  });
});
