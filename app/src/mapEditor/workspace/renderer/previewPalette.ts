import type { Camera, MapSize } from '../../core/renderer/camera.ts';

/**
 * Where each RMMZ tile sheet's ids start. Ids below A5 are the upper sheets (B to E); A1 to A4 are autotiles, 48
 * ids to a kind.
 */
const TILE_ID_A5 = 1536;
const TILE_ID_A1 = 2048;
const TILE_ID_A2 = 2816;
const TILE_ID_A3 = 4352;
const TILE_ID_A4 = 5888;
const TILE_ID_MAX = 8192;

/**
 * How much empty room the preview leaves around a map, in view pixels.
 */
const FIT_MARGIN = 12;

/**
 * Works out the camera that fits a whole map in a view, centred, with a little room around it.
 * @param {number} viewWidth The view's width in pixels.
 * @param {number} viewHeight The view's height in pixels.
 * @param {MapSize} size The map's size in tiles.
 * @param {number} tileSize The tile size in world pixels.
 * @returns {Camera} The camera.
 */
const fitCamera = (viewWidth: number, viewHeight: number, size: MapSize, tileSize: number): Camera =>
{
  const worldWidth = Math.max(size.width, 1) * tileSize;
  const worldHeight = Math.max(size.height, 1) * tileSize;
  const zoom = Math.max(0.01, Math.min((viewWidth - FIT_MARGIN * 2) / worldWidth, (viewHeight - FIT_MARGIN * 2) / worldHeight));

  // the camera names the world point at the view's top-left, so centring shifts it back by half the spare room.
  return {
    x: -((viewWidth / zoom) - worldWidth) / 2,
    y: -((viewHeight / zoom) - worldHeight) / 2,
    zoom,
  };
};

/**
 * Picks the preview colour of a ground tile by its sheet and kind: water blue, ground green, roofs red-brown, walls
 * grey, and the plain A5 tiles sand, each kind a little different so neighbouring terrain reads apart. Upper tiles
 * and empty cells have none.
 * @param {number} tileId The tile id.
 * @returns {string | null} A CSS colour, or null when the tile is not a ground tile.
 */
const groundColour = (tileId: number): string | null =>
{
  if (tileId >= TILE_ID_A1 && tileId < TILE_ID_MAX)
  {
    const kind = Math.floor((tileId - TILE_ID_A1) / 48);
    if (tileId < TILE_ID_A2)
    {
      return `hsl(205, 55%, ${34 + (kind % 4) * 4}%)`;
    }

    if (tileId < TILE_ID_A3)
    {
      return `hsl(${90 + (kind % 8) * 7}, 34%, ${28 + (kind % 3) * 4}%)`;
    }

    return tileId < TILE_ID_A4
      ? `hsl(${12 + (kind % 6) * 6}, 38%, 34%)`
      : `hsl(30, 8%, ${26 + (kind % 6) * 4}%)`;
  }

  return tileId >= TILE_ID_A5 && tileId < TILE_ID_A1
    ? `hsl(40, 24%, ${36 + (tileId % 8) * 2}%)`
    : null;
};

/**
 * Reports whether a tile id is one of the upper sheets' (B to E), which draw over the ground.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for a decoration tile.
 */
const isUpperTile = (tileId: number): boolean =>
{
  return tileId > 0 && tileId < TILE_ID_A5;
};

export { fitCamera, groundColour, isUpperTile };
