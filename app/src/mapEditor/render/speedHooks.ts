import type { SliderControl } from '../core/eventKinds/quickFields.ts';
import { deleteEvents } from '../core/events/eventEdits.ts';
import type { EventSelection } from '../core/events/EventSelection.ts';
import type { DocumentHub } from '../core/history/DocumentHub.ts';
import { mapHistoryKey } from '../core/history/historyKeys.ts';
import { mapDocumentKey } from '../core/model/documentKeys.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { MapPropertiesSection } from '../core/modules/PluginModule.ts';
import { ModulePropertyDrag, type MapPropertiesSource } from '../core/properties/moduleProperties.ts';
import type { MapEventTools } from '../events/MapEventTools.ts';
import { TILE_SIZE, type Camera } from '../core/renderer/camera.ts';
import type { LightingLayerDefinition } from '../core/renderer/lightingLayer.ts';
import { onTheClock, timeOfDayAt } from '../core/time/timeOfDay.ts';
import type { WindowClock } from '../core/time/WindowClock.ts';
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
 * same frames: a pan at zoom 1, a zoom sweep from 2x out to the whole map and back, the whole map held on screen and
 * drifting, so every frame is a real redraw, the whole map held still while the window's clock sweeps the day
 * ({@link clockOnPath}), so the sky is drawn again at every hour it passes, and the map held still at the game's scale
 * while a slider in Map Properties is dragged up and down its track ({@link sliderOnPath}), as an author drags a map's
 * darkness.
 */
type CameraPath = 'pan' | 'zoom' | 'zoomedout' | 'clock' | 'slider';

/**
 * How many minutes of the day a clock sweep passes in each second: a whole day every eight seconds, three minutes a
 * frame, so the hour turns every twentieth frame and every phase of the day goes by.
 */
const CLOCK_SWEEP_MINUTES_PER_SECOND = 180;

/**
 * How many of a slider's steps a slider sweep passes in each second: one a frame, as a hand dragging the thumb across
 * the track moves it.
 */
const SLIDER_SWEEP_STEPS_PER_SECOND = 60;

/**
 * How far down its track a slider sweep reaches, as a share of the track from its low end: it stays in the upper
 * reaches, so a map's darkness sweeps between deep and pitch black and never lets the map go undark, which would take
 * its mask away and build it afresh, a different cost from the one a drag through the darkness has.
 */
const SLIDER_SWEEP_LOW = 0.3;

/**
 * The first slider a module adds to Map Properties for a map, which a slider sweep drags: the section offering it, the
 * setting's key and its control.
 */
type SweptSlider = {
  readonly source: MapPropertiesSource;
  readonly key: string;
  readonly control: SliderControl;
};

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
 * Builds what the parity check draws: the game look, still, with events or without, never the shadows, and the
 * lighting only when the game it is held against draws its lighting too: its light mask over its base layer, and the
 * sky's tone over the base layer itself. Nothing animates: the check holds the water and the parallax at the game's
 * moment, and the game copy's lights are held steady, so every light draws at its full strength, as it does with no
 * effect running.
 * @param {boolean} events Whether the events show.
 * @param {boolean | undefined} lighting Whether the lighting shows; left out, it does not.
 * @returns {LayerVisibility} The visibility.
 */
const parityLook = (events: boolean, lighting?: boolean): LayerVisibility =>
{
  return { ...GAME_LOOK, animate: false, layers: { ...GAME_LOOK.layers, events, shadows: false, lighting: lighting === true } };
};

/**
 * Picks what the parity check lets draw into the lighting layer: only what the game itself shows, such as a map's
 * darkness, and never an aid like the ring marking a light's reach, which the game never draws.
 * @param {readonly LightingLayerDefinition[]} layers What the plugin modules draw there.
 * @returns {LightingLayerDefinition[]} What the game shows of it.
 */
const parityLightingLayers = (layers: readonly LightingLayerDefinition[]): LightingLayerDefinition[] =>
{
  return layers.filter(layer => layer.shownInGame === true);
};

