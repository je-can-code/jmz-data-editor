import type { MapCell } from '../renderer/camera.ts';
import type { CellRect, GhostTile } from '../renderer/MapRenderer.ts';
import { strokeLayerChoice, type LayerChoice, type Shaping, type TilesetLayering } from '../tiles/layering.ts';
import type { TileGrid, TileLayerIndex } from '../tiles/tileGrid.ts';
import { brushFootprint, type Brush } from './brush.ts';
import { cellsInRect } from './geometry.ts';
import { hasShadow, paintBrushTiles, type PaintContext, type ShadowQuarter } from './paintPlan.ts';
import type { PaintTool } from './PaintState.ts';

/**
 * Where a stroke would paint: the layer strip's choice, the override's layer, and whether its key is held.
 */
type LayerMode = {
  readonly strip: LayerChoice;
  readonly overrideLayer: TileLayerIndex;
  readonly overrideHeld: boolean;
};

/**
 * What the map shows under the pointer before a click: the cells the tool would reach (the brush cursor), the tiles a
 * click would lay (the ghost preview, each on the layer it would land on and in the shape it would take), and a few
 * words saying which layer the tool paints.
 */
type ToolPreview = {
  readonly hover: CellRect | null;
  readonly ghosts: readonly GhostTile[];
  readonly label: string | null;
};

/**
 * A preview showing nothing.
 */
const NO_PREVIEW: ToolPreview = { hover: null, ghosts: [], label: null };

/**
 * Everything a preview reads besides the map.
 */
type PreviewInputs = {
  readonly tool: PaintTool;
  readonly brush: Brush | null;
  readonly mode: LayerMode;
  readonly shaping: Shaping;
  readonly layering: TilesetLayering;
};

/**
 * Picks the layer choice a stroke begun now would paint with: the override's layer while its key is held, the strip's
 * choice otherwise.
 * @param {LayerMode} mode The layer mode.
 * @returns {LayerChoice} The choice.
 */
const choiceFor = (mode: LayerMode): LayerChoice =>
{
  return strokeLayerChoice(mode.strip, mode.overrideHeld ? mode.overrideLayer : 'none');
};

/**
 * Builds everything a stroke begun now paints with.
 * @param {LayerMode} mode The layer mode.
 * @param {Shaping} shaping Whether autotiles are shaped (exact while Shift is held).
 * @param {TilesetLayering} layering The tileset's mode and marks.
 * @returns {PaintContext} The context.
 */
const paintContextFor = (mode: LayerMode, shaping: Shaping, layering: TilesetLayering): PaintContext =>
{
  return { layering, choice: choiceFor(mode), shaping };
};

/**
 * Words the layer a stroke begun now paints, for the brush cursor: the chosen layer, the held override's layer, or,
 * under automatic layering, the layer the tile under the pointer would land on. Shift adds that tiles go down exactly.
 * @param {LayerMode} mode The layer mode.
 * @param {TileLayerIndex | -1} landing Where automatic layering lands the tile, or -1 for B's empty tile, which clears.
 * @param {Shaping} shaping Whether autotiles are shaped.
 * @returns {string} The words.
 */
const layerLabel = (mode: LayerMode, landing: TileLayerIndex | -1, shaping: Shaping): string =>
{
  const exact = shaping === 'exact' ? ' (exact)' : '';
  if (mode.overrideHeld)
  {
    return `Held: layer ${mode.overrideLayer + 1}${exact}`;
  }

  if (mode.strip !== 'auto')
  {
    return `Layer ${mode.strip + 1}${exact}`;
  }

  return landing === -1
    ? 'Auto: clears layers 3 and 4'
    : `Auto: layer ${landing + 1}${exact}`;
};

/**
 * Words what the eraser clears, for the brush cursor.
 * @param {Brush} brush The brush in hand, which says what the eraser clears.
 * @param {LayerMode} mode The layer mode.
 * @returns {string} The words.
 */
const eraserLabel = (brush: Brush, mode: LayerMode): string =>
{
  if (brush.kind !== 'tiles')
  {
    return brush.kind === 'regions' ? 'Erase regions' : 'Erase shadows';
  }

  const choice = choiceFor(mode);
  return choice === 'auto'
    ? 'Erase every layer'
    : `Erase layer ${choice + 1}`;
};

/**
 * Words what the eyedropper picks, for the brush cursor.
 * @param {Brush | null} brush The brush in hand: with regions it picks regions.
 * @param {LayerMode} mode The layer mode.
 * @returns {string} The words.
 */
const eyedropperLabel = (brush: Brush | null, mode: LayerMode): string =>
{
  if (brush !== null && brush.kind === 'regions')
  {
    return 'Pick regions';
  }

  const choice = choiceFor(mode);
  return choice === 'auto'
    ? 'Pick the top tile'
    : `Pick from layer ${choice + 1}`;
};

