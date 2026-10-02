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
  blocked: 0xef5350,
} as const;

/**
 * Which of the pointer overlays show.
 */
type PointerOverlaysShown = {
  readonly hover: boolean;
  readonly selection: boolean;
  readonly ghost: boolean;
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
 * Draws what is selected: the selected events' tiles and the selected tile area. It is drawn apart from the rest of
 * the pointer overlays, and only when the selection or the events change, since a selection can hold every event on a
 * map (600 on Map361) while the pointer moves every frame.
 * @param {Graphics} graphics Where to draw.
 * @param {OverlayState} state The tools' state.
 * @param {PointerOverlaysShown} shown Which overlays are on.
 * @param {(eventId: number) => MapCell | null} eventCell Finds where an event stands.
 * @param {number} tileSize The tile size.
 */
const drawSelection = (
  graphics: Graphics,
  state: OverlayState,
  shown: PointerOverlaysShown,
  eventCell: (eventId: number) => MapCell | null,
  tileSize: number): void =>
{
  graphics.clear();
  if (shown.selection === false)
  {
    return;
  }

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
};

/**
 * Draws what the tools point at: the box being dragged (selection), the tile every ghost event would land on with the
 * tiles it cannot land on in red (ghost), then the cell or footprint under the pointer (hover) on top. The renderer
 * lays the selection over all of it, so the hover never hides the event a click just picked. Cheap enough to redraw
 * whenever the state changes.
 * @param {Graphics} graphics Where to draw.
 * @param {OverlayState} state The tools' state.
 * @param {PointerOverlaysShown} shown Which overlays are on.
 * @param {number} tileSize The tile size.
 */
const drawPointerOverlays = (graphics: Graphics, state: OverlayState, shown: PointerOverlaysShown, tileSize: number): void =>
{
  graphics.clear();
  const box = state.selectionBox;
  if (shown.selection && box !== null)
  {
    graphics.rect(box.x, box.y, box.width, box.height).fill({ color: OverlayColour.selection, alpha: 0.15 });
    graphics.rect(box.x, box.y, box.width, box.height).stroke({ color: OverlayColour.selection, width: 1, pixelLine: true });
  }

  if (shown.ghost)
  {
    // an event with no picture draws no ghost sprite, so its outlined tile is all that shows where it would land.
    state.ghostEvents.forEach(ghost =>
    {
      graphics.rect(ghost.x * tileSize, ghost.y * tileSize, tileSize, tileSize)
        .stroke({ color: OverlayColour.selection, alpha: 0.9, width: 1, pixelLine: true });
    });

    (state.blockedCells ?? []).forEach(cell =>
    {
      drawCells(graphics, { x: cell.x, y: cell.y, width: 1, height: 1 }, OverlayColour.blocked, 0.35, tileSize);
    });
  }

  if (shown.hover && state.hover !== null)
  {
    drawCells(graphics, state.hover, OverlayColour.hover, 0.12, tileSize);
  }
};

export { drawCells, drawGrid, drawPointerOverlays, drawSelection, OverlayColour };
export type { PointerOverlaysShown };
