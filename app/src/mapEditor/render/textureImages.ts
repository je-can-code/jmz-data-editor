import { ImageSource, type TextureSource } from 'pixi.js';
import type { TextureImage } from '../core/renderer/MapRenderer.ts';

/**
 * Decodes an image file for the renderer. It decodes off the main thread and premultiplies alpha as it goes, which is
 * what the renderer's blending expects of every ImageBitmap it is handed.
 * @param {Blob} blob The image file.
 * @returns {Promise<ImageBitmap>} The decoded image.
 */
const decodeTextureImage = (blob: Blob): Promise<ImageBitmap> =>
{
  return createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
};

/**
 * Wraps an image as a texture source, sampled nearest by default so tiles stay crisp at every zoom. An ImageBitmap is
 * taken as already premultiplied ({@link decodeTextureImage} makes them so, since WebGL cannot premultiply an
 * ImageBitmap on upload); any other image is premultiplied as it uploads.
 * @param {TextureImage} image The image.
 * @param {'nearest' | 'linear'} scaleMode How it samples between pixels: nearest for tiles and characters, linear for
 * a painted parallax.
 * @returns {TextureSource} The source.
 */
const textureSourceFor = (image: TextureImage, scaleMode: 'nearest' | 'linear' = 'nearest'): TextureSource =>
{
  const premultiplied = typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
  return new ImageSource({
    resource: image,
    scaleMode,
    alphaMode: premultiplied ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload',
  });
};

/**
 * The one-pixel canvas pixels are read through, made on first use; null where the page has no off-screen canvas.
 */
let alphaProbe: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * Finds the one-pixel canvas to read pixels through, making it the first time.
 * @returns {OffscreenCanvasRenderingContext2D | null} Its context, or null where the page cannot make one.
 */
const probeContext = (): OffscreenCanvasRenderingContext2D | null =>
{
  if (alphaProbe === undefined)
  {
    // read back often and one pixel at a time, so the canvas stays in memory rather than on the graphics card.
    alphaProbe = typeof OffscreenCanvas === 'undefined'
      ? null
      : new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  }

  return alphaProbe;
};

/**
 * Reads how opaque one pixel of a texture source's image is. A sheet's frame is mostly clear around the figure it
 * draws, so this is how a click learns whether it landed on the figure or on whatever shows through around it.
 * @param {TextureSource} source The source, wrapping a decoded image.
 * @param {number} x The pixel's column in the image.
 * @param {number} y The pixel's row in the image.
 * @returns {number | null} The pixel's alpha, from 0 for clear to 255 for solid, or null when the page cannot read the
 * image's pixels.
 */
const readSourceAlpha = (source: TextureSource, x: number, y: number): number | null =>
{
  const probe = probeContext();
  if (probe === null)
  {
    return null;
  }

  // a read the browser refuses, such as from an image it has already let go of, leaves the frame counting as solid.
  try
  {
    probe.clearRect(0, 0, 1, 1);
    probe.drawImage(source.resource as CanvasImageSource, x, y, 1, 1, 0, 0, 1, 1);
    return probe.getImageData(0, 0, 1, 1).data[3];
  }
  catch
  {
    return null;
  }
};

export { decodeTextureImage, readSourceAlpha, textureSourceFor };