/**
 * Timings of opening a map, in milliseconds on the page's clock (from navigation start).
 */
type OpenTimings = Record<string, number>;

/**
 * What the hooks need from the map view: its renderer, the window's hub, its painting tools and their settings, its
 * event tools and selection, the map on show, a way to open another, the page's open timings, what the plugin modules
 * draw into the lighting layer, and the sections they add to Map Properties.
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
  readonly lightingLayers: () => readonly LightingLayerDefinition[];
  readonly mapProperties: () => readonly MapPropertiesSection[];

  /**
   * The window's clock, which the page is set to, and which a clock sweep moves.
   */
  readonly clock: WindowClock;
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

  // the clock's sweep holds the whole map still, so the sky is all that moves.
  if (path === 'clock')
  {
    return centerCamera(width / 2, height / 2, whole, view);
  }

  // a slider's holds the map still at the game's scale, about its middle, as an author working on a map looks at it.
  if (path === 'slider')
  {
    return centerCamera(width / 2, height / 2, 1, view);
  }

  return centerCamera(width / 2 + Math.sin(seconds * 2) * 96, height / 2 + Math.cos(seconds * 2) * 96, whole, view);
};

/**
 * Picks the time of day a clock sweep shows a moment in: a whole day every eight seconds from midnight, round and round.
 * @param {number} seconds Seconds since the sweep started.
 * @returns {number} The time of day, in minutes past midnight.
 */
const clockOnPath = (seconds: number): number =>
{
  return onTheClock(Math.floor(seconds * CLOCK_SWEEP_MINUTES_PER_SECOND));
};

/**
 * Picks the value a slider sweep shows a slider at a moment: from the top of its track down to {@link SLIDER_SWEEP_LOW}
 * of the way along it and back up, a step a frame, round and round.
 * @param {number} seconds Seconds since the sweep started.
 * @param {SliderControl} control The slider.
 * @returns {number} The value.
 */
const sliderOnPath = (seconds: number, control: SliderControl): number =>
{
  const [ low, high ] = control.track;
  const span = Math.round(((high - low) * (1 - SLIDER_SWEEP_LOW)) / control.step);

  // a step a frame down the span and back up it, so the turn at either end is a single frame.
  const stepsIn = Math.floor(seconds * SLIDER_SWEEP_STEPS_PER_SECOND) % (span * 2);
  const stepsDown = stepsIn <= span ? stepsIn : (span * 2) - stepsIn;
  return high - (stepsDown * control.step);
};

/**
 * Finds the first slider the plugin modules add to Map Properties for a map, in the order they add their sections.
 * @param {readonly MapPropertiesSection[]} sections The sections the modules add.
 * @param {MapDocument} map The map.
 * @returns {SweptSlider | null} The slider, or null when no section offers one for the map.
 */
const firstSlider = (sections: readonly MapPropertiesSection[], map: MapDocument): SweptSlider | null =>
{
  for (const section of sections)
  {
    const field = section.source(map).fields.find(each => each.control.kind === 'slider');
    if (field !== undefined)
    {
      return { source: section.source, key: field.key, control: field.control as SliderControl };
    }
  }

  return null;
};

/**
 * The time of day a page is asked to show, as the speed script and the parity check write it in the address: hours and
 * minutes on a 24-hour clock, such as {@code time=22:00}.
 */
const TIME_QUERY = /^([01]?\d|2[0-3]):([0-5]\d)$/u;

/**
 * Reads the time of day a page opened for measuring is asked to show, so a map can be measured at night from its very
 * first frame.
 * @param {string} search The page's query string.
 * @returns {number | null} The time of day, in minutes past midnight, or null when none is asked for.
 */
