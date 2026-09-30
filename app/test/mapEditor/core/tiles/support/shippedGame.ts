import { readdirSync, readFileSync } from 'node:fs';

/**
 * One shipped map, as the tile tests need it: its id, size, tileset, and the six layers.
 */
type ShippedMap = {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly tilesetId: number;
  readonly cells: Uint16Array;
};

/**
 * One row of {@code Tilesets.json}, as far as the tile tests read it.
 */
type ShippedTileset = {
  readonly id: number;
  readonly mode: number;
  readonly name: string;
};

/**
 * Reads every map the game ships with tiles in it, in id order. The 0x0 placeholders in the map tree hold nothing
 * to check and are left out.
 * @param {string} root The game's root.
 * @returns {ShippedMap[]} The maps.
 */
const readShippedMaps = (root: string): ShippedMap[] =>
{
  return readdirSync(`${root}/data`)
    .filter(name => /^Map\d{3,}\.json$/u.test(name))
    .sort()
    .map((name) =>
    {
      const json = JSON.parse(readFileSync(`${root}/data/${name}`, 'utf8')) as {
        width: number;
        height: number;
        tilesetId: number;
        data: number[];
      };

      return {
        id: Number.parseInt(name.slice('Map'.length), 10),
        width: json.width,
        height: json.height,
        tilesetId: json.tilesetId,
        cells: Uint16Array.from(json.data),
      };
    })
    .filter(map => map.width > 0 && map.height > 0);
};

/**
 * Reads the game's tilesets, keyed by id.
 * @param {string} root The game's root.
 * @returns {Map<number, ShippedTileset>} The tilesets.
 */
const readShippedTilesets = (root: string): Map<number, ShippedTileset> =>
{
  const rows = JSON.parse(readFileSync(`${root}/data/Tilesets.json`, 'utf8')) as (ShippedTileset | null)[];
  const tilesets = new Map<number, ShippedTileset>();
  rows.forEach((row) =>
  {
    if (row !== null)
    {
      tilesets.set(row.id, { id: row.id, mode: row.mode, name: row.name });
    }
  });

  return tilesets;
};

export { readShippedMaps, readShippedTilesets };
export type { ShippedMap, ShippedTileset };
