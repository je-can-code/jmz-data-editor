import { describe, expect, it } from 'vitest';
import { MARKER_SYMBOLS } from '../../../../src/mapEditor/core/eventKinds/eventMarkers.ts';
import { GLYPH_BOX, MARKER_GLYPHS } from '../../../../src/mapEditor/core/eventKinds/markerGlyphs.ts';

/*
 * The glyphs are path data in a 24 by 24 box, drawn by the map's marker atlas on a canvas and by the events list as SVG,
 * so a glyph that strays outside its box is clipped by the marker's rim on the map and spills out of its icon in the
 * list, and a shape left open fills differently in the two. Every symbol has a glyph of its own; every point a glyph
 * passes through (the ends of its lines and arcs, followed through relative moves as SVG reads them) stays inside the
 * box; and every shape is closed.
 */
describe('markerGlyphs', () =>
{
  /**
   * What walking a glyph's path found: every point its pen came to rest on, and whether each shape it began was closed.
   */
  type Walk = {
    readonly points: [ number, number ][];
    readonly shapes: number;
    readonly closed: number;
  };

  /**
   * How many numbers each path command takes.
   */
  const ARGUMENTS: Readonly<Record<string, number>> = { m: 2, l: 2, h: 1, v: 1, a: 7, z: 0 };

  /**
   * Walks SVG path data the way a browser reads it, absolute and relative commands alike, noting where the pen rests.
   * @param {string} path The path data.
   * @returns {Walk} What the walk found.
   */
  const walk = (path: string): Walk =>
  {
    const tokens = path.match(/[MLHVAZmlhvaz]|-?\d*\.?\d+/gu) ?? [];
    const points: [ number, number ][] = [];
    let x = 0;
    let y = 0;
    let shapes = 0;
    let closed = 0;
    let index = 0;
    while (index < tokens.length)
    {
      const command = tokens[index];
      const lower = command.toLowerCase();
      const relative = command === lower;
      const values = tokens.slice(index + 1, index + 1 + ARGUMENTS[lower]).map(Number);
      index += 1 + ARGUMENTS[lower];
      if (lower === 'z')
      {
        closed += 1;
        continue;
      }

      // an arc's end is its last two numbers; a line's or a move's, its two.
      const [ endX, endY ] = lower === 'a' ? values.slice(5) : values;
      if (lower === 'h')
      {
        x = relative ? x + values[0] : values[0];
      }
      else if (lower === 'v')
      {
        y = relative ? y + values[0] : values[0];
      }
      else
      {
        x = relative ? x + endX : endX;
        y = relative ? y + endY : endY;
      }

      shapes += lower === 'm' ? 1 : 0;
      points.push([ x, y ]);
    }

    return { points, shapes, closed };
  };

  it('gives every symbol a glyph of its own', () =>
  {
    // Arrange: every symbol.

    // Act.
    const glyphs = MARKER_SYMBOLS.map(symbol => MARKER_GLYPHS[symbol]);

    // Assert: eleven glyphs, all different, each starting with a move.
    expect([ glyphs.length, new Set(glyphs).size, glyphs.every(glyph => glyph.startsWith('M')) ])
      .toStrictEqual([ 11, 11, true ]);
  });

  it('keeps every point of every glyph inside its 24 by 24 box', () =>
  {
    // Arrange: every glyph, walked.
    const walks = MARKER_SYMBOLS.map(symbol => ({ symbol, walked: walk(MARKER_GLYPHS[symbol]) }));

    // Act.
    const strays = walks.flatMap(({ symbol, walked }) => walked.points
      .filter(([ x, y ]) => x < 0 || y < 0 || x > GLYPH_BOX || y > GLYPH_BOX)
      .map(point => `${symbol} ${point.join(',')}`));

    // Assert: points were found, and none strays.
    expect([ walks.every(({ walked }) => walked.points.length >= 3), strays ])
      .toStrictEqual([ true, [] ]);
  });

  it('closes every shape it begins', () =>
  {
    // Arrange: every glyph, walked.
    const walks = MARKER_SYMBOLS.map(symbol => walk(MARKER_GLYPHS[symbol]));

    // Act.
    const open = walks.filter(walked => walked.shapes !== walked.closed).length;

    // Assert: the chest's three shapes and the sun's nine are among them.
    expect([ open, walks[0].shapes, walks[MARKER_SYMBOLS.indexOf('light')].shapes ])
      .toStrictEqual([ 0, 3, 9 ]);
  });
});
