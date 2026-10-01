import { PALETTE_COLUMNS, type PaletteLayout, type PaletteRect } from '../../../core/palette/paletteLayout.ts';
import { badgeSize } from '../../../core/palette/paletteGeometry.ts';
import { passageStateOf, type FlagMode } from '../../../core/palette/passabilityEdits.ts';
import { FlagBit, PASSAGE_DIRECTIONS, shownFlags, terrainTagOf, type PassageDirection } from '../../../core/palette/tileFlags.ts';
import { TILE_SIZE } from '../../../core/renderer/camera.ts';
import type { TextureImage } from '../../../core/renderer/MapRenderer.ts';
import { isMarkedTile, type TilesetMarks } from '../../../core/tiles/tilesetMarks.ts';
import { isASheetTile } from '../../../core/tiles/tileRoles.ts';
import { drawRegion, drawTile } from '../../../render/tileCanvas.ts';

/**
 * The colours the palette draws its marks in.
 */
const PaletteColour = {
  selection: '#ffffff',
  selectionEdge: 'rgba(0, 0, 0, 0.9)',
  hover: 'rgba(255, 255, 255, 0.55)',
  section: 'rgba(255, 255, 255, 0.28)',
  badge: '#ffb300',
  badgeEdge: 'rgba(0, 0, 0, 0.75)',
  open: '#e8f5e9',
  blocked: '#ff5252',
  star: '#ffd740',
  on: '#4fc3f7',
  off: 'rgba(255, 255, 255, 0.45)',
  outline: 'rgba(0, 0, 0, 0.85)',
} as const;

/**
 * What the palette shows over its tiles, besides the tiles.
 */
type PaletteOverlays = {
  readonly selection: PaletteRect | null;
  readonly hover: { readonly column: number; readonly row: number; readonly onBadge: boolean } | null;

  /**
   * The tileset's "goes on top" marks, shown as badges; null where marks do not apply (every tab but A) or are not
   * loaded yet.
   */
  readonly marks: TilesetMarks | null;

  /**
   * The tileset's flags and the flags shown, while the passability editor is open; null while picking tiles.
   */
  readonly passability: { readonly flags: ArrayLike<number>; readonly mode: FlagMode } | null;
};

/**
 * Draws every cell of a tab at the sheets' own size onto a canvas of its own, once per tab and tileset, so hovering
 * and choosing only redraw the marks over it.
 * @param {Document} document The document to make the canvas in.
 * @param {PaletteLayout} layout The tab.
 * @param {readonly (TextureImage | null)[] | null} sheets The tileset's sheets, or null while they load.
 * @returns {HTMLCanvasElement | null} The picture, or null where canvases cannot draw.
 */
const drawPaletteBase = (document: Document, layout: PaletteLayout, sheets: readonly (TextureImage | null)[] | null): HTMLCanvasElement | null =>
{
  const canvas = document.createElement('canvas');
  canvas.width = PALETTE_COLUMNS * TILE_SIZE;
  canvas.height = Math.max(1, layout.rows * TILE_SIZE);
  const context = canvas.getContext('2d');
  if (context === null)
  {
    return null;
  }

  layout.cells.forEach((cell, index) =>
  {
    const x = (index % PALETTE_COLUMNS) * TILE_SIZE;
    const y = Math.floor(index / PALETTE_COLUMNS) * TILE_SIZE;
    if (layout.tab === 'R')
    {
      drawRegion(context, cell.picture, x, y, TILE_SIZE);
    }
    else if (sheets !== null)
    {
      drawTile(context, sheets, cell.picture, x, y, TILE_SIZE);
    }
  });

  return canvas;
};

/**
 * Draws the "goes on top" badge in a cell's top-right corner: filled when the tile is marked, an outline when it only
 * shows where to click.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {number} x The cell's left edge.
 * @param {number} y The cell's top edge.
 * @param {number} size The cell size.
 * @param {boolean} marked Whether the tile goes on top.
 */
