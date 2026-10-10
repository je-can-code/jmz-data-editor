import { Container, Graphics, Rectangle, Text, WebGLRenderer, type TextureSource } from 'pixi.js';
import type { DocumentChange } from '../core/model/EditorDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { PassabilityRule } from '../core/modules/PluginModule.ts';
import type { PageRule } from '../core/pageRule/pageRule.ts';
import { ShownPages } from '../core/pageRule/ShownPages.ts';
import type { GamePreview } from '../core/preview/GamePreview.ts';
import { cellAtPoint, panBy, screenToWorld, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from '../core/renderer/camera.ts';
import { FrameTimeRecorder, type FrameTimings } from '../core/renderer/FrameTimeRecorder.ts';
import type { JsonValue } from '../core/model/json.ts';
import type { LightingLayerDefinition, ScreenTone } from '../core/renderer/lightingLayer.ts';
import {
  GAME_LOOK,
  NO_OVERLAY_STATE,
  type FootprintReader,
  type LayerVisibility,
  type MapContextMenu,
  type MapRenderer,
  type MarkerClassifier,
  type OverlayId,
  type OverlaySet,
  type OverlayState,
  type RendererInfo,
  type TextureSource as ImageTextureSource,
  type TilesetTextures,
  type WorldRect,
} from '../core/renderer/MapRenderer.ts';
import { precisePoint } from '../core/renderer/precisePoint.ts';
import { castsTone } from '../core/renderer/screenTone.ts';
import type { SkyWeather, WeatherLayerDefinition } from '../core/renderer/weatherLayer.ts';
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
import { mapViewContexts } from './ContextBudget.ts';
import { ContextKeeper, type DrawState } from './ContextKeeper.ts';
import { changeEffect, loopsOf } from './documentChanges.ts';
import { animationFrameAt, animationVector, engineFramesAt } from './engine/animation.ts';
import { cellPassage, passabilityQuery, tileEventsByCell } from './engine/passability.ts';
import type { TileSource } from './engine/spotWriter.ts';
import { FrameLoop, type FrameWindow } from './FrameLoop.ts';
import { lightingClockAt } from './lightingClock.ts';
import { AtlasChunks } from './scene/AtlasChunks.ts';
import { EventLayer } from './scene/EventLayer.ts';
import { GhostTiles } from './scene/GhostTiles.ts';
import { LightingLayers } from './scene/LightingLayers.ts';
import { markerAtlasSource } from './scene/markerAtlas.ts';
import { ModuleOverlays } from './scene/ModuleOverlays.ts';
import { drawPassageAtlas, drawRegionAtlas, passageMarkIndex } from './scene/overlayAtlases.ts';
import { ParallaxLayer } from './scene/ParallaxLayer.ts';
import { drawGrid, drawPointerOverlays, drawSelection } from './scene/pointerOverlays.ts';
import { TileChunks } from './scene/TileChunks.ts';
import { ToneFilter } from './scene/ToneFilter.ts';
import { WeatherLayers } from './scene/WeatherLayers.ts';
import { textureSourceFor } from './textureImages.ts';
import { weatherClockAt } from './weatherClock.ts';

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
  readonly eventMarkers: number;

  /**
   * Events showing the area their page covers as a footprint.
   */
  readonly eventFootprints: number;

  /**
   * Events no page holds for at the clock's time, drawn faded.
   */
  readonly fadedEvents: number;

  /**
   * Events whose page can turn as the clock moves, the only ones judged again when it does.
   */
  readonly eventsFollowingClock: number;

  /**
   * Pictures still loading: character sheets, and the parallax.
   */
  readonly loadingImages: number;
  readonly moduleOverlays: number;
};

/**
 * The world's layers, bottom to top: what the game itself draws and tones (the engine's black behind the map, the
 * parallax, the tiles below characters, the events in their three priorities around the tiles above characters, and the
 * weather the plugin modules draw over all of them, all held in {@link game}), the lighting the plugin modules draw, then
 * the editor's own: the markers of events that draw no picture, over the footprints of events whose pages cover more
 * tiles than their own, which neither the tiles above characters nor the dark of a lit map may hide, the dimming and
 * highlighted layer, and the overlays, the ghosts and the pointer's own marks, then the selection over them all, so an
 * event shows as selected while the pointer still rests on it after the click that picked it.
 */
