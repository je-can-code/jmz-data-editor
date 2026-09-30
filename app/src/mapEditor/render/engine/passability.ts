import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzTileset } from '../../core/model/rmmzTypes.ts';
import type { PassabilityQuery, PassabilityRule } from '../../core/modules/PluginModule.ts';
import { TileFlag } from './tileIds.ts';

/**
 * The four directions a step can take, as RMMZ numbers them: down, left, right, up.
 */
const DIRECTIONS = [ 2, 4, 6, 8 ] as const;

/**
 * One of the four directions.
 */
type Direction = typeof DIRECTIONS[number];

/**
 * What stops steps out of one cell: the directions the engine's own passability blocks, and the directions a plugin
 * module's rule denies on top, each as a mask of passage bits (1 down, 2 left, 4 right, 8 up), with the rules'
 * reasons.
 */
type CellPassage = {
  readonly blocked: number;
  readonly denied: number;
  readonly reasons: readonly string[];
};

/**
 * The parts of a map passability reads.
 */
type PassageSource = {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
  readonly flags: ArrayLike<number>;
};

/**
 * Names the passage bit a direction reads, as Game_Map#isPassable: down 1, left 2, right 4, up 8.
 * @param {Direction} direction The direction.
 * @returns {number} The bit.
 */
const passageBit = (direction: Direction): number =>
{
  return (1 << (direction / 2 - 1)) & 0x0f;
};

/**
 * Decides whether a step through a stack of tiles is allowed, as Game_Map#checkPassage: the first tile without the
 * star flag decides, and a stack of nothing but star tiles is blocked.
 * @param {ArrayLike<number>} flags The tileset's flags.
 * @param {readonly number[]} tiles The tiles, top first, as Game_Map#allTiles lists them.
 * @param {number} bit The passage bit to test.
 * @returns {boolean} True when passable.
 */
const checkPassage = (flags: ArrayLike<number>, tiles: readonly number[], bit: number): boolean =>
{
  for (const tile of tiles)
  {
    const flag = flags[tile] ?? 0;

    // a star tile has no effect on passage.
    if ((flag & TileFlag.star) !== 0)
    {
      continue;
    }

    if ((flag & bit) === 0)
    {
      return true;
    }

    if ((flag & bit) === bit)
    {
      return false;
    }
  }

  return false;
};

/**
 * Lists the tiles a cell's passage reads, as Game_Map#allTiles: the tile images of events below characters standing
 * there, then the four layers from the top down.
 * @param {PassageSource} source The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {readonly number[]} tileEvents The tile ids of the tile-image events there, by event id.
 * @returns {number[]} The tiles, top first.
 */
const cellTiles = (source: PassageSource, x: number, y: number, tileEvents: readonly number[]): number[] =>
{
  const tiles = [ ...tileEvents ];
  for (let z = 3; z >= 0; z--)
  {
    tiles.push(source.data[(z * source.height + y) * source.width + x] || 0);
  }

  return tiles;
};

/**
 * Collects the tile ids of the events that count toward passage, as Game_Map#tileEventsXy picks them: a tile image
 * with priority below characters. The editor reads each event's first page, the page it draws.
 * @param {MapDocument} document The map.
 * @returns {Map<number, number[]>} Tile ids by cell ({@code y * width + x}), in event id order.
 */
const tileEventsByCell = (document: MapDocument): Map<number, number[]> =>
{
  const cells = new Map<number, number[]>();
  document.eventIds().forEach(id =>
  {
    const event = document.event(id);
    const page = event?.pages[0];
    if (event === null || page === undefined || page.image.tileId <= 0 || page.priorityType !== 0)
    {
      return;
    }

    const cell = event.y * document.width + event.x;
    const tiles = cells.get(cell) ?? [];
    tiles.push(page.image.tileId);
    cells.set(cell, tiles);
  });

  return cells;
};

/**
 * Works out what stops steps out of one cell: the engine's passability for each direction, then each module rule for
 * the directions the engine allows.
 * @param {PassageSource} source The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {readonly number[]} tileEvents The tile ids of the tile-image events there.
 * @param {readonly PassabilityRule[]} rules The modules' rules.
 * @param {(x: number, y: number, direction: Direction) => PassabilityQuery} query Builds what a rule is asked.
 * @returns {CellPassage} What is blocked, what is denied, and why.
 */
const cellPassage = (
  source: PassageSource,
  x: number,
  y: number,
  tileEvents: readonly number[],
  rules: readonly PassabilityRule[],
  query: (x: number, y: number, direction: Direction) => PassabilityQuery): CellPassage =>
{
  const tiles = cellTiles(source, x, y, tileEvents);
  let blocked = 0;
  let denied = 0;
  const reasons: string[] = [];
  DIRECTIONS.forEach(direction =>
  {
    const bit = passageBit(direction);
    if (checkPassage(source.flags, tiles, bit) === false)
    {
      blocked |= bit;
      return;
    }

    // a rule only matters where the engine would let the step through.
    for (const rule of rules)
    {
      const reason = rule.deny(query(x, y, direction));
      if (reason !== null)
      {
        denied |= bit;
        reasons.push(reason);
        break;
      }
    }
  });

  return { blocked, denied, reasons };
};

/**
 * Builds the query factory a map's rules are asked through.
 * @param {MapDocument} document The map.
 * @param {RmmzTileset} tileset Its tileset.
 * @returns {(x: number, y: number, direction: Direction) => PassabilityQuery} The factory.
 */
const passabilityQuery = (document: MapDocument, tileset: RmmzTileset) =>
{
  return (x: number, y: number, direction: Direction): PassabilityQuery => ({ document, tileset, x, y, direction });
};

export { cellPassage, cellTiles, checkPassage, DIRECTIONS, passabilityQuery, passageBit, tileEventsByCell };
export type { CellPassage, Direction, PassageSource };