const drawBadge = (context: CanvasRenderingContext2D, x: number, y: number, size: number, marked: boolean): void =>
{
  const side = badgeSize(size);
  const left = x + size - side;
  context.fillStyle = marked ? PaletteColour.badge : 'rgba(0, 0, 0, 0.45)';
  context.strokeStyle = marked ? PaletteColour.badgeEdge : PaletteColour.badge;
  context.lineWidth = 1;
  context.fillRect(left + 0.5, y + 0.5, side - 1, side - 1);
  context.strokeRect(left + 0.5, y + 0.5, side - 1, side - 1);

  // an arrow pointing up: the tile lies over whatever it is painted on.
  const inset = side * 0.22;
  context.fillStyle = marked ? PaletteColour.badgeEdge : PaletteColour.badge;
  context.beginPath();
  context.moveTo(left + side / 2, y + inset);
  context.lineTo(left + side - inset, y + side - inset);
  context.lineTo(left + inset, y + side - inset);
  context.closePath();
  context.fill();
};

/**
 * Strokes a path twice, dark and wide first, so a mark reads over any tile.
 * @param {CanvasRenderingContext2D} context Where to draw; the path is already built.
 * @param {string} colour The mark's colour.
 * @param {number} width The mark's line width.
 */
const strokeOutlined = (context: CanvasRenderingContext2D, colour: string, width: number): void =>
{
  context.strokeStyle = PaletteColour.outline;
  context.lineWidth = width + 2;
  context.stroke();
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.stroke();
};

/**
 * Draws a ring in the middle of a cell: open passage, or a flag that is on.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {number} cx The middle, across.
 * @param {number} cy The middle, down.
 * @param {number} size The cell size.
 * @param {string} colour The ring's colour.
 */
const drawRing = (context: CanvasRenderingContext2D, cx: number, cy: number, size: number, colour: string): void =>
{
  context.beginPath();
  context.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
  strokeOutlined(context, colour, Math.max(1.5, size / 16));
};

/**
 * Draws a cross in the middle of a cell: blocked passage.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {number} cx The middle, across.
 * @param {number} cy The middle, down.
 * @param {number} size The cell size.
 */
const drawCross = (context: CanvasRenderingContext2D, cx: number, cy: number, size: number): void =>
{
  const arm = size * 0.2;
  context.beginPath();
  context.moveTo(cx - arm, cy - arm);
  context.lineTo(cx + arm, cy + arm);
  context.moveTo(cx + arm, cy - arm);
  context.lineTo(cx - arm, cy + arm);
  strokeOutlined(context, PaletteColour.blocked, Math.max(2, size / 12));
};

/**
 * Draws a five-pointed star in the middle of a cell: a tile drawn above characters.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {number} cx The middle, across.
 * @param {number} cy The middle, down.
 * @param {number} size The cell size.
 * @param {number} alpha How strongly to draw it.
 */
const drawStar = (context: CanvasRenderingContext2D, cx: number, cy: number, size: number, alpha: number): void =>
{
  const outer = size * 0.26;
  const inner = outer * 0.45;
  context.beginPath();
  for (let point = 0; point < 10; point++)
  {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (point === 0)
    {
      context.moveTo(px, py);
    }
    else
    {
      context.lineTo(px, py);
    }
  }

  context.closePath();
  context.globalAlpha = alpha;
  context.fillStyle = PaletteColour.star;
  context.fill();
  context.strokeStyle = PaletteColour.outline;
  context.lineWidth = 1;
  context.stroke();
  context.globalAlpha = 1;
};

/**
 * Draws a small dot in the middle of a cell: a flag that is off.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {number} cx The middle, across.
 * @param {number} cy The middle, down.
 * @param {number} size The cell size.
 */
const drawDot = (context: CanvasRenderingContext2D, cx: number, cy: number, size: number): void =>
{
  context.beginPath();
  context.arc(cx, cy, Math.max(1.5, size * 0.06), 0, Math.PI * 2);
  context.fillStyle = PaletteColour.off;
  context.fill();
};

