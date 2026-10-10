import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightPictures, paintFalloff } from '../../../../src/mapEditor/modules/lighting/lightPictures.ts';

/**
 * Every stand-in texture made, with its source and whether it was let go.
 */
const stand = vi.hoisted(() => ({
  textures: [] as { source: { resource: unknown; scaleMode: string; alphaMode: string }; destroyed: boolean }[],
}));

// pictures become pixi textures, which need a GPU to mean anything; stand-ins write down what each was made from.
vi.mock('pixi.js', () =>
{
  /**
   * Stands in for pixi's image source, keeping what it was made from.
   */
  class ImageSource
  {
    resource: unknown;

    scaleMode: string;

    alphaMode: string;

    constructor(options: { resource: unknown; scaleMode: string; alphaMode: string })
    {
      this.resource = options.resource;
      this.scaleMode = options.scaleMode;
      this.alphaMode = options.alphaMode;
    }
  }

  /**
   * Stands in for pixi's texture, writing down its source and its letting go.
   */
  class Texture
  {
    source: { resource: unknown; scaleMode: string; alphaMode: string };

    destroyed = false;

    constructor(options: { source: { resource: unknown; scaleMode: string; alphaMode: string } })
    {
      this.source = options.source;
      stand.textures.push(this);
    }

    destroy(): void
    {
      this.destroyed = true;
    }
  }

  return { ImageSource, Texture };
});

/*
 * A light's picture is painted exactly as J-Lighting paints it: on a canvas sized twice the reach across, handed the
 * unrounded width as the game's Bitmap hands it, so a fraction is dropped the way the game's canvas drops it; then a
 * radial gradient centred on the canvas, from the light's heart out to its reach, through the falloff's stops, fills the
 * canvas whole. The picture samples smoothly between its pixels, as the game's bitmaps do.
 *
 * Pictures are painted once per look (reach, colour and intensity) and handed out to every light that looks that way,
 * however its colour is written; a picture no light draws any more is let go when asked, and all of them go with the
 * cache. Canvases come from the page, as the game's do, unless another maker is handed over.
 */

/**
 * A stand-in canvas whose 2D context writes down every call.
 * @returns {{ canvas: HTMLCanvasElement, calls: string[] }} The canvas, and what was drawn on it.
 */
