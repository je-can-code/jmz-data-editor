import { describe, expect, it } from 'vitest';
import { releasedOutside, windowAtDrop, windowBeside } from '../../../../src/mapEditor/core/workspace/tearOut.ts';

/*
 * A tab dragged beyond its window's edge and let go there opens in a window of its own, the way a browser tab does,
 * so these rules decide whether a release counts as outside and where the new window goes. Outside is anywhere past
 * the page's edges: its own frame, another window, the desktop. The new window opens with the pointer over its tab
 * where the drag was let go; one opened with a button opens a little off where its panel sat. Either way it keeps the
 * size its panel had while docked, never smaller than a comfortable minimum or larger than the screen, and it stays
 * wholly on the screen, so a drop near an edge never opens a window partly out of reach.
 *
 * The screen here is 2560 by 1440, with a 40 pixel bar across the top that windows may not use.
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
});
