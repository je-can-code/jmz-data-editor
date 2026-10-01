import { describe, expect, it } from 'vitest';
import { floodCells } from '../../../../src/mapEditor/core/tools/floodFill.ts';

/*
 * The paint bucket's spread.
 *
 * A fill must cover exactly the area the clicked cell belongs to and not one cell more: it crosses from cell to cell
 * only through a shared edge, so a diagonal line holds it back, and it never leaks past a cell that fails the test,
 * however the area winds. A click off the map fills nothing.
 */
describe('floodCells', () =>
{
  /**
   * Builds a test from a picture of the map, where '.' is the area to fill and anything else holds the fill back.
   * @param {string[]} rows The picture, one string per row.
   * @returns {(x: number, y: number) => boolean} The test.
   */
  const areaOf = (rows: string[]) => (x: number, y: number): boolean => rows[y][x] === '.';

  it('spreads through shared edges only, so a diagonal wall holds it back', () =>
  {
    // Arrange: a diagonal of walls splitting a 3x3 map; the corner cell beyond it must stay out.
    const rows = [
      '.#.',
      '#..',
      '...',
    ];

    // Act.
    const cells = floodCells(3, 3, { x: 0, y: 0 }, areaOf(rows));

    // Assert: the top-left cell alone; its diagonal neighbour across the wall is never reached.
    expect(cells)
      .toEqual([ { x: 0, y: 0 } ]);
  });

  it('follows a winding area to its end and leaves the cells outside it alone', () =>
  {
    // Arrange: a corridor that turns twice, beside a separate pocket of the same kind.
    const rows = [
      '...#.',
      '##.#.',
      '...#.',
    ];

    // Act.
    const cells = floodCells(5, 3, { x: 0, y: 0 }, areaOf(rows)).map(({ x, y }) => `${x},${y}`).sort();

    // Assert: the corridor's seven cells, and none of the pocket in the last column.
    expect(cells)
      .toEqual([ '0,0', '0,2', '1,0', '1,2', '2,0', '2,1', '2,2' ]);
  });

  it('includes the start even when the test would not, and nothing for a start off the map', () =>
  {
    // Arrange: a map where no cell passes the test.
    const never = () => false;

    // Act.
    const onMap = floodCells(2, 2, { x: 1, y: 1 }, never);
    const offMap = floodCells(2, 2, { x: 2, y: 0 }, never);

    // Assert.
    expect([ onMap, offMap ])
      .toEqual([ [ { x: 1, y: 1 } ], [] ]);
  });
});
