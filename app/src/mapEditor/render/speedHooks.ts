import { deleteEvents } from '../core/events/eventEdits.ts';
import type { EventSelection } from '../core/events/EventSelection.ts';
import type { DocumentHub } from '../core/history/DocumentHub.ts';
import { mapHistoryKey } from '../core/history/historyKeys.ts';
import { mapDocumentKey } from '../core/model/documentKeys.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { MapEventTools } from '../events/MapEventTools.ts';
import { TILE_SIZE, type Camera } from '../core/renderer/camera.ts';
import {
  GAME_LOOK,
  NO_OVERLAY_STATE,
  type CoreOverlayId,
  type GhostTile,
  type LayerVisibility,
  type MapContextMenu,
  type OverlayDefinition,
  type OverlayState,
} from '../core/renderer/MapRenderer.ts';
import { a2Column, autotileKind, isAutotile, makeAutotileId } from '../core/tiles/tileIds.ts';
import { tileBrush } from '../core/tools/brush.ts';
import type { PaintSettings, PaintState } from '../core/tools/PaintState.ts';
import { centerCamera, fitZoom } from './cameraControls.ts';
import { whenMapDrawn } from './openTiming.ts';
import type { PixiMapRenderer } from './PixiMapRenderer.ts';
import type { PaintController } from './tools/PaintController.ts';

/**
 * The camera paths the speed script records, each driven from the renderer's own frame clock so every run draws the
 * same frames: a pan at zoom 1, a zoom sweep from 2x out to the whole map and back, and the whole map held on screen
 * and drifting, so every frame is a real redraw.
 */
type CameraPath = 'pan' | 'zoom' | 'zoomedout';

/**
 * What the speed script's stroke paints with: a square brush of one tile, painted by the real pen through automatic
 * layering, so every step goes through the layering engine and reshapes the autotiles around what it covers.
 */
type StrokeSettings = {
  /**
   * The tile to paint; left out, a ground kind the map does not use, so every cell the pen covers really changes.
   */
  readonly tileId?: number;

  /**
   * The brush's size across and down.
   */
  readonly footprint: number;
};

/**
 * Finds an A2 ground kind a map holds nowhere, on any layer, for a stroke that must change every cell it covers.
 * @param {MapDocument} map The map.
 * @returns {number} The kind; the first ground kind when the map somehow holds all of them.
 */
const unusedGroundKind = (map: MapDocument): number =>
{
  const used = new Set<number>();
  const tileCells = map.width * map.height * 4;
  for (let index = 0; index < tileCells; index++)
  {
    const tileId = map.cells[index];
    if (isAutotile(tileId))
    {
      used.add(autotileKind(tileId));
    }
  }

  // the ground kinds are A2's first four columns, kinds 16 to 47.
  for (let kind = 16; kind < 48; kind++)
  {
    if (a2Column(kind) < 4 && used.has(kind) === false)
    {
      return kind;
    }
  }

  return 16;
};

/**
 * Builds a stand-in for a plugin module's overlay, as heavy as J-ABS's sight rings will be: two rings around every
 * event on the map. The speed script switches it on to measure what module overlays cost while painting, which is
 * nothing, since a tile edit never redraws them.
 * @returns {OverlayDefinition} The overlay.
 */
const ringsOverlay = (): OverlayDefinition =>
{
  return {
    id: 'speed.rings',
    title: 'Rings around every event',
    defaultOn: true,
    draw: (painter, context) =>
    {
      const { document, tileSize } = context;
      document.eventIds().forEach(id =>
      {
        const event = document.event(id);
        if (event !== null)
        {
          const x = (event.x + 0.5) * tileSize;
          const y = (event.y + 0.5) * tileSize;
          painter.circle(x, y, tileSize * 4, { stroke: 0xff5252, strokeAlpha: 0.8 });
          painter.circle(x, y, tileSize * 6, { stroke: 0xffab40, strokeAlpha: 0.5 });
        }
      });
    },
  };
};

/**
 * Builds what the parity check draws: the game look, still, with events or without, and with neither the shadows nor
 * the lighting, since the game it is held against draws its base layer with no lighting at all.
 * @param {boolean} events Whether the events show.
 * @returns {LayerVisibility} The visibility.
 */
const parityLook = (events: boolean): LayerVisibility =>
{
  return { ...GAME_LOOK, layers: { ...GAME_LOOK.layers, events, shadows: false, lighting: false } };
};

/**
 * Timings of opening a map, in milliseconds on the page's clock (from navigation start).
 */
type OpenTimings = Record<string, number>;

/**
 * What the hooks need from the map view: its renderer, the window's hub, its painting tools and their settings, its
 * event tools and selection, the map on show, a way to open another, and the page's open timings.
 */
type SpeedHooksContext = {
  readonly renderer: PixiMapRenderer;
  readonly hub: DocumentHub;
  readonly painter: PaintController;
  readonly painting: PaintState;
  readonly tools: MapEventTools;
  readonly selection: EventSelection;
  readonly map: () => MapDocument | null;
  readonly openMap: (mapId: number) => Promise<void>;
  readonly timings: OpenTimings;
};

/**
 * The global the speed script and the parity check drive the page through.
 */
const HOOKS_GLOBAL = '__jmzMapView';

/**
 * Every overlay the core draws, which the speed script switches on together: the event markers among them, so a map
 * full of events that draw no picture (458 of Map361's 600) is measured with every one of them on show.
 */
