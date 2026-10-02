import { MAX_ZOOM, MIN_ZOOM, screenToWorld, type Camera, type MapSize, type ScreenPoint } from '../core/renderer/camera.ts';
import type { WorldRect } from './chunkMath.ts';

/**
 * The size of the map view, in CSS pixels.
 */
type ViewSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * How far the camera may zoom out and in for one map in one view.
 */
type ZoomLimits = {
  readonly min: number;
  readonly max: number;
};

/**
 * How much one wheel pixel scales the zoom. A standard mouse notch is 100 pixels, which zooms by about 16%.
 */
const WHEEL_ZOOM_RATE = 0.0015;

/**
 * How far the pointer may drift while the right button is held and still count as a click, in CSS pixels. Beyond it,
 * the press is a pan.
 */
const CLICK_SLOP = 4;

/**
 * The share of the view a fitted map fills, leaving a margin so its edges show.
 */
const FIT_FILL = 0.95;

/**
 * Converts a wheel event's movement into a zoom factor: above 1 zooms in. Line and page scrolling are converted to
 * pixels first, so every mouse and touchpad zooms at the same rate.
 * @param {number} deltaY The wheel's movement down.
 * @param {number} deltaMode What the movement counts: 0 pixels, 1 lines, 2 pages.
 * @returns {number} The factor to scale the zoom by.
 */
const wheelZoomFactor = (deltaY: number, deltaMode: number): number =>
{
  let pixels = deltaY;
  if (deltaMode === 1)
  {
    pixels = deltaY * 16;
  }
  else if (deltaMode === 2)
  {
    pixels = deltaY * 400;
  }

  return Math.exp(-pixels * WHEEL_ZOOM_RATE);
};

/**
 * The zoom a map with no tiles shows at: the game's own scale, since there is nothing to fit.
 */
const EMPTY_MAP_ZOOM = 1;

/**
 * Finds the zoom that shows a whole map in a view. It never goes closer than the wheel may zoom, so a map smaller
 * than the view shows as close as the wheel could bring it, and a map with no tiles at all (the 0x0 placeholders the
 * tree holds for maps not yet built) shows at the game's own scale rather than at whatever the view's size divided by
 * nothing comes to.
 * @param {ViewSize} view The view.
 * @param {MapSize} map The map's size in tiles.
 * @param {number} tileSize The tile size in world pixels.
 * @returns {number} The zoom.
 */
const fitZoom = (view: ViewSize, map: MapSize, tileSize: number): number =>
{
  // a map with no cells has nothing to fit.
  if (map.width * map.height === 0)
  {
    return EMPTY_MAP_ZOOM;
  }

  const zoom = Math.min(view.width / (map.width * tileSize), view.height / (map.height * tileSize)) * FIT_FILL;
  return Math.min(MAX_ZOOM, zoom);
};

/**
 * Finds how far the camera may zoom for a map in a view. Zooming out always reaches the whole map, even when that is
 * further out than the usual limit, because seeing all of it at once is a promise the editor keeps.
 * @param {ViewSize} view The view.
 * @param {MapSize} map The map's size in tiles.
 * @param {number} tileSize The tile size in world pixels.
 * @returns {ZoomLimits} The limits.
 */
const zoomLimits = (view: ViewSize, map: MapSize, tileSize: number): ZoomLimits =>
{
  return { min: Math.min(MIN_ZOOM, fitZoom(view, map, tileSize)), max: MAX_ZOOM };
};

/**
 * Builds the camera that shows a whole map, centred in the view. A map with no tiles shows at the game's own scale,
 * with the corner it would grow from in the middle of the view.
 * @param {ViewSize} view The view.
 * @param {MapSize} map The map's size in tiles.
 * @param {number} tileSize The tile size in world pixels.
 * @returns {Camera} The camera.
 */
const fitCamera = (view: ViewSize, map: MapSize, tileSize: number): Camera =>
{
  const zoom = fitZoom(view, map, tileSize);
  return {
    x: (map.width * tileSize - view.width / zoom) / 2,
    y: (map.height * tileSize - view.height / zoom) / 2,
    zoom,
  };
};

/**
 * Builds the camera that centres a world point in the view at a zoom.
 * @param {number} worldX The point, across.
 * @param {number} worldY The point, down.
 * @param {number} zoom The zoom.
 * @param {ViewSize} view The view.
 * @returns {Camera} The camera.
 */
