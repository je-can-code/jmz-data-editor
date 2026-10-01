import { describe, expect, it } from 'vitest';
import type { TextureImage } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { makeAutotileId, TileId } from '../../../src/mapEditor/core/tiles/tileIds.ts';
import { drawPatch, drawRegion, drawTile, type RegionContext, type TileContext } from '../../../src/mapEditor/render/tileCanvas.ts';

/*
 * Drawing tiles into a 2D canvas, for the palette, its painted patches and the stack view.
 *
 * The palette must show exactly the pictures painting lays down, so a tile is cut from its sheet by the engine's own
 * rules (an autotile's four quarters from its kind's block, any other tile whole) and only scaled on the way to the
 * canvas. A canvas stands in here, recording every call, since the test environment has no canvas to draw on.
 */

/**
 * The nine sheets, each a stand-in image named for its sheet.
 * @param {readonly string[]} missing The sheets to leave out.
 * @returns {(TextureImage | null)[]} The sheets.
 */
const sheetsWithout = (missing: readonly string[] = []): (TextureImage | null)[] =>
{
  return [ 'A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E' ].map(name => (missing.includes(name) ? null : { name } as unknown as TextureImage));
};

/**
 * A stand-in canvas context recording each image drawn: the sheet's name, the source rectangle and where it went.
 * @returns {{ context: TileContext, drawn: (string | number)[][] }} The context and its record.
 */
const recordingContext = () =>
{
  const drawn: (string | number)[][] = [];
  const context = {
    drawImage: (image: { name: string }, ...rest: number[]) => drawn.push([ image.name, ...rest ]),
  } as unknown as TileContext;
  return { context, drawn };
};

describe('drawTile', () =>
{
  it('cuts a plain tile whole from its sheet and draws it where asked', () =>
  {
    // Arrange: A5's twelfth tile sits in the fourth column of the sheet's second row.
    const { context, drawn } = recordingContext();

    // Act.
    drawTile(context, sheetsWithout(), TileId.A5 + 11, 10, 20, 48);

    // Assert.
    expect(drawn)
      .toStrictEqual([ [ 'A5', 144, 48, 48, 48, 10, 20, 48, 48 ] ]);
  });

  it('scales the picture to the size asked for, cutting the same part of the sheet', () =>
  {
    // Arrange.
    const { context, drawn } = recordingContext();

    // Act.
    drawTile(context, sheetsWithout(), TileId.A5 + 11, 10, 20, 24);

    // Assert.
    expect(drawn)
      .toStrictEqual([ [ 'A5', 144, 48, 48, 48, 10, 20, 24, 24 ] ]);
  });

  it('draws an autotile as the four quarters its shape names, from its kind\'s block', () =>
  {
    // Arrange: A2's second kind in its palette shape, the sample tile at the top-left of its block.
    const { context, drawn } = recordingContext();

    // Act.
    drawTile(context, sheetsWithout(), makeAutotileId(17, 47), 0, 0, 48);

    // Assert: kind 17's block starts two tiles in.
    expect(drawn)
      .toStrictEqual([
        [ 'A2', 96, 0, 24, 24, 0, 0, 24, 24 ],
        [ 'A2', 120, 0, 24, 24, 24, 0, 24, 24 ],
        [ 'A2', 96, 24, 24, 24, 0, 24, 24, 24 ],
        [ 'A2', 120, 24, 24, 24, 24, 24, 24, 24 ],
      ]);
  });

  it('draws nothing from a sheet the tileset lacks', () =>
  {
    // Arrange.
    const { context, drawn } = recordingContext();

    // Act.
    drawTile(context, sheetsWithout([ 'A5' ]), TileId.A5 + 11, 0, 0, 48);

    // Assert.
    expect(drawn)
      .toStrictEqual([]);
  });
});

describe('drawPatch', () =>
{
  it('draws each tile of a patch in its cell and nothing in an empty one', () =>
  {
    // Arrange: a patch two cells wide and two high, with its first and last cells painted.
    const { context, drawn } = recordingContext();
    const patch = { width: 2, height: 2, tiles: [ TileId.A5, 0, 0, TileId.A5 + 1 ] };

    // Act.
    drawPatch(context, sheetsWithout(), patch, 32);

    // Assert.
    expect(drawn)
      .toStrictEqual([ [ 'A5', 0, 0, 48, 48, 0, 0, 32, 32 ], [ 'A5', 48, 0, 48, 48, 32, 32, 32, 32 ] ]);
  });
});

describe('drawRegion', () =>
{
  /**
   * A stand-in context recording the text it writes and whether it drew lines.
   * @returns {{ context: RegionContext, texts: string[], lines: number[] }} The context and its record.
   */
  const regionContext = () =>
  {
    const texts: string[] = [];
    const lines: number[] = [];
    const context = {
      fillRect: () => undefined,
      strokeRect: () => undefined,
      fillText: (text: string) => texts.push(text),
      strokeText: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => lines.push(1),
      stroke: () => undefined,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'top',
    } as unknown as RegionContext;
    return { context, texts, lines };
  };

  it('writes a region\'s number on its cell', () =>
  {
    // Arrange.
    const { context, texts, lines } = regionContext();

    // Act.
    drawRegion(context, 7, 0, 0, 32);

    // Assert.
    expect([ texts, lines.length ])
      .toStrictEqual([ [ '7' ], 0 ]);
  });

  it('crosses out region 0, which clears a cell\'s region, and writes no number', () =>
  {
    // Arrange.
    const { context, texts, lines } = regionContext();

    // Act.
    drawRegion(context, 0, 0, 0, 32);

    // Assert.
    expect([ texts, lines.length ])
      .toStrictEqual([ [], 2 ]);
  });
});