type Slots = {
  /**
   * Everything the game draws beneath its lighting, which a screen tone casts its colour over, as the engine's base
   * sprite holds it, and nothing of the editor's.
   */
  readonly game: Container;
  readonly backdrop: Graphics;
  readonly parallax: Container;
  readonly lowerTiles: Container;
  readonly upperTiles: Container;

  /**
   * The weather the plugin modules draw, last inside what the game tones, as J-Weather appends its plane to the base
   * sprite after the tilemap: over every tile and event, coloured by the screen's tone, and beneath the lighting's dark.
   */
  readonly weather: Container;

  /**
   * The map's own rectangle, which the weather is clipped to, so nothing of it falls on the editor around the map.
   */
  readonly weatherClip: Graphics;
  readonly lighting: Container;
  readonly markers: Container;
  readonly dim: Graphics;
  readonly highlightTiles: Container;
  readonly regions: Container;
  readonly passability: Container;
  readonly grid: Graphics;
  readonly modules: Container;
  readonly selection: Graphics;
  readonly ghosts: Container;
  readonly pointer: Graphics;
  readonly pointerLabel: Text;
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
 * How far above the hover its words sit, in screen pixels.
 */
const HOVER_LABEL_GAP = 3;

/**
 * Reports whether two maps of tiles to the tile-image events on them hold the same, so passability is rebuilt only
 * when an edit really moved or changed an event that blocks steps.
 * @param {ReadonlyMap<number, readonly number[]>} left One map.
 * @param {ReadonlyMap<number, readonly number[]>} right The other.
 * @returns {boolean} True when both hold the same tiles with the same tile ids.
 */
const sameTileEvents = (left: ReadonlyMap<number, readonly number[]>, right: ReadonlyMap<number, readonly number[]>): boolean =>
{
  if (left.size !== right.size)
  {
    return false;
  }

  for (const [ cell, tiles ] of left)
  {
    const other = right.get(cell);
    if (other === undefined || other.length !== tiles.length || tiles.some((tile, index) => other[index] !== tile))
    {
      return false;
    }
  }

  return true;
};

/**
 * Runs a callback after a delay on the page's timers, for the context keeper.
 * @param {() => void} callback What to run.
 * @param {number} delayMs How long to wait.
 * @returns {() => void} Cancels it.
 */
const scheduleOnTimers = (callback: () => void, delayMs: number): (() => void) =>
{
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/**
 * Draws a map with pixi and the vendored tilemap exactly as the engine does, on its own frame loop: nothing here goes
 * through React. It listens to its document and redraws only what an edit touched, inside the frame that shows the
 * edit, and draws a frame only when something changed. Frames are scheduled on whichever window hosts it, so a
 * torn-out map keeps drawing.
 *
 * The game look is the default: water animates, the parallax scrolls, lights run their effects, the weather falls over
 * the map where the game draws it, toned with the map and beneath the dark, events stand where the engine stands them and
 * auto-shadows stay off, since the game never draws them. The lighting draws at the hour of the
 * window's clock, and a tone it casts, such as the sky's colour at that hour, colours what the game tones, through the
 * engine's own colour arithmetic, and none of the editor's overlays. Each event draws the page the page rule handed over
 * picks at that hour, the page a fresh save would show, and its light comes from that page too; moving the clock judges
 * again only the events whose pages ask something of it, and draws again only those it turned. The camera is its own: the wheel zooms about the
 * pointer, the right button held pans, and a right click that does not move raises a context-menu event.
 *
 * Its WebGL context is held only while the view is on screen, through a {@link ContextKeeper}: a view behind another
 * tab lets it go and asks for it back when shown, keeping its map, its camera and everything else, and a context the
 * browser takes anyway is asked back on its own. Every view of the window shares one budget of contexts, below what
 * Chromium keeps per process, and a view shown when all of them are taken says so through its draw state.
 */
class PixiMapRenderer implements MapRenderer
{
  #host: HTMLElement | null = null;

  #canvas: HTMLCanvasElement | null = null;

  #pixi: WebGLRenderer | null = null;

  #ready: Promise<void>;

  #settleReady: { resolve: () => void; reject: (error: unknown) => void } = { resolve: () => undefined, reject: () => undefined };

  #keeper: ContextKeeper;

  #visible = true;

  #sized = false;

  #destroyed = false;

  #stage = new Container();

  #world = new Container({ isRenderGroup: true });

  #slots: Slots;

  #scene: MapScene | null = null;

  #events: EventLayer;

  #parallax: ParallaxLayer;

  #modules = new ModuleOverlays();

  #lighting = new LightingLayers(TILE_SIZE, tone => this.#castTone(tone));

  #weather = new WeatherLayers(TILE_SIZE);

  /**
   * What the sky is doing, which the weather is drawn under; null while nothing drives a sky.
   */
  #weatherSky: SkyWeather | null = null;

  /**
   * The tone the lighting casts over what the game tones, or null while it casts none; it shows only while the lighting
   * does.
   */
  #tone: ScreenTone | null = null;

  /**
   * The filter casting {@link #tone}, made the first time a tone shows, and kept for the life of the renderer.
   */
  #toneFilter: ToneFilter | null = null;

  /**
   * Whether the filter is on what the game tones now.
   */
  #toning = false;

  /**
   * The time of day the window's clock shows, in minutes past midnight, which the lighting reads its sky at.
   */
  #timeOfDay = 0;

  /**
   * The page each event shows at the clock's time, by the page rule handed over; every event's first until one is.
   */
  #pages = new ShownPages();

  /**
   * How many times drawing has started on a live context: once for the first, and once more each time the graphics
   * card gives the context back. The lighting reads it to know its render textures hold nothing.
   */
  #contexts = 0;

  #atlases: { regions: TextureSource; passability: TextureSource } | null = null;

  /**
   * The atlas every event marker is cut from, drawn the first time a marker needs it.
   */
  #markerAtlas: TextureSource | null = null;

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

  #selectionDirty = true;

  #pointerDirty = true;

  #ghostsDirty = true;

  #eventsDirty = false;

  #frames = new FrameTimeRecorder();

  #loop: FrameLoop;

  #needsRender = true;

  #animationStart = 0;

  #animationStep = -1;

  #fixedAnimation: { step: number; frames: number } | null = null;

  #gesture = new RightButtonGesture();

  /**
   * Where the pointer last was over the canvas, as precisely as a pointer event reported it: the spot the wheel zooms
   * about, since a wheel event itself reports whole pixels.
   */
  #pointer: ScreenPoint | null = null;

  #resizeObserver: ResizeObserver | null = null;

  #listeners: (() => void)[] = [];

  #cameraListeners = new Set<(camera: Camera) => void>();

  #contextMenuListeners = new Set<(menu: MapContextMenu) => void>();

  #frameListeners = new Set<(report: FrameReport) => void>();

  #beforeFrameListeners = new Set<(time: number) => void>();

  constructor()
  {
    this.#loop = new FrameLoop(() => this.#hostWindow(), time => this.#frame(time));
    this.#ready = new Promise<void>((resolve, reject) =>
    {
      this.#settleReady = { resolve, reject };
    });

    // a window that cannot draw rejects this for whoever waits on it, and is no unhandled failure when nobody does.
    this.#ready.catch(() => undefined);
    this.#keeper = new ContextKeeper({
      create: () => this.#createContext(),
      release: () => this.#releaseContext(),
      restore: () => this.#restoreContext(),
      resume: () => this.#resumeDrawing(),
      suspend: () => this.#loop.stop(),
    }, { budget: mapViewContexts, schedule: scheduleOnTimers, now: () => performance.now() });
    const invalidate = () =>
    {
      this.#needsRender = true;
    };
    this.#events = new EventLayer(invalidate);
    this.#parallax = new ParallaxLayer(invalidate);
    this.#slots = {
      game: new Container(),
      backdrop: new Graphics(),
      parallax: this.#parallax.layer,
      lowerTiles: new Container(),
      upperTiles: new Container(),
      weather: this.#weather.layer,
      weatherClip: this.#weather.clip,
      lighting: this.#lighting.layer,
      markers: new Container(),
      dim: new Graphics(),
      highlightTiles: new Container(),
      regions: new Container(),
      passability: new Container(),
      grid: new Graphics(),
      modules: this.#modules.layer,
      selection: new Graphics(),
      ghosts: new Container(),
      pointer: new Graphics(),
      pointerLabel: new Text({
        text: '',
        style: { fontFamily: 'sans-serif', fontSize: 13, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
      }),
    };
    this.#slots.pointerLabel.anchor.set(0, 1);
    this.#slots.pointerLabel.visible = false;

    // the engine's order: lower tiles, events below and with characters, upper tiles, events above characters, then the
    // weather, all of it in the one container a screen tone colours, as the engine's base sprite holds it; the weather's
    // clip rides beside it, so it moves and scales with the world. The markers go over the lighting, so an event no
    // picture shows stays in sight on the darkest map, and the selection goes over the hover, which would otherwise hide
    // it on the very tile just clicked.
    const { slots } = this;
    slots.game.addChild(
      slots.backdrop,
      slots.parallax,
      slots.lowerTiles,
      this.#events.below,
      this.#events.same,
      slots.upperTiles,
      this.#events.above,
      slots.weatherClip,
      slots.weather,
    );
    this.#world.addChild(
      slots.game,
      slots.lighting,
      slots.markers,
      slots.dim,
      slots.highlightTiles,
      slots.regions,
      slots.passability,
      slots.grid,
      slots.modules,
      slots.ghosts,
      slots.pointer,
      slots.selection,
      slots.pointerLabel,
    );
    slots.ghosts.addChild(this.#events.ghosts);

    // the footprints sit beneath the markers they join, each marker in its footprint's corner.
    slots.markers.addChild(this.#events.footprints, this.#events.markers);
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
   * The container the plugin modules' lighting draws into: above the map and its events, below the editor's overlays,
   * shown while the layer visibility's lighting is on.
   * @returns {Container} The layer.
   */
  get lightingLayer(): Container
  {
    return this.#slots.lighting;
  }

  /**
   * Chooses what the plugin modules draw into the lighting layer, making each drawing once and keeping it for as long
   * as its lighting layer is handed over again; one no longer handed over is let go.
   * @param {readonly LightingLayerDefinition[]} definitions The lighting layers of the active modules.
   */
  setLightingLayers(definitions: readonly LightingLayerDefinition[]): void
  {
    this.#lighting.setDefinitions(definitions);
    this.#needsRender = true;
  }

  /**
   * The container the plugin modules' weather draws into: last inside what the game tones, over the map and its events
   * and beneath the lighting, shown while the layer visibility's weather is on.
   * @returns {Container} The layer.
   */
  get weatherLayer(): Container
  {
    return this.#slots.weather;
  }

  /**
   * Chooses what the plugin modules draw into the weather layer: a drawing is made only on a map its weather layer draws
   * on, and kept for as long as that weather layer is handed over again; one no longer handed over is let go, and the
   * view draws again without it.
   * @param {readonly WeatherLayerDefinition[]} definitions The weather layers of the active modules.
   */
  setWeatherLayers(definitions: readonly WeatherLayerDefinition[]): void
  {
    if (this.#weather.setDefinitions(definitions))
    {
      this.#needsRender = true;
    }
  }

  /**
   * Says what the sky is doing, which the weather is drawn under: an outdoor map tagged with a look rises and falls with
   * it, and one with no look of its own shows the sky's. It stays null, which is J-Weather on its own, until the view
   * follows a sky the author picked; the weather is asked to draw again in the next frame.
   * @param {SkyWeather | null} sky What the sky is doing, or null for no sky.
   */
  setWeatherSky(sky: SkyWeather | null): void
  {
    this.#weatherSky = sky;
    this.#weather.markStale();
    this.#needsRender = true;
  }

  /**
   * What the sky is doing, as last said.
   * @returns {SkyWeather | null} The sky, or null for none.
   */
  get weatherSky(): SkyWeather | null
  {
    return this.#weatherSky;
  }

  /**
   * Starts the weather over, as on arriving at the map: every weather drawing is let go, and each weather layer drawing
   * on the map is made afresh and settles as the game's does, in the next frame, for the part of the map the view shows
   * then.
   */
  resetWeather(): void
  {
    this.#weather.reset();
    this.#needsRender = true;
  }

  /**
   * Says what the weather shows, as each drawing describes itself, for the parity check.
   * @returns {JsonValue[]} What each weather drawing shows.
   */
  weatherDescriptions(): JsonValue[]
  {
    return this.#weather.describe();
  }

  /**
   * Sets the time of day the window's clock shows, which the lighting reads the sky at and the page rule picks each
   * event's page at. Nothing draws for it at once: the events whose pages ask something of the clock are judged again,
   * and those now showing another page are drawn again in the next frame, with the lighting asked to draw, since their
   * lights may have come or gone; the lighting is handed the new time in that frame too, and only what the hour changed
   * is drawn again, which within one hour may be nothing at all.
   * @param {number} minutes The time of day, in minutes past midnight.
   */
  setTimeOfDay(minutes: number): void
  {
    this.#timeOfDay = minutes;
    this.#drawTurned(this.#pages.setTime(minutes));
  }

  /**
   * Sets the season the window's clock shows, which moves the date the page rule picks each event's page at. Nothing
   * draws for it at once: the events whose pages read the date are judged again, and those now showing another page are
   * drawn again in the next frame, with the lighting asked to draw, since their lights may have come or gone. A season
   * no event's pages read draws nothing at all.
   * @param {number | null} season The season, or null for the season the game starts in.
   */
  setSeason(season: number | null): void
  {
    this.#drawTurned(this.#pages.setSeason(season));
  }

  /**
   * The season every event's pages are judged at, as last set.
   * @returns {number | null} The season, or null for the season the game starts in.
   */
  get season(): number | null
  {
    return this.#pages.season;
  }

  /**
   * Sets the preview every event's pages are judged against: the switches, variables and the rest the author set to see
   * the game further along than a fresh save. Nothing draws for it at once: the events whose pages read something the
   * preview changed are judged again, and those now showing another page are drawn again in the next frame, with the
   * lighting asked to draw, since their lights may have come or gone. A preview changing nothing any event reads draws
   * nothing at all.
   * @param {GamePreview} preview The preview.
   */
  setPreview(preview: GamePreview): void
  {
    this.#drawTurned(this.#pages.setPreview(preview));
  }

  /**
   * The preview every event's pages are judged against, as last set.
   * @returns {GamePreview} The preview.
   */
  get preview(): GamePreview
  {
    return this.#pages.preview;
  }

  /**
   * Picks each event's page by a page rule, the game's own with the plugin modules' conditions, at the clock's time and
   * the preview: every event is judged afresh and drawn again in the next frame, and the lighting asked to draw.
   * @param {PageRule | null} rule The rule, or null to show every event's first page, as MZ's own editor does.
   */
  setPageRule(rule: PageRule | null): void
  {
    this.#pages.setRule(rule);
    this.#events.markChanged(null);
    this.#eventsDirty = true;
    this.#selectionDirty = true;
    this.#lighting.markStale();
  }

  /**
   * The time of day the lighting reads the sky at, as last set.
   * @returns {number} The time of day, in minutes past midnight.
   */
  get timeOfDay(): number
  {
    return this.#timeOfDay;
  }

  /**
   * The tone the lighting casts over what the game tones, whether or not the lighting shows.
   * @returns {ScreenTone | null} The tone, or null while it casts none.
   */
  get tone(): ScreenTone | null
  {
    return this.#tone;
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
      eventMarkers: this.#events.markerCount,
      eventFootprints: this.#events.footprintCount,
      fadedEvents: this.#events.fadedCount,
      eventsFollowingClock: this.#pages.followingClock,
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

    // a view mounted behind another tab makes no context until it shows.
    if (this.#visible)
    {
      this.#keeper.show();
    }
  }

  /**
   * Settles once the GPU context is first up and the renderer draws, which for a view mounted behind another tab is
   * when it first shows.
   * @returns {Promise<void>} Settles when ready; rejects when WebGL is unavailable.
   */
  whenReady(): Promise<void>
  {
    return this.#ready;
  }

  /**
   * Says whether the view is on screen. A view behind another tab lets its GPU context go, since the window may keep
   * only so many, and draws again, as it was, when it shows.
   * @param {boolean} visible True while the view is on screen.
   */
  setVisible(visible: boolean): void
  {
    this.#visible = visible;
    if (this.#host === null)
    {
      return;
    }

    if (visible)
    {
      this.#keeper.show();
    }
    else
    {
      this.#keeper.hide();
    }
  }

  /**
   * Where the view's drawing stands: drawing, waiting for a context, getting one back, and so on.
   * @returns {DrawState} The state.
   */
  get drawState(): DrawState
  {
    return this.#keeper.state;
  }

  /**
   * Listens for the draw state changing, so the view can say why a map is not drawing.
   * @param {(state: DrawState) => void} listener Called with each new state.
   * @returns {() => void} Stops listening.
   */
  onDrawStateChange(listener: (state: DrawState) => void): () => void
  {
    return this.#keeper.onStateChange(listener);
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
    this.#selectionDirty = true;
    this.#pointerDirty = true;
    this.#ghostsDirty = true;
    this.#applyVisibility();
  }

  setOverlayState(state: OverlayState): void
  {
    const previous = this.#overlayState;
    if (state.selectedEvents !== previous.selectedEvents)
    {
      this.#modulesDirty = true;
    }

    // the selection redraws only when it changes, however often the pointer moves.
    if (state.selectedEvents !== previous.selectedEvents || state.selectedCells !== previous.selectedCells)
    {
      this.#selectionDirty = true;
    }

    if (state.ghostTiles !== previous.ghostTiles || state.ghostEvents !== previous.ghostEvents)
    {
      this.#ghostsDirty = true;
    }

    const pointerChanged = state.hover !== previous.hover
      || (state.hoverLabel ?? null) !== (previous.hoverLabel ?? null)
      || state.selectionBox !== previous.selectionBox
      || state.ghostEvents !== previous.ghostEvents
      || state.blockedCells !== previous.blockedCells;
    this.#overlayState = state;
    this.#pointerDirty ||= pointerChanged;
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

  setEventMarkers(classify: MarkerClassifier): void
  {
    // every event is rebuilt in the next frame, however many times the classifier changes before it.
    this.#events.setMarkerClassifier(classify);
    this.#eventsDirty = true;
    this.#selectionDirty = true;
  }

  setEventFootprints(read: FootprintReader): void
  {
    // every event is rebuilt in the next frame, and the selection with it, since a selected event's footprint is outlined.
    this.#events.setFootprintReader(read);
    this.#eventsDirty = true;
    this.#selectionDirty = true;
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

    // sprites waiting for the next frame are brought up to date first, so a click just after an edit finds what is there.
    if (this.#eventsDirty)
    {
      this.#flushEvents();
    }

    // the event a click there picks, by its tile or by the pixels its sprite draws at this zoom; or failing that, while
    // the map's sprites are still to be built, the newest event standing on the cell.
    const world = screenToWorld(this.#camera, point);
    const drawn = this.#events.eventAt(world.x, world.y, this.#camera.zoom);
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
   * scrolling parallax and the lighting's clock a number of engine frames in. The parity check uses it to match a frame
   * of the game.
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
    this.#prepareFrame(performance.now(), pixi);
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
    this.#keeper.destroy();
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
    this.#lighting.destroy();
    this.#weather.destroy();
    this.#slots.game.filters = null;
    this.#toning = false;
    this.#toneFilter?.destroy();
    this.#toneFilter = null;
    [ ...this.#sheetSources, ...this.#retiredSources ].forEach(source => source?.destroy());
    this.#sheetSources = [];
    this.#retiredSources = [];
    this.#atlases?.regions.destroy();
    this.#atlases?.passability.destroy();
    this.#atlases = null;
    this.#markerAtlas?.destroy();
    this.#markerAtlas = null;
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
   * Makes the WebGL context and starts the renderer on the canvas, the first time the view shows; the keeper starts
   * the drawing. It settles the renderer's readiness either way.
   * @returns {Promise<void>} Settles once the renderer can draw; rejects when WebGL is unavailable.
   */
  async #createContext(): Promise<void>
  {
    try
    {
      await this.#initPixi(this.#canvas as HTMLCanvasElement);
      this.#settleReady.resolve();
    }
    catch (error)
    {
      this.#settleReady.reject(error);
      throw error;
    }
  }

  /**
   * Starts the WebGL renderer on the canvas, then listens for the context going and coming back.
   * @param {HTMLCanvasElement} canvas The canvas.
   * @returns {Promise<void>} Settles once the renderer can draw.
   */
  async #initPixi(canvas: HTMLCanvasElement): Promise<void>
  {
    this.#measureView();
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
    this.#listenForContext(canvas);
  }

  /**
   * Passes the canvas's context events to the keeper, after pixi's own listeners, which ready its systems for a
   * restored context. A lost context can be asked back only once its lost event has been handled and its loss
   * prevented from being final, so the keeper hears of a loss in a task of its own, after the event is done.
   * @param {HTMLCanvasElement} canvas The canvas.
   */
  #listenForContext(canvas: HTMLCanvasElement): void
  {
    const onLost = (event: Event) =>
    {
      event.preventDefault();
      setTimeout(() => this.#keeper.contextLost(), 0);
    };
    const onRestored = () => this.#keeper.contextRestored();
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    this.#listeners.push(
      () => canvas.removeEventListener('webglcontextlost', onLost),
      () => canvas.removeEventListener('webglcontextrestored', onRestored),
    );
  }

  /**
   * Lets go of the live context, freeing its place in the process at once; pixi keeps everything it drew with, to
   * draw with again once the context is back.
   * @returns {boolean} True when the context is going; false when the browser offers no way to let go of it.
   */
  #releaseContext(): boolean
  {
    const lose = this.#pixi?.context.extensions.loseContext ?? null;
    if (lose === null)
    {
      return false;
    }

    lose.loseContext();
    return true;
  }

  /**
   * Asks the browser for the lost context back, through the extension pixi fetched while the context was live: a lost
   * context hands out no extensions.
   */
  #restoreContext(): void
  {
    this.#pixi?.context.extensions.loseContext?.restoreContext();
  }

  /**
   * Draws again on a context that has just come up. Pixi uploads every texture and buffer afresh as the first frame
   * draws, and edits made meanwhile, in this window or another, are already marked in the chunks they touched. What
   * the lighting drew into render textures went with the old context, so it draws again too, told the context is new.
   */
  #resumeDrawing(): void
  {
    this.#measureView();
    this.#pixi?.resize(this.#view.width, this.#view.height, this.#resolution);
    this.#needsRender = true;
    this.#selectionDirty = true;
    this.#pointerDirty = true;
    this.#contexts += 1;
    this.#lighting.markStale();
    this.#weather.markStale();
    this.#loop.start();
  }

  /**
   * Reads the host's size and pixel ratio. A host with no size, as a panel behind another tab has while it is out of
   * the page, keeps the size it last had, so the view comes back as it was rather than squeezed to a point.
   */
  #measureView(): void
  {
    const host = this.#host;
    if (host === null || host.clientWidth === 0 || host.clientHeight === 0)
    {
      return;
    }

    this.#view = { width: host.clientWidth, height: host.clientHeight };
    this.#resolution = host.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    this.#sized = true;
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

    // the wheel zooms about the pointer's own spot: the wheel event's whole-pixel spot lies up to two pixels off it at a
    // device pixel ratio of 1.5, which would shift the map under a still pointer a little more with every notch.
    listen('wheel', event =>
    {
      event.preventDefault();
      this.#zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode), precisePoint({ x: event.offsetX, y: event.offsetY }, this.#pointer));
    }, false);
    listen('pointerdown', event =>
    {
      this.#pointer = { x: event.offsetX, y: event.offsetY };
      if (event.button === 2)
      {
        this.#gesture.press({ x: event.offsetX, y: event.offsetY });
        canvas.setPointerCapture(event.pointerId);
      }
    });
    listen('pointermove', event =>
    {
      this.#pointer = { x: event.offsetX, y: event.offsetY };
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
   * Places the world under the camera, snapped to device pixels so tiles stay crisp, and tells the markers the zoom, so
   * they keep a size that can be read however far out it is.
   */
  #applyCamera(): void
  {
    const { x, y, zoom } = this.#camera;
    const resolution = this.#resolution;
    this.#world.scale.set(zoom);
    this.#world.position.set(Math.round(-x * zoom * resolution) / resolution, Math.round(-y * zoom * resolution) / resolution);
    this.#events.setZoom(zoom);
    this.#placeHoverLabel();
  }

  /**
   * Puts the hover's words just above its top-left corner, at the same size on screen whatever the zoom.
   */
  #placeHoverLabel(): void
  {
    const label = this.#slots.pointerLabel;
    const { hover } = this.#overlayState;
    if (label.visible === false || hover === null)
    {
      return;
    }

    const { zoom } = this.#camera;
    label.scale.set(1 / zoom);
    label.position.set(hover.x * TILE_SIZE, hover.y * TILE_SIZE - HOVER_LABEL_GAP / zoom);
  }

  /**
   * Writes the hover's words, or hides them when there are none or no hover to put them beside.
   */
  #writeHoverLabel(): void
  {
    const label = this.#slots.pointerLabel;
    const text = this.#overlayState.hoverLabel ?? null;
    const shown = text !== null && text !== '' && this.#overlayState.hover !== null && this.#isOn('hover');
    label.visible = shown;
    if (shown === false)
    {
      return;
    }

    // each change redraws the words' texture, so only a real change is made.
    if (label.text !== text)
    {
      label.text = text;
    }

    if (label.resolution !== this.#resolution)
    {
      label.resolution = this.#resolution;
    }

    this.#placeHoverLabel();
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
   * Makes the atlas event markers are cut from, once, in the host's document: the first time an event with no picture
   * needs its marker.
   * @returns {TextureSource} The atlas.
   */
  #markerAtlasSource(): TextureSource
  {
    this.#markerAtlas ??= markerAtlasSource(this.#host?.ownerDocument ?? globalThis.document);
    return this.#markerAtlas;
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

    // a map opened or swapped is read afresh, every event at the clock's time.
    this.#pages.forget(null);
    this.#events.setContext({
      document,
      flags: source.flags,
      sheets: this.#sheetSources,
      images: this.#images,
      tileSize: TILE_SIZE,
      markerAtlas: () => this.#markerAtlasSource(),
      pages: this.#pages,
    });
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
    this.#lighting.markStale();
    this.#weather.markStale();
    this.#selectionDirty = true;
    this.#pointerDirty = true;
    this.#ghostsDirty = true;
    this.#eventsDirty = false;
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
   * Draws what is sized to the map: the black behind it, the dimming, and the grid. The weather's clip is drawn by the
   * weather itself, and only on a map with weather to clip.
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
    slots.weather.visible = layers.weather;
    this.#applyTone();
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

    // the markers show the events no picture shows, so they go with the events, and with nothing of the editor's; the
    // footprints joined to them and the events no page holds for go with them, so with the markers off a map shows only
    // what the game draws.
    this.#events.markers.visible = layers.events && this.#isOn('markers');
    this.#events.footprints.visible = this.#events.markers.visible;
    this.#events.setFadedShown(this.#isOn('markers'));
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

    this.#selectionDirty = true;
    this.#pointerDirty = true;
    this.#needsRender = true;
  }

  /**
   * Keeps the tone the lighting casts, and shows it.
   * @param {ScreenTone | null} tone The tone, or null for none.
   */
  #castTone(tone: ScreenTone | null): void
  {
    this.#tone = tone;
    this.#applyTone();
    this.#needsRender = true;
  }

  /**
   * Casts the lighting's tone over what the game tones while the lighting shows and the tone changes anything, and takes
   * it off otherwise. Nothing filters the map while there is no tone to cast, so a map in plain daylight, or with the
   * Lighting switch off, costs no more to draw than it ever did.
   */
  #applyTone(): void
  {
    const { game, lighting } = this.#slots;
    const tone = this.#tone;
    if (lighting.visible === false || castsTone(tone) === false)
    {
      if (this.#toning)
      {
        game.filters = null;
        this.#toning = false;
      }

      return;
    }

    // the filter is made once, the first time a tone shows; after that only its tone changes.
    if (this.#toneFilter === null)
    {
      this.#toneFilter = new ToneFilter(tone);
    }
    else
    {
      this.#toneFilter.tone = tone;
    }

    if (this.#toning === false)
    {
      game.filters = [ this.#toneFilter ];
      this.#toning = true;
    }
  }

  /**
   * Hears a change to the document and marks what it touched.
   * @param {DocumentChange} change The change.
   */
  #onDocumentChange(change: DocumentChange): void
  {
    this.#needsRender = true;
    const effect = changeEffect(change);

    // the modules draw from events and regions, so a tile edit that leaves the regions alone never redraws them: a
    // brush stroke would otherwise redraw every sight ring and light on the map at every step. The lighting and the
    // weather read no tiles at all, so no tile edit ever asks either to draw.
    if (effect.kind !== 'tiles' || this.#touchesRegions(effect.indices))
    {
      this.#modulesDirty = true;
    }

    this.#lighting.hear(effect);
    this.#weather.hear(effect);

    switch (effect.kind)
    {
      case 'rebuild':
        // rebuilt once, in the next frame, however many changes arrive before it.
        this.#mapDirty = true;
        break;
      case 'tiles':
        this.#markTiles(effect.indices);
        break;
      case 'event':
        // a changed event is judged again, since its pages, or whether it follows the clock, may have changed.
        this.#pages.forget(effect.id);
        this.#eventsChanged(effect.id);
        break;
      case 'events':
        this.#pages.forget(null);
        this.#eventsChanged(null);
        break;
      case 'overlays':
        break;
    }
  }

  /**
   * Reports whether any of some changed cells lies on the region layer, the one tile layer a module may draw from.
   * @param {readonly number[]} indices The changed cells, as flat indexes.
   * @returns {boolean} True when a region changed.
   */
  #touchesRegions(indices: readonly number[]): boolean
  {
    const document = this.#document;
    if (document === null)
    {
      return false;
    }

    const regionsStart = document.width * document.height * 5;
    return indices.some(index => index >= regionsStart);
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
   * Marks the events a change touched, for the next frame to redraw together with the selection on them and the
   * passability their tile images feed. A drop moving hundreds of events arrives as hundreds of changes, and all of
   * them cost the frame one rebuild.
   * @param {number | null} id The event, or null when the list itself changed.
   */
  #eventsChanged(id: number | null): void
  {
    this.#events.markChanged(id);
    this.#eventsDirty = true;
    this.#selectionDirty = true;
  }

  /**
   * Draws again, in the next frame, the events a move of the clock, of its season or of the preview turned to another
   * page, asking the lighting to draw with them, since their lights may have come or gone, and the selection, since a
   * selected event's footprint may have changed with its page; when it turned none, nothing is asked of anything.
   * @param {readonly number[]} turned The ids of the events now showing another page.
   */
  #drawTurned(turned: readonly number[]): void
  {
    if (turned.length === 0)
    {
      return;
    }

    turned.forEach(id => this.#events.markChanged(id));
    this.#eventsDirty = true;
    this.#selectionDirty = true;
    this.#lighting.markStale();
  }

  /**
   * Redraws the events changed since the last frame, and rebuilds passability only when the tile-image events that
   * block steps are not where they were.
   */
  #flushEvents(): void
  {
    this.#eventsDirty = false;
    this.#events.flushChanges();
    const document = this.#document;
    if (document === null)
    {
      return;
    }

    const tileEvents = tileEventsByCell(document);
    if (sameTileEvents(tileEvents, this.#tileEvents) === false)
    {
      this.#tileEvents = tileEvents;
      this.#scene?.passability?.markAllDirty();
    }
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
    const { animate } = this.#visibility;
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

    const shown = { hover: this.#isOn('hover'), selection: this.#isOn('selection'), ghost: this.#isOn('ghost') };
    if (this.#selectionDirty)
    {
      this.#selectionDirty = false;
      const eventCell = (id: number) =>
      {
        const event = document?.event(id) ?? null;
        return event === null ? null : { x: event.x, y: event.y };
      };

      // a selected event's footprint is outlined while footprints show, so picking an exit strip at its far end shows the
      // whole strip picked.
      const footprints = this.#events.footprints.visible;
      const eventFootprint = (id: number) => (footprints ? this.#events.footprintOf(id) : null);
      drawSelection(this.#slots.selection, this.#overlayState, shown, eventCell, TILE_SIZE, eventFootprint);
      redrew = true;
    }

    if (this.#pointerDirty)
    {
      this.#pointerDirty = false;
      drawPointerOverlays(this.#slots.pointer, this.#overlayState, shown, TILE_SIZE);
      this.#writeHoverLabel();
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
   * moves the animation, culls to the camera, rebuilds dirty chunks and overlays, and lets the lighting and the weather
   * draw when they are due, or move on with the clock when they are not.
   * @param {number} now The frame's time.
   * @param {WebGLRenderer} pixi The renderer the frame draws with, which the lighting may draw into textures with.
   * @returns {{ changed: boolean, rebuiltChunks: number }} Whether anything changed, and how many tile chunks rebuilt.
   */
  #prepareFrame(now: number, pixi: WebGLRenderer): { changed: boolean; rebuiltChunks: number }
  {
    if (this.#mapDirty)
    {
      this.#mapDirty = false;
      this.#rebuildMap();
    }

    const document = this.#document;
    if (document !== null && this.#cameraPlaced === false && this.#scene !== null && this.#sized)
    {
      // a map shown for the first time starts whole on screen, once the view has a size to fit it to.
      this.#cameraPlaced = true;
      this.#moveCamera(fitCamera(this.#view, document, TILE_SIZE));
    }

    if (this.#eventsDirty)
    {
      this.#flushEvents();
    }

    let changed = this.#tickAnimation(now);
    let rebuiltChunks = 0;
    const scene = this.#scene;

    // the part of the map this frame shows, which the tiles are culled to and the lighting may leave alone outside of.
    const view = visibleWorld(this.#camera, this.#view);
    if (scene !== null)
    {
      const range: ChunkRange = chunkRangeFor(scene.grid, view, TILE_SIZE);
      scene.tiles.cull(range);
      scene.regions?.cull(range);
      scene.passability?.cull(range);
      rebuiltChunks = scene.tiles.flush();
      const overlayChunks = (scene.regions?.flush() ?? 0) + (scene.passability?.flush() ?? 0);
      changed = changed || rebuiltChunks > 0 || overlayChunks > 0;
    }

    changed = this.#refreshOverlays() || changed;
    if (document !== null)
    {
      changed = this.#drawLightAndWeather(document, now, pixi, view) || changed;
    }

    return { changed, rebuiltChunks };
  }

  /**
   * Lets the lighting draw, or move on with the clock, and the weather likewise. A map without weather costs the frame
   * nothing: the weather is handed a frame only while it holds a drawing, or is due to ask whether the map has any.
   * @param {MapDocument} document The map shown.
   * @param {number} now The frame's time.
   * @param {WebGLRenderer} pixi The renderer the frame draws with.
   * @param {WorldRect} view The part of the map the frame shows.
   * @returns {boolean} True when either changed what it shows.
   */
  #drawLightAndWeather(document: MapDocument, now: number, pixi: WebGLRenderer, view: WorldRect): boolean
  {
    const clock = lightingClockAt(now, this.#fixedAnimation, this.#visibility.animate, this.#timeOfDay);
    const lit = this.#lighting.draw({ document, renderer: pixi, context: this.#contexts, clock, pages: this.#pages, view });
    if (this.#weather.needsFrame === false)
    {
      return lit;
    }

    const fell = this.#weather.draw({
      document,
      renderer: pixi,
      context: this.#contexts,
      clock: weatherClockAt(now, this.#fixedAnimation, this.#visibility.animate),
      view,
      images: this.#images,
      sky: this.#weatherSky,
    });
    return lit || fell;
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
    const { changed, rebuiltChunks } = this.#prepareFrame(started, pixi);
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
