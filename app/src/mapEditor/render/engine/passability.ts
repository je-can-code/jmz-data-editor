import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzMapEvent, RmmzTileset } from '../../core/model/rmmzTypes.ts';
import type { PassabilityQuery, PassabilityRule } from '../../core/modules/PluginModule.ts';
import type { ActivePages } from '../../core/pageRule/ShownPages.ts';
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
 * module's rule denies on top, each as a mask of passage bits (1 down, 2 left, 4 right, 8 up), with the reason the rule
 * gave for each direction it denies.
 */
type CellPassage = {
  readonly blocked: number;
  readonly denied: number;
  readonly reasons: Readonly<Partial<Record<Direction, string>>>;
};

/**
 * Builds what a cell's rules are asked about one step out of it.
 */
type QueryFactory = (x: number, y: number, direction: Direction, tiles: readonly number[]) => PassabilityQuery;

/**
 * Reads every event by its first page, as MZ's own editor shows it, which is the page passability reads unless a page
 * rule is handed over: an event with no pages shows none.
 */
const FIRST_PAGES: ActivePages = {
  activePage: (event: RmmzMapEvent) => (event.pages.length > 0 ? 0 : -1),
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
 * with priority below characters, standing there without Through (Game_CharacterBase#posNt skips an event with it on).
 * Each event is read by the page it shows: its first, the page the editor draws, unless a page rule says which. An event
 * no page holds for shows none, which the engine reads as Through (Game_Event#clearPageSettings), so it counts for
 * nothing.
 * @param {MapDocument} document The map.
 * @param {ActivePages} pages Picks the page each event shows; each event's first by default.
 * @returns {Map<number, number[]>} Tile ids by cell ({@code y * width + x}), in event id order.
 */
const tileEventsByCell = (document: MapDocument, pages: ActivePages = FIRST_PAGES): Map<number, number[]> =>
{
  const cells = new Map<number, number[]>();
  document.eventIds().forEach(id =>
  {
    const event = document.event(id);
    const page = event === null ? undefined : event.pages[pages.activePage(event)];
    if (event === null || page === undefined || page.image.tileId <= 0 || page.priorityType !== 0 || page.through)
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
 * the directions the engine allows, the first rule to deny a direction giving its reason.
 * @param {PassageSource} source The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {readonly number[]} tileEvents The tile ids of the tile-image events there.
 * @param {readonly PassabilityRule[]} rules The modules' rules.
 * @param {QueryFactory} query Builds what a rule is asked.
 * @returns {CellPassage} What is blocked, what is denied, and why.
 */
const cellPassage = (
  source: PassageSource,
  x: number,
  y: number,
  tileEvents: readonly number[],
  rules: readonly PassabilityRule[],
  query: QueryFactory): CellPassage =>
{
  const tiles = cellTiles(source, x, y, tileEvents);
  let blocked = 0;
  let denied = 0;
  const reasons: Partial<Record<Direction, string>> = {};
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
      const reason = rule.deny(query(x, y, direction, tiles));
      if (reason !== null)
      {
        denied |= bit;
        reasons[direction] = reason;
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
 * @returns {QueryFactory} The factory.
 */
const passabilityQuery = (document: MapDocument, tileset: RmmzTileset): QueryFactory =>
{
  return (x: number, y: number, direction: Direction, tiles: readonly number[]): PassabilityQuery =>
  {
    return { document, tileset, x, y, direction, tiles };
  };
};

export { cellPassage, cellTiles, checkPassage, DIRECTIONS, FIRST_PAGES, passabilityQuery, passageBit, tileEventsByCell };
export type { CellPassage, Direction, PassageSource, QueryFactory };