const centerCamera = (worldX: number, worldY: number, zoom: number, view: ViewSize): Camera =>
{
  return { x: worldX - view.width / zoom / 2, y: worldY - view.height / zoom / 2, zoom };
};

/**
 * Zooms about a point in the view within limits, so whatever is under the mouse wheel stays under it.
 * @param {Camera} camera The camera.
 * @param {ScreenPoint} anchor The view point to hold still.
 * @param {number} factor How much to scale the zoom by; above 1 zooms in.
 * @param {ZoomLimits} limits How far the zoom may go.
 * @returns {Camera} The new camera.
 */
const zoomAt = (camera: Camera, anchor: ScreenPoint, factor: number, limits: ZoomLimits): Camera =>
{
  const zoom = Math.min(limits.max, Math.max(limits.min, camera.zoom * factor));
  const world = screenToWorld(camera, anchor);
  return { x: world.x - anchor.x / zoom, y: world.y - anchor.y / zoom, zoom };
};

/**
 * Finds the part of the world a camera shows.
 * @param {Camera} camera The camera.
 * @param {ViewSize} view The view.
 * @returns {WorldRect} The world rectangle on screen.
 */
const visibleWorld = (camera: Camera, view: ViewSize): WorldRect =>
{
  return { x: camera.x, y: camera.y, width: view.width / camera.zoom, height: view.height / camera.zoom };
};

/**
 * What a pointer event did to a right-button press.
 */
type GestureStep =
  | { readonly kind: 'none' }
  | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'context-menu'; readonly point: ScreenPoint };

/**
 * Tells a right click from a right drag. Holding the right button and moving pans the map with the pointer; pressing
 * and releasing without moving past a few pixels is a click, which opens the context menu. The first move past the
 * slop pans by everything since the press, so the map stays under the pointer.
 */
class RightButtonGesture
{
  #pressedAt: ScreenPoint | null = null;

  #last: ScreenPoint = { x: 0, y: 0 };

  #panning = false;

  /**
   * Whether the button is down.
   * @returns {boolean} True between a press and its release.
   */
  get isPressed(): boolean
  {
    return this.#pressedAt !== null;
  }

  /**
   * Whether the press has become a pan.
   * @returns {boolean} True once the pointer moved past the slop.
   */
  get isPanning(): boolean
  {
    return this.#panning;
  }

  /**
   * Starts a press.
   * @param {ScreenPoint} point Where the button went down.
   */
  press(point: ScreenPoint): void
  {
    this.#pressedAt = point;
    this.#last = point;
    this.#panning = false;
  }

  /**
   * Follows the pointer.
   * @param {ScreenPoint} point Where it is now.
   * @returns {GestureStep} A pan by the movement since the last step, or nothing while still inside the slop.
   */
  move(point: ScreenPoint): GestureStep
  {
    const pressedAt = this.#pressedAt;
    if (pressedAt === null)
    {
      return { kind: 'none' };
    }

    if (this.#panning === false && Math.hypot(point.x - pressedAt.x, point.y - pressedAt.y) <= CLICK_SLOP)
    {
      return { kind: 'none' };
    }

    this.#panning = true;
    const step: GestureStep = { kind: 'pan', dx: point.x - this.#last.x, dy: point.y - this.#last.y };
    this.#last = point;
    return step;
  }

  /**
   * Ends a press.
   * @param {ScreenPoint} point Where the button came up.
   * @returns {GestureStep} A context menu at the press when it never became a pan, nothing otherwise.
   */
  release(point: ScreenPoint): GestureStep
  {
    const pressedAt = this.#pressedAt;
    const wasPanning = this.#panning;
    this.cancel();
    if (pressedAt === null || wasPanning)
    {
      return { kind: 'none' };
    }

    // a release that drifted inside the slop is still the click that pressed there.
    return Math.hypot(point.x - pressedAt.x, point.y - pressedAt.y) <= CLICK_SLOP
      ? { kind: 'context-menu', point: pressedAt }
      : { kind: 'none' };
  }

  /**
   * Forgets the press, as when the pointer is lost.
   */
  cancel(): void
  {
    this.#pressedAt = null;
    this.#panning = false;
  }
}

export {
  centerCamera,
  CLICK_SLOP,
  fitCamera,
  fitZoom,
  RightButtonGesture,
  visibleWorld,
  wheelZoomFactor,
  zoomAt,
  zoomLimits,
};
export type { GestureStep, ViewSize, ZoomLimits };
