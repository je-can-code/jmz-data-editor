import { Rectangle, Texture, type TextureSource } from 'pixi.js';
import type { TextureImage } from '../../core/renderer/MapRenderer.ts';
import { textureSourceFor } from '../../render/textureImages.ts';

/**
 * The pictures one layer of weather draws with: its particles' own, and what they turn into, if anything. Both are cut
 * from one source, since every particle of a layer draws in one batch, and a raindrop turning into its ripple changes
 * only which part of the source it shows.
 */
type LayerPictures = {
  readonly source: TextureSource;
  readonly first: Texture;
  readonly second: Texture | null;
};

/**
 * Makes a canvas to lay two pictures side by side on.
 */
type CanvasMaker = () => HTMLCanvasElement | OffscreenCanvas;

/**
 * How many clear pixels part two pictures laid side by side, so neither bleeds into the other where a particle samples
 * smoothly between pixels at its edge.
 */
const PICTURE_GAP = 2;

/**
 * Makes a canvas on the page, as the game's own pictures are drawn into one.
 * @returns {HTMLCanvasElement} The canvas.
 */
const pageCanvas: CanvasMaker = () =>
{
  return globalThis.document.createElement('canvas');
};

/**
 * Cuts the pictures one layer draws with, sampled smoothly between pixels as the game's bitmaps are. A layer whose
 * particles never turn into anything, or turn into the same picture, draws from its picture alone; one whose particles
 * turn into another picture, as a raindrop into its ripple, has both laid side by side on one canvas, a small gap
 * between them, each cut out at its own size.
 * @param {TextureImage} first The layer's own picture.
 * @param {TextureImage | null} second What its particles turn into, or null when they turn into nothing else.
 * @param {CanvasMaker} makeCanvas Makes the canvas two pictures are laid on; by default, one on the page.
 * @returns {LayerPictures} The pictures.
 */
const layerPicturesFor = (first: TextureImage, second: TextureImage | null, makeCanvas: CanvasMaker = pageCanvas): LayerPictures =>
{
  if (second === null || second === first)
  {
    const source = textureSourceFor(first, 'linear');
    const texture = new Texture({ source });
    return { source, first: texture, second: second === null ? null : texture };
  }

  const canvas = makeCanvas();
  canvas.width = first.width + PICTURE_GAP + second.width;
  canvas.height = Math.max(first.height, second.height);
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  context.drawImage(first, 0, 0);
  context.drawImage(second, first.width + PICTURE_GAP, 0);
  const source = textureSourceFor(canvas, 'linear');
  return {
    source,
    first: new Texture({ source, frame: new Rectangle(0, 0, first.width, first.height) }),
    second: new Texture({ source, frame: new Rectangle(first.width + PICTURE_GAP, 0, second.width, second.height) }),
  };
};

/**
 * Lets go of one layer's pictures, and the source they were cut from.
 * @param {LayerPictures} pictures The pictures.
 */
const releasePictures = (pictures: LayerPictures): void =>
{
  pictures.first.destroy();
  if (pictures.second !== null && pictures.second !== pictures.first)
  {
    pictures.second.destroy();
  }

  pictures.source.destroy();
};

export { layerPicturesFor, pageCanvas, PICTURE_GAP, releasePictures };
export type { CanvasMaker, LayerPictures };
