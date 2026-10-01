import type { PalettePick } from './paletteGeometry.ts';
import { isTabAvailable, PALETTE_TABS, type PaletteTab } from './paletteLayout.ts';

/**
 * What a palette remembers for one tileset: the tab on show, and what was picked there.
 */
type PaletteMemory = {
  readonly tab: PaletteTab;
  readonly pick: PalettePick | null;
};

/**
 * What a palette remembers for every tileset it has shown, by tileset id, for as long as its window is open, so moving
 * between maps on different tilesets comes back to what each had picked.
 */
type PaletteMemories = Map<number, PaletteMemory>;

/**
 * Recalls what a tileset's palette had on show and picked. A tileset never shown starts on its first tab with a sheet,
 * or the regions when it names none, with nothing picked; a remembered tab whose sheet the tileset no longer names
 * gives way to that first tab, keeping the pick.
 * @param {ReadonlyMap<number, PaletteMemory>} memories What the palette remembers.
 * @param {{ id: number, tilesetNames: readonly string[] }} tileset The tileset: its id and its sheets' names.
 * @returns {PaletteMemory} What to show.
 */
const recallPalette = (
  memories: ReadonlyMap<number, PaletteMemory>,
  tileset: { readonly id: number; readonly tilesetNames: readonly string[] },
): PaletteMemory =>
{
  const remembered = memories.get(tileset.id);
  if (remembered !== undefined && isTabAvailable(remembered.tab, tileset.tilesetNames))
  {
    return remembered;
  }

  const tab = PALETTE_TABS.find(each => isTabAvailable(each, tileset.tilesetNames)) ?? 'R';
  return { tab, pick: remembered?.pick ?? null };
};

export { recallPalette };
export type { PaletteMemories, PaletteMemory };
