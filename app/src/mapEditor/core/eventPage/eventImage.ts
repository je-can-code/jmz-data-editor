import { sheetKind } from '../../render/engine/characterFrames.ts';
import type { RmmzEventImage } from '../model/rmmzTypes.ts';

/**
 * Which kind of graphic a page shows: nothing, a cell cut from a character sheet, or a tile from the map's own
 * tileset. RMMZ never stores this directly; it falls out of {@code tileId} and {@code characterName} together,
 * with a tile always winning when both happen to be set.
 */
type EventImageMode = 'none' | 'character' | 'tile';

/**
 * How many characters a normal sheet holds across, and down. A big ({@code $}) sheet holds one, drawn full size.
 */
const CHARACTER_SHEET_COLUMNS = 4;
const CHARACTER_SHEET_ROWS = 2;

/**
 * One choice of {@link RmmzEventImage.direction}, in the order the arrow keys give it.
 */
const DIRECTION_OPTIONS = [
  { value: 2, label: 'Down' },
  { value: 4, label: 'Left' },
  { value: 6, label: 'Right' },
  { value: 8, label: 'Up' },
] as const;

/**
 * One choice of {@link RmmzEventImage.pattern}: which of the three steps of the walking cycle a still picture
 * shows. Pattern 3, the cycle's fourth step, is never stored; the engine shows pattern 1 for it instead.
 */
const PATTERN_OPTIONS = [
  { value: 0, label: 'Step left' },
  { value: 1, label: 'Standing' },
  { value: 2, label: 'Step right' },
] as const;

/**
 * How a character sheet's cells are laid out for picking.
 */
type SheetGrid = {
  /**
   * How many characters sit across one row.
   */
  readonly columns: number;

  /**
   * How many rows of characters the sheet holds.
   */
  readonly rows: number;

  /**
   * True for a {@code $} sheet: one character, and {@code characterIndex} is never read for it.
   */
  readonly big: boolean;
};

/**
 * Reports which kind of graphic a page's image shows, the way {@code Sprite_Character#updateTileFrame} and
 * {@code #updateCharacterFrame} resolve it: a tile wins whenever one is set, even over a leftover character name.
 * @param {RmmzEventImage} image The page's image.
 * @returns {EventImageMode} The mode.
 */
const eventImageMode = (image: RmmzEventImage): EventImageMode =>
{
  if (image.tileId > 0)
  {
    return 'tile';
  }

  return image.characterName === ''
    ? 'none'
    : 'character';
};

/**
 * Lays out a character sheet's picking grid: eight characters, four across by two down, or one character filling
 * the whole sheet for a {@code $} name.
 * @param {string} characterName The sheet's name, exactly as it would be written to {@code characterName}.
 * @returns {SheetGrid} The grid.
 */
const sheetGrid = (characterName: string): SheetGrid =>
{
  const { big } = sheetKind(characterName);
  return big
    ? { columns: 1, rows: 1, big: true }
    : { columns: CHARACTER_SHEET_COLUMNS, rows: CHARACTER_SHEET_ROWS, big: false };
};

/**
 * Picks a character sheet and a cell within it, clearing any tile so the character draws. A big sheet's one
 * character always indexes as 0, whatever cell was clicked to reach it, since RMMZ never reads an index for one.
 * @param {RmmzEventImage} image The page's image.
 * @param {string} characterName The sheet's name.
 * @param {number} cellIndex The cell picked, 0 to 7 on a normal sheet.
 * @returns {RmmzEventImage} The image showing that character.
 */
const withCharacter = (image: RmmzEventImage, characterName: string, cellIndex: number): RmmzEventImage =>
{
  const { big } = sheetKind(characterName);
  return { ...image, tileId: 0, characterName, characterIndex: big ? 0 : cellIndex };
};

/**
 * Changes which way the character faces. Only a character sheet draws differently for it, but the engine turns the
 * event to face this way whatever the page shows ({@code Game_Event#setupPageSettings}), so on a tile or an empty page
 * it still decides which way the event faces: where Move Forward and Move Backward take it, for one.
 * @param {RmmzEventImage} image The page's image.
 * @param {number} direction One of {@link DIRECTION_OPTIONS}.
 * @returns {RmmzEventImage} The image facing that way.
 */
const withDirection = (image: RmmzEventImage, direction: number): RmmzEventImage =>
{
  return { ...image, direction };
};

/**
 * Changes which step of the walking cycle a still picture shows.
 * @param {RmmzEventImage} image The page's image.
 * @param {number} pattern One of {@link PATTERN_OPTIONS}.
 * @returns {RmmzEventImage} The image.
 */
