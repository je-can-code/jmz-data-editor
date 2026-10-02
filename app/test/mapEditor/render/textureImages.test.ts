import { TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * A click on an event's sprite asks whether the sprite draws the pixel under it, since a frame is mostly clear around
 * its figure. readSourceAlpha owes that answer: the alpha of exactly the pixel asked for, read by drawing that one
 * pixel of the source's image through a one-pixel off-screen canvas, made once. Where the page has no such canvas, or
 * the browser refuses the read, it answers null, and the caller counts the frame as solid rather than guessing clear.
 * The canvas is made on first use and kept for the module's life, so every test loads the module afresh.
 */
describe('readSourceAlpha', () =>
{
  afterEach(() =>
  {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * Stands in for the page's off-screen canvas, its 2D context recording each pixel drawn and answering every read
   * with one colour.
   * @param {number} alpha The alpha every read answers.
   * @param {boolean} refuses True to have every draw refused, as the browser refuses an image it has let go of.
   * @returns {{ drawn: unknown[][], made: () => number }} Each draw's arguments, and how many canvases were made.
   */
  const stubCanvas = (alpha: number, refuses = false) =>
  {
    const drawn: unknown[][] = [];
    let made = 0;
    const context = {
      clearRect: () => undefined,
      drawImage: (...args: unknown[]) =>
      {
        if (refuses)
        {
          throw new DOMException('The image is gone.', 'InvalidStateError');
        }

        drawn.push(args);
      },
      getImageData: () => ({ data: [ 10, 20, 30, alpha ] }),
    };
    vi.stubGlobal('OffscreenCanvas', class
    {
      constructor()
      {
        made += 1;
      }

      getContext()
      {
        return context;
      }
    });
    return { drawn, made: () => made };
  };

  it('reads the alpha of the pixel asked for, drawing just that pixel, through one canvas made once', async () =>
  {
    // Arrange: a sheet whose read pixels come back with alpha 77.
    const canvas = stubCanvas(77);
    const { readSourceAlpha } = await import('../../../src/mapEditor/render/textureImages.ts');
    const image = { width: 96, height: 64 };
    const source = new TextureSource({ resource: image });

    // Act: two reads.
    const alphas = [ readSourceAlpha(source, 40, 50), readSourceAlpha(source, 3, 4) ];

    // Assert.
    expect([ alphas, canvas.drawn, canvas.made() ])
      .toStrictEqual([ [ 77, 77 ], [ [ image, 40, 50, 1, 1, 0, 0, 1, 1 ], [ image, 3, 4, 1, 1, 0, 0, 1, 1 ] ], 1 ]);
  });

  it('answers null where the page has no off-screen canvas', async () =>
  {
    // Arrange: node has no OffscreenCanvas, and none is stubbed.
    const { readSourceAlpha } = await import('../../../src/mapEditor/render/textureImages.ts');

    // Act.
    const alpha = readSourceAlpha(new TextureSource({ resource: { width: 8, height: 8 } }), 1, 1);

    // Assert.
    expect(alpha)
      .toBe(null);
  });

  it('answers null when the browser refuses the read', async () =>
  {
    // Arrange: every draw is refused.
    stubCanvas(255, true);
    const { readSourceAlpha } = await import('../../../src/mapEditor/render/textureImages.ts');

    // Act.
    const alpha = readSourceAlpha(new TextureSource({ resource: { width: 8, height: 8 } }), 1, 1);

    // Assert.
    expect(alpha)
      .toBe(null);
  });
});
