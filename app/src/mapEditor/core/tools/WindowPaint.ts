import { PaintSelection } from '../palette/paintSelection.ts';
import type { PaletteMemories } from '../palette/paletteMemory.ts';
import { PaletteModeStore } from '../palette/paletteMode.ts';
import { linkPaintSelection } from './paintSelectionLink.ts';
import { PaintState } from './PaintState.ts';

/**
 * Everything one window paints with: what its palette and layer strip have chosen, the tools' settings (the tool, the
 * brush, the strip's layer and the override's), the palette's mode, and what its palette remembers of each tileset. A
 * window's palette, layer strip and maps all read and change this one, and no other window's.
 *
 * Built from another window's, it starts where that one stands (the same tool, brush and layer, and the same tab and
 * pick remembered for each tileset), so a map torn out carries on painting with what it had, then goes its own way.
 * The palette's mode starts afresh, picking tiles, since passability editing belongs to the window it was opened in.
 */
class WindowPaint
{
  /**
   * What the window's palette and layer strip have chosen.
   */
  readonly selection = new PaintSelection();

  /**
   * What the window's painting tools paint with.
   */
  readonly painting: PaintState;

  /**
   * Whether the window's palette picks tiles or edits passability, which the window's maps follow.
   */
  readonly mode = new PaletteModeStore();

  /**
   * What the window's palette remembers of each tileset it has shown.
   */
  readonly memories: PaletteMemories;

  /**
   * @param {WindowPaint} from The window to start where it stands, or none to start from scratch.
   */
  constructor(from?: WindowPaint)
  {
    this.painting = new PaintState(from?.painting.settings);
    this.memories = new Map(from?.memories ?? []);
    if (from !== undefined)
    {
      this.selection.setBrush(from.selection.brush);
      this.selection.setLayer(from.selection.layer);
    }
  }

  /**
   * Links the palette and the layer strip to the painting tools, both ways (see linkPaintSelection): the palette's
   * brush and the strip's layer become what the tools paint with, and the eyedropper's picks go back to them.
   * @returns {() => void} Unlinks them.
   */
  link(): () => void
  {
    return linkPaintSelection(this.selection, this.painting);
  }
}

/**
 * Every window's paint, by window. The page's own window has its paint from the start; any other window the page
 * draws into (a panel torn out into a window of its own) gets one of its own the first time it is asked for, started
 * where the page's own stands and linked for good: a window that has closed is never asked for again, and its paint
 * goes with it, since nothing else holds on to it.
 */
class WindowPaints
{
  /**
   * The page's own window's paint, linked by whoever starts the page.
   */
  readonly main = new WindowPaint();

  #mainWindow: object;

  #others = new WeakMap<object, WindowPaint>();

  /**
   * @param {object} mainWindow The page's own window.
   */
  constructor(mainWindow: object)
  {
    this.#mainWindow = mainWindow;
  }

  /**
   * Finds a window's paint, making it the first time a window other than the page's own is asked for.
   * @param {object} host The window.
   * @returns {WindowPaint} Its paint.
   */
  forWindow(host: object): WindowPaint
  {
    if (host === this.#mainWindow)
    {
      return this.main;
    }

    const known = this.#others.get(host);
    if (known !== undefined)
    {
      return known;
    }

    const paint = new WindowPaint(this.main);
    paint.link();
    this.#others.set(host, paint);
    return paint;
  }
}

export { WindowPaint, WindowPaints };
