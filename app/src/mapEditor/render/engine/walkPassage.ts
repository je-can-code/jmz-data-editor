import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzTileset } from '../../core/model/rmmzTypes.ts';
import type { PassabilityRule } from '../../core/modules/PluginModule.ts';
import type { Facing, WalkMap } from '../../core/moveRoutes/routeWalk.ts';
import type { ActivePages } from '../../core/pageRule/ShownPages.ts';
import { cellPassage, FIRST_PAGES, passabilityQuery, passageBit, tileEventsByCell, type CellPassage, type PassageSource } from './passability.ts';

/**
 * The scroll types of a map that loops across, and up and down, as Game_Map#isLoopHorizontal and #isLoopVertical read
 * them: 2 loops across, 1 up and down, 3 both.
 */
const LOOPS_ACROSS: ReadonlySet<number> = new Set([ 2, 3 ]);
const LOOPS_UP_AND_DOWN: ReadonlySet<number> = new Set([ 1, 3 ]);

/**
 * Reads what stops steps out of one tile of a map, the tile on the map.
 */
type PassageReader = (x: number, y: number) => CellPassage;

/**
 * Builds a reader of what stops steps out of each tile of a map, exactly as the passability overlay works it out: the
 * engine's own passage through the tile stack, events with tile pictures beneath characters included, then every plugin
 * module's deny rule, with the reasons the rules give. Each tile is worked out once, the first time it is asked about.
 * @param {MapDocument} map The map.
 * @param {RmmzTileset} tileset Its tileset.
 * @param {readonly PassabilityRule[]} rules The plugin modules' deny rules.
 * @param {ActivePages} pages Picks the page each event shows, whose tile picture counts; each event's first by default,
 * as the overlay draws them.
 * @returns {PassageReader} The reader, for tiles on the map.
 */
const passageReaderOf = (map: MapDocument, tileset: RmmzTileset, rules: readonly PassabilityRule[], pages: ActivePages = FIRST_PAGES): PassageReader =>
{
  const { width, height } = map;
  const source: PassageSource = { width, height, data: map.cells, flags: tileset.flags };
  const tileEvents = tileEventsByCell(map, pages);
  const query = passabilityQuery(map, tileset);
  const known = new Map<number, CellPassage>();
  return (x: number, y: number): CellPassage =>
  {
    const cell = y * width + x;
    const read = known.get(cell);
    if (read !== undefined)
    {
      return read;
    }

    const passage = cellPassage(source, x, y, tileEvents.get(cell) ?? [], rules, query);
    known.set(cell, passage);
    return passage;
  };
};

/**
 * Builds the map a route walks on from a map and its tileset, deciding each step out of a tile exactly as the
 * passability overlay does: the engine's own passage through the tile stack, events with tile pictures beneath
 * characters included, then every plugin module's deny rule. Each tile is worked out once, the first time a walk asks,
 * and a tile off the map lets nothing through.
 * @param {MapDocument} map The map.
 * @param {RmmzTileset} tileset Its tileset.
 * @param {readonly PassabilityRule[]} rules The plugin modules' deny rules.
 * @param {PassageReader} passage Reads what stops steps out of each tile; worked out from the map, its tileset, the
 * rules and each event's first page unless handed over.
 * @returns {WalkMap} The map to walk on.
 */
const walkMapOf = (
  map: MapDocument,
  tileset: RmmzTileset,
  rules: readonly PassabilityRule[],
  passage: PassageReader = passageReaderOf(map, tileset, rules)): WalkMap =>
{
  const { width, height } = map;
  const scrollType = map.property('scrollType');
  return {
    width,
    height,
    loopsX: LOOPS_ACROSS.has(scrollType),
    loopsY: LOOPS_UP_AND_DOWN.has(scrollType),
    isPassable: (x: number, y: number, direction: Facing) =>
    {
      if (x < 0 || y < 0 || x >= width || y >= height)
      {
        return false;
      }

      const { blocked, denied } = passage(x, y);
      return ((blocked | denied) & passageBit(direction)) === 0;
    },
  };
};

export { passageReaderOf, walkMapOf };
export type { PassageReader };
