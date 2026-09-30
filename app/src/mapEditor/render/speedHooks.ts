import type { DocumentHub } from '../core/history/DocumentHub.ts';
import { mapHistoryKey } from '../core/history/historyKeys.ts';
import type { Transaction } from '../core/history/Transaction.ts';
import { mapDocumentKey } from '../core/model/documentKeys.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import { TILE_SIZE, type Camera } from '../core/renderer/camera.ts';
import {
  GAME_LOOK,
  NO_OVERLAY_STATE,
  type CoreOverlayId,
  type GhostTile,
  type MapContextMenu,
  type OverlayState,
} from '../core/renderer/MapRenderer.ts';
import { centerCamera, fitZoom } from './cameraControls.ts';
import type { PixiMapRenderer } from './PixiMapRenderer.ts';

/**
 * The camera paths the speed script records, each driven from the renderer's own frame clock so every run draws the
 * same frames: a pan at zoom 1, a zoom sweep from 2x out to the whole map and back, and the whole map held on screen
 * and drifting, so every frame is a real redraw.
 */
type CameraPath = 'pan' | 'zoom' | 'zoomedout';

/**
 * What the paint stand-in paints: tile ids it alternates between, so every step is a real change, on one layer, over a
 * square footprint about the pointer. A footprint of 3 stands in for the autotile neighbourhood P3's pen reshapes.
 */
type PaintSettings = {
  readonly tileIds: readonly number[];
  readonly layer: number;
  readonly footprint: number;
};

/**
 * Timings of opening a map, in milliseconds on the page's clock (from navigation start).
 */
type OpenTimings = Record<string, number>;

/**
 * What the hooks need from the map view.
 */
type SpeedHooksContext = {
  readonly renderer: PixiMapRenderer;
  readonly hub: DocumentHub;
  readonly map: () => MapDocument | null;
  readonly openMap: (mapId: number) => Promise<void>;
  readonly timings: OpenTimings;
};

/**
 * The global the speed script and the parity check drive the page through.
 */
const HOOKS_GLOBAL = '__jmzMapView';

/**
 * Every overlay the core draws, which the speed script switches on together.
 */
const EVERY_CORE_OVERLAY: readonly CoreOverlayId[] = [ 'grid', 'regions', 'passability', 'layer-highlight', 'selection', 'hover', 'ghost' ];

/**
 * Builds a representative state for every pointer overlay at once: a brush footprint under the pointer, fifty events
 * selected, a tile area and a box selected, and a 3x3 ghost of tiles and an event about to be placed.
 * @param {MapDocument} map The map.
 * @returns {OverlayState} The state.
 */
const everyOverlayState = (map: MapDocument): OverlayState =>
{
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  const ghostTiles: GhostTile[] = [];
  for (let dy = 0; dy < 3; dy++)
  {
    for (let dx = 0; dx < 3; dx++)
    {
      ghostTiles.push({ x: Math.min(map.width - 1, cx + 2 + dx), y: Math.min(map.height - 1, cy + dy), layer: 0, tileId: 2816 + 47 });
    }
  }

  const ids = map.eventIds();
  const firstImage = ids.length === 0 ? null : map.event(ids[0])?.pages[0]?.image ?? null;
  return {
    hover: { x: cx - 1, y: cy - 1, width: 3, height: 3 },
    selectedEvents: ids.slice(0, 50),
    selectedCells: { x: 1, y: 1, width: Math.min(6, map.width - 1), height: Math.min(4, map.height - 1) },
    selectionBox: { x: TILE_SIZE * 2, y: TILE_SIZE * 2, width: TILE_SIZE * 8, height: TILE_SIZE * 5 },
    ghostTiles,
    ghostEvents: firstImage === null ? [] : [ { x: cx, y: Math.min(map.height - 1, cy + 4), image: firstImage, priorityType: 1 } ],
  };
};

/**
 * Picks where a camera path looks at a moment.
 * @param {CameraPath} path The path.
 * @param {number} seconds Seconds since the path started.
 * @param {MapDocument} map The map.
 * @param {{ width: number, height: number }} view The view size.
 * @returns {Camera} The camera.
 */
