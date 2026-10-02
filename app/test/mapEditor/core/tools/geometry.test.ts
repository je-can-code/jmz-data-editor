import { describe, expect, it } from 'vitest';
import {
  cellsInEllipse,
  cellsInRect,
  cellsOnLine,
  clipRect,
  rectangleBetween,
  rectContains,
} from '../../../../src/mapEditor/core/tools/geometry.ts';

/*
 * The shapes the tools reach.
 *
 * A pen stroke dragged faster than the pointer reports must still paint every cell in between, so the line walk
 * steps one cell at a time with no gaps; the rectangle and ellipse tools paint the cells their shape covers, whichever
 * way they were dragged, with small ellipses rounding off rather than filling their whole rectangle; and anything
 * hanging off the map is cut back to the part on it.
 */
describe('cellsOnLine', () =>
{
  it('walks a straight line one cell at a time, both ends included', () =>
  {
    // Arrange.
    const from = { x: 0, y: 0 };
    const to = { x: 3, y: 0 };

    // Act.
    const cells = cellsOnLine(from, to);

    // Assert.
    expect(cells)
      .toEqual([ { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 } ]);
  });

  it('walks a slope with no gaps, every step touching the last', () =>
  {
    // Arrange: a line going back and up, steeper than it is wide.
    const from = { x: 5, y: 9 };
    const to = { x: 3, y: 2 };

    // Act.
    const cells = cellsOnLine(from, to);

    // Assert: eight cells from 9 up to 2, each within one step of the one before.
    const steps = cells.slice(1).map((cell, index) => Math.max(Math.abs(cell.x - cells[index].x), Math.abs(cell.y - cells[index].y)));
    expect([ cells.length, cells[0], cells[cells.length - 1], steps.every(step => step === 1) ])
      .toEqual([ 8, { x: 5, y: 9 }, { x: 3, y: 2 }, true ]);
  });

  it('answers the one cell for a line that goes nowhere', () =>
  {
    // Arrange.
    const cell = { x: 4, y: 4 };

    // Act.
    const cells = cellsOnLine(cell, cell);

    // Assert.
    expect(cells)
      .toEqual([ { x: 4, y: 4 } ]);
  });
});

describe('rectangleBetween', () =>
{
  it('spans two cells whichever corners they are', () =>
  {
    // Arrange: bottom-right first, then top-left.
    const a = { x: 6, y: 5 };
    const b = { x: 2, y: 3 };

    // Act.
    const rect = rectangleBetween(a, b);

    // Assert.
    expect(rect)
      .toEqual({ x: 2, y: 3, width: 5, height: 3 });
  });
});

describe('cellsInRect', () =>
{
  it('lists every cell row by row', () =>
  {
    // Arrange.
    const rect = { x: 1, y: 1, width: 2, height: 2 };

    // Act.
    const cells = cellsInRect(rect);

    // Assert.
    expect(cells)
      .toEqual([ { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 } ]);
  });
});

describe('cellsInEllipse', () =>
{
  it('rounds a 3 by 3 ellipse into a plus, and a 4 by 4 one loses its corners', () =>
  {
    // Arrange.
    const three = { x: 0, y: 0, width: 3, height: 3 };
    const four = { x: 0, y: 0, width: 4, height: 4 };

    // Act.
    const plus = cellsInEllipse(three).map(({ x, y }) => `${x},${y}`);
    const round = cellsInEllipse(four).map(({ x, y }) => `${x},${y}`);

    // Assert.
    expect([ plus, round.length, round.includes('0,0'), round.includes('1,0') ])
      .toEqual([ [ '1,0', '0,1', '1,1', '2,1', '1,2' ], 12, false, true ]);
  });

  it('fills a one-cell-wide ellipse as a full line, and a 2 by 2 one whole', () =>
  {
    // Arrange.
    const line = { x: 3, y: 0, width: 1, height: 4 };
    const square = { x: 0, y: 0, width: 2, height: 2 };

    // Act.
    const lineCells = cellsInEllipse(line);
    const squareCells = cellsInEllipse(square);

    // Assert.
    expect([ lineCells.length, squareCells.length ])
      .toEqual([ 4, 4 ]);
  });
});

describe('clipRect', () =>
{
  it('cuts a rectangle back to the part on the map', () =>
  {
    // Arrange: a 4x4 rectangle hanging off the top-left corner of a 10x8 map.
    const rect = { x: -2, y: -1, width: 4, height: 4 };

    // Act.
    const clipped = clipRect(rect, 10, 8);

    // Assert.
    expect(clipped)
      .toEqual({ x: 0, y: 0, width: 2, height: 3 });
  });

  it('answers null for a rectangle wholly off the map, while one touching its last cell stays', () =>
  {
    // Arrange: one just past the right edge, and one on the last column.
    const beyond = { x: 10, y: 0, width: 2, height: 2 };
    const edge = { x: 9, y: 0, width: 2, height: 2 };

    // Act.
    const clipped = [ clipRect(beyond, 10, 8), clipRect(edge, 10, 8) ];

    // Assert.
    expect(clipped)
      .toEqual([ null, { x: 9, y: 0, width: 1, height: 2 } ]);
  });
});

describe('rectContains', () =>
{
  it('holds the cells inside and not the one just past its edge', () =>
  {
    // Arrange.
    const rect = { x: 2, y: 2, width: 2, height: 2 };

    // Act.
    const inside = [ { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 1 } ].map(cell => rectContains(rect, cell));

    // Assert.
    expect(inside)
      .toEqual([ true, true, false, false ]);
  });
});
