import { EMPTY_BRUSH, type PaintSelection, type PaletteBrush } from '../palette/paintSelection.ts';
import type { Brush } from './brush.ts';
import { isPaintingTool, type PaintState } from './PaintState.ts';

/**
 * Takes up the pen for a brush just picked in the palette, when the events are in hand: a tile is picked to be
 * painted, so the next click on the map paints it rather than selecting an event. Any painting tool already in hand
 * stays, as a picked colour leaves a paint program's tool alone.
 * @param {PaintState} painting The window's painting settings.
 */
const takeUpPenForPick = (painting: PaintState): void =>
{
  if (isPaintingTool(painting.settings.tool) === false)
  {
    painting.setTool('pen');
  }
};

/**
 * Turns the palette's brush into the tools' brush: the same rectangle of values, naming the tileset they belong to.
 * The palette's empty brush, which it hands out before anything is chosen, holds no values and must paint nothing, so
 * it becomes no brush at all; read as a brush, its missing values would read as B's empty tile and clear layers 3 and 4
 * wherever a rectangle or a fill reached.
 * @param {PaletteBrush} brush The palette's brush.
 * @returns {Brush | null} The tools' brush, or null for a brush that paints nothing.
 */
const toolBrushFrom = (brush: PaletteBrush): Brush | null =>
{
  // a shadows brush holds no values by design; any other brush without them paints nothing.
  if (brush.kind !== 'shadows' && brush.cells.length === 0)
  {
    return null;
  }

  const { kind, tilesetId, width, height, cells } = brush;
  return { kind, tilesetId, width, height, cells: [ ...cells ] };
};

/**
 * Reports whether two of the tools' brushes paint the same: the same kind, tileset, size and values.
 * @param {Brush | null} left One brush, or null for none.
 * @param {Brush | null} right The other.
 * @returns {boolean} True when both are missing, or both paint the same.
 */
const sameToolBrush = (left: Brush | null, right: Brush | null): boolean =>
{
  if (left === null || right === null)
  {
    return left === right;
  }

  return left.kind === right.kind
    && left.tilesetId === right.tilesetId
    && left.width === right.width
    && left.height === right.height
    && left.cells.length === right.cells.length
    && left.cells.every((value, index) => value === right.cells[index]);
};

/**
 * Turns the tools' brush back into the palette's, so the palette knows what the tools hold after the eyedropper picks
 * off the map; no brush becomes the palette's empty one. A brush naming no tileset, which only a brush built by hand
 * does, has no place on a palette that always shows one tileset, and naming one for it would change where it paints.
 * @param {Brush | null} brush The tools' brush.
 * @returns {PaletteBrush | null} The palette's brush, or null for a brush naming no tileset.
 */
const paletteBrushFrom = (brush: Brush | null): PaletteBrush | null =>
{
  if (brush === null)
  {
    return EMPTY_BRUSH;
  }

  const { kind, tilesetId, width, height, cells } = brush;
  return tilesetId === undefined
    ? null
    : { kind, tilesetId, width, height, cells: [ ...cells ] };
};

/**
 * Links the palette and the layer strip to the painting tools, both ways:
 *
 * - the palette's brush becomes the tools' brush, whether picked there or brought back with another tileset's palette;
 * - the strip's layer becomes the tools' layer choice, Shift and the wheel included, so a layer picked there is also
 *   the one the override key paints;
 * - a brush the eyedropper picks off the map, and a layer choice the tools take up themselves, go back to the palette
 *   and the strip, so they show what the tools hold, and so picking the palette's brush again after the eyedropper is
 *   heard as the change it is rather than as the palette's brush picked twice.
 *
 * The palette's choices win when the link starts. Each side tells the other only of a real change, so nothing echoes
 * back and forth.
 * @param {PaintSelection} selection The palette's and the strip's choices.
 * @param {PaintState} painting The window's painting settings.
 * @returns {() => void} Unlinks them.
 */
const linkPaintSelection = (selection: PaintSelection, painting: PaintState): (() => void) =>
{
  const fromPalette = () =>
  {
    const { brush, layer } = selection.getState();
    painting.setStrip(layer);

    // a new brush from the palette replaces the tools' one.
    const next = toolBrushFrom(brush);
    if (sameToolBrush(next, painting.settings.brush) === false)
    {
      painting.setBrush(next);
    }
  };

  const fromTools = () =>
  {
    const { brush, strip } = painting.settings;
    selection.setLayer(strip);

    // a brush the palette cannot show stays the tools' alone.
    const shown = paletteBrushFrom(brush);
    if (shown !== null && sameToolBrush(toolBrushFrom(selection.brush), brush) === false)
    {
      selection.setBrush(shown);
    }
  };

  fromPalette();
  const stops = [ selection.subscribe(fromPalette), painting.subscribe(fromTools) ];
  return () => stops.forEach(stop => stop());
};

export { linkPaintSelection, paletteBrushFrom, sameToolBrush, takeUpPenForPick, toolBrushFrom };
