/**
 * The size of one tile in world pixels, as RMMZ draws it.
 */
const TILE_SIZE = 48;

/**
 * How far the camera zooms out and in: a whole large map on screen at the low end, single tiles filling the
 * view at the high end.
 */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

/**
 * Where the map view looks: the world pixel at the view's top-left corner, and the scale from world pixels to
 * screen pixels.
 */
type Camera = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

/**
 * A point in the view, in CSS pixels from its top-left corner, as pointer events report it.
 */
type ScreenPoint = {
  readonly x: number;
  readonly y: number;
};

/**
 * A point in the map, in world pixels from its top-left corner.
 */
type WorldPoint = {
  readonly x: number;
  readonly y: number;
};

/**
 * One tile position on the map.
 */
type MapCell = {
  readonly x: number;
  readonly y: number;
};

/**
 * A map's size in tiles.
 */
type MapSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * Converts a point in the view to the map point under it.
 * @param {Camera} camera The camera.
 * @param {ScreenPoint} point The view point.
 * @returns {WorldPoint} The world point.
 */
const screenToWorld = (camera: Camera, point: ScreenPoint): WorldPoint =>
{
  return { x: camera.x + point.x / camera.zoom, y: camera.y + point.y / camera.zoom };
};

/**
 * Converts a map point to where it shows in the view.
 * @param {Camera} camera The camera.
 * @param {WorldPoint} point The world point.
 * @returns {ScreenPoint} The view point.
 */
const worldToScreen = (camera: Camera, point: WorldPoint): ScreenPoint =>
{
  return { x: (point.x - camera.x) * camera.zoom, y: (point.y - camera.y) * camera.zoom };
};

/**
 * Finds the tile under a point in the view.
 * @param {Camera} camera The camera.
 * @param {ScreenPoint} point The view point.
 * @param {MapSize} size The map's size.
 * @param {number} tileSize The tile size in world pixels.
 * @returns {MapCell | null} The tile, or null when the point is off the map.
 */
const cellAtPoint = (camera: Camera, point: ScreenPoint, size: MapSize, tileSize = TILE_SIZE): MapCell | null =>
{
  const world = screenToWorld(camera, point);
  const x = Math.floor(world.x / tileSize);
  const y = Math.floor(world.y / tileSize);
  if (x < 0 || y < 0 || x >= size.width || y >= size.height)
  {
    return null;
  }

  return { x, y };
};

/**
 * Keeps a zoom inside the camera's range.
 * @param {number} zoom The wanted zoom.
 * @returns {number} The zoom, clamped.
 */
const clampZoom = (zoom: number): number =>
{
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
};

/**
 * Zooms about a point in the view, so whatever is under the mouse wheel stays under it.
 * @param {Camera} camera The camera.
 * @param {ScreenPoint} anchor The view point to hold still.
 * @param {number} factor How much to scale the zoom by; above 1 zooms in.
 * @returns {Camera} The new camera.
 */
const zoomAround = (camera: Camera, anchor: ScreenPoint, factor: number): Camera =>
{
  const zoom = clampZoom(camera.zoom * factor);
  const world = screenToWorld(camera, anchor);
  return { x: world.x - anchor.x / zoom, y: world.y - anchor.y / zoom, zoom };
};

/**
 * Moves the camera by a drag in the view, so the map follows the pointer while the right button is held.
 * @param {Camera} camera The camera.
 * @param {number} dx The drag across, in view pixels.
 * @param {number} dy The drag down, in view pixels.
 * @returns {Camera} The new camera.
 */
const panBy = (camera: Camera, dx: number, dy: number): Camera =>
{
  return { x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom, zoom: camera.zoom };
};

export { cellAtPoint, clampZoom, MAX_ZOOM, MIN_ZOOM, panBy, screenToWorld, TILE_SIZE, worldToScreen, zoomAround };
export type { Camera, MapCell, MapSize, ScreenPoint, WorldPoint };
