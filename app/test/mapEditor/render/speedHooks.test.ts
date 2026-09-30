import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import { screenToWorld } from '../../../src/mapEditor/core/renderer/camera.ts';
import { fitZoom } from '../../../src/mapEditor/render/cameraControls.ts';
import { cameraOnPath, wantsSpeedHooks } from '../../../src/mapEditor/render/speedHooks.ts';
import { buildMapJson } from '../support/fixtures.ts';

/*
 * The speed script drives the page through hooks that exist only when the page was opened for measuring, and its
 * camera paths decide what the budgets are measured on: a pan at zoom 1, a zoom sweep between 2x and the whole map,
 * and the whole map held on screen. If a path never reached the whole map, the budget for it would pass untested.
 */
describe('speedHooks', () =>
{
  describe('wantsSpeedHooks', () =>
  {
    it('installs the hooks only for a page opened with speed=1', () =>
    {
      // Arrange.
      const searches = [ '?map=102&speed=1', '?map=102', '?speed=0', '' ];

      // Act.
      const wanted = searches.map(wantsSpeedHooks);

      // Assert.
      expect(wanted)
        .toStrictEqual([ true, false, false, false ]);
    });
  });

  describe('cameraOnPath', () =>
  {
    const map = (() =>
    {
      const json = buildMapJson();
      return MapDocument.fromJson('map:1', { ...json, width: 75, height: 75, data: new Array(75 * 75 * 6).fill(0) });
    })();
    const view = { width: 2560, height: 1415 };

    it('pans at zoom 1 about the map\'s middle', () =>
    {
      // Arrange: at the start the pan sits 0.3 of a swing down from the middle.
      const seconds = 0;

      // Act.
      const camera = cameraOnPath('pan', seconds, map, view);
      const centre = screenToWorld(camera, { x: view.width / 2, y: view.height / 2 });

      // Assert.
      expect([ camera.zoom, centre ])
        .toStrictEqual([ 1, { x: 1800, y: 1800 + 3600 * 0.3 } ]);
    });

    it('sweeps the zoom from 2x all the way out to the whole map', () =>
    {
      // Arrange: the sweep is at 2x at the start and at the whole map half a period later.
      const whole = fitZoom(view, map, 48);

      // Act.
      const zooms = [ cameraOnPath('zoom', 0, map, view).zoom, cameraOnPath('zoom', Math.PI / 1.3, map, view).zoom ];

      // Assert.
      expect(zooms.map(zoom => Number(zoom.toFixed(9))))
        .toStrictEqual([ 2, Number(whole.toFixed(9)) ]);
    });

    it('holds the whole map on screen, drifting', () =>
    {
      // Arrange.
      const whole = fitZoom(view, map, 48);

      // Act.
      const cameras = [ cameraOnPath('zoomedout', 0, map, view), cameraOnPath('zoomedout', 1, map, view) ];

      // Assert: always the whole map's zoom, and not standing still.
      expect([ cameras.map(camera => camera.zoom), cameras[0].x !== cameras[1].x ])
        .toStrictEqual([ [ whole, whole ], true ]);
    });
  });
});
