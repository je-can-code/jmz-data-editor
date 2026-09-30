import { Container, Graphics, WebGLRenderer, type TextureSource } from 'pixi.js';
import type { DocumentChange } from '../core/model/EditorDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import { cellAtPoint, panBy, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from '../core/renderer/camera.ts';
import { FrameTimeRecorder, type FrameTimings } from '../core/renderer/FrameTimeRecorder.ts';
import {
  GAME_LOOK,
  type LayerVisibility,
  type MapRenderer,
  type OverlaySet,
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
import { chunkGrid, chunkRangeFor, dirtyChunksForCells, type ChunkGrid } from './chunkMath.ts';
import { animationFrameAt, animationVector } from './engine/animation.ts';
import type { TileSource } from './engine/spotWriter.ts';
import { FrameLoop, type FrameWindow } from './FrameLoop.ts';
import { TileChunks } from './scene/TileChunks.ts';
import { textureSourceFor } from './textureImages.ts';

/**
 * What the WebGL context reports about the GPU drawing the map.
 */
type RendererInfo = {
  readonly vendor: string;
  readonly renderer: string;
};

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
 * The colour behind the map where nothing is drawn, as the engine's black screen shows behind its tilemap.
 */
const MAP_BACKDROP = 0x000000;

/**
 * The editor's own background, around the map.
 */
const VIEW_BACKGROUND = 0x121212;

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
 * Draws a map with pixi and the vendored tilemap, exactly as the engine does, on its own frame loop: nothing here goes
 * through React. It listens to its document and redraws only the chunks an edit touched, inside the frame that shows
 * the edit. Frames are scheduled on whichever window hosts it, so a torn-out map keeps drawing.
 *
 * The camera is its own: the wheel zooms about the pointer, the right button held pans, and a right click that does
 * not move raises a context-menu event.
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

  #backdrop = new Graphics();

  #tiles: TileChunks | null = null;

  #grid: ChunkGrid | null = null;

  #lighting = new Container();

  #document: MapDocument | null = null;

  #unsubscribe: (() => void) | null = null;

  #tileset: TilesetTextures | null = null;

  #sheetSources: (TextureSource | null)[] = [];

  #retiredSources: (TextureSource | null)[] = [];

  #mapDirty = false;

  #textureSource: ImageTextureSource | null = null;

  #camera: Camera = { x: 0, y: 0, zoom: 1 };

  #cameraPlaced = false;

  #view: ViewSize = { width: 1, height: 1 };

  #resolution = 1;

  #visibility: LayerVisibility = GAME_LOOK;

  #overlays: OverlaySet = { enabled: new Set(), definitions: [] };

  #frames = new FrameTimeRecorder();

  #loop: FrameLoop;

  #needsRender = true;

  #animationStart = 0;

  #animationStep = -1;

  #gesture = new RightButtonGesture();

  #resizeObserver: ResizeObserver | null = null;

  #listeners: (() => void)[] = [];

  #cameraListeners = new Set<(camera: Camera) => void>();

  #contextMenuListeners = new Set<(point: ScreenPoint) => void>();

  #frameListeners = new Set<(report: FrameReport) => void>();

  #beforeFrameListeners = new Set<(time: number) => void>();

  constructor()
  {
    this.#loop = new FrameLoop(() => this.#hostWindow(), time => this.#frame(time));
    this.#world.addChild(this.#backdrop);
    this.#stage.addChild(this.#world);
  }

  /**
   * The container P9's lighting draws into: above the map and its events, below the editor's overlays.
   * @returns {Container} The layer.
   */
  get lightingLayer(): Container
  {
    return this.#lighting;
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
   * @returns {{ quads: number, chunks: number }} The tile rects and the chunks.
   */
  stats(): { quads: number; chunks: number }
  {
    const grid = this.#grid;
    return { quads: this.#tiles?.quadCount ?? 0, chunks: grid === null ? 0 : grid.columns * grid.rows };
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
    this.#textureSource = source;
  }

  setCamera(camera: Camera): void
  {
    this.#cameraPlaced = true;
    this.#moveCamera(camera, false);
  }

  setLayerVisibility(visibility: LayerVisibility): void
  {
    this.#visibility = visibility;
    this.#applyVisibility();
  }

  setOverlays(overlays: OverlaySet): void
  {
    this.#overlays = overlays;
    this.#applyVisibility();
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
    const cell = this.cellAt(point);
    const document = this.#document;
    if (cell === null || document === null)
    {
      return null;
    }

    // the newest event on the cell is the one on top.
    const ids = document.eventIds().filter(id =>
    {
      const event = document.event(id);
      return event !== null && event.x === cell.x && event.y === cell.y;
    });
    return ids.length > 0
      ? ids[ids.length - 1]
      : null;
  }

  /**
   * Reads the GPU the map is drawn on, from the WebGL context.
   * @returns {RendererInfo | null} The vendor and renderer strings, or null before the context is up.
   */
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

  /**
   * Shows the whole map, centred.
   */
  zoomToFit(): void
  {
    const document = this.#document;
    if (document !== null)
    {
      this.#cameraPlaced = true;
      this.#moveCamera(fitCamera(this.#view, document, TILE_SIZE), false);
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
    this.#moveCamera(centerCamera(centre, middle, zoom, this.#view), false);
  }

  /**
   * Listens for camera moves, whether from the pointer or from {@link setCamera}.
   * @param {(camera: Camera) => void} listener Called with the new camera.
   * @returns {() => void} Stops listening.
   */
  onCameraChange(listener: (camera: Camera) => void): () => void
  {
    this.#cameraListeners.add(listener);
    return () => this.#cameraListeners.delete(listener);
  }

  /**
   * Listens for right clicks that did not move.
   * @param {(point: ScreenPoint) => void} listener Called with the view point that was clicked.
   * @returns {() => void} Stops listening.
   */
  onContextMenu(listener: (point: ScreenPoint) => void): () => void
  {
    this.#contextMenuListeners.add(listener);
    return () => this.#contextMenuListeners.delete(listener);
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

  destroy(): void
  {
    this.#destroyed = true;
    this.#loop.stop();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#listeners.splice(0).forEach(stop => stop());
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#tiles?.destroy();
    this.#tiles = null;
    [ ...this.#sheetSources, ...this.#retiredSources ].forEach(source => source?.destroy());
    this.#sheetSources = [];
    this.#retiredSources = [];
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
        this.#moveCamera(panBy(this.#camera, step.dx, step.dy), true);
      }
    });
    listen('pointerup', event =>
    {
      if (event.button !== 2)
      {
        return;
      }

      const step = this.#gesture.release({ x: event.offsetX, y: event.offsetY });
      if (step.kind === 'context-menu')
      {
        this.#contextMenuListeners.forEach(listener => listener(step.point));
      }
    });
    listen('pointercancel', () => this.#gesture.cancel());

    // the browser's own menu never opens over the map; a right click that did not move raises the editor's.
    listen('contextmenu', event => event.preventDefault(), false);
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
    this.#moveCamera(zoomAt(this.#camera, anchor, factor, zoomLimits(this.#view, document, TILE_SIZE)), true);
  }

  /**
   * Moves the camera and tells whoever listens.
   * @param {Camera} camera The camera.
   * @param {boolean} _fromPointer Whether the pointer moved it.
   */
  #moveCamera(camera: Camera, _fromPointer: boolean): void
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
   * Rebuilds everything that depends on the map's size and tileset: the chunk grid, the chunks and the backdrop.
   */
  #rebuildMap(): void
  {
    const source = this.#tileSource();
    this.#tiles?.destroy();
    this.#tiles = null;
    this.#grid = null;
    this.#needsRender = true;
    if (source === null)
    {
      return;
    }

    const grid = chunkGrid(source.width, source.height);
    const tiles = new TileChunks(grid, TILE_SIZE);
    tiles.setMap(source, this.#sheetSources);
    this.#grid = grid;
    this.#tiles = tiles;
    this.#world.addChildAt(tiles.lowerLayer, 1);
    this.#world.addChildAt(tiles.upperLayer, 2);
    this.#world.addChild(this.#lighting);
    this.#world.addChild(tiles.highlightLayer);
    this.#backdrop.clear().rect(0, 0, source.width * TILE_SIZE, source.height * TILE_SIZE).fill(MAP_BACKDROP);
    this.#animationStart = performance.now();
    this.#animationStep = -1;
    this.#applyVisibility();

    // the chunks that drew with the old sheets are gone, so the sheets can go too.
    this.#retiredSources.splice(0).forEach(retired => retired?.destroy());
  }

  /**
   * Applies the layer visibility and highlight to the scene.
   */
  #applyVisibility(): void
  {
    const { layers, highlighted } = this.#visibility;
    const tiles = this.#tiles;
    this.#lighting.visible = layers.lighting;
    if (tiles !== null)
    {
      tiles.setShadows(layers.shadows);
      const highlight = highlighted !== null && this.#overlays.enabled.has('layer-highlight')
        ? Number(highlighted.slice('tiles'.length)) - 1
        : null;
      tiles.setHighlight(highlight);
    }

    this.#needsRender = true;
  }

  /**
   * Hears a change to the document and marks what it touched.
   * @param {DocumentChange} change The change.
   */
  #onDocumentChange(change: DocumentChange): void
  {
    // a swapped file or a new size rebuilds everything, once, in the next frame.
    if (change.kind === 'replaced')
    {
      this.#mapDirty = true;
      return;
    }

    const { patch } = change;
    if (patch.kind === 'resize')
    {
      this.#mapDirty = true;
      return;
    }

    if (patch.kind === 'tiles')
    {
      const grid = this.#grid;
      if (grid !== null && this.#tiles !== null && this.#document !== null)
      {
        const loops = loopsOf(this.#document.property('scrollType'));
        const dirty = dirtyChunksForCells(grid, patch.indices, loops.vertical);
        this.#tiles.markDirty(dirty.tiles);
      }

      this.#needsRender = true;
      return;
    }

    // a change of loop settings changes how the edges read.
    if (patch.path[0] === 'scrollType')
    {
      this.#mapDirty = true;
      return;
    }

    this.#needsRender = true;
  }

  /**
   * Moves the A1 animation to where the clock says, when the game look animates water.
   * @param {number} now The frame's time.
   * @returns {boolean} True when the animation step changed.
   */
  #tickAnimation(now: number): boolean
  {
    const step = this.#visibility.animateWater
      ? animationFrameAt(Math.max(0, now - this.#animationStart))
      : 0;
    if (step === this.#animationStep || this.#tiles === null)
    {
      return false;
    }

    this.#animationStep = step;
    this.#tiles.setAnimation(animationVector(step));
    return true;
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
    if (this.#mapDirty)
    {
      this.#mapDirty = false;
      this.#rebuildMap();
    }

    const document = this.#document;
    if (document !== null && this.#cameraPlaced === false && this.#tiles !== null)
    {
      // a map shown for the first time starts whole on screen.
      this.#cameraPlaced = true;
      this.#moveCamera(fitCamera(this.#view, document, TILE_SIZE), false);
    }

    let changed = this.#tickAnimation(performance.now());
    let rebuiltChunks = 0;
    const tiles = this.#tiles;
    const grid = this.#grid;
    if (tiles !== null && grid !== null)
    {
      tiles.cull(chunkRangeFor(grid, visibleWorld(this.#camera, this.#view), TILE_SIZE));
      rebuiltChunks = tiles.flush();
    }

    changed = changed || rebuiltChunks > 0 || this.#needsRender;
    if (changed === false)
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
export type { FrameReport, RendererInfo };