const recordingCanvas = () =>
{
  const calls: string[] = [];
  const gradient = {
    addColorStop: (offset: number, color: string) => calls.push(`stop ${offset} ${color}`),
  };
  const context = {
    createRadialGradient: (...args: number[]) =>
    {
      calls.push(`gradient ${args.join(',')}`);
      return gradient;
    },
    set fillStyle(value: unknown)
    {
      calls.push(value === gradient ? 'fill with the gradient' : 'fill with something else');
    },
    fillRect: (...args: number[]) => calls.push(`fillRect ${args.join(',')}`),
  };
  const canvas = {
    set width(value: number)
    {
      calls.push(`width ${value}`);
    },
    set height(value: number)
    {
      calls.push(`height ${value}`);
    },
    getContext: (kind: string) =>
    {
      calls.push(`context ${kind}`);
      return context;
    },
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
};

describe('lightPictures', () =>
{
  afterEach(() =>
  {
    stand.textures.splice(0);
    vi.unstubAllGlobals();
  });

  describe('paintFalloff', () =>
  {
    it('sizes the canvas twice the reach across and fills it whole with the gradient, centred, heart to rim', () =>
    {
      // Arrange.
      const { canvas, calls } = recordingCanvas();
      const stops = [ { offset: 0, color: '#ffbb73' }, { offset: 0.658, color: 'rgb(156,114,70)' }, { offset: 1, color: '#000000' } ];

      // Act.
      paintFalloff(canvas, 192, stops);

      // Assert.
      expect(calls)
        .toStrictEqual([
          'width 384',
          'height 384',
          'context 2d',
          'gradient 192,192,0,192,192,192',
          'stop 0 #ffbb73',
          'stop 0.658 rgb(156,114,70)',
          'stop 1 #000000',
          'fill with the gradient',
          'fillRect 0,0,384,384',
        ]);
    });

    it('hands the canvas the unrounded width, as the game\'s Bitmap does, leaving the canvas to drop the fraction', () =>
    {
      // Arrange: a reach of 1.3 tiles.
      const { canvas, calls } = recordingCanvas();

      // Act.
      paintFalloff(canvas, 62.4, [ { offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' } ]);

      // Assert.
      expect([ calls[0], calls[3], calls[calls.length - 1] ])
        .toStrictEqual([ 'width 124.8', 'gradient 62.4,62.4,0,62.4,62.4,62.4', 'fillRect 0,0,124.8,124.8' ]);
    });
  });

  describe('LightPictures', () =>
  {
    it('paints one picture per look and hands it to every light looking that way, however its colour is written', () =>
    {
      // Arrange: a cache over stand-in canvases.
      const made: string[][] = [];
      const pictures = new LightPictures(() =>
      {
        const { canvas, calls } = recordingCanvas();
        made.push(calls);
        return canvas;
      });

      // Act: one look written two ways, and a near miss differing only in intensity.
      const first = pictures.pictureFor({ radius: 192, color: '#FFBB73', intensity: 0.4 });
      const again = pictures.pictureFor({ radius: 192, color: '#ffbb73', intensity: 0.4 });
      const harder = pictures.pictureFor({ radius: 192, color: '#ffbb73', intensity: 0.5 });

      // Assert.
      expect([ made.length, first === again, first === harder, pictures.size ])
        .toStrictEqual([ 2, true, false, 2 ]);
    });

    it('makes each picture from its canvas, sampled smoothly and premultiplied as it uploads', () =>
    {
      // Arrange.
      const { canvas } = recordingCanvas();
      const pictures = new LightPictures(() => canvas);

      // Act.
      pictures.pictureFor({ radius: 96, color: '#bcd9ff', intensity: 0.1 });

      // Assert.
      expect(stand.textures.map(texture => [ texture.source.resource === canvas, texture.source.scaleMode, texture.source.alphaMode ]))
        .toStrictEqual([ [ true, 'linear', 'premultiply-alpha-on-upload' ] ]);
    });

    it('lets go of every picture no light draws any more, keeping the rest', () =>
    {
      // Arrange: a torch's picture and a ghost's.
      const pictures = new LightPictures(() => recordingCanvas().canvas);
      pictures.pictureFor({ radius: 192, color: '#ffbb73', intensity: 0.4 });
      pictures.pictureFor({ radius: 96, color: '#bcd9ff', intensity: 0.1 });

      // Act: only the torch is still drawn.
      pictures.keepOnly(new Set([ '192:#ffbb73:0.4' ]));

      // Assert.
      expect([ stand.textures.map(texture => texture.destroyed), pictures.size ])
        .toStrictEqual([ [ false, true ], 1 ]);
    });

    it('lets go of every picture with the cache', () =>
    {
      // Arrange.
      const pictures = new LightPictures(() => recordingCanvas().canvas);
      pictures.pictureFor({ radius: 192, color: '#ffbb73', intensity: 0.4 });
      pictures.pictureFor({ radius: 96, color: '#bcd9ff', intensity: 0.1 });

      // Act.
      pictures.destroy();

      // Assert.
      expect([ stand.textures.map(texture => texture.destroyed), pictures.size ])
        .toStrictEqual([ [ true, true ], 0 ]);
    });

    it('paints on a canvas from the page when no maker is handed over', () =>
    {
      // Arrange: a page whose every new element is a stand-in canvas.
      const { canvas, calls } = recordingCanvas();
      const createElement = vi.fn(() => canvas);
      vi.stubGlobal('document', { createElement });

      // Act.
      new LightPictures().pictureFor({ radius: 48, color: '#ffffff', intensity: 0 });

      // Assert.
      expect([ createElement.mock.calls, calls[0] ])
        .toStrictEqual([ [ [ 'canvas' ] ], 'width 96' ]);
    });
  });
});