/**
 * Where each way out's mark sits in a cell, as a unit step from the middle towards that edge.
 */
const EDGE_STEPS: Readonly<Record<PassageDirection, readonly [ number, number ]>> = {
  down: [ 0, 1 ],
  left: [ -1, 0 ],
  right: [ 1, 0 ],
  up: [ 0, -1 ],
};

/**
 * Draws a tile's four ways out, as MZ does: an arrow pointing out across each open edge, a bar along each blocked one.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {number} x The cell's left edge.
 * @param {number} y The cell's top edge.
 * @param {number} size The cell size.
 * @param {number} flag The tile's flags.
 */
const drawDirections = (context: CanvasRenderingContext2D, x: number, y: number, size: number, flag: number): void =>
{
  const cx = x + size / 2;
  const cy = y + size / 2;
  const reach = size * 0.3;
  const wing = size * 0.11;
  PASSAGE_DIRECTIONS.forEach(({ direction, bit }) =>
  {
    const [ dx, dy ] = EDGE_STEPS[direction];
    const tipX = cx + dx * reach;
    const tipY = cy + dy * reach;
    context.beginPath();
    if ((flag & bit) !== 0)
    {
      // a bar across the way out: blocked.
      context.moveTo(tipX - dy * wing, tipY - dx * wing);
      context.lineTo(tipX + dy * wing, tipY + dx * wing);
      strokeOutlined(context, PaletteColour.blocked, Math.max(2, size / 12));
      return;
    }

    // an arrowhead pointing out: open.
    const baseX = tipX - dx * wing;
    const baseY = tipY - dy * wing;
    context.moveTo(tipX, tipY);
    context.lineTo(baseX - dy * wing, baseY - dx * wing);
    context.moveTo(tipX, tipY);
    context.lineTo(baseX + dy * wing, baseY + dx * wing);
    strokeOutlined(context, PaletteColour.open, Math.max(1.5, size / 16));
  });
};

/**
 * The flag bit each switched flag's mode shows.
 */
const MODE_BITS: Readonly<Record<'ladder' | 'bush' | 'counter' | 'damage', number>> = {
  ladder: FlagBit.ladder,
  bush: FlagBit.bush,
  counter: FlagBit.counter,
  damage: FlagBit.damage,
};

/**
 * Draws one cell's flags for the mode the passability editor shows. The empty tile, which cannot be edited, shows its
 * star faintly.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {number} tileId The tile in the cell.
 * @param {number} x The cell's left edge.
 * @param {number} y The cell's top edge.
 * @param {number} size The cell size.
 * @param {{ flags: ArrayLike<number>, mode: FlagMode }} passability The flags, and which to show.
 */
