import { DIRECTIONS, passageBit } from '../../render/engine/passability.ts';
import { passageReaderOf, walkMapOf, type PassageReader } from '../../render/engine/walkPassage.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMapEvent, RmmzTileset } from '../model/rmmzTypes.ts';
import type { PassabilityRule } from '../modules/PluginModule.ts';
import { canPass, columnAfter, reverse, rowAfter, type Walker, type WalkMap } from '../moveRoutes/routeWalk.ts';
import type { PageRule } from '../pageRule/pageRule.ts';
import { ShownPages, type ActivePages } from '../pageRule/ShownPages.ts';
import { GamePreview } from '../preview/GamePreview.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import type { MapLocation } from './LocationPicks.ts';

/**
 * Why the player cannot land on a tile, in the order the check asks:
 * - {@code no-map}: the map does not exist, and the game stops with an error the moment it tries to load it;
 * - {@code off-map}: the tile lies outside the map, which is this many tiles across and down;
 * - {@code occupied}: an event stands there that the player can never share a tile with;
 * - {@code blocked}: the tiles there let no one through any way, as a wall or the empty space beyond a room does;
 * - {@code denied}: a plugin's rule takes away every way off the tile, for the reasons it gives, such as a region the
 *   player may never set foot in;
 * - {@code stuck}: the tile itself is open, but the tiles around it, or the map's edge, leave no way off it.
 */
type LandingProblem =
  | { readonly kind: 'no-map'; readonly mapId: number }
  | { readonly kind: 'off-map'; readonly width: number; readonly height: number }
  | { readonly kind: 'occupied'; readonly eventId: number; readonly name: string }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'denied'; readonly reasons: readonly string[] }
  | { readonly kind: 'stuck' };

/**
 * One map as the landing check reads it: the tiles, the events as they stand on a fresh save, and the plugins' rules,
 * worked out tile by tile as tiles are asked about and kept, so judging every tile of a big map stays quick.
 */
type LandingGround = {
  /**
   * The map judged.
   */
  readonly map: MapDocument;

  /**
   * Judges one tile as somewhere for the player to land.
   * @param {number} x The column.
   * @param {number} y The row.
   * @returns {LandingProblem | null} Why the player cannot land there, or null when they can.
   */
  problemAt(x: number, y: number): LandingProblem | null;
};

/**
 * The player as a landing puts them down: on foot, without Through, so every wall counts.
 */
const PLAYER: Walker = { x: 0, y: 0, facing: 2, directionFix: false, through: false };

/**
 * Builds the page every event shows on a fresh save at a moment of the clock: the window's page rule, every switch and
 * self switch off and every variable 0, at the clock's time of day and season.
 * @param {PageRule | null} rule The page rule, or null to read every event by its first page, as MZ's own editor does.
 * @param {number} timeOfDay The clock's time of day, in minutes past midnight.
 * @param {number | null} season The clock's season, or null for the season the game starts in.
 * @returns {ActivePages} The pages.
 */
const freshSavePages = (rule: PageRule | null, timeOfDay: number, season: number | null): ActivePages =>
{
  const pages = new ShownPages(rule, timeOfDay, GamePreview.FRESH);
  pages.setSeason(season);
  return pages;
};

/**
 * Finds, for each tile, the first event standing there that the player can never share a tile with, as
 * Game_CharacterBase#isCollidedWithEvents finds one: on the page it shows, its priority same as characters, and Through
 * off. An event no page holds for shows nothing and goes Through (Game_Event#clearPageSettings), so it never counts.
 * @param {MapDocument} map The map.
 * @param {ActivePages} pages Picks the page each event shows.
 * @returns {Map<number, RmmzMapEvent>} The first such event on each tile, by cell ({@code y * width + x}), in id order.
 */
const blockersByCell = (map: MapDocument, pages: ActivePages): Map<number, RmmzMapEvent> =>
{
  const blockers = new Map<number, RmmzMapEvent>();
  map.eventIds().forEach(id =>
  {
    const event = map.event(id) as RmmzMapEvent;
    const page = event.pages[pages.activePage(event)];
    const cell = event.y * map.width + event.x;
    if (page === undefined || page.priorityType !== 1 || page.through || blockers.has(cell))
    {
      return;
    }

    blockers.set(cell, event);
  });

  return blockers;
};

/**
 * Works out why no step leads off a tile, from what stops each of the four: the tile's own passage, a rule on the way
 * out, the map's edge, the next tile's passage, or a rule on the way into it. A tile whose own passage stops all four is
 * blocked; otherwise any rule's reason among the four says the rules took the last ways away; otherwise it is stuck.
 * @param {WalkMap} walkMap The map, as a walk steps across it.
 * @param {PassageReader} passage Reads what stops each step out of a tile.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {LandingProblem} Why the player could not step off it.
 */
const whyStuck = (walkMap: WalkMap, passage: PassageReader, x: number, y: number): LandingProblem =>
{
  const own = passage(x, y);
  if (own.blocked === 0x0f)
  {
    return { kind: 'blocked' };
  }

  // each way off: out of this tile, then into the next, as Game_CharacterBase#isMapPassable reads both halves.
  const reasons = new Set<string>();
  DIRECTIONS.forEach(direction =>
  {
    const outward = own.reasons[direction];
    if (outward !== undefined)
    {
      reasons.add(outward);
      return;
    }

    const toX = columnAfter(walkMap, x, direction);
    const toY = rowAfter(walkMap, y, direction);
    if ((own.blocked & passageBit(direction)) !== 0 || toX < 0 || toY < 0 || toX >= walkMap.width || toY >= walkMap.height)
    {
      return;
    }

    // the way in is the next tile's own step back, so a rule judging the tile it steps onto names this one.
    const inward = passage(toX, toY).reasons[reverse(direction)];
    if (inward !== undefined)
    {
      reasons.add(inward);
    }
  });

  return reasons.size > 0
    ? { kind: 'denied', reasons: [ ...reasons ] }
    : { kind: 'stuck' };
};

