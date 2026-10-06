import { describe, expect, it } from 'vitest';
import {
  ascendingByPriority,
  composeAmbientColor,
  composeDarkness,
  hasMask,
  maskTintFor,
  priorityOf,
  rgbOf,
  type AmbientDeclaration,
} from '../../../../src/mapEditor/modules/lighting/lightingComposition.ts';

/*
 * The map's darkness is composed as J-Lighting's ScreenLightingComposer composes the screen's, so the editor's dark and
 * the game's are the same number. Darkness compounds: each source takes its share of whatever light reached it, so 30%
 * and 40% make 58%, never 70%, whichever way round they come. The colour of the dark belongs to whoever named one, and
 * among those to the most assertive source (an event command over the clock over a map), so a clock that only knows how
 * dark it is never paints a teal cave black; with nobody naming one, the dark is black. A source's rank is read from
 * its kind, the part of its key before any colon, and a kind J-Lighting does not rank ranks lowest.
 *
 * The mask is filled with the share of each channel the map keeps, rounded exactly as LightingRenderLayer rounds it, and
 * only a stated darkness earns a mask at all.
 */

/**
 * One source's darkness.
 * @param {number} darkness How much light it takes, 0 to 1.
 * @param {string} source Who declares it.
 * @param {readonly [number, number, number] | null} color The colour it names, or null when it names none.
 * @returns {AmbientDeclaration} The declaration.
 */
const declared = (darkness: number, source: string, color: readonly [ number, number, number ] | null = null): AmbientDeclaration =>
{
  return { darkness, color: color ?? [ 0, 0, 0 ], declaresColor: color !== null, source };
};