const drawCellFlags = (
  context: CanvasRenderingContext2D,
  tileId: number,
  x: number,
  y: number,
  size: number,
  passability: { readonly flags: ArrayLike<number>; readonly mode: FlagMode }): void =>
{
  const flag = shownFlags(passability.flags, tileId);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const { mode } = passability;
  if (mode === 'directions')
  {
    drawDirections(context, x, y, size, flag);
    return;
  }

  if (mode === 'terrain')
  {
    const tag = terrainTagOf(flag);
    context.font = `bold ${Math.max(9, Math.round(size * 0.42))}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 3;
    context.strokeStyle = PaletteColour.outline;
    context.strokeText(String(tag), cx, cy);
    context.fillStyle = tag === 0 ? PaletteColour.off : PaletteColour.star;
    context.fillText(String(tag), cx, cy);
    return;
  }

  if (mode !== 'passage')
  {
    if ((flag & MODE_BITS[mode]) === 0)
    {
      drawDot(context, cx, cy, size);
    }
    else
    {
      drawRing(context, cx, cy, size, PaletteColour.on);
    }

    return;
  }

  const state = passageStateOf(flag);
  if (state === 'star')
  {
    drawStar(context, cx, cy, size, tileId === 0 ? 0.35 : 1);
  }
  else if (state === 'blocked')
  {
    drawCross(context, cx, cy, size);
  }
  else
  {
    drawRing(context, cx, cy, size, PaletteColour.open);
  }
};

/**
 * Outlines a rectangle of cells, white inside a dark edge, so it shows over any tile.
 * @param {CanvasRenderingContext2D} context Where to draw.
 * @param {PaletteRect} rect The cells.
 * @param {number} size The cell size.
 */
const drawSelection = (context: CanvasRenderingContext2D, rect: PaletteRect, size: number): void =>
{
  const x = rect.column * size;
  const y = rect.row * size;
  const width = rect.columns * size;
  const height = rect.rows * size;
  context.lineWidth = 3;
  context.strokeStyle = PaletteColour.selectionEdge;
  context.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
  context.lineWidth = 1.5;
  context.strokeStyle = PaletteColour.selection;
  context.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
};

/**
 * Draws the palette as it shows: its tiles from the base picture, scaled to the cell size, then the lines between
 * sheets, the "goes on top" badges, the passability marks while that editor is open, the cell under the pointer, and
 * the rectangle chosen.
 * @param {HTMLCanvasElement} canvas The palette's canvas, sized here to the tab.
 * @param {HTMLCanvasElement | null} base The tab's picture at the sheets' size, or null while there is none.
 * @param {PaletteLayout} layout The tab.
 * @param {number} size The cell size, in CSS pixels.
 * @param {number} scale The screen's pixel density.
 * @param {PaletteOverlays} overlays What shows over the tiles.
 */
const drawPalette = (
  canvas: HTMLCanvasElement,
  base: HTMLCanvasElement | null,
  layout: PaletteLayout,
  size: number,
  scale: number,
  overlays: PaletteOverlays): void =>
{
  const width = PALETTE_COLUMNS * size;
  const height = layout.rows * size;
  const pixelWidth = Math.max(1, Math.round(width * scale));
  const pixelHeight = Math.max(1, Math.round(height * scale));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight)
  {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext('2d');
  if (context === null)
  {
    return;
  }

  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  if (base !== null)
  {
    // shrunk tiles are smoothed so they do not shimmer; tiles at their own size or larger stay crisp.
    context.imageSmoothingEnabled = size * scale < TILE_SIZE;
    context.imageSmoothingQuality = 'high';
    context.drawImage(base, 0, 0, width, height);
  }

  // a faint line where one sheet ends and the next begins.
  context.fillStyle = PaletteColour.section;
  layout.sections.slice(1).forEach(section => context.fillRect(0, section.firstRow * size, width, 1));

  const { marks, passability, hover, selection } = overlays;
  layout.cells.forEach((cell, index) =>
  {
    const column = index % PALETTE_COLUMNS;
    const row = Math.floor(index / PALETTE_COLUMNS);
    const x = column * size;
    const y = row * size;
    if (passability !== null)
    {
      drawCellFlags(context, cell.id, x, y, size, passability);
      return;
    }

    // a marked tile always shows its badge; the tile under the pointer shows where to click to mark it.
    if (marks !== null && isASheetTile(cell.id))
    {
      const marked = isMarkedTile(marks, cell.id);
      const hovered = hover !== null && hover.column === column && hover.row === row;
      if (marked || hovered)
      {
        drawBadge(context, x, y, size, marked);
      }
    }
  });

  if (hover !== null)
  {
    context.lineWidth = 1;
    context.strokeStyle = PaletteColour.hover;
    context.strokeRect(hover.column * size + 0.5, hover.row * size + 0.5, size - 1, size - 1);
  }

  if (selection !== null)
  {
    drawSelection(context, selection, size);
  }
};

export { drawPalette, drawPaletteBase, PaletteColour };
export type { PaletteOverlays };
