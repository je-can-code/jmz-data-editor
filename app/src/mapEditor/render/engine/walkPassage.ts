import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzTileset } from '../../core/model/rmmzTypes.ts';
import type { PassabilityRule } from '../../core/modules/PluginModule.ts';
import type { Facing, WalkMap } from '../../core/moveRoutes/routeWalk.ts';
import { cellPassage, passabilityQuery, passageBit, tileEventsByCell, type PassageSource } from './passability.ts';

/**
 * The scroll types of a map that loops across, and up and down, as Game_Map#isLoopHorizontal and #isLoopVertical read
 * them: 2 loops across, 1 up and down, 3 both.
 */
const LOOPS_ACROSS: ReadonlySet<number> = new Set([ 2, 3 ]);
const LOOPS_UP_AND_DOWN: ReadonlySet<number> = new Set([ 1, 3 ]);

/**
 * Builds the map a route walks on from a map and its tileset, deciding each step out of a tile exactly as the
 * passability overlay does: the engine's own passage through the tile stack, events with tile pictures beneath
 * characters included, then every plugin module's deny rule. Each tile is worked out once, the first time a walk asks,
 * and a tile off the map lets nothing through.
 * @param {MapDocument} map The map.
 * @param {RmmzTileset} tileset Its tileset.
 * @param {readonly PassabilityRule[]} rules The plugin modules' deny rules.
 * @returns {WalkMap} The map to walk on.
 */
const walkMapOf = (map: MapDocument, tileset: RmmzTileset, rules: readonly PassabilityRule[]): WalkMap =>
{
  const { width, height } = map;
  const source: PassageSource = { width, height, data: map.cells, flags: tileset.flags };
  const tileEvents = tileEventsByCell(map);
  const query = passabilityQuery(map, tileset);
  const stopped = new Map<number, number>();
  const scrollType = map.property('scrollType');

  /**
   * Works out which ways out of a tile are stopped, once per tile.
   * @param {number} x The column.
   * @param {number} y The row.
   * @returns {number} The passage bits stopped, whether by the tiles or by a rule.
   */
  const stoppedAt = (x: number, y: number): number =>
  {
    const cell = y * width + x;
    const known = stopped.get(cell);
    if (known !== undefined)
    {
      return known;
    }

    const { blocked, denied } = cellPassage(source, x, y, tileEvents.get(cell) ?? [], rules, query);
    stopped.set(cell, blocked | denied);
    return blocked | denied;
  };

  return {
    width,
    height,
    loopsX: LOOPS_ACROSS.has(scrollType),
    loopsY: LOOPS_UP_AND_DOWN.has(scrollType),
    isPassable: (x: number, y: number, direction: Facing) =>
    {
      const onMap = x >= 0 && y >= 0 && x < width && y < height;
      return onMap && (stoppedAt(x, y) & passageBit(direction)) === 0;
    },
  };
};

export { walkMapOf };
