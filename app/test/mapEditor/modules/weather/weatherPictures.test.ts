import { describe, expect, it } from 'vitest';
import type { TextureImage } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { layerPicturesFor, PICTURE_GAP, releasePictures, type CanvasMaker } from '../../../../src/mapEditor/modules/weather/weatherPictures.ts';

/*
 * Every particle of one layer draws in one batch, which takes one picture source; so a layer whose particles turn into
 * another picture, as a raindrop into its ripple, has both laid side by side on one canvas, a small gap between them so
 * neither bleeds into the other as a particle samples smoothly at its edge, and each cut out at its own size. A layer
 * whose particles turn into nothing draws from its own picture alone, and one turning into the same picture shares it.
 * Pictures sample smoothly between pixels, as the game's bitmaps do, and all of them, source included, go when let go.
 */
describe('weatherPictures', () =>
{
  /**
   * A stand-in picture of a size.
   * @param {number} width Its width.
   * @param {number} height Its height.
   * @returns {TextureImage} The picture.
   */
  const picture = (width: number, height: number): TextureImage => ({ width, height }) as unknown as TextureImage;

  describe('layerPicturesFor', () =>
  {
    it('draws a layer that turns into nothing from its own picture alone, sampled smoothly', () =>
    {
      // Arrange.
      const snow = picture(32, 32);

      // Act.
      const pictures = layerPicturesFor(snow, null);

      // Assert.
      expect([ pictures.first.frame.width, pictures.first.frame.height, pictures.second, pictures.source.resource === snow, pictures.source.scaleMode ])
        .toStrictEqual([ 32, 32, null, true, 'linear' ]);
    });

    it('shares one picture between a layer and a stage drawn with the same one', () =>
    {
      // Arrange.
      const star = picture(40, 40);

      // Act.
      const pictures = layerPicturesFor(star, star);

      // Assert.
      expect(pictures.second)
        .toBe(pictures.first);
    });

    it('lays a layer and its stage side by side on one canvas, a gap between, each cut out at its own size', () =>
    {
      // Arrange: an 18 by 36 drop and a 64 by 64 ripple, and a canvas writing down what is drawn on it.
      const drawn: string[] = [];
      let made: { width: number; height: number } | null = null;
      const makeCanvas: CanvasMaker = () =>
      {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: (image: { width: number }, x: number, y: number) => drawn.push(`${image.width} at ${x},${y}`) }),
        };
        made = canvas;
        return canvas as unknown as HTMLCanvasElement;
      };

      // Act.
      const pictures = layerPicturesFor(picture(18, 36), picture(64, 64), makeCanvas);

      // Assert.
      const { first, second } = pictures;
      expect([ made, drawn, [ first.frame.x, first.frame.y, first.frame.width, first.frame.height ], [ second?.frame.x, second?.frame.width, second?.frame.height ], pictures.source.resource === made ])
        .toStrictEqual([ { width: 18 + PICTURE_GAP + 64, height: 64, getContext: expect.any(Function) }, [ '18 at 0,0', `64 at ${18 + PICTURE_GAP},0` ], [ 0, 0, 18, 36 ], [ 18 + PICTURE_GAP, 64, 64 ], true ]);
    });
  });

  describe('releasePictures', () =>
  {
    it('lets go of both pictures and the source they were cut from, and of a shared picture once', () =>
    {
      // Arrange: a drop with its ripple laid beside it, and a star sharing its picture with its stage.
      const makeCanvas: CanvasMaker = () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }) }) as unknown as HTMLCanvasElement;
      const rain = layerPicturesFor(picture(18, 36), picture(64, 64), makeCanvas);
      const star = picture(40, 40);
      const stars = layerPicturesFor(star, star);

      // Act.
      releasePictures(rain);
      releasePictures(stars);

      // Assert.
      expect([ rain.first.destroyed, rain.second?.destroyed, rain.source.destroyed, stars.first.destroyed, stars.source.destroyed ])
        .toStrictEqual([ true, true, true, true, true ]);
    });
  });
});