/**
 * Reads a map as somewhere to land. A tile is a landing when the player could stand on it and play on from there,
 * judged as the engine and the active plugins would:
 *
 * 1. it lies on the map;
 * 2. no event stands there that the player can never share a tile with, each event read by the page a fresh save shows
 *    at the clock's time;
 * 3. at least one step leads off it, as Game_CharacterBase#canPass takes a step without counting characters: the next
 *    tile on the map, wrapping on a map that loops, the way out of this tile and the way into the next both open. Each
 *    way reads the tiles as Game_Map#checkPassage does, top layer first, star tiles skipped and tile pictures of events
 *    below characters on top, then every plugin rule.
 *
 * The third is how a tile the player cannot stand on shows itself: a wall or the space beyond a room lets no one through
 * any way; a region a plugin keeps everyone out of refuses the way back onto it from every side, so no step ever leaves
 * it; a terrain a plugin keeps everyone off refuses every way out of it. An open tile walled in on every side fails it
 * too, since the player landing there could never move. Steps are the very steps a route preview walks, so the two never
 * disagree.
 * @param {MapDocument} map The map.
 * @param {RmmzTileset} tileset Its tileset.
 * @param {readonly PassabilityRule[]} rules The plugin modules' rules.
 * @param {ActivePages} pages Picks the page each event shows; see {@link freshSavePages}.
 * @returns {LandingGround} The map, ready to judge.
 */
const landingGroundOf = (map: MapDocument, tileset: RmmzTileset, rules: readonly PassabilityRule[], pages: ActivePages): LandingGround =>
{
  const passage = passageReaderOf(map, tileset, rules, pages);
  const walkMap = walkMapOf(map, tileset, rules, passage);
  const blockers = blockersByCell(map, pages);
  return {
    map,
    problemAt: (x: number, y: number): LandingProblem | null =>
    {
      const { width, height } = map;
      if (x < 0 || y < 0 || x >= width || y >= height)
      {
        return { kind: 'off-map', width, height };
      }

      const blocker = blockers.get(y * width + x);
      if (blocker !== undefined)
      {
        return { kind: 'occupied', eventId: blocker.id, name: blocker.name };
      }

      // one way off is all a landing needs.
      return DIRECTIONS.some(direction => canPass(walkMap, PLAYER, x, y, direction))
        ? null
        : whyStuck(walkMap, passage, x, y);
    },
  };
};

/**
 * Judges where something lands: on a map that does not exist, or on a tile of one that does.
 * @param {LandingGround | null} ground The map it lands on, ready to judge, or null when there is no such map.
 * @param {MapLocation} location Where it lands.
 * @returns {LandingProblem | null} Why the player cannot land there, or null when they can.
 */
const landingProblem = (ground: LandingGround | null, location: MapLocation): LandingProblem | null =>
{
  return ground === null
    ? { kind: 'no-map', mapId: location.mapId }
    : ground.problemAt(location.x, location.y);
};

/**
 * Says why the player cannot land somewhere, as a sentence or two an author reads beside the place.
 * @param {LandingProblem} problem The problem.
 * @returns {string} The words.
 */
const landingWords = (problem: LandingProblem): string =>
{
  switch (problem.kind)
  {
    case 'no-map':
      return `Map ${problem.mapId} does not exist.`;
    case 'off-map':
      return `That tile is off the map, which is ${problem.width} by ${problem.height} tiles.`;
    case 'occupied':
    {
      const who = problem.name === '' ? 'An event' : problem.name;
      return `${who} (event ${problem.eventId}) stands there, and the player cannot share its tile.`;
    }
    case 'blocked':
      return 'The tiles there let no one through.';
    case 'denied':
      return `There is no way off it. ${problem.reasons.join(' ')}`;
    case 'stuck':
      return 'There is no way off it: every tile around it is blocked.';
  }
};

/**
 * Lists the tiles of a map the player cannot land on, as rectangles to shade: each row's runs of such tiles joined, and a
 * run joined to the same run on the rows below, so the empty space around a room is a handful of shapes rather than
 * thousands of tiles.
 * @param {LandingGround} ground The map, ready to judge.
 * @returns {CellRect[]} The rectangles, in the order their top rows are reached.
 */
const closedTiles = (ground: LandingGround): CellRect[] =>
{
  const { width, height } = ground.map;
  const done: CellRect[] = [];
  let open = new Map<string, CellRect>();
  for (let y = 0; y < height; y++)
  {
    // each tile of the row judged once.
    const closed = Array.from({ length: width }, (_, x) => ground.problemAt(x, y) !== null);
    const next = new Map<string, CellRect>();
    let x = 0;
    while (x < width)
    {
      if (closed[x] === false)
      {
        x += 1;
        continue;
      }

      // the run goes on to the last closed tile in a row.
      const start = x;
      while (x < width && closed[x])
      {
        x += 1;
      }

      const key = `${start}:${x - start}`;
      const above = open.get(key);
      next.set(key, above === undefined ? { x: start, y, width: x - start, height: 1 } : { ...above, height: above.height + 1 });
      open.delete(key);
    }

    // a run the row below does not carry on is finished.
    done.push(...open.values());
    open = next;
  }

  return [ ...done, ...open.values() ].sort((left, right) => left.y - right.y || left.x - right.x);
};

export { closedTiles, freshSavePages, landingGroundOf, landingProblem, landingWords };
export type { LandingGround, LandingProblem };
