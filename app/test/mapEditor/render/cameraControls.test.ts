import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, screenToWorld } from '../../../src/mapEditor/core/renderer/camera.ts';
import {
  centerCamera,
  CLICK_SLOP,
  fitCamera,
  fitZoom,
  RightButtonGesture,
  visibleWorld,
  wheelZoomFactor,
  zoomAt,
  zoomLimits,
} from '../../../src/mapEditor/render/cameraControls.ts';

/*
 * The camera is Jeremy's "sweet god" upgrade: the wheel zooms about the pointer, holding the right button drags the
 * map, and a right click that does not move still opens the context menu. The math must keep the point under the
 * wheel still, always reach the whole map when zooming out however large it is, and tell a click from a drag by a
 * few pixels of slop, in both directions: a drag that strays past the slop pans, a click that drifts inside it does
 * not.
 */
describe('cameraControls', () =>
{
  describe('wheelZoomFactor', () =>
  {
    it('zooms in for a wheel turned up and out for one turned down, whatever the wheel counts in', () =>
    {
      // Arrange: 100 pixels, the same as about 6 lines, and a quarter page, each way.
      const turns: [ number, number ][] = [ [ -100, 0 ], [ 100, 0 ], [ 100 / 16, 1 ], [ 100 / 400, 2 ] ];

      // Act.
      const factors = turns.map(([ deltaY, mode ]) => Number(wheelZoomFactor(deltaY, mode).toFixed(6)));

      // Assert: e^0.15 in, e^-0.15 out, and the same for lines and pages converted to pixels.
      expect(factors)
        .toStrictEqual([ 1.161834, 0.860708, 0.860708, 0.860708 ]);
    });
  });

  describe('fitZoom, fitCamera and zoomLimits', () =>
  {
    it('fits a whole map in the view with a margin, centred', () =>
    {
      // Arrange: a 75x75 map (3600 pixels) in a 2000x1000 view.
      const view = { width: 2000, height: 1000 };

      // Act.
      const camera = fitCamera(view, { width: 75, height: 75 }, 48);

      // Assert: 1000/3600 x 0.95; the map's middle sits in the view's middle.
      expect([ Number(camera.zoom.toFixed(6)), screenToWorld(camera, { x: 1000, y: 500 }) ])
        .toStrictEqual([ 0.263889, { x: 1800, y: 1800 } ]);
    });

    it('lets the zoom out reach a whole map below the usual limit, and never caps zooming in beyond it', () =>
    {
      // Arrange: a 256x256 map in a small view needs less than the usual least zoom; a small map does not.
      const small = { width: 600, height: 400 };

      // Act.
      const limits = [ zoomLimits(small, { width: 256, height: 256 }, 48), zoomLimits(small, { width: 10, height: 10 }, 48) ];

      // Assert.
      expect([ limits[0].min < MIN_ZOOM, limits[0].min === fitZoom(small, { width: 256, height: 256 }, 48), limits[1].min, limits[1].max ])
        .toStrictEqual([ true, true, MIN_ZOOM, MAX_ZOOM ]);
    });
  });

  describe('zoomAt', () =>
  {
    it('keeps the point under the wheel still as it zooms', () =>
    {
      // Arrange.
      const camera = { x: 120, y: 40, zoom: 1 };
      const anchor = { x: 300, y: 200 };
      const before = screenToWorld(camera, anchor);

      // Act.
      const zoomed = zoomAt(camera, anchor, 2, { min: 0.1, max: 8 });

      // Assert.
      expect([ zoomed.zoom, screenToWorld(zoomed, anchor) ])
        .toStrictEqual([ 2, before ]);
    });

    it('stops at the limits, still holding the point under the wheel', () =>
    {
      // Arrange.
      const camera = { x: 0, y: 0, zoom: 1 };
      const anchor = { x: 100, y: 100 };

      // Act.
      const zooms = [ zoomAt(camera, anchor, 100, { min: 0.5, max: 4 }), zoomAt(camera, anchor, 0.01, { min: 0.5, max: 4 }) ];

      // Assert.
      expect(zooms.map(each => [ each.zoom, screenToWorld(each, anchor) ]))
        .toStrictEqual([ [ 4, { x: 100, y: 100 } ], [ 0.5, { x: 100, y: 100 } ] ]);
    });
  });

  describe('visibleWorld and centerCamera', () =>
  {
    it('shows the world rectangle the camera covers, and centres a point', () =>
    {
      // Arrange.
      const view = { width: 800, height: 600 };

      // Act.
      const answers = [ visibleWorld({ x: 100, y: 50, zoom: 2 }, view), centerCamera(500, 300, 0.5, view) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ { x: 100, y: 50, width: 400, height: 300 }, { x: -300, y: -300, zoom: 0.5 } ]);
    });
  });

  describe('RightButtonGesture', () =>
  {
    it('opens the context menu for a press and release that never left the slop', () =>
    {
      // Arrange.
      const gesture = new RightButtonGesture();

      // Act.
      gesture.press({ x: 10, y: 10 });
      const moved = gesture.move({ x: 12, y: 11 });
      const released = gesture.release({ x: 13, y: 12 });

      // Assert: the menu opens where the button went down.
      expect([ moved, released, gesture.isPressed ])
        .toStrictEqual([ { kind: 'none' }, { kind: 'context-menu', point: { x: 10, y: 10 } }, false ]);
    });

    it('pans once the pointer leaves the slop, first by everything since the press, then step by step', () =>
    {
      // Arrange.
      const gesture = new RightButtonGesture();
      gesture.press({ x: 10, y: 10 });

      // Act.
      const steps = [ gesture.move({ x: 10 + CLICK_SLOP + 1, y: 10 }), gesture.move({ x: 20, y: 18 }), gesture.move({ x: 21, y: 18 }) ];
      const released = gesture.release({ x: 21, y: 18 });

      // Assert: a released pan opens no menu.
      expect([ steps, gesture.isPanning, released ])
        .toStrictEqual([
          [ { kind: 'pan', dx: CLICK_SLOP + 1, dy: 0 }, { kind: 'pan', dx: 5, dy: 8 }, { kind: 'pan', dx: 1, dy: 0 } ],
          false,
          { kind: 'none' },
        ]);
    });

    it('opens no menu for a release that strayed past the slop without a move, or for a cancelled press', () =>
    {
      // Arrange.
      const strayed = new RightButtonGesture();
      const cancelled = new RightButtonGesture();
      strayed.press({ x: 0, y: 0 });
      cancelled.press({ x: 0, y: 0 });

      // Act.
      cancelled.cancel();
      const answers = [ strayed.release({ x: 50, y: 0 }), cancelled.release({ x: 0, y: 0 }), cancelled.move({ x: 90, y: 0 }) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ { kind: 'none' }, { kind: 'none' }, { kind: 'none' } ]);
    });
  });
});