/**
 * Previews painting tiles with the brush at the pointer: its footprint (one cell for the fill and the swap), the
 * tiles that would land, and the layer the one under the pointer lands on.
 * @param {TileGrid} grid The map.
 * @param {Brush} brush A tiles brush.
 * @param {CellRect} hover The cells the tool reaches.
 * @param {MapCell} cell The cell under the pointer, where the pattern starts.
 * @param {PreviewInputs} inputs The layer mode, shaping and layering.
 * @returns {ToolPreview} The preview.
 */
const tilesPreview = (grid: TileGrid, brush: Brush, hover: CellRect, cell: MapCell, inputs: PreviewInputs): ToolPreview =>
{
  const context = paintContextFor(inputs.mode, inputs.shaping, inputs.layering);
  const { landings } = paintBrushTiles(grid, brush, cellsInRect(hover), cell, context);
  const under = landings.find(landing => landing.x === cell.x && landing.y === cell.y);
  return {
    hover,
    ghosts: landings.map(({ x, y, layer, tileId }) => ({ x, y, layer, tileId })),
    label: layerLabel(inputs.mode, under?.layer ?? -1, inputs.shaping),
  };
};

/**
 * Previews the shadow pen over a quarter: that quarter, and whether a stroke begun there adds a shadow or takes one
 * away.
 * @param {TileGrid} grid The map.
 * @param {ShadowQuarter} quarter The quarter under the pointer.
 * @returns {ToolPreview} The preview.
 */
const shadowPreview = (grid: TileGrid, quarter: ShadowQuarter): ToolPreview =>
{
  const across = quarter.quarter % 2;
  const down = Math.floor(quarter.quarter / 2);
  return {
    hover: { x: quarter.x + across / 2, y: quarter.y + down / 2, width: 0.5, height: 0.5 },
    ghosts: [],
    label: hasShadow(grid, quarter) ? 'Remove shadow' : 'Add shadow',
  };
};

/**
 * Previews the tool in hand with the pointer over a cell, before any click. The painting tools show their footprint,
 * the tiles they would lay and the layer those land on; the fill and the swap show the tile that would land on the
 * cell clicked; the eraser, the eyedropper and the region brush show their footprint and what they do; the shadow pen
 * shows the quarter under the pointer; the select tool shows the cell. Nothing picked, nothing previewed but the cell.
 * @param {TileGrid} grid The map.
 * @param {MapCell} cell The cell under the pointer.
 * @param {ShadowQuarter} quarter The quarter of it under the pointer, which only the shadow pen reads.
 * @param {PreviewInputs} inputs The tool, brush, layer mode, shaping and layering.
 * @returns {ToolPreview} The preview.
 */
const previewTool = (grid: TileGrid, cell: MapCell, quarter: ShadowQuarter, inputs: PreviewInputs): ToolPreview =>
{
  const { tool, brush, mode } = inputs;
  const single: CellRect = { x: cell.x, y: cell.y, width: 1, height: 1 };
  if (tool === 'select' || (brush === null && tool !== 'eyedropper'))
  {
    return { hover: single, ghosts: [], label: null };
  }

  if (tool === 'eyedropper')
  {
    return { hover: single, ghosts: [], label: eyedropperLabel(brush, mode) };
  }

  const held = brush as Brush;
  if (tool === 'eraser')
  {
    return { hover: brushFootprint(held, cell), ghosts: [], label: eraserLabel(held, mode) };
  }

  if (held.kind === 'shadows')
  {
    return tool === 'pen'
      ? shadowPreview(grid, quarter)
      : { hover: single, ghosts: [], label: 'Shadow every quarter' };
  }

  const reach = tool === 'fill' || tool === 'swap'
    ? single
    : brushFootprint(held, cell);
  if (held.kind === 'regions')
  {
    return { hover: reach, ghosts: [], label: `Region ${held.cells[0]}` };
  }

  return tilesPreview(grid, held, reach, cell, inputs);
};

/**
 * Lists the ghosts of the tiles a brush would lay on some cells, for a rectangle or ellipse being dragged out: each on
 * the layer it would land on, in the shape it would take.
 * @param {TileGrid} grid The map.
 * @param {Brush} brush The brush; anything but tiles shows no ghosts.
 * @param {readonly MapCell[]} cells The cells the shape covers.
 * @param {MapCell} origin Where the pattern starts.
 * @param {PaintContext} context The layering, layer choice and shaping.
 * @returns {GhostTile[]} The ghosts.
 */
const shapeGhosts = (grid: TileGrid, brush: Brush, cells: readonly MapCell[], origin: MapCell, context: PaintContext): GhostTile[] =>
{
  if (brush.kind !== 'tiles')
  {
    return [];
  }

  return paintBrushTiles(grid, brush, cells, origin, context).landings.map(({ x, y, layer, tileId }) => ({ x, y, layer, tileId }));
};

export { choiceFor, layerLabel, NO_PREVIEW, paintContextFor, previewTool, shapeGhosts };
export type { LayerMode, PreviewInputs, ToolPreview };
