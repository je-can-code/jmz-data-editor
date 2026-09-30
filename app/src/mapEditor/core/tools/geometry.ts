import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';

/**
 * How far inside its rectangle an ellipse's edge sits, in cells. A cell belongs to the ellipse when its centre does,
 * and measuring against an edge a quarter cell in keeps small ellipses round: a 3 by 3 ellipse is a plus rather than
 * the whole square, and a 4 by 4 one loses its corners, while a one-cell-wide ellipse is still a full line.
 */
const ELLIPSE_INSET = 0.25;

/**
 * Lists the cells on a straight line between two cells, both ends included, stepping one cell at a time so a stroke
 * dragged faster than the pointer reports leaves no gaps.
 * @param {MapCell} from Where the line starts.
 * @param {MapCell} to Where it ends.
 * @returns {MapCell[]} The cells, from start to end.
 */
const cellsOnLine = (from: MapCell, to: MapCell): MapCell[] =>
{
  const cells: MapCell[] = [];
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  let { x, y } = from;

  // Bresenham's walk: each step moves across, down, or both, whichever keeps closest to the true line.
  for (;;)
  {
    cells.push({ x, y });
    if (x === to.x && y === to.y)
    {
      return cells;
    }

    const doubled = error * 2;
    if (doubled >= dy)
    {
      error += dy;
      x += stepX;
    }

    if (doubled <= dx)
    {
      error += dx;
      y += stepY;
    }
  }
};

/**
 * Finds the rectangle two cells span, whichever corners they are.
 * @param {MapCell} a One corner.
 * @param {MapCell} b The opposite corner.
 * @returns {CellRect} The rectangle, both corners inside it.
 */
const rectangleBetween = (a: MapCell, b: MapCell): CellRect =>
{
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 };
};

/**
 * Lists the cells inside a rectangle, row by row.
 * @param {CellRect} rect The rectangle.
 * @returns {MapCell[]} The cells.
 */
const cellsInRect = (rect: CellRect): MapCell[] =>
{
  const { x: left, y: top, width, height } = rect;
  const cells: MapCell[] = [];
  for (let y = top; y < top + height; y++)
  {
    for (let x = left; x < left + width; x++)
    {
      cells.push({ x, y });
    }
  }

  return cells;
};

/**
 * Lists the cells of the filled ellipse inside a rectangle, row by row: every cell whose centre lies within an ellipse
 * a quarter cell inside the rectangle's edges (see {@link ELLIPSE_INSET}).
 * @param {CellRect} rect The rectangle the ellipse fills.
 * @returns {MapCell[]} The cells.
 */
const cellsInEllipse = (rect: CellRect): MapCell[] =>
{
  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;

  // half a cell is the least radius, so a one-cell-wide ellipse still takes its whole row or column.
  const radiusX = Math.max(0.5, rect.width / 2 - ELLIPSE_INSET);
  const radiusY = Math.max(0.5, rect.height / 2 - ELLIPSE_INSET);
  return cellsInRect(rect).filter(({ x, y }) =>
  {
    const across = (x + 0.5 - centreX) / radiusX;
    const down = (y + 0.5 - centreY) / radiusY;
    return across * across + down * down <= 1;
  });
};

/**
 * Cuts a rectangle down to the part inside a map.
 * @param {CellRect} rect The rectangle.
 * @param {number} width The map's width.
 * @param {number} height The map's height.
 * @returns {CellRect | null} The part on the map, or null when none of it is.
 */
const clipRect = (rect: CellRect, width: number, height: number): CellRect | null =>
{
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(width, rect.x + rect.width);
  const bottom = Math.min(height, rect.y + rect.height);
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
};

/**
 * Reports whether a cell lies inside a rectangle.
 * @param {CellRect} rect The rectangle.
 * @param {MapCell} cell The cell.
 * @returns {boolean} True when it is inside.
 */
const rectContains = (rect: CellRect, cell: MapCell): boolean =>
{
  return cell.x >= rect.x && cell.y >= rect.y && cell.x < rect.x + rect.width && cell.y < rect.y + rect.height;
};

export { cellsInEllipse, cellsInRect, cellsOnLine, clipRect, ELLIPSE_INSET, rectangleBetween, rectContains };
