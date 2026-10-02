import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARKER_STYLES, MARKER_SYMBOLS } from '../../../../src/mapEditor/core/eventKinds/eventMarkers.ts';
import { MARKER_GLYPHS } from '../../../../src/mapEditor/core/eventKinds/markerGlyphs.ts';
import {
  drawMarkerAtlas,
  MARKER_CELL,
  MARKER_COLUMNS,
  MARKER_ROWS,
  MARKER_SQUARE,
  markerFrame,
  markerScale,
  markerSpriteScale,
} from '../../../../src/mapEditor/render/scene/markerAtlas.ts';

/*
 * Every marker on a map is cut from one atlas, so they all draw together, and each symbol owns one frame of it: frames
 * that overlapped, or ran off the atlas, would cut one symbol's marker with another's edge. The atlas draws each
 * symbol's square in that symbol's colour, and its glyph filled even-odd, inside its own frame.
 *
 * A marker's square is 40 world pixels across, a little smaller than its 48-pixel tile, down to 50% zoom, where it is
 * 20 pixels on screen; further out it stops shrinking, keeping 20 pixels so its symbol can still be read, and so draws
 * bigger than its own size by however much the zoom fell short.
 */
describe('markerAtlas', () =>
{
  afterEach(() =>
  {
    vi.unstubAllGlobals();
  });

  describe('markerFrame', () =>
  {
    it('gives every symbol its own frame, a row of four at a time, all inside the atlas', () =>
    {
      // Arrange: every symbol.

      // Act.
      const frames = MARKER_SYMBOLS.map(markerFrame);

      // Assert: eleven frames at distinct places, the first row's four across the top, none past the atlas's edge.
      const places = new Set(frames.map(frame => `${frame.x},${frame.y}`));
      const inside = frames.every(frame => frame.x + frame.width <= MARKER_COLUMNS * MARKER_CELL && frame.y + frame.height <= MARKER_ROWS * MARKER_CELL);
      expect([ places.size, frames.slice(0, 5).map(frame => [ frame.x, frame.y ]), inside ])
        .toStrictEqual([ 11, [ [ 0, 0 ], [ 128, 0 ], [ 256, 0 ], [ 384, 0 ], [ 0, 128 ] ], true ]);
    });
  });

  describe('markerScale', () =>
  {
    it('keeps a marker its own size from 50% zoom in, and grows it further out to stay 20 pixels on screen', () =>
    {
      // Arrange: closer than the game's scale, the game's scale, just at 50%, then a quarter and a tenth.
      const zooms = [ 2, 1, 0.5, 0.25, 0.1 ];

      // Act.
      const scales = zooms.map(markerScale);

      // Assert: the square on screen is 40 times the zoom times the scale: 80, 40, 20, 20 and 20 pixels.
      expect([ scales, zooms.map((zoom, index) => Math.round(40 * zoom * scales[index])) ])
        .toStrictEqual([ [ 1, 1, 1, 2, 5 ], [ 80, 40, 20, 20, 20 ] ]);
    });
  });

  describe('markerSpriteScale', () =>
  {
    it('draws the atlas\'s 112-pixel square 40 world pixels across, times how much bigger the marker draws', () =>
    {
      // Arrange: its own size, and twice it.
      const scales = [ 1, 2 ];

      // Act.
      const squares = scales.map(scale => markerSpriteScale(scale) * MARKER_SQUARE);

      // Assert.
      expect(squares.map(square => Math.round(square * 1000) / 1000))
        .toStrictEqual([ 40, 80 ]);
    });
  });

  describe('drawMarkerAtlas', () =>
  {
    /**
     * What a stand-in canvas records of one drawing call: its name, its numbers, and the colour or rule in force.
     */
    type Call = { readonly name: string; readonly values: readonly (number | string)[]; readonly style: string };

    /**
     * Builds a document whose canvases record every square and glyph drawn on them.
     * @param {Call[]} calls Where the calls go.
     * @returns {Document} The document.
     */
    const recordingDocument = (calls: Call[]): Document =>
    {
      const context = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        lineJoin: '',
        offset: [ 0, 0 ],
        beginPath: () => undefined,
        roundRect(x: number, y: number, width: number, height: number)
        {
          calls.push({ name: 'square', values: [ x, y, width, height ], style: '' });
        },
        fill(path?: { d: string }, rule?: string)
        {
          calls.push(path === undefined
            ? { name: 'fill', values: [], style: this.fillStyle }
            : { name: 'glyph', values: [ path.d, rule ?? '', ...this.offset ], style: this.fillStyle });
        },
        stroke: () => undefined,
        save: () => undefined,
        restore: () => undefined,
        translate(x: number, y: number)
        {
          this.offset = [ x, y ];
        },
        scale: () => undefined,
      };
      return { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
    };

    it('draws every symbol\'s square in its colour inside its own frame, with its glyph filled even-odd in the middle', () =>
    {
      // Arrange: a canvas recording what is drawn, and paths that remember their data.
      vi.stubGlobal('Path2D', class
      {
        readonly d: string;

        constructor(d: string)
        {
          this.d = d;
        }
      });
      const calls: Call[] = [];

      // Act.
      const canvas = drawMarkerAtlas(recordingDocument(calls));

      // Assert: the atlas is 512 square; the chest, first, fills its square brown from 11.5 in, then its glyph in white
      // even-odd, centred; and every symbol gets one square and one glyph, in its own frame.
      const squares = calls.filter(call => call.name === 'square');
      const fills = calls.filter(call => call.name === 'fill').map(call => call.style);
      const glyphs = calls.filter(call => call.name === 'glyph');
      expect([
        canvas.width,
        canvas.height,
        squares[0].values,
        fills[0],
        glyphs[0].values.slice(0, 2),
        glyphs[0].style,
        squares.map(call => [ Math.floor(Number(call.values[0]) / 128), Math.floor(Number(call.values[1]) / 128) ]),
        fills,
        glyphs.map(call => call.values[0]),
      ])
        .toStrictEqual([
          512,
          512,
          [ 11.5, 11.5, 105, 105 ],
          '#795548',
          [ MARKER_GLYPHS.chest, 'evenodd' ],
          '#ffffff',
          MARKER_SYMBOLS.map(symbol => [ markerFrame(symbol).x / 128, markerFrame(symbol).y / 128 ]),
          MARKER_SYMBOLS.map(symbol => MARKER_STYLES[symbol].colour),
          MARKER_SYMBOLS.map(symbol => MARKER_GLYPHS[symbol]),
        ]);
    });
  });
});