const timeFromQuery = (search: string): number | null =>
{
  const match = TIME_QUERY.exec(new URLSearchParams(search).get('time') ?? '');
  if (match === null)
  {
    return null;
  }

  const [ , hours, minutes ] = match;
  return timeOfDayAt(Number(hours), Number(minutes));
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
  const { renderer, hub, tools, selection, clock } = context;
  const stops: (() => void)[] = [];
  let path: CameraPath | null = null;
  let pathStart = 0;
  let timeBeforeSweep = clock.time();
  let overlayState: OverlayState = NO_OVERLAY_STATE;
  let hoverFollows = false;

  // the slider a slider sweep drags, and the drag showing each value it passes, let go once the sweep stops.
  let swept: { slider: SweptSlider; drag: ModulePropertyDrag } | null = null;

  // a page asked for an hour shows it from its first frame, as an author's chosen hour holds, whatever the game's start.
  const asked = timeFromQuery(target.location.search);
  if (asked !== null)
  {
    clock.set(asked);
  }

  // camera paths move the camera at the start of each frame, so the frame that draws the move is the one timed; with
  // every overlay on, the hover follows the view's centre, as it follows a pointer held still while the map moves. A
  // clock sweep moves the window's clock there too, and a slider sweep the slider.
  stops.push(renderer.onBeforeFrame(time =>
  {
    const map = context.map();
    if (path === null || map === null)
    {
      return;
    }

    const seconds = (time - pathStart) / 1000;
    if (path === 'clock')
    {
      clock.set(clockOnPath(seconds));
    }

    if (swept !== null)
    {
      swept.drag.move(sliderOnPath(seconds, swept.slider.control));
    }

    const camera = cameraOnPath(path, seconds, map, renderer.viewSize);
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
    // a clock sweep puts the clock back where it found it once it stops, so what is measured after it is measured at
    // the hour the run asked for; a slider sweep lets its drag go, so the map is left as it found it, with nothing in
    // its history. A slider sweep on a map no module offers a slider for only holds the map still.
    startPath: (kind: CameraPath) =>
    {
      path = kind;
      pathStart = performance.now();
      timeBeforeSweep = clock.time();
      swept = null;
      const map = context.map();
      if (kind !== 'slider' || map === null)
      {
        return;
      }

      const slider = firstSlider(context.mapProperties(), map);
      if (slider !== null)
      {
        swept = { slider, drag: new ModulePropertyDrag(hub, map.mapId, slider.source, slider.key) };
      }
    },
    stopPath: () =>
    {
      if (path === 'clock')
      {
        clock.set(timeBeforeSweep);
      }

      swept?.drag.cancel();
      swept = null;
      path = null;
    },
    time: () => clock.time(),
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
    // the parity check draws the map as the game would, still, with nothing of the editor's on top: of the lighting,
    // only what the game itself shows, such as a map's darkness and the sky's colour, and never an aid like a light's
    // ring; at the hour the game's clock was set to, when it says one.
    prepareParity: (options: { events: boolean; step: number; frames: number; lighting?: boolean; time?: number }) =>
    {
      hoverFollows = false;
      overlayState = NO_OVERLAY_STATE;
      if (options.time !== undefined)
      {
        clock.set(options.time);
      }

      renderer.setOverlayState(overlayState);
      renderer.setOverlays({ enabled: new Set(), definitions: [] });
      renderer.setLightingLayers(parityLightingLayers(context.lightingLayers()));
      renderer.setLayerVisibility(parityLook(options.events, options.lighting));
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
    // a slider sweep still running lets its drag go, so the map is not left holding the value it last showed.
    swept?.drag.cancel();
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

export {
  cameraOnPath,
  CLOCK_SWEEP_MINUTES_PER_SECOND,
  clockOnPath,
  firstSlider,
  HOOKS_GLOBAL,
  installSpeedHooks,
  parityLightingLayers,
  parityLook,
  ringsOverlay,
  SLIDER_SWEEP_LOW,
  SLIDER_SWEEP_STEPS_PER_SECOND,
  sliderOnPath,
  timeFromQuery,
  unusedGroundKind,
  wantsSpeedHooks,
};
export type { CameraPath, SpeedHooksContext, StrokeSettings, SweptSlider };
