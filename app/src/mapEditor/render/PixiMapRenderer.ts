import { Container, Graphics, Rectangle, WebGLRenderer, type TextureSource } from 'pixi.js';
import type { DocumentChange } from '../core/model/EditorDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { Patch } from '../core/model/patches.ts';
import type { PassabilityRule } from '../core/modules/PluginModule.ts';
import { cellAtPoint, panBy, screenToWorld, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from '../core/renderer/camera.ts';
import { FrameTimeRecorder, type FrameTimings } from '../core/renderer/FrameTimeRecorder.ts';
import {
  GAME_LOOK,
  NO_OVERLAY_STATE,
  type LayerVisibility,
  type MapContextMenu,
  type MapRenderer,
  type OverlayId,
  type OverlaySet,
  type OverlayState,
  type RendererInfo,
  type TextureSource as ImageTextureSource,
  type TilesetTextures,
} from '../core/renderer/MapRenderer.ts';
import {
  centerCamera,
  fitCamera,
  RightButtonGesture,
  visibleWorld,
  wheelZoomFactor,
  zoomAt,
  zoomLimits,
  type ViewSize,
} from './cameraControls.ts';
import { chunkGrid, chunkRangeFor, dirtyChunksForCells, type ChunkGrid, type ChunkRange } from './chunkMath.ts';
import { animationFrameAt, animationVector, engineFramesAt } from './engine/animation.ts';
import { cellPassage, passabilityQuery, tileEventsByCell } from './engine/passability.ts';
import type { TileSource } from './engine/spotWriter.ts';
import { FrameLoop, type FrameWindow } from './FrameLoop.ts';
import { AtlasChunks } from './scene/AtlasChunks.ts';
import { EventLayer } from './scene/EventLayer.ts';
import { GhostTiles } from './scene/GhostTiles.ts';
import { ModuleOverlays } from './scene/ModuleOverlays.ts';
import { drawPassageAtlas, drawRegionAtlas, passageMarkIndex } from './scene/overlayAtlases.ts';
import { ParallaxLayer } from './scene/ParallaxLayer.ts';
import { drawGrid, drawPointerOverlays } from './scene/pointerOverlays.ts';
import { TileChunks } from './scene/TileChunks.ts';
import { textureSourceFor } from './textureImages.ts';

/**
 * What a frame did, for anything timing the renderer.
 */
type FrameReport = {
  /**
   * The frame's time, as the window handed it to the frame callback.
   */
  readonly time: number;

  /**
   * How long the frame's work took, in milliseconds.
   */
  readonly workMs: number;

  /**
   * How many tile chunks the frame rebuilt.
   */
  readonly rebuiltChunks: number;
};

/**
 * What the renderer holds, for the speed script's report.
 */
type RendererStats = {
  readonly quads: number;
  readonly chunks: number;
  readonly eventSprites: number;

  /**
   * Pictures still loading: character sheets, and the parallax.
   */
  readonly loadingImages: number;
  readonly moduleOverlays: number;
};

/**
 * The world's layers, bottom to top: the engine's black behind the map, the parallax, the tiles below characters,
 * the events in their three priorities around the tiles above characters, the lighting P9 draws, then the editor's
 * own: the dimming and highlighted layer, and the overlays.
 */
type Slots = {
  readonly backdrop: Graphics;
  readonly parallax: Container;
  readonly lowerTiles: Container;
  readonly upperTiles: Container;
  readonly lighting: Container;
  readonly dim: Graphics;
  readonly highlightTiles: Container;
  readonly regions: Container;
  readonly passability: Container;
  readonly grid: Graphics;
  readonly modules: Container;
  readonly ghosts: Container;
  readonly pointer: Graphics;
};

/**
 * What changes with the map: its chunks, its size-bound drawings and its ghosts.
 */
type MapScene = {
  readonly grid: ChunkGrid;
  readonly source: TileSource;
  readonly document: MapDocument;
  readonly tiles: TileChunks;
  readonly ghosts: GhostTiles;

  /**
   * The region overlay's chunks, built the first time the overlay shows, since its atlas takes a moment to draw.
   */
  regions: AtlasChunks | null;

  /**
   * The passability overlay's chunks, likewise built on first show.
   */
  passability: AtlasChunks | null;
};

/**
 * The colour behind the map where nothing is drawn, as the engine's black screen shows behind its tilemap.
 */
const MAP_BACKDROP = 0x000000;

/**
 * The editor's own background, around the map.
 */
const VIEW_BACKGROUND = 0x121212;

/**
 * How dark the layer highlight makes everything but the highlighted layer.
 */
const DIM_ALPHA = 0.6;

/**
 * The map properties the parallax reads.
 */
const PARALLAX_FIELDS: ReadonlySet<string> = new Set([ 'parallaxName', 'parallaxLoopX', 'parallaxLoopY', 'parallaxSx', 'parallaxSy' ]);

/**
 * Reads a map's loop settings, as Game_Map#isLoopHorizontal and #isLoopVertical.
 * @param {number} scrollType The map's scroll type: 0 none, 1 loops down, 2 loops across, 3 both.
 * @returns {{ horizontal: boolean, vertical: boolean }} Which ways it loops.
 */
const loopsOf = (scrollType: number): { horizontal: boolean; vertical: boolean } =>
{
  return { horizontal: scrollType === 2 || scrollType === 3, vertical: scrollType === 1 || scrollType === 3 };
};

/**
 * Reads which event a patch changed, when it changed exactly one.
 * @param {Patch} patch The patch.
 * @returns {number | null} The event id, or null when the patch reaches the event list as a whole.
 */
const patchedEventId = (patch: Patch): number | null =>
{
  if (patch.kind !== 'set' && patch.kind !== 'splice')
  {
    return null;
  }

  const [ , id ] = patch.path;
  return patch.path.length >= 2 && typeof id === 'number'
    ? id
    : null;
};

/**
 * Draws a map with pixi and the vendored tilemap exactly as the engine does, on its own frame loop: nothing here goes
 * through React. It listens to its document and redraws only what an edit touched, inside the frame that shows the
 * edit, and draws a frame only when something changed. Frames are scheduled on whichever window hosts it, so a
 * torn-out map keeps drawing.
 *
 * The game look is the default: water animates, the parallax scrolls, events stand where the engine stands them and
 * auto-shadows stay off, since the game never draws them. The camera is its own: the wheel zooms about the pointer,
 * the right button held pans, and a right click that does not move raises a context-menu event.
 */
class PixiMapRenderer implements MapRenderer
{
  #host: HTMLElement | null = null;

  #canvas: HTMLCanvasElement | null = null;

  #pixi: WebGLRenderer | null = null;

  #ready: Promise<void> | null = null;

  #destroyed = false;

  #stage = new Container();

  #world = new Container({ isRenderGroup: true });

  #slots: Slots;

  #scene: MapScene | null = null;

  #events: EventLayer;

  #parallax: ParallaxLayer;

  #modules = new ModuleOverlays();

  #atlases: { regions: TextureSource; passability: TextureSource } | null = null;

  #document: MapDocument | null = null;

  #unsubscribe: (() => void) | null = null;

  #tileset: TilesetTextures | null = null;

  #sheetSources: (TextureSource | null)[] = [];

  #retiredSources: (TextureSource | null)[] = [];

  #mapDirty = false;

  #images: ImageTextureSource | null = null;

  #camera: Camera = { x: 0, y: 0, zoom: 1 };

  #cameraPlaced = false;

  #view: ViewSize = { width: 1, height: 1 };

  #resolution = 1;

  #visibility: LayerVisibility = GAME_LOOK;

  #overlays: OverlaySet = { enabled: new Set(), definitions: [] };

  #overlayState: OverlayState = NO_OVERLAY_STATE;

  #rules: readonly PassabilityRule[] = [];

  #tileEvents = new Map<number, number[]>();

  #modulesDirty = true;

  #pointerDirty = true;

  #ghostsDirty = true;

  #frames = new FrameTimeRecorder();

  #loop: FrameLoop;

  #needsRender = true;

  #animationStart = 0;

  #animationStep = -1;

  #fixedAnimation: { step: number; frames: number } | null = null;

  #gesture = new RightButtonGesture();

  #resizeObserver: ResizeObserver | null = null;

  #listeners: (() => void)[] = [];

  #cameraListeners = new Set<(camera: Camera) => void>();

  #contextMenuListeners = new Set<(menu: MapContextMenu) => void>();

  #frameListeners = new Set<(report: FrameReport) => void>();

  #beforeFrameListeners = new Set<(time: number) => void>();

  constructor()
  {
    this.#loop = new FrameLoop(() => this.#hostWindow(), time => this.#frame(time));
    const invalidate = () =>
    {
      this.#needsRender = true;
    };
    this.#events = new EventLayer(invalidate);
    this.#parallax = new ParallaxLayer(invalidate);
    this.#slots = {
      backdrop: new Graphics(),
      parallax: this.#parallax.layer,
      lowerTiles: new Container(),
      upperTiles: new Container(),
      lighting: new Container(),
      dim: new Graphics(),
      highlightTiles: new Container(),
      regions: new Container(),
      passability: new Container(),
      grid: new Graphics(),
      modules: this.#modules.layer,
      ghosts: new Container(),
      pointer: new Graphics(),
    };

    // the engine's order: lower tiles, events below and with characters, upper tiles, events above characters.
    const { slots } = this;
    this.#world.addChild(
      slots.backdrop,
      slots.parallax,
      slots.lowerTiles,
      this.#events.below,
      this.#events.same,
      slots.upperTiles,
      this.#events.above,
      slots.lighting,
      slots.dim,
      slots.highlightTiles,
      slots.regions,
      slots.passability,
      slots.grid,
      slots.modules,
      slots.ghosts,
      slots.pointer,
    );
    slots.ghosts.addChild(this.#events.ghosts);
    this.#stage.addChild(this.#world);
    this.#applyVisibility();
  }

  /**
   * The world's layers.
   * @returns {Slots} The slots.
   */
  get slots(): Slots
  {
    return this.#slots;
  }

  /**
   * The container P9's lighting draws into: above the map and its events, below the editor's overlays.
   * @returns {Container} The layer.
   */
  get lightingLayer(): Container
  {
    return this.#slots.lighting;
  }

  /**
   * The current camera, including every pan and zoom the pointer made.
   * @returns {Camera} The camera.
   */
  get camera(): Camera
  {
    return this.#camera;
  }

  /**
   * The size of the view in CSS pixels.
   * @returns {ViewSize} The size.
   */
  get viewSize(): ViewSize
  {
    return this.#view;
  }

  /**
   * The canvas the map draws on.
   * @returns {HTMLCanvasElement | null} The canvas, or null before mounting.
   */
  get canvas(): HTMLCanvasElement | null
  {
    return this.#canvas;
  }

  /**
   * Counts what the renderer holds, for the speed script's report.
   * @returns {RendererStats} The counts.
   */
  stats(): RendererStats
  {
    const scene = this.#scene;
    return {
      quads: scene?.tiles.quadCount ?? 0,
      chunks: scene === null ? 0 : scene.grid.columns * scene.grid.rows,
      eventSprites: this.#events.spriteCount,
      loadingImages: this.#events.pendingLoads + (this.#parallax.loading ? 1 : 0),
      moduleOverlays: this.#modules.count,
    };
  }

  mount(host: HTMLElement): void
  {
    this.#host = host;
    const canvas = host.ownerDocument.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    host.appendChild(canvas);
    this.#canvas = canvas;
    this.#measureView();
    this.#observeSize(host);
    this.#listenForInput(canvas);
    this.#ready = this.#initPixi(canvas);
  }

  /**
   * Settles once the GPU context is up and the renderer draws.
   * @returns {Promise<void>} Settles when ready; rejects when WebGL is unavailable.
   */
  whenReady(): Promise<void>
  {
    return this.#ready ?? Promise.reject(new Error('mount the renderer before waiting for it'));
  }

  setDocument(document: MapDocument): void
  {
    if (this.#document === document)
    {
      return;
    }

    this.#unsubscribe?.();
    this.#document = document;
    this.#unsubscribe = document.subscribe(change => this.#onDocumentChange(change));
    this.#cameraPlaced = false;
    this.#mapDirty = true;
  }

  setTileset(textures: TilesetTextures): void
  {
    // keep the old sources until the rebuild, since the chunks still draw with them until then.
    this.#retiredSources.push(...this.#sheetSources);
    this.#tileset = textures;
    this.#sheetSources = textures.sheets.map(sheet => (sheet === null ? null : textureSourceFor(sheet)));
    this.#mapDirty = true;
  }

  setTextureSource(source: ImageTextureSource): void
  {
    this.#images = source;
    this.#mapDirty = true;
  }

  setCamera(camera: Camera): void
  {
    this.#cameraPlaced = true;
    this.#moveCamera(camera);
  }

  setLayerVisibility(visibility: LayerVisibility): void
  {
    this.#visibility = visibility;
    this.#applyVisibility();
  }

  setOverlays(overlays: OverlaySet): void
  {
    this.#overlays = overlays;
    this.#modules.setDefinitions(overlays.definitions, overlays.enabled);
    this.#modulesDirty = true;
    this.#pointerDirty = true;
    this.#ghostsDirty = true;
    this.#applyVisibility();
  }

  setOverlayState(state: OverlayState): void
  {
    if (state.selectedEvents !== this.#overlayState.selectedEvents)
    {
      this.#modulesDirty = true;
    }

    if (state.ghostTiles !== this.#overlayState.ghostTiles || state.ghostEvents !== this.#overlayState.ghostEvents)
    {
      this.#ghostsDirty = true;
    }

    this.#overlayState = state;
    this.#pointerDirty = true;
    this.#needsRender = true;
  }

  setPassabilityRules(rules: readonly PassabilityRule[]): void
  {
    this.#rules = rules;
    this.#scene?.passability?.markAllDirty();
    this.#needsRender = true;
  }

  refreshOverlays(): void
  {
    this.#modulesDirty = true;
    this.#needsRender = true;
  }

  frameTimings(): FrameTimings
  {
    return this.#frames.summary();
  }

  resetFrameTimings(): void
  {
    this.#frames.reset();
  }

  cellAt(point: ScreenPoint): MapCell | null
  {
    return this.#document === null
      ? null
      : cellAtPoint(this.#camera, point, this.#document, TILE_SIZE);
  }

  eventAt(point: ScreenPoint): number | null
  {
    const document = this.#document;
    if (document === null)
    {
      return null;
    }

    // the sprite drawn on top under the point, or failing that the newest event standing on the cell.
    const world = screenToWorld(this.#camera, point);
    const drawn = this.#events.eventAt(world.x, world.y);
    if (drawn !== null)
    {
      return drawn;
    }

    const cell = this.cellAt(point);
    if (cell === null)
    {
      return null;
    }

    const ids = document.eventIds().filter(id =>
    {
      const event = document.event(id);
      return event !== null && event.x === cell.x && event.y === cell.y;
    });
    return ids.length > 0
      ? ids[ids.length - 1]
      : null;
  }

  rendererInfo(): RendererInfo | null
  {
    const pixi = this.#pixi;
    if (pixi === null)
    {
      return null;
    }

    const { gl } = pixi;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return debug === null
      ? { vendor: String(gl.getParameter(gl.VENDOR)), renderer: String(gl.getParameter(gl.RENDERER)) }
      : { vendor: String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)), renderer: String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) };
  }

  onContextMenu(listener: (menu: MapContextMenu) => void): () => void
  {
    this.#contextMenuListeners.add(listener);
    return () => this.#contextMenuListeners.delete(listener);
  }

  onCameraChange(listener: (camera: Camera) => void): () => void
  {
    this.#cameraListeners.add(listener);
    return () => this.#cameraListeners.delete(listener);
  }

  /**
   * Shows the whole map, centred.
   */
  zoomToFit(): void
  {
    const document = this.#document;
    if (document !== null)
    {
      this.#cameraPlaced = true;
      this.#moveCamera(fitCamera(this.#view, document, TILE_SIZE));
    }
  }

  /**
   * Centres a cell in the view at a zoom.
   * @param {MapCell} cell The cell.
   * @param {number} zoom The zoom.
   */
  lookAt(cell: MapCell, zoom: number): void
  {
    this.#cameraPlaced = true;
    const centre = cell.x * TILE_SIZE + TILE_SIZE / 2;
    const middle = cell.y * TILE_SIZE + TILE_SIZE / 2;
    this.#moveCamera(centerCamera(centre, middle, zoom, this.#view));
  }

  /**
   * Holds the game look's animation still at one moment, or lets it run again: water at an animation step, and a
   * scrolling parallax a number of engine frames in. The parity check uses it to match a frame of the game.
   * @param {{ step: number, frames: number } | null} moment The moment, or null to follow the clock.
   */
  holdAnimation(moment: { step: number; frames: number } | null): void
  {
    this.#fixedAnimation = moment;
    this.#animationStep = -1;
    this.#needsRender = true;
  }

  /**
   * Listens for every frame that drew.
   * @param {(report: FrameReport) => void} listener Called after the frame's draw.
   * @returns {() => void} Stops listening.
   */
  onFrame(listener: (report: FrameReport) => void): () => void
  {
    this.#frameListeners.add(listener);
    return () => this.#frameListeners.delete(listener);
  }

  /**
   * Listens for the start of every frame, before anything is rebuilt or drawn, so a change made there shows in the
   * same frame. The speed script drives its camera paths from here.
   * @param {(time: number) => void} listener Called with the frame's time.
   * @returns {() => void} Stops listening.
   */
  onBeforeFrame(listener: (time: number) => void): () => void
  {
    this.#beforeFrameListeners.add(listener);
    return () => this.#beforeFrameListeners.delete(listener);
  }

  /**
   * Asks for a redraw on the next frame.
   */
  invalidate(): void
  {
    this.#needsRender = true;
  }

  /**
   * Draws a stretch of the world at one to one, as it would show through a view at zoom 1, and hands it back as a
   * PNG: what the parity check compares with the game's own drawing of the same stretch.
   * @param {{ x: number, y: number, width: number, height: number }} rect The stretch, in world pixels.
   * @returns {Promise<string>} A data URL of the PNG.
   */
  async extract(rect: { x: number; y: number; width: number; height: number }): Promise<string>
  {
    const pixi = this.#pixi;
    if (pixi === null)
    {
      throw new Error('the renderer is not drawing yet');
    }

    // draw every chunk the stretch covers, whatever the camera and the view show now.
    const saved = { camera: this.#camera, view: this.#view };
    this.#camera = { x: rect.x, y: rect.y, zoom: 1 };
    this.#view = { width: rect.width, height: rect.height };
    this.#prepareFrame(performance.now());
    this.#world.scale.set(1);
    this.#world.position.set(-rect.x, -rect.y);
    try
    {
      return await pixi.extract.base64({
        target: this.#stage,
        frame: new Rectangle(0, 0, rect.width, rect.height),
        resolution: 1,
        antialias: false,
      });
    }
    finally
    {
      this.#camera = saved.camera;
      this.#view = saved.view;
      this.#needsRender = true;
    }
  }

  destroy(): void
  {
    this.#destroyed = true;
    this.#loop.stop();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#listeners.splice(0).forEach(stop => stop());
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#destroyScene();
    this.#events.destroy();
    this.#parallax.destroy();
    this.#modules.destroy();
    [ ...this.#sheetSources, ...this.#retiredSources ].forEach(source => source?.destroy());
    this.#sheetSources = [];
    this.#retiredSources = [];
    this.#atlases?.regions.destroy();
    this.#atlases?.passability.destroy();
    this.#atlases = null;
    this.#stage.destroy({ children: true });
    this.#pixi?.destroy();
    this.#pixi = null;
    this.#canvas?.remove();
    this.#canvas = null;
    this.#host = null;
    this.#document = null;
  }

  /**
   * Finds the window hosting the renderer now.
   * @returns {FrameWindow | null} The window, or null once unmounted.
   */
  #hostWindow(): FrameWindow | null
  {
    return this.#host?.ownerDocument.defaultView ?? null;
  }

  /**
   * Starts the WebGL renderer on the canvas, then the frame loop.
   * @param {HTMLCanvasElement} canvas The canvas.
   * @returns {Promise<void>} Settles once drawing.
   */
  async #initPixi(canvas: HTMLCanvasElement): Promise<void>
  {
    const pixi = new WebGLRenderer();
    await pixi.init({
      canvas,
      width: this.#view.width,
      height: this.#view.height,
      resolution: this.#resolution,
      autoDensity: false,
      antialias: false,
      background: VIEW_BACKGROUND,
      powerPreference: 'high-performance',
    });
    if (this.#destroyed)
    {
      pixi.destroy();
      return;
    }

    this.#pixi = pixi;
    this.#needsRender = true;
    this.#loop.start();
  }

  /**
   * Reads the host's size and pixel ratio.
   */
  #measureView(): void
  {
    const host = this.#host;
    if (host === null)
    {
      return;
    }

    this.#view = { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) };
    this.#resolution = host.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  }

  /**
   * Follows the host's size with a resize observer from the host's own window.
   * @param {HTMLElement} host The host.
   */
  #observeSize(host: HTMLElement): void
  {
    const Observer = host.ownerDocument.defaultView?.ResizeObserver ?? null;
    if (Observer === null)
    {
      return;
    }

    this.#resizeObserver = new Observer(() =>
    {
      this.#measureView();
      this.#pixi?.resize(this.#view.width, this.#view.height, this.#resolution);
      this.#needsRender = true;
    });
    this.#resizeObserver.observe(host);
  }

  /**
   * Listens on the canvas for the wheel and the right button.
   * @param {HTMLCanvasElement} canvas The canvas.
   */
  #listenForInput(canvas: HTMLCanvasElement): void
  {
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void, passive = true) =>
    {
      canvas.addEventListener(type, handler, { passive });
      this.#listeners.push(() => canvas.removeEventListener(type, handler));
    };

    listen('wheel', event =>
    {
      event.preventDefault();
      this.#zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode), { x: event.offsetX, y: event.offsetY });
    }, false);
    listen('pointerdown', event =>
    {
      if (event.button === 2)
      {
        this.#gesture.press({ x: event.offsetX, y: event.offsetY });
        canvas.setPointerCapture(event.pointerId);
      }
    });
    listen('pointermove', event =>
    {
      const step = this.#gesture.move({ x: event.offsetX, y: event.offsetY });
      if (step.kind === 'pan')
      {
        this.#cameraPlaced = true;
        this.#moveCamera(panBy(this.#camera, step.dx, step.dy));
      }
    });
    listen('pointerup', event =>
    {
      if (event.button === 2)
      {
        this.#finishRightClick(this.#gesture.release({ x: event.offsetX, y: event.offsetY }));
      }
    });
    listen('pointercancel', () => this.#gesture.cancel());

    // the browser's own menu never opens over the map; a right click that did not move raises the editor's.
    listen('contextmenu', event => event.preventDefault(), false);
  }

  /**
   * Raises the context menu for a right click that did not move.
   * @param {ReturnType<RightButtonGesture['release']>} step What the release came to.
   */
  #finishRightClick(step: ReturnType<RightButtonGesture['release']>): void
  {
    if (step.kind !== 'context-menu')
    {
      return;
    }

    const menu: MapContextMenu = { point: step.point, cell: this.cellAt(step.point), eventId: this.eventAt(step.point) };
    this.#contextMenuListeners.forEach(listener => listener(menu));
  }

  /**
   * Zooms about a view point, within the limits for the current map.
   * @param {number} factor How much to scale the zoom by.
   * @param {ScreenPoint} anchor The view point to hold still.
   */
  #zoomBy(factor: number, anchor: ScreenPoint): void
  {
    const document = this.#document;
    if (document === null)
    {
      return;
    }

    this.#cameraPlaced = true;
    this.#moveCamera(zoomAt(this.#camera, anchor, factor, zoomLimits(this.#view, document, TILE_SIZE)));
  }

  /**
   * Moves the camera and tells whoever listens.
   * @param {Camera} camera The camera.
   */
  #moveCamera(camera: Camera): void
  {
    this.#camera = camera;
    this.#needsRender = true;
    this.#cameraListeners.forEach(listener => listener(camera));
  }

  /**
   * Places the world under the camera, snapped to device pixels so tiles stay crisp.
   */
  #applyCamera(): void
  {
    const { x, y, zoom } = this.#camera;
    const resolution = this.#resolution;
    this.#world.scale.set(zoom);
    this.#world.position.set(Math.round(-x * zoom * resolution) / resolution, Math.round(-y * zoom * resolution) / resolution);
  }

  /**
   * Builds the tile source the spot writer reads, from the document and the tileset.
   * @returns {TileSource | null} The source, or null until both are known.
   */
  #tileSource(): TileSource | null
  {
    const document = this.#document;
    const tileset = this.#tileset;
    if (document === null || tileset === null)
    {
      return null;
    }

    const loops = loopsOf(document.property('scrollType'));
    return {
      width: document.width,
      height: document.height,
      data: document.cells,
      flags: tileset.tileset.flags,
      horizontalWrap: loops.horizontal,
      verticalWrap: loops.vertical,
    };
  }

  /**
   * Makes the region and passability atlases, once, in the host's document.
   * @returns {{ regions: TextureSource, passability: TextureSource }} The atlases.
   */
  #atlasSources(): { regions: TextureSource; passability: TextureSource }
  {
    if (this.#atlases === null)
    {
      const document = this.#host?.ownerDocument ?? globalThis.document;
      this.#atlases = {
        regions: textureSourceFor(drawRegionAtlas(document, TILE_SIZE)),
        passability: textureSourceFor(drawPassageAtlas(document, TILE_SIZE)),
      };
    }

    return this.#atlases;
  }

  /**
   * Rebuilds everything that depends on the map's size and tileset: the chunks, the per-cell overlays, the grid, the
   * backdrop, the parallax and the events.
   */
  #rebuildMap(): void
  {
    this.#destroyScene();
    this.#needsRender = true;
    const source = this.#tileSource();
    const document = this.#document;
    if (source === null || document === null)
    {
      return;
    }

    const grid = chunkGrid(source.width, source.height);
    const tiles = new TileChunks(grid, TILE_SIZE);
    tiles.setMap(source, this.#sheetSources);
    const scene: MapScene = {
      grid,
      source,
      document,
      tiles,
      regions: null,
      passability: null,
      ghosts: new GhostTiles(this.#sheetSources, TILE_SIZE),
    };
    this.#scene = scene;
    this.#mountScene(scene);
    this.#drawMapBound(source.width, source.height);
    this.#tileEvents = tileEventsByCell(document);
    this.#events.setContext({ document, flags: source.flags, sheets: this.#sheetSources, images: this.#images, tileSize: TILE_SIZE });
    this.#parallax.setMap({
      name: document.property('parallaxName'),
      loopX: document.property('parallaxLoopX'),
      loopY: document.property('parallaxLoopY'),
      sx: document.property('parallaxSx'),
      sy: document.property('parallaxSy'),
    }, source.width * TILE_SIZE, source.height * TILE_SIZE, this.#images);
    this.#animationStart = performance.now();
    this.#animationStep = -1;
    this.#modulesDirty = true;
    this.#pointerDirty = true;
    this.#ghostsDirty = true;
    this.#applyVisibility();

    // the chunks that drew with the old sheets are gone, so the sheets can go too.
    this.#retiredSources.splice(0).forEach(retired => retired?.destroy());
  }

  /**
   * Builds the region overlay's chunks.
   * @param {ChunkGrid} grid The grid.
   * @param {MapDocument} document The map.
   * @returns {AtlasChunks} The chunks.
   */
  #regionChunks(grid: ChunkGrid, document: MapDocument): AtlasChunks
  {
    return new AtlasChunks(grid, TILE_SIZE, this.#atlasSources().regions, (x, y) =>
    {
      const region = document.cellAt(x, y, 5);
      return region > 0 ? region : -1;
    });
  }

  /**
   * Builds the passability overlay's chunks.
   * @param {ChunkGrid} grid The grid.
   * @param {TileSource} source The tile source.
   * @param {MapDocument} document The map.
   * @returns {AtlasChunks} The chunks.
   */
  #passageChunks(grid: ChunkGrid, source: TileSource, document: MapDocument): AtlasChunks
  {
    const tileset = this.#tileset as TilesetTextures;
    const query = passabilityQuery(document, tileset.tileset);
    return new AtlasChunks(grid, TILE_SIZE, this.#atlasSources().passability, (x, y) =>
    {
      const tileEvents = this.#tileEvents.get(y * source.width + x) ?? [];
      const { blocked, denied } = cellPassage(source, x, y, tileEvents, this.#rules, query);
      return passageMarkIndex(blocked, denied);
    });
  }

  /**
   * Puts a map's chunk layers into their slots.
   * @param {MapScene} scene The map's scene.
   */
  #mountScene(scene: MapScene): void
  {
    const { slots } = this;
    slots.lowerTiles.addChild(scene.tiles.lowerLayer);
    slots.upperTiles.addChild(scene.tiles.upperLayer);
    slots.highlightTiles.addChild(scene.tiles.highlightLayer);
    slots.ghosts.addChildAt(scene.ghosts.view, 0);
  }

  /**
   * Builds the per-cell overlays' chunks the first time each shows.
   * @param {MapScene} scene The map's scene.
   */
  #ensureOverlayChunks(scene: MapScene): void
  {
    if (scene.regions === null && this.#isOn('regions'))
    {
      scene.regions = this.#regionChunks(scene.grid, scene.document);
      this.#slots.regions.addChild(scene.regions.layer);
    }

    if (scene.passability === null && this.#isOn('passability'))
    {
      scene.passability = this.#passageChunks(scene.grid, scene.source, scene.document);
      this.#slots.passability.addChild(scene.passability.layer);
    }
  }

  /**
   * Draws what is sized to the map: the black behind it, the dimming, and the grid.
   * @param {number} width The map's width in tiles.
   * @param {number} height The map's height in tiles.
   */
  #drawMapBound(width: number, height: number): void
  {
    const { slots } = this;
    slots.backdrop.clear().rect(0, 0, width * TILE_SIZE, height * TILE_SIZE).fill(MAP_BACKDROP);
    slots.dim.clear().rect(0, 0, width * TILE_SIZE, height * TILE_SIZE).fill({ color: 0x000000, alpha: DIM_ALPHA });
    drawGrid(slots.grid, width, height, TILE_SIZE);
  }

  /**
   * Lets go of the current map's scene.
   */
  #destroyScene(): void
  {
    const scene = this.#scene;
    if (scene === null)
    {
      return;
    }

    scene.tiles.destroy();
    scene.regions?.destroy();
    scene.passability?.destroy();
    scene.ghosts.destroy();
    this.#scene = null;
  }

  /**
   * Reports whether an overlay is switched on.
   * @param {OverlayId} id The overlay.
   * @returns {boolean} True when on.
   */
  #isOn(id: OverlayId): boolean
  {
    return this.#overlays.enabled.has(id);
  }

  /**
   * Applies the layer visibility, the highlight and the overlay switches to the scene.
   */
  #applyVisibility(): void
  {
    const { layers, highlighted } = this.#visibility;
    const { slots } = this;
    const highlight = highlighted !== null && this.#isOn('layer-highlight')
      ? Number(highlighted.slice('tiles'.length)) - 1
      : null;
    slots.lighting.visible = layers.lighting;
    slots.parallax.visible = layers.parallax;
    slots.dim.visible = highlight !== null;
    slots.grid.visible = this.#isOn('grid');
    slots.regions.visible = this.#isOn('regions');
    slots.passability.visible = this.#isOn('passability');
    slots.ghosts.visible = this.#isOn('ghost');
    [ this.#events.below, this.#events.same, this.#events.above ].forEach(group =>
    {
      group.visible = layers.events;
    });
    const scene = this.#scene;
    if (scene !== null)
    {
      scene.tiles.setShadows(layers.shadows);
      scene.tiles.setLayersShown([ layers.tiles1, layers.tiles2, layers.tiles3, layers.tiles4 ]);
      scene.tiles.setHighlight(highlight);
      this.#ensureOverlayChunks(scene);
      if (scene.regions !== null)
      {
        scene.regions.layer.visible = slots.regions.visible;
      }

      if (scene.passability !== null)
      {
        scene.passability.layer.visible = slots.passability.visible;
      }
    }

    this.#pointerDirty = true;
    this.#needsRender = true;
  }

  /**
   * Hears a change to the document and marks what it touched.
   * @param {DocumentChange} change The change.
   */
  #onDocumentChange(change: DocumentChange): void
  {
    this.#needsRender = true;
    this.#modulesDirty = true;

    // a swapped file or a new size rebuilds everything, once, in the next frame.
    if (change.kind === 'replaced' || change.patch.kind === 'resize')
    {
      this.#mapDirty = true;
      return;
    }

    const { patch } = change;
    if (patch.kind === 'tiles')
    {
      this.#markTiles(patch.indices);
      return;
    }

    const [ field ] = patch.path;
    if (field === 'events')
    {
      this.#eventsChanged(patch);
      return;
    }

    // the loop settings change how the edges read; the parallax fields change the parallax.
    if (field === 'scrollType' || PARALLAX_FIELDS.has(String(field)))
    {
      this.#mapDirty = true;
    }
  }

  /**
   * Marks the chunks some changed cells dirty, in every layer that reads them.
   * @param {readonly number[]} indices The changed cells, as flat indexes.
   */
  #markTiles(indices: readonly number[]): void
  {
    const scene = this.#scene;
    if (scene === null)
    {
      return;
    }

    const dirty = dirtyChunksForCells(scene.grid, indices, scene.source.verticalWrap);
    scene.tiles.markDirty(dirty.tiles);
    scene.passability?.markDirty(dirty.passage);
    scene.regions?.markDirty(dirty.regions);
  }

  /**
   * Redraws the events a patch touched, and the passability their tile images feed.
   * @param {Patch} patch The patch.
   */
  #eventsChanged(patch: Patch): void
  {
    const id = patchedEventId(patch);
    if (id === null)
    {
      this.#events.rebuild();
    }
    else
    {
      this.#events.refreshEvent(id);
    }

    const document = this.#document;
    if (document !== null)
    {
      this.#tileEvents = tileEventsByCell(document);
    }

    this.#scene?.passability?.markAllDirty();
    this.#pointerDirty = true;
  }

  /**
   * Moves the A1 animation and the parallax drift to where the clock says, when the game look animates.
   * @param {number} now The frame's time.
   * @returns {boolean} True when either moved.
   */
  #tickAnimation(now: number): boolean
  {
    const scene = this.#scene;
    if (scene === null)
    {
      return false;
    }

    const elapsed = Math.max(0, now - this.#animationStart);
    const animate = this.#visibility.animateWater;
    const fixed = this.#fixedAnimation;
    const step = fixed?.step ?? (animate ? animationFrameAt(elapsed) : 0);
    const frames = fixed?.frames ?? (animate ? engineFramesAt(elapsed) : 0);
    let moved = this.#parallax.update(this.#camera, frames, TILE_SIZE);
    if (step !== this.#animationStep)
    {
      this.#animationStep = step;
      scene.tiles.setAnimation(animationVector(step));
      moved = true;
    }

    return moved;
  }

  /**
   * Redraws whatever overlays went stale since the last frame.
   * @returns {boolean} True when any redrew.
   */
  #refreshOverlays(): boolean
  {
    const document = this.#document;
    let redrew = false;
    if (this.#modulesDirty && document !== null)
    {
      this.#modulesDirty = false;
      this.#modules.redraw({ document, tileSize: TILE_SIZE, selection: this.#overlayState.selectedEvents });
      redrew = true;
    }

    if (this.#pointerDirty)
    {
      this.#pointerDirty = false;
      const eventCell = (id: number) =>
      {
        const event = document?.event(id) ?? null;
        return event === null ? null : { x: event.x, y: event.y };
      };
      drawPointerOverlays(this.#slots.pointer, this.#overlayState, { hover: this.#isOn('hover'), selection: this.#isOn('selection') }, eventCell, TILE_SIZE);
      redrew = true;
    }

    const scene = this.#scene;
    if (this.#ghostsDirty && scene !== null)
    {
      this.#ghostsDirty = false;
      scene.ghosts.setGhosts(this.#overlayState.ghostTiles, scene.source);
      this.#events.setGhosts(this.#overlayState.ghostEvents);
      redrew = true;
    }

    return redrew;
  }

  /**
   * Brings the scene up to date for a frame: rebuilds the map when it went stale, places a new map whole on screen,
   * moves the animation, culls to the camera and rebuilds dirty chunks and overlays.
   * @param {number} now The frame's time.
   * @returns {{ changed: boolean, rebuiltChunks: number }} Whether anything changed, and how many tile chunks rebuilt.
   */
  #prepareFrame(now: number): { changed: boolean; rebuiltChunks: number }
  {
    if (this.#mapDirty)
    {
      this.#mapDirty = false;
      this.#rebuildMap();
    }

    const document = this.#document;
    if (document !== null && this.#cameraPlaced === false && this.#scene !== null)
    {
      // a map shown for the first time starts whole on screen.
      this.#cameraPlaced = true;
      this.#moveCamera(fitCamera(this.#view, document, TILE_SIZE));
    }

    let changed = this.#tickAnimation(now);
    let rebuiltChunks = 0;
    const scene = this.#scene;
    if (scene !== null)
    {
      const range: ChunkRange = chunkRangeFor(scene.grid, visibleWorld(this.#camera, this.#view), TILE_SIZE);
      scene.tiles.cull(range);
      scene.regions?.cull(range);
      scene.passability?.cull(range);
      rebuiltChunks = scene.tiles.flush();
      const overlayChunks = (scene.regions?.flush() ?? 0) + (scene.passability?.flush() ?? 0);
      changed = changed || rebuiltChunks > 0 || overlayChunks > 0;
    }

    changed = this.#refreshOverlays() || changed;
    return { changed, rebuiltChunks };
  }

  /**
   * Draws one frame, when anything changed since the last.
   * @param {number} time The frame's time.
   */
  #frame(time: number): void
  {
    const pixi = this.#pixi;
    if (pixi === null)
    {
      return;
    }

    const started = performance.now();
    this.#beforeFrameListeners.forEach(listener => listener(time));
    const { changed, rebuiltChunks } = this.#prepareFrame(started);
    if (changed === false && this.#needsRender === false)
    {
      return;
    }

    this.#needsRender = false;
    this.#applyCamera();
    pixi.render({ container: this.#stage });
    const workMs = performance.now() - started;
    this.#frames.record(workMs);
    this.#frameListeners.forEach(listener => listener({ time, workMs, rebuiltChunks }));
  }
}

export { PixiMapRenderer };
export type { FrameReport, RendererStats, Slots };
