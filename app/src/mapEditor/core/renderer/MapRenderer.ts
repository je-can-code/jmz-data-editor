import type { ImageFolder } from '../api/MapEditorApi.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzEventImage, RmmzTileset } from '../model/rmmzTypes.ts';
import type { PassabilityRule } from '../modules/PluginModule.ts';
import type { Camera, MapCell, ScreenPoint } from './camera.ts';
import type { FrameTimings } from './FrameTimeRecorder.ts';

/**
 * An image a renderer can draw from.
 */
type TextureImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

/**
 * A tileset ready to draw: its row (passability flags, mode, sheet names) and the nine sheet images in RMMZ order
 * (A1, A2, A3, A4, A5, B, C, D, E), null where the tileset leaves a sheet empty.
 */
type TilesetTextures = {
  readonly tileset: RmmzTileset;
  readonly sheets: readonly (TextureImage | null)[];
};

/**
 * Where a renderer gets the images events draw with: character sheets and tile images. It caches as it likes.
 */
interface TextureSource
{
  /**
   * Loads a project image.
   * @param {ImageFolder} folder The folder under {@code img/}.
   * @param {string} name The file name without {@code .png}.
   * @returns {Promise<TextureImage | null>} The image, or null when the file is missing.
   */
  image(folder: ImageFolder, name: string): Promise<TextureImage | null>;
}

/**
 * The tile layers, which one may highlight.
 */
type TileLayer = 'tiles1' | 'tiles2' | 'tiles3' | 'tiles4';

/**
 * Everything a renderer can show or hide.
 */
type RenderLayer = TileLayer | 'shadows' | 'events' | 'parallax' | 'lighting';

/**
 * What shows. The game look is the default: every layer on, water animated, the parallax and lighting drawn.
 * Highlighting a tile layer dims everything else, so what sits on it stands out.
 */
type LayerVisibility = {
  readonly layers: Readonly<Record<RenderLayer, boolean>>;
  readonly animateWater: boolean;
  readonly highlighted: TileLayer | null;
};

/**
 * The game look, the renderer's default. Auto-shadows start off because the game never draws them: J-Base turns
 * Tilemap#_addShadow into nothing. A switch shows them for editing.
 */
const GAME_LOOK: LayerVisibility = {
  layers: {
    tiles1: true,
    tiles2: true,
    tiles3: true,
    tiles4: true,
    shadows: false,
    events: true,
    parallax: true,
    lighting: true,
  },
  animateWater: true,
  highlighted: null,
};

/**
 * The overlays the core draws: the grid, regions, passability, the highlight of the chosen layer, the selection,
 * the hover and the ghost preview of what a click would place. Plugin modules add their own, named
 * {@code module.overlay} (J-ABS's sight rings would be {@code jabs.sight}).
 */
type CoreOverlayId = 'grid' | 'regions' | 'passability' | 'layer-highlight' | 'selection' | 'hover' | 'ghost';

/**
 * Names one overlay.
 */
type OverlayId = CoreOverlayId | `${string}.${string}`;

/**
 * How an overlay shape is drawn. Colours are {@code 0xRRGGBB}; alphas run from 0 to 1.
 */
type OverlayStyle = {
  readonly fill?: number;
  readonly fillAlpha?: number;
  readonly stroke?: number;
  readonly strokeAlpha?: number;
  readonly strokeWidth?: number;
};

/**
 * What an overlay draws with: plain shapes in world pixels. A module's overlay never touches the renderer's
 * internals, so a light's radius or a battler's sight ring draws the same whatever the renderer is built on.
 */
interface OverlayPainter
{
  /**
   * Draws a circle.
   * @param {number} x The centre, across.
   * @param {number} y The centre, down.
   * @param {number} radius The radius.
   * @param {OverlayStyle} style How to draw it.
   */
  circle(x: number, y: number, radius: number, style: OverlayStyle): void;