const withPattern = (image: RmmzEventImage, pattern: number): RmmzEventImage =>
{
  return { ...image, pattern };
};

/**
 * Picks a tile from the map's tileset, clearing the character sheet name so a later read of it alone never mistakes
 * the page for one still carrying a character. The tile wins over a character regardless, so this is tidiness
 * rather than a fix.
 * @param {RmmzEventImage} image The page's image.
 * @param {number} tileId The tile, from the B to E sheets; 0 reads back as no image at all, the same sentinel RMMZ
 * uses, so the one cell at id 0 can never be picked as a real tile.
 * @returns {RmmzEventImage} The image showing that tile.
 */
const withTile = (image: RmmzEventImage, tileId: number): RmmzEventImage =>
{
  return { ...image, tileId, characterName: '' };
};

/**
 * Clears the page's graphic. Direction, pattern and the character index are left exactly where they were: the
 * pattern and the index stop mattering the moment both {@code tileId} and {@code characterName} are empty, and the
 * direction still sets which way the event faces (see {@link withDirection}).
 * @param {RmmzEventImage} image The page's image.
 * @returns {RmmzEventImage} The image showing nothing.
 */
const withNoImage = (image: RmmzEventImage): RmmzEventImage =>
{
  return { ...image, tileId: 0, characterName: '' };
};

/**
 * How many columns and rows a B to E sheet's picking grid shows: sixteen each way, the full sheet.
 */
const TILE_SHEET_COLUMNS = 16;
const TILE_SHEET_ROWS = 16;

/**
 * One of the four sheets an event's tile image can be cut from: its letter, its place among the tileset's nine
 * sheets (A1 to A5 take the first five), and the first tile id on it.
 */
type TileSheetTab = {
  readonly label: 'B' | 'C' | 'D' | 'E';
  readonly sheetIndex: number;
  readonly base: number;
};

/**
 * The four tabs the tile picker offers, in RMMZ's own order.
 */
const TILE_SHEET_TABS: readonly TileSheetTab[] = [
  { label: 'B', sheetIndex: 5, base: 0 },
  { label: 'C', sheetIndex: 6, base: 256 },
  { label: 'D', sheetIndex: 7, base: 512 },
  { label: 'E', sheetIndex: 8, base: 768 },
];

/**
 * Finds the tile id a cell of a B to E sheet's picking grid names: the inverse of {@code normalTileCell}
 * ({@code render/engine/tileIds.ts}), since a sheet is stored as two blocks of eight columns by sixteen rows side
 * by side, not sixteen columns read straight across.
 * @param {TileSheetTab} tab Which sheet the grid shows.
 * @param {number} column The cell's column, 0 to 15.
 * @param {number} row The cell's row, 0 to 15.
 * @returns {number} The tile id, with the sheet's own base already added.
 */
const tileGridCell = (tab: TileSheetTab, column: number, row: number): number =>
{
  return tab.base + (column >= 8 ? 128 : 0) + row * 8 + (column % 8);
};

/**
 * A page's image, read for editing: every field RMMZ stores, plus the mode they resolve to.
 */
type EventImageModel = {
  readonly mode: EventImageMode;
  readonly tileId: number;
  readonly characterName: string;
  readonly direction: number;
  readonly pattern: number;
  readonly characterIndex: number;
};

/**
 * Reads a page's image for the picker.
 * @param {RmmzEventImage} image The image as stored.
 * @returns {EventImageModel} The model.
 */
const parseEventImage = (image: RmmzEventImage): EventImageModel =>
{
  const { tileId, characterName, direction, pattern, characterIndex } = image;
  return { mode: eventImageMode(image), tileId, characterName, direction, pattern, characterIndex };
};

/**
 * Writes the picker's model back in RMMZ's own field order, {@code mode} dropped since it is never stored: it is
 * read back from {@code tileId} and {@code characterName} the next time the page is opened.
 * @param {EventImageModel} model The model.
 * @returns {RmmzEventImage} The image.
 */
const writeEventImage = (model: EventImageModel): RmmzEventImage =>
{
  const { tileId, characterName, direction, pattern, characterIndex } = model;
  return { tileId, characterName, direction, pattern, characterIndex };
};

export {
  DIRECTION_OPTIONS,
  eventImageMode,
  parseEventImage,
  PATTERN_OPTIONS,
  sheetGrid,
  tileGridCell,
  TILE_SHEET_COLUMNS,
  TILE_SHEET_ROWS,
  TILE_SHEET_TABS,
  withCharacter,
  withDirection,
  withNoImage,
  withPattern,
  withTile,
  writeEventImage,
};
export type { EventImageMode, EventImageModel, SheetGrid, TileSheetTab };
