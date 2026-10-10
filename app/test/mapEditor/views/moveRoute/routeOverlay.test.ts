import { describe, expect, it } from 'vitest';
import type { RouteWalk, WalkStep, Walker } from '../../../../src/mapEditor/core/moveRoutes/routeWalk.ts';
import type { OverlayPainter, OverlayStyle } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { drawRouteWalk, RouteColour } from '../../../../src/mapEditor/views/moveRoute/routeOverlay.ts';

/*
 * The preview draws a route as the author reads a path: a line from tile to tile with an arrowhead where each step
 * lands, an arc for a leap, a red cross on the tile a wall kept the walker out of, and a question mark above a step
 * that turns on the dice or the player, then a ring where the walk ends. Turns, waits and settings draw nothing; nor
 * does a step that wraps around a looping map, which would draw a line across the whole map; nor does a walk with no
 * steps at all.
 */
describe('drawRouteWalk', () =>
{
  /**
   * The tile size the preview draws at.
   */
  const TILE = 48;

  /**
   * A painter recording every shape drawn, by kind, with its colour.
   * @returns {{ painter: OverlayPainter, drawn: string[] }} The painter, and what it drew.
   */
  const recorder = () =>
  {
    const drawn: string[] = [];
    const colour = (style: OverlayStyle) => (style.stroke ?? style.fill ?? 0).toString(16);
    const painter: OverlayPainter = {
      circle: (x, y, radius, style) => drawn.push(`circle ${x},${y} ${radius} ${colour(style)}`),
      rect: (_x, _y, _width, _height, style) => drawn.push(`rect ${colour(style)}`),
      line: (x1, y1, x2, y2, style) => drawn.push(`line ${Math.round(x1)},${Math.round(y1)}>${Math.round(x2)},${Math.round(y2)} ${colour(style)}`),
      text: (_x, _y, text, style) => drawn.push(`text ${text} ${colour(style)}`),
    };
    return { painter, drawn };
  };

  /**
   * The walker where a walk ends.
   * @param {number} x The column.
   * @param {number} y The row.
   * @returns {Walker} The walker.
   */
  const at = (x: number, y: number): Walker => ({ x, y, facing: 2, directionFix: false, through: false });

  /**
   * Builds a step.
   * @param {WalkStep['kind']} kind What it was.
   * @param {[ number, number ]} from Where it started.
   * @param {[ number, number ]} to Where it left the walker.
   * @param {[ number, number ] | null} blocked The tile a wall kept it out of, or null.
   * @returns {WalkStep} The step.
   */
  const step = (kind: WalkStep['kind'], from: [ number, number ], to: [ number, number ], blocked: [ number, number ] | null = null): WalkStep => ({
    index: 0,
    kind,
    from: { x: from[0], y: from[1] },
    to: { x: to[0], y: to[1] },
    facing: 2,
    blocked: blocked === null ? null : { x: blocked[0], y: blocked[1] },
  });

  /**
   * Builds a walk ending at a tile.
   * @param {readonly WalkStep[]} steps The steps.
   * @param {[ number, number ]} end Where it ends.
   * @returns {RouteWalk} The walk.
   */
  const walkOf = (steps: readonly WalkStep[], end: [ number, number ]): RouteWalk => ({ steps, end: at(end[0], end[1]), stuck: false });

  const path = RouteColour.path.toString(16);

  it('draws a step to the next tile as a line with an arrowhead, then rings the end', () =>
  {
    // Arrange: one step right, from 1, 1 to 2, 1.
    const { painter, drawn } = recorder();

    // Act.
    drawRouteWalk(painter, walkOf([ step('move', [ 1, 1 ], [ 2, 1 ]) ], [ 2, 1 ]), TILE);

    // Assert: the line between the middles, two wings at its tip, and the ring.
    expect([ drawn[0], drawn.length, drawn.filter(shape => shape.startsWith(`line 120,72>`)).length, drawn.at(-1) ])
      .toStrictEqual([ `line 72,72>120,72 ${path}`, 4, 2, `circle 120,72 8.64 ${path}` ]);
  });

  it('draws a leap as an arc of short lines with an arrowhead where it lands', () =>
  {
    // Arrange: a leap of two tiles right.
    const { painter, drawn } = recorder();

    // Act.
    drawRouteWalk(painter, walkOf([ step('jump', [ 1, 1 ], [ 3, 1 ]) ], [ 3, 1 ]), TILE);

    // Assert: eight short lines and two wings, rising well above the straight way at y 72, ending where it lands.
    const lines = drawn.filter(shape => shape.startsWith('line'));
    const highest = Math.min(...lines.map(shape => Number(/>\d+,(-?\d+)/u.exec(shape)?.[1])));
    expect([ lines.length, highest < 40, lines.some(shape => shape.includes('>168,72')), drawn.at(-1) ])
      .toStrictEqual([ 10, true, true, `circle 168,72 8.64 ${path}` ]);
  });

  it('draws a red cross on the tile a wall kept the walker out of, and no line', () =>
  {
    // Arrange: a step right refused by a wall at 2, 1.
    const { painter, drawn } = recorder();

    // Act.
    drawRouteWalk(painter, walkOf([ step('move', [ 1, 1 ], [ 1, 1 ], [ 2, 1 ]) ], [ 1, 1 ]), TILE);

    // Assert: two red lines crossing the wall's middle, then the ring where the walker stays.
    const stopped = RouteColour.stopped.toString(16);
    expect(drawn)
      .toStrictEqual([ `line 106,58>134,86 ${stopped}`, `line 106,86>134,58 ${stopped}`, `circle 72,72 8.64 ${path}` ]);
  });

  it('marks a guessed step with a question mark above where it happens', () =>
  {
    // Arrange: a move at random.
    const { painter, drawn } = recorder();

    // Act.
    drawRouteWalk(painter, walkOf([ step('guess', [ 1, 1 ], [ 1, 1 ]) ], [ 1, 1 ]), TILE);

    // Assert.
    expect(drawn)
      .toStrictEqual([ `text ? ${RouteColour.guess.toString(16)}`, `circle 72,72 8.64 ${path}` ]);
  });

  it('draws nothing for turns, waits and settings, nor for a step wrapping around a looping map', () =>
  {
    // Arrange: a turn, a wait, and a step wrapping from the right edge to the left one.
    const { painter, drawn } = recorder();
    const steps = [ step('turn', [ 1, 1 ], [ 1, 1 ]), step('other', [ 1, 1 ], [ 1, 1 ]), step('move', [ 4, 1 ], [ 0, 1 ]) ];

    // Act.
    drawRouteWalk(painter, walkOf(steps, [ 0, 1 ]), TILE);

    // Assert: only the ring where it ends.
    expect(drawn)
      .toStrictEqual([ `circle 24,72 8.64 ${path}` ]);
  });

  it('draws nothing at all for a walk with no steps', () =>
  {
    // Arrange.
    const { painter, drawn } = recorder();

    // Act.
    drawRouteWalk(painter, walkOf([], [ 1, 1 ]), TILE);

    // Assert.
    expect(drawn)
      .toStrictEqual([]);
  });
});
