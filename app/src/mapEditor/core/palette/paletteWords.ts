import type { LayerChoice } from '../tiles/layering.ts';
import type { TileLayerIndex } from '../tiles/tileGrid.ts';
import { isMarkedTile, type TilesetMarks } from '../tiles/tilesetMarks.ts';
import type { PalettePick } from './paletteGeometry.ts';
import { describeTile, layoutPaletteTab, PALETTE_COLUMNS, type PaletteTab } from './paletteLayout.ts';
import type { FlagMode } from './passabilityEdits.ts';
import { isMarkableTile } from './tilesetMarkEdits.ts';

/**
 * What each set of flags is called, and what a click does to it, in the passability editor.
 */
const FLAG_MODE_WORDS: Readonly<Record<FlagMode, { readonly label: string; readonly hint: string }>> = {
  passage: { label: 'Passage', hint: 'Click a tile to make it open, blocked, or drawn above characters.' },
  directions: { label: 'Directions', hint: 'Click near a tile\'s edge to block or open the way out across it.' },
  ladder: { label: 'Ladder', hint: 'Click a tile to make it a ladder, climbed facing up, or not.' },
  bush: { label: 'Bush', hint: 'Click a tile to make it a bush, which hides the feet of whoever stands in it, or not.' },
  counter: { label: 'Counter', hint: 'Click a tile to make it a counter, which people can be spoken to across, or not.' },
  damage: { label: 'Damage floor', hint: 'Click a tile to make it hurt whoever walks on it, or not.' },
  terrain: { label: 'Terrain tag', hint: 'Click a tile to count its terrain tag up; right-click or Shift-click to count down.' },
};

/**
 * Names one palette cell for the line under the palette.
 * @param {PaletteTab} tab The tab it is on.
 * @param {number} id The cell's id: a tile id, or a region id on the regions tab.
 * @returns {string} The name.
 */
const describeCell = (tab: PaletteTab, id: number): string =>
{
  if (tab !== 'R')
  {
    return describeTile(id);
  }

  return id === 0
    ? 'Clears the region'
    : `Region ${id}`;
};

/**
 * Says what painting with a pick lays down, for the line under the palette.
 * @param {PalettePick | null} pick What was picked.
 * @param {readonly string[]} sheetNames The tileset's sheets.
 * @returns {string} The words.
 */
const describePick = (pick: PalettePick | null, sheetNames: readonly string[]): string =>
{
  if (pick === null)
  {
    return 'Pick a tile to paint with.';
  }

  if (pick.kind === 'shadow')
  {
    return 'Shadow pen: shades the quarter of a tile under the pointer.';
  }

  const { rect, tab } = pick;
  if (rect.columns === 1 && rect.rows === 1)
  {
    // a lone cell is named; a pick on a tab its tileset no longer shows names nothing.
    const cell = layoutPaletteTab(tab, sheetNames).cells[rect.row * PALETTE_COLUMNS + rect.column];
    return cell === undefined
      ? 'Pick a tile to paint with.'
      : `Painting with ${describeCell(tab, cell.id)}.`;
  }

  return `Painting with ${rect.columns} by ${rect.rows} ${tab === 'R' ? 'regions' : 'tiles'}.`;
};

/**
 * Says what the cell under the pointer is, and for an A tile whether it goes on top, or what a click on its badge
 * would do.
 * @param {PaletteTab} tab The tab on show.
 * @param {{ id: number, onBadge: boolean }} hover The cell's id, and whether the pointer is on its badge.
 * @param {TilesetMarks | null} marks The tileset's marks, where they apply.
 * @returns {string} The words.
 */
const describeHover = (tab: PaletteTab, hover: { readonly id: number; readonly onBadge: boolean }, marks: TilesetMarks | null): string =>
{
  const name = describeCell(tab, hover.id);
  if (marks === null || isMarkableTile(hover.id) === false)
  {
    return name;
  }

  const marked = isMarkedTile(marks, hover.id);
  if (hover.onBadge)
  {
    return marked
      ? `${name}: click to paint it as ground again`
      : `${name}: click to have it go on top`;
  }

  return marked
    ? `${name} · goes on top`
    : name;
};

/**
 * Says how to use what the palette shows: the passability editor's mode, or how to mark a tile to go on top.
 * @param {boolean} editing Whether the passability editor is open.
 * @param {FlagMode} flagMode The flags it shows.
 * @param {boolean} marksShown Whether the "goes on top" badges show.
 * @returns {string} The hint, or an empty string when there is nothing to say.
 */
const paletteHint = (editing: boolean, flagMode: FlagMode, marksShown: boolean): string =>
{
  if (editing)
  {
    const { hint } = FLAG_MODE_WORDS[flagMode];
    return hint;
  }

  return marksShown
    ? 'Right-click a tile, or click its corner, to have it go on top of the ground.'
    : '';
};

/**
 * Names a layer choice on the strip's button: automatic layering, or the layer as people count them, 1 to 4.
 * @param {LayerChoice} choice The choice.
 * @returns {string} The label.
 */
const layerLabel = (choice: LayerChoice): string =>
{
  return choice === 'auto'
    ? 'Auto'
    : String(choice + 1);
};

/**
 * Reads a strip button's value back into a layer choice.
 * @param {string} value The value: "auto", or a tile layer 0 to 3.
 * @returns {LayerChoice} The choice.
 */
const choiceOf = (value: string): LayerChoice =>
{
  return value === 'auto'
    ? 'auto'
    : Number.parseInt(value, 10) as TileLayerIndex;
};

export { choiceOf, describeCell, describeHover, describePick, FLAG_MODE_WORDS, layerLabel, paletteHint };
