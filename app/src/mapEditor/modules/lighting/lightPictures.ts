import { Texture } from 'pixi.js';
import { textureSourceFor } from '../../render/textureImages.ts';
import { falloffStops, pictureKey, type FalloffStop } from './lightFalloff.ts';

/**
 * What a light's picture is drawn from: its reach in pixels, its colour and its intensity.
 */
type PictureSpec = {
  readonly radius: number;
  readonly color: string;
  readonly intensity: number;
};

/**
 * Makes a canvas to paint a light's picture on.
 */
type CanvasMaker = () => HTMLCanvasElement;

/**
 * Makes a canvas on the page, as the game's Bitmap makes one, so the picture is rasterised by the same canvas the game's
 * is.
 * @returns {HTMLCanvasElement} The canvas.
 */
const pageCanvas: CanvasMaker = () =>
{
  return globalThis.document.createElement('canvas');
};

/**
 * Paints a light's falloff onto a canvas exactly as LightTextureCache#generate does: the canvas is sized twice the reach
 * across (a fraction of a pixel dropped, as the game's canvas drops it), and a radial gradient from the light's heart
 * out to its rim, through the stops, fills it whole, so the corners past the rim are the rim's black.
 * @param {HTMLCanvasElement} canvas The canvas.
 * @param {number} radius The light's reach, in pixels.
 * @param {readonly FalloffStop[]} stops The gradient's stops, heart to rim.
 */
const paintFalloff = (canvas: HTMLCanvasElement, radius: number, stops: readonly FalloffStop[]): void =>
{
  const diameter = radius * 2;
  canvas.width = diameter;
  canvas.height = diameter;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  stops.forEach(stop => gradient.addColorStop(stop.offset, stop.color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, diameter, diameter);
};

/**
 * Every distinct light picture one view's dark needs, painted once and handed out for as long as a light on the map
 * looks that way, as J-Lighting's LightTextureCache keeps them: forty torches of one reach, colour and intensity share
 * one picture, whatever their effects. Pictures sample smoothly between pixels, as the game's bitmaps do.
 */
class LightPictures
{
  #makeCanvas: CanvasMaker;

  #pictures = new Map<string, Texture>();

  /**
   * @param {CanvasMaker} makeCanvas Makes the canvas each picture is painted on; by default, one on the page.
   */
  constructor(makeCanvas: CanvasMaker = pageCanvas)
  {
    this.#makeCanvas = makeCanvas;
  }

  /**
   * How many pictures are held.
   * @returns {number} The count.
   */
  get size(): number
  {
    return this.#pictures.size;
  }

  /**
   * Hands out a light's picture, painting it the first time a light looks that way.
   * @param {PictureSpec} spec What the picture is drawn from.
   * @returns {Texture} The picture.
   */
  pictureFor(spec: PictureSpec): Texture
  {
    const key = pictureKey(spec.radius, spec.color, spec.intensity);
    const known = this.#pictures.get(key);
    if (known !== undefined)
    {
      return known;
    }

    const canvas = this.#makeCanvas();
    paintFalloff(canvas, spec.radius, falloffStops(spec.color, spec.intensity));
    const picture = new Texture({ source: textureSourceFor(canvas, 'linear') });
    this.#pictures.set(key, picture);
    return picture;
  }

  /**
   * Lets go of every picture no light on the map draws any more, such as the one a light had before its reach changed.
   * @param {ReadonlySet<string>} keys The names of the pictures still drawn.
   */
  keepOnly(keys: ReadonlySet<string>): void
  {
    [ ...this.#pictures ].forEach(([ key, picture ]) =>
    {
      if (keys.has(key) === false)
      {
        picture.destroy(true);
        this.#pictures.delete(key);
      }
    });
  }

  /**
   * Lets go of every picture.
   */
  destroy(): void
  {
    this.keepOnly(new Set());
  }
}

export { LightPictures, paintFalloff };
export type { CanvasMaker, PictureSpec };
