import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Chef Adventure, when it sits beside this repository in the workspace. Resolved from this file rather than the
 * working directory, so it holds wherever vitest runs.
 */
const SIBLING_GAME = fileURLToPath(new URL('../../../../../../../ca/chef-adventure', import.meta.url));

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
 * Reports whether a folder holds an RMMZ project.
 * @param {string} root The candidate root.
 * @returns {boolean} True when it has a map tree.
 */
const isGameFolder = (root: string): boolean =>
{
  return existsSync(`${root}/data/MapInfos.json`);
};

/**
 * Finds the game whose shipped maps the tile tests check.
 *
 * {@code JMZ_PROJECT_ROOT} comes first, since it is what the server reads and the only way a worktree, where the
 * sibling path resolves to nothing, can reach the game. When it is set it must be right: a mistyped path throws
 * rather than quietly skipping the very tests it was set to run. Unset, the sibling checkout is used, and the tests
 * skip when that is absent too, since the game is not part of this repository.
 * @returns {string | null} The game's root, or null when none is configured or beside the repository.
 */
const locateShippedGame = (): string | null =>
{
  const configured = process.env['JMZ_PROJECT_ROOT'] ?? '';
  if (configured !== '')
  {
    if (isGameFolder(configured) === false)
    {
      throw new Error(`JMZ_PROJECT_ROOT is set to ${configured}, which holds no RMMZ project`);
    }

    return configured;
  }

  return isGameFolder(SIBLING_GAME)
    ? SIBLING_GAME
    : null;
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

export { locateShippedGame, readShippedMaps, readShippedTilesets };
export type { ShippedMap, ShippedTileset };