  /**
   * Draws a rectangle.
   * @param {number} x The left edge.
   * @param {number} y The top edge.
   * @param {number} width The width.
   * @param {number} height The height.
   * @param {OverlayStyle} style How to draw it.
   */
  rect(x: number, y: number, width: number, height: number, style: OverlayStyle): void;

  /**
   * Draws a line.
   * @param {number} x1 The start, across.
   * @param {number} y1 The start, down.
   * @param {number} x2 The end, across.
   * @param {number} y2 The end, down.
   * @param {OverlayStyle} style How to draw it.
   */
  line(x1: number, y1: number, x2: number, y2: number, style: OverlayStyle): void;

  /**
   * Draws a label.
   * @param {number} x The left edge.
   * @param {number} y The top edge.
   * @param {string} text The label.
   * @param {OverlayStyle} style How to draw it.
   */
  text(x: number, y: number, text: string, style: OverlayStyle): void;
}

/**
 * What an overlay may read while drawing.
 */
type OverlayContext = {
  readonly document: MapDocument;
  readonly tileSize: number;
  readonly selection: readonly number[];
};

/**
 * One switchable overlay: a name for the toggle, whether it starts on, and how it draws.
 */
type OverlayDefinition = {
  readonly id: OverlayId;
  readonly title: string;
  readonly defaultOn: boolean;
  readonly draw: (painter: OverlayPainter, context: OverlayContext) => void;
};

/**
 * The overlays a renderer draws: which are switched on, and the definitions of those that plugin modules
 * contributed. Core overlays the renderer draws itself.
 */
type OverlaySet = {
  readonly enabled: ReadonlySet<OverlayId>;
  readonly definitions: readonly OverlayDefinition[];
};

/**
 * A rectangle of cells: its top-left cell and its size in cells.
 */
type CellRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * A rectangle in world pixels.
 */
type WorldRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * A tile a ghost preview shows: where a click would put it, on which layer (0 to 3), and which tile it is, shape
 * included.
 */
type GhostTile = {
  readonly x: number;
  readonly y: number;
  readonly layer: number;
  readonly tileId: number;
};

/**
 * An event a ghost preview shows, such as one being dragged: where it would land and how it looks there.
 */
type GhostEvent = {
  readonly x: number;
  readonly y: number;
  readonly image: RmmzEventImage;
  readonly priorityType: number;
};

/**
 * What the tools are pointing at, which the core overlays show: the cell or brush footprint under the pointer
 * (hover), the selected events, tile area and the box being dragged (selection), and what a click would place (ghost).
 * The tools own this state and hand the renderer all of it whenever any part changes.
 */
type OverlayState = {
  readonly hover: CellRect | null;
  readonly selectedEvents: readonly number[];
  readonly selectedCells: CellRect | null;
  readonly selectionBox: WorldRect | null;
  readonly ghostTiles: readonly GhostTile[];
  readonly ghostEvents: readonly GhostEvent[];

  /**
   * A few words beside the hover, such as the layer the brush will paint; drawn at the same size at every zoom, and
   * only while there is a hover to put them beside. Left out, or null, there are none.
   */
  readonly hoverLabel?: string | null;
};

/**
 * Nothing pointed at, selected or previewed.
 */
const NO_OVERLAY_STATE: OverlayState = {
  hover: null,
  selectedEvents: [],
  selectedCells: null,
  selectionBox: null,
  ghostTiles: [],
  ghostEvents: [],
  hoverLabel: null,
};

/**
 * A right click that did not move: where it landed, and what is there.
 */
type MapContextMenu = {
  readonly point: ScreenPoint;
  readonly cell: MapCell | null;
  readonly eventId: number | null;
};

/**
 * What the graphics driver reports about the GPU drawing the map, so the editor can show which card it runs on.
 */
type RendererInfo = {
  readonly vendor: string;
  readonly renderer: string;
};

/**
 * The contract every map renderer keeps. Drawing never goes through React: a pane hands the renderer a host
 * element and the things below, and the renderer draws on its own loop, listening to the document for changes
 * so an edit redraws only what it touched.
 *
 * What it receives: the document, the tileset textures and a texture source, the camera, the layer visibility
 * and the overlay set. What it answers: its frame timings (for the speed script), and the cell and the event
 * under a point (for every tool and every click).
 */
