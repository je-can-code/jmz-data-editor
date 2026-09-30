import { EMPTY_BRUSH, type PaletteBrush } from './paintSelection.ts';
import { PALETTE_COLUMNS, rectCells, type PaletteLayout, type PaletteRect } from './paletteLayout.ts';
import type { PassageDirection } from './tileFlags.ts';

/**
 * The smallest and largest a palette cell is drawn, in CSS pixels: never so small a tile cannot be made out, and never
 * past the size the sheets are drawn at, so a wide panel never blurs its tiles.
 */
const MIN_CELL_SIZE = 16;
const MAX_CELL_SIZE = 48;

/**
 * How much of a cell the "goes on top" badge takes, in its top-right corner, and the least it ever takes, so it stays
 * clickable on small cells.
 */
const BADGE_SHARE = 0.34;
const MIN_BADGE_SIZE = 10;

/**
 * A palette cell by column and row.
 */
type PaletteCellPosition = {
  readonly column: number;
  readonly row: number;
};

/**
 * Works out how big to draw each palette cell so eight fit across the width the palette has.
 * @param {number} width The width available, in CSS pixels.
 * @returns {number} The cell size, a whole number of pixels between the smallest and the largest.
 */
const paletteCellSize = (width: number): number =>
{
  return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, Math.floor(width / PALETTE_COLUMNS)));
};

/**
 * Finds the cell under a point on the palette.
 * @param {PaletteLayout} layout The tab on show.
 * @param {number} x The point across, from the palette's left edge.
 * @param {number} y The point down, from its top edge.
 * @param {number} size The cell size.
 * @returns {PaletteCellPosition | null} The cell, or null off the tab's cells.
 */
const cellAtPoint = (layout: PaletteLayout, x: number, y: number, size: number): PaletteCellPosition | null =>
{
  const column = Math.floor(x / size);
  const row = Math.floor(y / size);
  if (x < 0 || y < 0 || column >= PALETTE_COLUMNS || row >= layout.rows)
  {
    return null;
  }

  return { column, row };
};

/**
 * Works out how big the "goes on top" badge is drawn in a cell.
 * @param {number} size The cell size.
 * @returns {number} The badge's side, in pixels.
 */
const badgeSize = (size: number): number =>
{
  return Math.max(MIN_BADGE_SIZE, Math.round(size * BADGE_SHARE));
};

/**
 * Reports whether a point falls on the "goes on top" badge of the cell under it: the square in the cell's top-right
 * corner, where a click toggles the mark rather than picking the tile.
 * @param {number} x The point across, from the palette's left edge.
 * @param {number} y The point down, from its top edge.
 * @param {number} size The cell size.
 * @returns {boolean} True on the badge.
 */
const isOnBadge = (x: number, y: number, size: number): boolean =>
{
  const badge = badgeSize(size);
  const inX = x - Math.floor(x / size) * size;
  const inY = y - Math.floor(y / size) * size;
  return inX >= size - badge && inY < badge;
};

/**
 * Works out which way out of a tile a click in the passability editor means: the edge of the cell nearest the point,
 * as MZ draws an arrow at each edge. A tie between two edges goes to the one listed first, down, left, right, up.
 * @param {number} x The point across, from the palette's left edge.
 * @param {number} y The point down, from its top edge.
 * @param {number} size The cell size.
 * @returns {PassageDirection} The way out.
 */
const edgeAtPoint = (x: number, y: number, size: number): PassageDirection =>
{
  const inX = x - Math.floor(x / size) * size;
  const inY = y - Math.floor(y / size) * size;
  const distances: readonly (readonly [ PassageDirection, number ])[] = [
    [ 'down', size - inY ],
    [ 'left', inX ],
    [ 'right', size - inX ],
    [ 'up', inY ],
  ];

  return distances.reduce((nearest, each) => (each[1] < nearest[1] ? each : nearest))[0];
};

/**
 * Builds the brush a rectangle of the palette makes: region ids from the regions tab, tile ids from any other, and
 * nothing when no rectangle is chosen.
 * @param {PaletteLayout} layout The tab on show.
 * @param {PaletteRect | null} rect The rectangle chosen, or null for none.
 * @param {number} tilesetId The tileset on show.
 * @returns {PaletteBrush} The brush; {@link EMPTY_BRUSH} when nothing is chosen.
 */
const brushFromRect = (layout: PaletteLayout, rect: PaletteRect | null, tilesetId: number): PaletteBrush =>
{
  if (rect === null)
  {
    return EMPTY_BRUSH;
  }

  const kind = layout.tab === 'R'
    ? 'regions'
    : 'tiles';
  return { kind, tilesetId, ...rectCells(layout, rect) };
};

export { badgeSize, brushFromRect, cellAtPoint, edgeAtPoint, isOnBadge, MAX_CELL_SIZE, MIN_CELL_SIZE, paletteCellSize };
export type { PaletteCellPosition };
