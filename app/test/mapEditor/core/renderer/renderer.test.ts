import { describe, expect, it } from 'vitest';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import {
  cellAtPoint,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAround,
} from '../../../../src/mapEditor/core/renderer/camera.ts';
import { FrameTimeRecorder } from '../../../../src/mapEditor/core/renderer/FrameTimeRecorder.ts';
import { HeadlessMapRenderer } from '../../../../src/mapEditor/core/renderer/HeadlessMapRenderer.ts';
import { GAME_LOOK, type OverlaySet } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Every tool and every click asks the renderer one of two questions, which cell is under this point and which
 * event, and the speed script asks a third, how long did the frames take. The camera math behind the first two is
 * shared by every renderer, so it is proved here once: a point converts to the world and back exactly, the cell
 * under the pointer is the one drawn there at any zoom, zooming holds the point under the wheel still, and panning
 * moves the map with the pointer. The headless renderer keeps the whole contract without a GPU, so tools can be
 * tested against it.
 */
describe('renderer', () =>
{
  describe('camera', () =>
  {
    it('converts a view point to the world and back', () =>
    {
      // Arrange.
      const camera = { x: 100, y: 50, zoom: 2 };

      // Act.
      const world = screenToWorld(camera, { x: 30, y: 40 });
      const back = worldToScreen(camera, world);

      // Assert.
      expect([ world, back ])
        .toStrictEqual([ { x: 115, y: 70 }, { x: 30, y: 40 } ]);
    });

    it('finds the cell under a point at any zoom, and nothing off the map', () =>
    {
      // Arrange: a 3x2 map with the camera zoomed out by half.
      const camera = { x: 0, y: 0, zoom: 0.5 };
      const size = { width: 3, height: 2 };

      // Act.
      const cells = [
        cellAtPoint(camera, { x: 0, y: 0 }, size),
        cellAtPoint(camera, { x: 23, y: 23 }, size),
        cellAtPoint(camera, { x: 24, y: 23 }, size),
        cellAtPoint(camera, { x: 71, y: 47 }, size),
        cellAtPoint(camera, { x: 72, y: 0 }, size),
        cellAtPoint(camera, { x: 0, y: 48 }, size),
        cellAtPoint({ x: 10, y: 0, zoom: 1 }, { x: 0, y: 0 }, size),
        cellAtPoint({ x: -10, y: 0, zoom: 1 }, { x: 0, y: 0 }, size),
      ];

      // Assert.
      expect(cells)
        .toStrictEqual([ { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, null, null, { x: 0, y: 0 }, null ]);
    });

    it('holds the point under the wheel still while zooming', () =>
    {
      // Arrange.
      const camera = { x: 200, y: 100, zoom: 1 };
      const anchor = { x: 320, y: 240 };
      const before = screenToWorld(camera, anchor);

      // Act.
      const zoomed = zoomAround(camera, anchor, 2);

      // Assert.
      expect([ zoomed.zoom, screenToWorld(zoomed, anchor) ])
        .toStrictEqual([ 2, before ]);
    });

    it('keeps the zoom inside its range', () =>
    {
      // Arrange: values beyond each end, and one inside.

      // Act.
      const zooms = [ clampZoom(0.01), clampZoom(50), clampZoom(1.5), zoomAround({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 1000).zoom ];

      // Assert.
      expect(zooms)
        .toStrictEqual([ MIN_ZOOM, MAX_ZOOM, 1.5, MAX_ZOOM ]);
    });

    it('moves the map with the pointer while panning', () =>
    {
      // Arrange.
      const camera = { x: 100, y: 100, zoom: 2 };

      // Act.
      const panned = panBy(camera, 40, -20);

      // Assert.
      expect(panned)
        .toStrictEqual({ x: 80, y: 110, zoom: 2 });
    });
  });

  describe('FrameTimeRecorder', () =>
  {
    it('sums up frame durations, counting the frames over budget', () =>
    {
      // Arrange.
      const recorder = new FrameTimeRecorder();
      [ 10, 12, 14, 16, 30 ].forEach(duration => recorder.record(duration));

      // Act.
      const summary = recorder.summary();

      // Assert.
      expect(summary)
        .toStrictEqual({ frames: 5, averageMs: 16.4, p95Ms: 30, worstMs: 30, overBudget: 1 });
    });

    it('reports zeros before any frame and after a reset', () =>
    {
      // Arrange.
      const recorder = new FrameTimeRecorder();
      const empty = recorder.summary();
      recorder.record(20);

      // Act.
      recorder.reset();

      // Assert.
      expect([ empty, recorder.summary() ])
        .toStrictEqual([
          { frames: 0, averageMs: 0, p95Ms: 0, worstMs: 0, overBudget: 0 },
          { frames: 0, averageMs: 0, p95Ms: 0, worstMs: 0, overBudget: 0 },
        ]);
    });

    it('keeps only the most recent frames', () =>
    {
      // Arrange.
      const recorder = new FrameTimeRecorder(3);

      // Act.
      [ 100, 1, 2, 3 ].forEach(duration => recorder.record(duration));

      // Assert.
      expect([ recorder.summary().frames, recorder.summary().worstMs ])
        .toStrictEqual([ 3, 3 ]);
    });
  });

  describe('HeadlessMapRenderer', () =>
  {
    /**
     * A renderer showing the fixture map, with a second event sharing the first event's cell.
     * @returns {HeadlessMapRenderer} The renderer.
     */
    const buildRenderer = (): HeadlessMapRenderer =>
    {
      const json = buildMapJson();
      json.events.push(createMapEvent(5, 0, 0));
      const renderer = new HeadlessMapRenderer();
      renderer.setDocument(MapDocument.fromJson('map:1', json));
      return renderer;
    };

    it('finds the event on the cell under a point, the newest where several share it', () =>
    {
      // Arrange.
      const renderer = buildRenderer();

      // Act.
      const events = [
        renderer.eventAt({ x: 10, y: 10 }),
        renderer.eventAt({ x: 2 * 48 + 5, y: 48 + 5 }),
        renderer.eventAt({ x: 48 + 5, y: 5 }),
        renderer.eventAt({ x: 500, y: 5 }),
      ];

      // Assert.
      expect(events)
        .toStrictEqual([ 5, 3, null, null ]);
    });

    it('follows the camera when finding cells', () =>
    {
      // Arrange.
      const renderer = buildRenderer();

      // Act.
      renderer.setCamera({ x: 48, y: 0, zoom: 2 });
      const cell = renderer.cellAt({ x: 100, y: 0 });

      // Assert.
      expect(cell)
        .toStrictEqual({ x: 2, y: 0 });
    });

    it('answers nothing before it has a map, and after it is destroyed', () =>
    {
      // Arrange.
      const blank = new HeadlessMapRenderer();
      const destroyed = buildRenderer();

      // Act.
      destroyed.destroy();

      // Assert.
      expect([ blank.cellAt({ x: 0, y: 0 }), blank.eventAt({ x: 0, y: 0 }), destroyed.eventAt({ x: 10, y: 10 }), destroyed.state.destroyed ])
        .toStrictEqual([ null, null, null, true ]);
    });

    it('keeps what it is given and reports its frames', () =>
    {
      // Arrange.
      const renderer = buildRenderer();
      const host = {} as HTMLElement;
      const overlays: OverlaySet = { enabled: new Set([ 'grid' ]), definitions: [] };
      const tileset = { tileset: { id: 1, flags: [], mode: 1, name: 'Outside', note: '', tilesetNames: [] }, sheets: [] };
      const textures = { image: async () => null };
      const visibility = { ...GAME_LOOK, highlighted: 'tiles3' as const };

      // Act.
      renderer.mount(host);
      renderer.setOverlays(overlays);
      renderer.setTileset(tileset);
      renderer.setTextureSource(textures);
      renderer.setLayerVisibility(visibility);
      renderer.recordFrame(20);
      const timings = renderer.frameTimings();
      renderer.resetFrameTimings();

      // Assert.
      const { state } = renderer;
      expect([ state.host, state.overlays, state.tileset, state.textures, state.visibility, timings.frames, renderer.frameTimings().frames ])
        .toStrictEqual([ host, overlays, tileset, textures, visibility, 1, 0 ]);
    });
  });
});