interface MapRenderer
{
  /**
   * Starts drawing into a host element.
   * @param {HTMLElement} host The element to fill.
   */
  mount(host: HTMLElement): void;

  /**
   * Draws a map, following its changes until another map replaces it.
   * @param {MapDocument} document The map.
   */
  setDocument(document: MapDocument): void;

  /**
   * Draws with a tileset.
   * @param {TilesetTextures} textures The tileset and its sheets.
   */
  setTileset(textures: TilesetTextures): void;

  /**
   * Loads event images through a source.
   * @param {TextureSource} source The source.
   */
  setTextureSource(source: TextureSource): void;

  /**
   * Moves the view.
   * @param {Camera} camera The camera.
   */
  setCamera(camera: Camera): void;

  /**
   * Shows and hides layers.
   * @param {LayerVisibility} visibility What shows.
   */
  setLayerVisibility(visibility: LayerVisibility): void;

  /**
   * Chooses the overlays. The layer highlight dims everything but the highlighted layer only while this set enables
   * {@code layer-highlight} and the layer visibility names a layer.
   * @param {OverlaySet} overlays The overlays.
   */
  setOverlays(overlays: OverlaySet): void;

  /**
   * Shows what the tools point at: hover, selection and ghost previews.
   * @param {OverlayState} state The whole state.
   */
  setOverlayState(state: OverlayState): void;

  /**
   * Adds the plugin modules' passability rules to the engine's own, for the passability overlay.
   * @param {readonly PassabilityRule[]} rules The active rules.
   */
  setPassabilityRules(rules: readonly PassabilityRule[]): void;

  /**
   * Redraws the plugin modules' overlays, for a change the renderer cannot see, such as the clock moving.
   */
  refreshOverlays(): void;

  /**
   * Listens for right clicks that did not move, which open the context menu.
   * @param {(menu: MapContextMenu) => void} listener Called with where the click landed.
   * @returns {() => void} Stops listening.
   */
  onContextMenu(listener: (menu: MapContextMenu) => void): () => void;

  /**
   * Listens for camera moves, whether the pointer made them or {@link setCamera} did.
   * @param {(camera: Camera) => void} listener Called with the new camera.
   * @returns {() => void} Stops listening.
   */
  onCameraChange(listener: (camera: Camera) => void): () => void;

  /**
   * Names the GPU drawing the map.
   * @returns {RendererInfo | null} The driver's report, or null before drawing starts.
   */
  rendererInfo(): RendererInfo | null;

  /**
   * Sums up recent frame durations.
   * @returns {FrameTimings} The summary.
   */
  frameTimings(): FrameTimings;

  /**
   * Forgets recent frame durations, before a timed interaction.
   */
  resetFrameTimings(): void;

  /**
   * Finds the tile under a point in the view.
   * @param {ScreenPoint} point The view point.
   * @returns {MapCell | null} The tile, or null off the map.
   */
  cellAt(point: ScreenPoint): MapCell | null;

  /**
   * Finds the event under a point in the view.
   * @param {ScreenPoint} point The view point.
   * @returns {number | null} The event id, or null when there is none.
   */
  eventAt(point: ScreenPoint): number | null;

  /**
   * Stops drawing and lets go of everything.
   */
  destroy(): void;
}

export { GAME_LOOK, NO_OVERLAY_STATE };
export type {
  CellRect,
  CoreOverlayId,
  GhostEvent,
  GhostTile,
  LayerVisibility,
  MapContextMenu,
  MapRenderer,
  OverlayContext,
  OverlayDefinition,
  OverlayId,
  OverlayPainter,
  OverlaySet,
  OverlayState,
  OverlayStyle,
  RendererInfo,
  RenderLayer,
  TextureImage,
  TextureSource,
  TileLayer,
  TilesetTextures,
  WorldRect,
};
