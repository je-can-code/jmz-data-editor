import type { RmmzEventImage } from '../../core/model/rmmzTypes.ts';
import { normalTileCell, TileFlag } from './tileIds.ts';

/**
 * What a character sheet's name says about it, as ImageManager reads the {@code !} and {@code $} it may start with.
 */
type SheetKind = {
  /**
   * {@code $}: the sheet holds one character, three patterns by four directions, instead of eight.
   */
  readonly big: boolean;

  /**
   * {@code !}: an object, which sits on its tile instead of standing 6 pixels up, and never sinks into bushes.
   */
  readonly object: boolean;
};

/**
 * Where an event's picture is cut from: a character sheet, or one of the tileset's B to E sheets for a tile image.
 */
type SpriteFrame = {
  readonly source: 'character' | 'tileset';

  /**
   * For a tile image, the sheet among the tileset's nine (5 to 8 for B to E); 0 for a character sheet.
   */
  readonly sheet: number;
  readonly sx: number;
  readonly sy: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Where and in what order an event's sprite draws: the point its bottom centre sits on, the engine's z (1 below
 * characters, 3 with them, 5 above them, and so above star tiles), and how deep it sinks into a bush.
 */
type SpritePlacement = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly bushDepth: number;
};

/**
 * The size of a loaded sheet.
 */
type SheetSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * Reads the {@code !} and {@code $} a character sheet's file name starts with, as ImageManager.isObjectCharacter and
 * isBigCharacter do: only the leading run of those two marks counts, and only the file name, not its folder.
 * @param {string} name The sheet's name.
 * @returns {SheetKind} What the name says.
 */
const sheetKind = (name: string): SheetKind =>
{
  const fileName = name.split('/').pop() ?? '';
  const marks = /^[!$]+/u.exec(fileName)?.[0] ?? '';
  return { big: marks.includes('$'), object: marks.includes('!') };
};

/**
 * Finds the frame an event page's image shows, as Sprite_Character#updateTileFrame and #updateCharacterFrame do.
 * @param {RmmzEventImage} image The page's image.
 * @param {SheetSize | null} sheet The character sheet's size, once loaded; tile images do not need it.
 * @param {number} tileSize The tile size.
 * @returns {SpriteFrame | null} The frame, or null when the page shows nothing or its sheet is not loaded yet.
 */
const eventFrame = (image: RmmzEventImage, sheet: SheetSize | null, tileSize: number): SpriteFrame | null =>
{
  if (image.tileId > 0)
  {
    const { column, row } = normalTileCell(image.tileId);
    return {
      source: 'tileset',
      sheet: 5 + Math.floor(image.tileId / 256),
      sx: column * tileSize,
      sy: row * tileSize,
      width: tileSize,
      height: tileSize,
    };
  }

  if (image.characterName === '' || sheet === null)
  {
    return null;
  }

  // a big sheet is one character; a normal one holds eight, four across and two down, three patterns by four facings.
  const { big } = sheetKind(image.characterName);
  const width = big ? sheet.width / 3 : sheet.width / 12;
  const height = big ? sheet.height / 4 : sheet.height / 8;
  const blockX = big ? 0 : (image.characterIndex % 4) * 3;
  const blockY = big ? 0 : Math.floor(image.characterIndex / 4) * 4;
  return {
    source: 'character',
    sheet: 0,
    sx: (blockX + image.pattern) * width,
    sy: (blockY + (image.direction - 2) / 2) * height,
    width,
    height,
  };
};

/**
 * Reports whether a cell holds a bush on any tile layer, as Game_Map#isBush reads it through checkLayeredTilesFlags.
 * @param {ArrayLike<number>} data The map's six layers.
 * @param {number} width The map's width.
 * @param {number} height The map's height.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {boolean} True on a bush.
 */
const isBushCell = (
  data: ArrayLike<number>, width: number, height: number, flags: ArrayLike<number>, x: number, y: number): boolean =>
{
  if (x < 0 || y < 0 || x >= width || y >= height)
  {
    return false;
  }

  for (let z = 0; z < 4; z++)
  {
    const tileId = data[(z * height + y) * width + x] || 0;
    if (((flags[tileId] ?? 0) & TileFlag.bush) !== 0)
    {
      return true;
    }
  }

  return false;
};

/**
 * Places an event's sprite as the engine does for a character standing still: its bottom centre at
 * Game_CharacterBase#screenX and #screenY (6 pixels up unless it is an object or a tile), its z from its priority, and
 * its bush depth from Game_CharacterBase#refreshBushDepth: a quarter tile, for a character of normal priority that is
 * not an object, standing on a bush.
 * @param {number} x The event's column.
 * @param {number} y The event's row.
 * @param {RmmzEventImage} image The page's image.
 * @param {number} priorityType The page's priority: 0 below characters, 1 with them, 2 above them.
 * @param {boolean} onBush Whether the event's cell holds a bush.
 * @param {number} tileSize The tile size.
 * @returns {SpritePlacement} The placement.
 */
const eventPlacement = (
  x: number, y: number, image: RmmzEventImage, priorityType: number, onBush: boolean, tileSize: number): SpritePlacement =>
{
  // a tile image counts as an object: Game_CharacterBase#setTileImage marks it so.
  const object = image.tileId > 0 || sheetKind(image.characterName).object;
  const shiftY = object ? 0 : 6;
  const sinks = priorityType === 1 && object === false && onBush;
  return {
    x: Math.floor(x * tileSize + tileSize / 2),
    y: Math.floor(y * tileSize + tileSize - shiftY),
    z: priorityType * 2 + 1,
    bushDepth: sinks ? tileSize / 4 : 0,
  };
};

/**
 * Orders sprites as the engine's tilemap sorts its children: by z, then by the y they stand on, then by the order
 * they were made, which for events is their id.
 * @param {{ z: number, y: number, id: number }} left One sprite.
 * @param {{ z: number, y: number, id: number }} right The other.
 * @returns {number} Negative when the left draws first.
 */
const compareDrawOrder = (
  left: { z: number; y: number; id: number },
  right: { z: number; y: number; id: number }): number =>
{
  if (left.z !== right.z)
  {
    return left.z - right.z;
  }

  if (left.y !== right.y)
  {
    return left.y - right.y;
  }

  return left.id - right.id;
};

export { compareDrawOrder, eventFrame, eventPlacement, isBushCell, sheetKind };
export type { SheetKind, SheetSize, SpriteFrame, SpritePlacement };
