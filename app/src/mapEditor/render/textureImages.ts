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
 * Wraps an image as a texture source, sampled nearest so tiles stay crisp at every zoom. An ImageBitmap is taken as
 * already premultiplied ({@link decodeTextureImage} makes them so, since WebGL cannot premultiply an ImageBitmap on
 * upload); any other image is premultiplied as it uploads.
 * @param {TextureImage} image The image.
 * @returns {TextureSource} The source.
 */
const textureSourceFor = (image: TextureImage): TextureSource =>
{
  const premultiplied = typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
  return new ImageSource({
    resource: image,
    scaleMode: 'nearest',
    alphaMode: premultiplied ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload',
  });
};

export { decodeTextureImage, textureSourceFor };
