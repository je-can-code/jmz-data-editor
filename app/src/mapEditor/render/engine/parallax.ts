/**
 * A map's parallax settings, as its file stores them.
 */
type ParallaxSettings = {
  readonly name: string;
  readonly loopX: boolean;
  readonly loopY: boolean;
  readonly sx: number;
  readonly sy: number;
};

/**
 * A point in pixels.
 */
type PixelPoint = {
  readonly x: number;
  readonly y: number;
};

/**
 * Reports whether a parallax is fixed to the map, as ImageManager.isZeroParallax: its file name starts with {@code !}.
 * @param {string} name The parallax's name.
 * @returns {boolean} True when it moves with the map, one to one.
 */
const isZeroParallax = (name: string): boolean =>
{
  return (name.split('/').pop() ?? '').charAt(0) === '!';
};

/**
 * Finds the parallax origin the engine scrolls to, as Game_Map#parallaxOx and #parallaxOy: fixed to the map for a
 * {@code !} parallax, following at half speed when it loops, and still otherwise. A looping parallax also drifts by
 * its scroll speed every frame, which Game_Map#updateParallax adds to where the display is.
 * @param {ParallaxSettings} settings The map's parallax settings.
 * @param {PixelPoint} display The display position, in tiles, as Game_Map keeps it.
 * @param {number} frames Engine frames since the map was shown, for the drift.
 * @param {number} tileSize The tile size.
 * @returns {PixelPoint} The origin, in pixels, before it wraps at the picture's size.
 */
const parallaxOrigin = (settings: ParallaxSettings, display: PixelPoint, frames: number, tileSize: number): PixelPoint =>
{
  const zero = isZeroParallax(settings.name);
  const axis = (position: number, loops: boolean, speed: number): number =>
  {
    const drifted = loops
      ? position + (frames * speed) / tileSize / 2
      : position;
    if (zero)
    {
      return drifted * tileSize;
    }

    return loops
      ? (drifted * tileSize) / 2
      : 0;
  };

  return { x: axis(display.x, settings.loopX, settings.sx), y: axis(display.y, settings.loopY, settings.sy) };
};

/**
 * Finds the tile offset that makes a tiling sprite laid over the whole map, from its top-left corner, show the same
 * picture the engine shows through the screen: Spriteset_Map wraps the origin at the picture's size, and TilingSprite
 * rounds its negation, so the offset keeps both steps and moves them from the screen's corner to the map's.
 * @param {ParallaxSettings} settings The map's parallax settings.
 * @param {PixelPoint} camera The world pixel at the view's top-left corner.
 * @param {number} frames Engine frames since the map was shown, for the drift.
 * @param {number} tileSize The tile size.
 * @param {PixelPoint} picture The parallax picture's size, as {@code x} across and {@code y} down.
 * @returns {PixelPoint} The tiling sprite's offset.
 */
const parallaxTileOffset = (
  settings: ParallaxSettings, camera: PixelPoint, frames: number, tileSize: number, picture: PixelPoint): PixelPoint =>
{
  const display = { x: camera.x / tileSize, y: camera.y / tileSize };
  const origin = parallaxOrigin(settings, display, frames, tileSize);
  return {
    x: camera.x + Math.round(-(origin.x % picture.x)),
    y: camera.y + Math.round(-(origin.y % picture.y)),
  };
};

export { isZeroParallax, parallaxOrigin, parallaxTileOffset };
export type { ParallaxSettings, PixelPoint };
