import type { Graphics } from 'pixi.js';
import type { MapCell } from '../../core/renderer/camera.ts';
import type { CellRect, OverlayState } from '../../core/renderer/MapRenderer.ts';

/**
 * The colours the core overlays draw in.
 */
const OverlayColour = {
  grid: 0x000000,
  hover: 0xffffff,
  selection: 0x4fc3f7,
  cells: 0xffd54f,
} as const;

/**
 * Which of the pointer overlays show.
 */
type PointerOverlaysShown = {
  readonly hover: boolean;
  readonly selection: boolean;
};

/**
 * Draws the grid: a line on every cell boundary across the whole map, one screen pixel wide at every zoom, so it is
 * built once per map and never again while the camera moves.
 * @param {Graphics} graphics Where to draw.
 * @param {number} width The map's width in tiles.
 * @param {number} height The map's height in tiles.
 * @param {number} tileSize The tile size.
 */
const drawGrid = (graphics: Graphics, width: number, height: number, tileSize: number): void =>
{
  graphics.clear();
  for (let x = 0; x <= width; x++)
  {
    graphics.moveTo(x * tileSize, 0).lineTo(x * tileSize, height * tileSize);
  }

  for (let y = 0; y <= height; y++)
  {
    graphics.moveTo(0, y * tileSize).lineTo(width * tileSize, y * tileSize);
  }

  graphics.stroke({ color: OverlayColour.grid, alpha: 0.35, width: 1, pixelLine: true });
};

/**
 * Outlines a rectangle of cells over a faint wash of its colour.
 * @param {Graphics} graphics Where to draw.
 * @param {CellRect} rect The cells.
 * @param {number} colour The colour.
 * @param {number} washAlpha How strong the wash is.
 * @param {number} tileSize The tile size.
 */
const drawCells = (graphics: Graphics, rect: CellRect, colour: number, washAlpha: number, tileSize: number): void =>
{
  const x = rect.x * tileSize;
  const y = rect.y * tileSize;
  const width = rect.width * tileSize;
  const height = rect.height * tileSize;
  graphics.rect(x, y, width, height).fill({ color: colour, alpha: washAlpha });
  graphics.rect(x, y, width, height).stroke({ color: colour, alpha: 1, width: 1, pixelLine: true });
};

/**
 * Draws what the tools point at: the selected events, tile area and box (selection), then the cell or footprint under
 * the pointer (hover) on top. Cheap enough to redraw whenever the state changes.
 * @param {Graphics} graphics Where to draw.
 * @param {OverlayState} state The tools' state.
 * @param {PointerOverlaysShown} shown Which overlays are on.
 * @param {(eventId: number) => MapCell | null} eventCell Finds where an event stands.
 * @param {number} tileSize The tile size.
 */
const drawPointerOverlays = (
  graphics: Graphics,
  state: OverlayState,
  shown: PointerOverlaysShown,
  eventCell: (eventId: number) => MapCell | null,
  tileSize: number): void =>
{
  graphics.clear();
  if (shown.selection)
  {
    state.selectedEvents.forEach(id =>
    {
      const cell = eventCell(id);
      if (cell !== null)
      {
        drawCells(graphics, { x: cell.x, y: cell.y, width: 1, height: 1 }, OverlayColour.selection, 0.3, tileSize);
      }
    });

    if (state.selectedCells !== null)
    {
      drawCells(graphics, state.selectedCells, OverlayColour.cells, 0.15, tileSize);
    }

    const box = state.selectionBox;
    if (box !== null)
    {
      graphics.rect(box.x, box.y, box.width, box.height).fill({ color: OverlayColour.selection, alpha: 0.15 });
      graphics.rect(box.x, box.y, box.width, box.height).stroke({ color: OverlayColour.selection, width: 1, pixelLine: true });
    }
  }

  if (shown.hover && state.hover !== null)
  {
    drawCells(graphics, state.hover, OverlayColour.hover, 0.12, tileSize);
  }
};

export { drawCells, drawGrid, drawPointerOverlays, OverlayColour };
export type { PointerOverlaysShown };