const cameraOnPath = (
  path: CameraPath, seconds: number, map: MapDocument, view: { width: number; height: number }): Camera =>
{
  const width = map.width * TILE_SIZE;
  const height = map.height * TILE_SIZE;
  const swingX = Math.sin(seconds * 0.9) * width;
  const swingY = Math.cos(seconds * 0.7) * height;
  const whole = fitZoom(view, map, TILE_SIZE);
  if (path === 'pan')
  {
    return centerCamera(width / 2 + swingX * 0.3, height / 2 + swingY * 0.3, 1, view);
  }

  if (path === 'zoom')
  {
    // geometric, so the sweep reads as even: 2x at the top, the whole map at the bottom, every 4.8 s.
    const phase = 0.5 + 0.5 * Math.cos(seconds * 1.3);
    const zoom = whole * Math.pow(2 / whole, phase);
    return centerCamera(width / 2 + swingX * 0.2, height / 2 + swingY * 0.2, zoom, view);
  }

  return centerCamera(width / 2 + Math.sin(seconds * 2) * 96, height / 2 + Math.cos(seconds * 2) * 96, whole, view);
};

/**
 * Installs the hooks the speed script and the parity check drive the page through, as a global on the page's window.
 * Nothing here runs unless the page was opened for measuring.
 * @param {Window} target The page's window.
 * @param {SpeedHooksContext} context The map view's parts.
 * @returns {() => void} Removes the hooks.
 */