describe('lightingComposition', () =>
{
  describe('rgbOf', () =>
  {
    it('splits a colour of six digits into its channels, whatever their case', () =>
    {
      // Arrange.
      const colours = [ '#0a2a2a', '#FFBB73' ];

      // Act.
      const channels = colours.map(rgbOf);

      // Assert.
      expect(channels)
        .toStrictEqual([ [ 10, 42, 42 ], [ 255, 187, 115 ] ]);
    });

    it('doubles each digit of a shorthand colour', () =>
    {
      // Arrange.
      const shorthand = '#fb7';

      // Act.
      const channels = rgbOf(shorthand);

      // Assert.
      expect(channels)
        .toStrictEqual([ 255, 187, 119 ]);
    });
  });

  describe('priorityOf', () =>
  {
    it('ranks each kind of source as the composer does, an event command highest and a map lowest', () =>
    {
      // Arrange.
      const sources = [ 'command', 'time', 'player', 'page', 'map' ];

      // Act.
      const ranks = sources.map(priorityOf);

      // Assert.
      expect(ranks)
        .toStrictEqual([ 5, 4, 3, 2, 1 ]);
    });

    it('ranks a source by its kind before the colon, so every event\'s page ranks alike', () =>
    {
      // Arrange: two events' pages, and a key that only starts with a kind's name.
      const sources = [ 'page:12', 'page:3', 'pages:1' ];

      // Act.
      const ranks = sources.map(priorityOf);

      // Assert.
      expect(ranks)
        .toStrictEqual([ 2, 2, 0 ]);
    });
  });

  describe('ascendingByPriority', () =>
  {
    it('puts the least assertive source first, keeping the order given between equals', () =>
    {
      // Arrange: a command, two pages in that order, the clock and the map.
      const declarations = [
        declared(0.1, 'command'),
        declared(0.2, 'page:2'),
        declared(0.3, 'time'),
        declared(0.4, 'page:1'),
        declared(0.5, 'map'),
      ];

      // Act.
      const ordered = ascendingByPriority(declarations).map(declaration => declaration.source);

      // Assert.
      expect(ordered)
        .toStrictEqual([ 'map', 'page:2', 'page:1', 'time', 'command' ]);
    });
  });

  describe('composeDarkness', () =>
  {
    it('takes nothing away when nothing says the map is dark', () =>
    {
      // Arrange: no sources.

      // Act.
      const darkness = composeDarkness([]);

      // Assert.
      expect(darkness)
        .toBe(0);
    });

    it('keeps one source\'s darkness as it is', () =>
    {
      // Arrange: a cave at 85%.
      const cave = [ declared(0.85, 'map') ];

      // Act.
      const darkness = composeDarkness(cave);

      // Assert.
      expect(darkness)
        .toBe(0.85);
    });

    it('compounds two sources, so 30% and 40% make 58% whichever way round they come', () =>
    {
      // Arrange: a map at 30% and an hour at 40%, listed both ways.
      const mapFirst = [ declared(0.3, 'map'), declared(0.4, 'time') ];
      const clockFirst = [ declared(0.4, 'time'), declared(0.3, 'map') ];

      // Act.
      const darkness = [ composeDarkness(mapFirst), composeDarkness(clockFirst) ];

      // Assert.
      expect(darkness)
        .toStrictEqual([ 0.5800000000000001, 0.5800000000000001 ]);
    });
  });

  describe('composeAmbientColor', () =>
  {
    it('leaves the dark black when no source names a colour', () =>
    {
      // Arrange: a map naming none, and a clock naming none.
      const declarations = [ declared(0.85, 'map'), declared(0.4, 'time') ];

      // Act.
      const color = composeAmbientColor(declarations);

      // Assert.
      expect(color)
        .toStrictEqual([ 0, 0, 0 ]);
    });

    it('keeps the colour a map names when the clock, which outranks it, names none', () =>
    {
      // Arrange: a teal cave, and a clock carrying a colour it never named.
      const declarations = [ declared(0.85, 'map', [ 10, 42, 42 ]), { ...declared(0.4, 'time'), color: [ 9, 9, 9 ] as const } ];

      // Act.
      const color = composeAmbientColor(declarations);

      // Assert.
      expect(color)
        .toStrictEqual([ 10, 42, 42 ]);
    });

    it('gives the colour to the most assertive source naming one, whichever way round they come', () =>
    {
      // Arrange: a teal map and a red command, listed both ways.
      const mapFirst = [ declared(0.85, 'map', [ 10, 42, 42 ]), declared(0.5, 'command', [ 128, 0, 0 ]) ];
      const commandFirst = [ declared(0.5, 'command', [ 128, 0, 0 ]), declared(0.85, 'map', [ 10, 42, 42 ]) ];

      // Act.
      const colours = [ composeAmbientColor(mapFirst), composeAmbientColor(commandFirst) ];

      // Assert.
      expect(colours)
        .toStrictEqual([ [ 128, 0, 0 ], [ 128, 0, 0 ] ]);
    });
  });

  describe('hasMask', () =>
  {
    it('draws a mask only where some darkness was stated', () =>
    {
      // Arrange: none at all, and the least there can be.
      const darkness = [ 0, 0.01 ];

      // Act.
      const masked = darkness.map(hasMask);

      // Assert.
      expect(masked)
        .toStrictEqual([ false, true ]);
    });
  });

  describe('maskTintFor', () =>
  {
    it('fills the mask with the share of each channel the map keeps, rounded as the game rounds it', () =>
    {
      // Arrange: 85% black, 85% teal, 93% black, and half dark in a colour of three different channels.
      const asked: [ number, readonly [ number, number, number ] ][] = [
        [ 0.85, [ 0, 0, 0 ] ],
        [ 0.85, [ 10, 42, 42 ] ],
        [ 0.93, [ 0, 0, 0 ] ],
        [ 0.5, [ 255, 0, 128 ] ],
      ];

      // Act.
      const tints = asked.map(([ darkness, color ]) => maskTintFor(darkness, color));

      // Assert.
      expect(tints)
        .toStrictEqual([ 0x262626, 0x2f4a4a, 0x121212, 0xff80c0 ]);
    });

    it('keeps everything with no darkness, and only the dark\'s own colour at pitch black', () =>
    {
      // Arrange: a teal dark, at none and at all.
      const teal = [ 10, 42, 42 ] as const;

      // Act.
      const tints = [ maskTintFor(0, teal), maskTintFor(1, teal) ];

      // Assert.
      expect(tints)
        .toStrictEqual([ 0xffffff, 0x0a2a2a ]);
    });
  });
});
