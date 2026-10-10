import type { PalettePick } from './paletteGeometry.ts';
import { isTabAvailable, PALETTE_TABS, type PaletteTab } from './paletteLayout.ts';
import type { PaletteBrush } from './paintSelection.ts';

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

/**
 * Chooses the brush a tileset's palette hands its window as it comes into view, as it does whenever the map it shows
 * opens, a blueprint's tab among them. A brush the window already holds of this tileset's tiles stays: it is the newest
 * thing chosen for the tileset, picked in this palette or off a map with the eyedropper, which this palette never
 * remembers. A brush of any other tileset, or none, gives way to the pick the palette remembers for this one, as when
 * coming back from a map drawn with another tileset.
 * @param {PaletteBrush} held The brush the window holds.
 * @param {PaletteBrush} remembered The brush the palette's remembered pick makes.
 * @param {number} tilesetId The tileset the palette shows.
 * @returns {PaletteBrush} The brush to hand the window.
 */
const brushOnShow = (held: PaletteBrush, remembered: PaletteBrush, tilesetId: number): PaletteBrush =>
{
  return held.tilesetId === tilesetId
    ? held
    : remembered;
};

export { brushOnShow, recallPalette };
export type { PaletteMemories, PaletteMemory };