const installSpeedHooks = (target: Window, context: SpeedHooksContext): (() => void) =>
{
  const { renderer, hub } = context;
  const stops: (() => void)[] = [];
  let path: CameraPath | null = null;
  let pathStart = 0;
  let overlayState: OverlayState = NO_OVERLAY_STATE;
  let hoverFollows = false;

  // camera paths move the camera at the start of each frame, so the frame that draws the move is the one timed; with
  // every overlay on, the hover follows the view's centre, as it follows a pointer held still while the map moves.
  stops.push(renderer.onBeforeFrame(time =>
  {
    const map = context.map();
    if (path === null || map === null)
    {
      return;
    }

    const camera = cameraOnPath(path, (time - pathStart) / 1000, map, renderer.viewSize);
    renderer.setCamera(camera);
    if (hoverFollows)
    {
      const { width, height } = renderer.viewSize;
      const x = Math.floor((camera.x + width / camera.zoom / 2) / TILE_SIZE);
      const y = Math.floor((camera.y + height / camera.zoom / 2) / TILE_SIZE);
      overlayState = { ...overlayState, hover: { x: x - 1, y: y - 1, width: 3, height: 3 } };
      renderer.setOverlayState(overlayState);
    }
  }));

  // every context menu the renderer raises, so a check can see a still right click land.
  const contextMenus: MapContextMenu[] = [];
  stops.push(renderer.onContextMenu(menu => contextMenus.push(menu)));

  // the paint stand-in: a pen that paints on pointer moves with the left button held, the way P3's will.
  let painting: { transaction: Transaction; map: MapDocument } | null = null;
  let settings: PaintSettings = { tileIds: [ 2048 + 47, 2816 + 47 ], layer: 0, footprint: 3 };
  let steps = 0;
  const { canvas } = renderer;
  const paintAt = (x: number, y: number) =>
  {
    const cell = renderer.cellAt({ x, y });
    if (painting === null || cell === null)
    {
      return;
    }

    const { map, transaction } = painting;
    const value = settings.tileIds[steps % settings.tileIds.length];
    const half = Math.floor(settings.footprint / 2);
    const cells: [ number, number ][] = [];
    for (let dy = -half; dy <= half; dy++)
    {
      for (let dx = -half; dx <= half; dx++)
      {
        const cx = cell.x + dx;
        const cy = cell.y + dy;
        if (cx >= 0 && cy >= 0 && cx < map.width && cy < map.height)
        {
          cells.push([ map.cellIndex(cx, cy, settings.layer), value ]);
        }
      }
    }

    transaction.tiles(map.key, cells);
    steps += 1;
  };
  const onDown = (event: PointerEvent) =>
  {
    const map = context.map();
    if (event.button !== 0 || map === null || canvas === null)
    {
      return;
    }

    painting = { map, transaction: hub.begin('Paint', [ mapHistoryKey(map.mapId) ]) };
    canvas.setPointerCapture(event.pointerId);
    paintAt(event.offsetX, event.offsetY);
  };
  const onMove = (event: PointerEvent) =>
  {
    paintAt(event.offsetX, event.offsetY);
  };
  const onUp = () =>
  {
    painting?.transaction.commit();
    painting = null;
  };

  const hooks = {
    ready: () => context.timings['firstFrameAt'] !== undefined,
    timings: context.timings,
    info: () =>
    {
      const map = context.map();
      return {
        mapId: map?.mapId ?? null,
        size: map === null ? null : [ map.width, map.height ],
        events: map === null ? 0 : map.eventIds().length,
        gpu: renderer.rendererInfo(),
        canvas: canvas === null ? null : [ canvas.width, canvas.height ],
        view: renderer.viewSize,
        stats: renderer.stats(),
      };
    },
    camera: () => renderer.camera,
    contextMenus: () => [ ...contextMenus ],
    lookAt: (x: number, y: number, zoom: number) => renderer.lookAt({ x, y }, zoom),
    zoomToFit: () => renderer.zoomToFit(),
    screenOfCell: (x: number, y: number) =>
    {
      const { x: cameraX, y: cameraY, zoom } = renderer.camera;
      return { x: (x * TILE_SIZE + TILE_SIZE / 2 - cameraX) * zoom, y: (y * TILE_SIZE + TILE_SIZE / 2 - cameraY) * zoom };
    },
    startPath: (kind: CameraPath) =>
    {
      path = kind;
      pathStart = performance.now();
    },
    stopPath: () =>
    {
      path = null;
    },
    enablePaint: (next: Partial<PaintSettings>) =>
    {
      settings = { ...settings, ...next };
      steps = 0;
      canvas?.addEventListener('pointerdown', onDown);
      canvas?.addEventListener('pointermove', onMove);
      canvas?.addEventListener('pointerup', onUp);
    },
    disablePaint: () =>
    {
      onUp();
      canvas?.removeEventListener('pointerdown', onDown);
      canvas?.removeEventListener('pointermove', onMove);
      canvas?.removeEventListener('pointerup', onUp);
    },
    enableEveryOverlay: () =>
    {
      const map = context.map();
      if (map === null)
      {
        return;
      }

      renderer.setOverlays({ enabled: new Set(EVERY_CORE_OVERLAY), definitions: [] });
      renderer.setLayerVisibility({ ...GAME_LOOK, highlighted: 'tiles3' });
      overlayState = everyOverlayState(map);
      renderer.setOverlayState(overlayState);
      hoverFollows = true;
    },
    // the parity check draws the map as the game would, still, with nothing of the editor's on top.
    prepareParity: (options: { events: boolean; step: number; frames: number }) =>
    {
      hoverFollows = false;
      overlayState = NO_OVERLAY_STATE;
      renderer.setOverlayState(overlayState);
      renderer.setOverlays({ enabled: new Set(), definitions: [] });
      renderer.setLayerVisibility({ ...GAME_LOOK, layers: { ...GAME_LOOK.layers, events: options.events, shadows: false } });
      renderer.holdAnimation({ step: options.step, frames: options.frames });
    },
    extract: (rect: { x: number; y: number; width: number; height: number }) => renderer.extract(rect),
    paintState: () => ({ steps, painting: painting !== null }),
    undoPaint: () => hub.undo(mapHistoryKey(context.map()?.mapId ?? 0)),
    openMap: async (mapId: number) =>
    {
      const started = performance.now();
      await context.openMap(mapId);
      const drawn = await new Promise<number>(resolve =>
      {
        const stop = renderer.onFrame(report =>
        {
          if (report.rebuiltChunks > 0)
          {
            stop();
            resolve(performance.now());
          }
        });
      });
      return { ms: drawn - started, key: mapDocumentKey(mapId) };
    },
    // P5 fills this in once events can be dragged; the speed script measures it only when it is there.
    dragEvents: null as null | ((options: unknown) => Promise<unknown>),
  };

  (target as unknown as Record<string, unknown>)[HOOKS_GLOBAL] = hooks;
  return () =>
  {
    hooks.disablePaint();
    stops.forEach(stop => stop());
    delete (target as unknown as Record<string, unknown>)[HOOKS_GLOBAL];
  };
};

/**
 * Reports whether a page was opened for measuring: the speed script adds {@code speed=1} to the address.
 * @param {string} search The page's query string.
 * @returns {boolean} True when the hooks should be installed.
 */
const wantsSpeedHooks = (search: string): boolean =>
{
  return new URLSearchParams(search).get('speed') === '1';
};

export { cameraOnPath, HOOKS_GLOBAL, installSpeedHooks, wantsSpeedHooks };
export type { CameraPath, PaintSettings, SpeedHooksContext };
