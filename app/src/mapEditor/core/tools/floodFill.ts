import type { MapCell } from '../renderer/camera.ts';

/**
 * Finds the cells a fill spreads over: from the start cell, through every cell that shares an edge with one already
 * reached and passes the test, as MZ's paint bucket spreads. Cells touching only at a corner are never crossed, so a
 * diagonal line of walls holds the fill back. The start cell itself is always included when it lies on the map.
 * @param {number} width The map's width in cells.
 * @param {number} height The map's height in cells.
 * @param {MapCell} start Where the fill starts.
 * @param {(x: number, y: number) => boolean} matches Whether a cell belongs to the same area as the start.
 * @returns {MapCell[]} The cells, in the order the fill reached them; empty when the start is off the map.
 */
const floodCells = (width: number, height: number, start: MapCell, matches: (x: number, y: number) => boolean): MapCell[] =>
{
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height)
  {
    return [];
  }

  const reached = new Uint8Array(width * height);
  const cells: MapCell[] = [ start ];
  reached[start.y * width + start.x] = 1;

  // walk the cells in the order they were reached, adding each unreached neighbour that belongs.
  for (let next = 0; next < cells.length; next++)
  {
    const { x, y } = cells[next];
    const neighbours: readonly (readonly [ number, number ])[] = [ [ x - 1, y ], [ x + 1, y ], [ x, y - 1 ], [ x, y + 1 ] ];
    neighbours.forEach(([ nx, ny ]) =>
    {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || reached[ny * width + nx] === 1)
      {
        return;
      }

      reached[ny * width + nx] = 1;
      if (matches(nx, ny))
      {
        cells.push({ x: nx, y: ny });
      }
    });
  }

  return cells;
};

export { floodCells };