const EVERY_CORE_OVERLAY: readonly CoreOverlayId[] = [ 'grid', 'regions', 'passability', 'layer-highlight', 'selection', 'hover', 'ghost', 'markers' ];

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
  const { renderer, hub, tools, selection } = context;
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

  // strokes paint with the real pen: the map view's own tools, through the layering engine and the autotile refresh.
  const { painter, painting } = context;
  let before: PaintSettings | null = null;

  // the frames that rebuilt chunks since the pen was picked up: proof a stroke reached the screen.
  let redrawnFrames = 0;
  stops.push(renderer.onFrame(report =>
  {
    if (report.rebuiltChunks > 0)
    {
      redrawnFrames += 1;
    }
  }));
  const { canvas } = renderer;

  const hooks = {
    ready: () => context.timings['drawnAt'] !== undefined,
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
    drawState: () => renderer.drawState,
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
    // picks up the pen with a square brush of one tile, remembering what was in hand to put it back afterwards; the pen
    // owns the left button while it is in hand, so the event tools stand down until the tool in hand goes back.
    enablePaint: (next: Partial<StrokeSettings>) =>
    {
      const map = context.map();
      if (map === null)
      {
        return null;
      }

      const footprint = next.footprint ?? 3;
      const tileId = next.tileId ?? makeAutotileId(unusedGroundKind(map), 0);
      before ??= painting.settings;
      painting.setBrush({ ...tileBrush(new Array(footprint * footprint).fill(tileId), footprint, footprint), tilesetId: map.tilesetId });
      painting.setStrip('auto');
      painting.setTool('pen');
      painter.resetPaintedInputs();
      redrawnFrames = 0;
      return tileId;
    },
    disablePaint: () =>
    {
      painter.session.interrupt();
      if (before !== null)
      {
        painting.setBrush(before.brush);
        painting.setStrip(before.strip);
        painting.setOverrideLayer(before.overrideLayer);
        painting.setTool(before.tool);
        before = null;
      }
    },
    // stands in for a plugin module's overlay, as heavy as sight rings around every event.
    enableModuleRings: () =>
    {
      renderer.setOverlays({ enabled: new Set([ ...EVERY_CORE_OVERLAY, 'speed.rings' ]), definitions: [ ringsOverlay() ] });
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
      renderer.setLayerVisibility(parityLook(options.events));
      renderer.holdAnimation({ step: options.step, frames: options.frames });
    },
    extract: (rect: { x: number; y: number; width: number; height: number }) => renderer.extract(rect),
    paintState: () => ({ steps: painter.paintedInputs, redrawnFrames, painting: painter.session.isActive }),
    undoPaint: () => hub.undo(mapHistoryKey(context.map()?.mapId ?? 0)),
    // a warm open ends where a cold one does: at the first frame showing the map complete, sprites and parallax included.
    openMap: async (mapId: number) =>
    {
      const started = performance.now();
      await context.openMap(mapId);
      const drawn = await new Promise<number>(resolve =>
      {
        whenMapDrawn(renderer, resolve);
      });
      return { ms: drawn - started, key: mapDocumentKey(mapId) };
    },
    // a map panel put behind another tab and brought back: the view lets its GPU context go, waits for it to be gone,
    // then is shown and asks for it back. It ends at the first frame drawn once the context is back, which uploads
    // everything afresh, as a warm open ends at its first frame showing the map complete.
    showAgain: async (hiddenMs = 250) =>
    {
      renderer.setVisible(false);
      await new Promise(resolve =>
      {
        setTimeout(resolve, hiddenMs);
      });
      const hidden = renderer.drawState;
      const started = performance.now();
      const drawn = new Promise<number>(resolve =>
      {
        const stop = renderer.onFrame(() =>
        {
          stop();
          resolve(performance.now());
        });
      });
      renderer.setVisible(true);
      return { ms: (await drawn) - started, hidden, shown: renderer.drawState };
    },
    // what the speed script needs to select, box-select and drag events with the real mouse, and to prove it did: the
    // tools' counts, the selection, where an event shows, and a way to empty a row so a big drop has somewhere to land.
    events: {
      state: () => ({ ...tools.state(), total: context.map()?.eventIds().length ?? 0 }),
      clear: () => selection.clear(),
      screenOfEvent: (eventId: number) =>
      {
        const event = context.map()?.event(eventId) ?? null;
        return event === null ? null : hooks.screenOfCell(event.x, event.y);
      },
      cellOf: (eventId: number) =>
      {
        const event = context.map()?.event(eventId) ?? null;
        return event === null ? null : { x: event.x, y: event.y };
      },
      eventIds: () => context.map()?.eventIds() ?? [],
      selectedIds: () => [ ...selection.eventsOn(context.map()?.mapId ?? 0) ],
      removeRow: (y: number) =>
      {
        const map = context.map();
        if (map === null)
        {
          return 0;
        }

        const row = map.eventIds().filter(id => map.event(id)?.y === y);
        deleteEvents(hub, map.mapId, row);
        return row.length;
      },
    },
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

export { cameraOnPath, HOOKS_GLOBAL, installSpeedHooks, parityLook, ringsOverlay, unusedGroundKind, wantsSpeedHooks };
export type { CameraPath, SpeedHooksContext, StrokeSettings };
