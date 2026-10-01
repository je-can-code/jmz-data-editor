import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { withReshapes } from '../tiles/autotileRefresh.ts';
import { cellIndex, TILE_LAYERS, type CellChange, type TileGrid, type TileLayerIndex } from '../tiles/tileGrid.ts';
import { unshapedTile } from '../tiles/tileRoles.ts';
import { describeTile } from './paletteLayout.ts';
import { FlagBit, flagsOf, terrainTagOf } from './tileFlags.ts';

/**
 * How passage treats one tile of a cell, walking the cell from the top as the engine does:
 *
 * - {@code decides}: the first tile without a star, whose passage bits decide every way out of the cell;
 * - {@code lookedPast}: a star tile above it (the empty tile is one), which passage looks straight past;
 * - {@code unread}: a tile below the one that decides, which passage never reaches.
 */
type PassageRole = 'decides' | 'lookedPast' | 'unread';

/**
 * One tile layer of a cell, as the stack view shows it.
 */
type StackLayer = {
  readonly z: TileLayerIndex;
  readonly tileId: number;
  readonly flags: number;
  readonly passage: PassageRole;
  readonly terrainTag: number;

  /**
   * Whether this layer's terrain tag is the cell's: the first tag found from the top.
   */
  readonly decidesTerrain: boolean;
};

/**
 * An event standing on a cell with a tile for its picture, below characters and without Through: the engine reads its
 * tile before any layer when it works out passage there.
 */
type StackEventTile = {
  readonly eventId: number;
  readonly tileId: number;
  readonly flags: number;
  readonly passage: PassageRole;
};

/**
 * Everything stacked on one cell and what it comes to, as the engine reads it.
 */
type CellStack = {
  readonly x: number;
  readonly y: number;

  /**
   * The four tile layers, layer 4 first, which is the order the engine reads them.
   */
  readonly layers: readonly StackLayer[];

  /**
   * The tiles of events standing there, which passage reads before the layers.
   */
  readonly eventTiles: readonly StackEventTile[];

  /**
   * The ways out passage blocks, as passage bits (1 down, 2 left, 4 right, 8 up): the deciding tile's, or every way
   * when every tile is a star.
   */
  readonly blocked: number;

  /**
   * Whether any layer is a ladder, a bush, a counter or a damage floor: the engine counts each from every layer.
   */
  readonly ladder: boolean;
  readonly bush: boolean;
  readonly counter: boolean;
  readonly damage: boolean;

  /**
   * The cell's terrain tag: the first one found from the top, 0 for none.
   */
  readonly terrainTag: number;

  /**
   * The cell's shadow bits (1 top left, 2 top right, 4 bottom left, 8 bottom right) and its region id.
   */
  readonly shadow: number;
  readonly region: number;
};

/**
 * What the stack view reads from a map and its tileset.
 */
type StackSource = TileGrid & {
  readonly flags: ArrayLike<number>;
};

/**
 * An event's tile standing on a cell, before its passage role is worked out.
 */
type EventTile = {
  readonly eventId: number;
  readonly tileId: number;
};

/**
 * A change to one cell's layers the stack view offers, with the name the map's history gives it.
 */
type CellFix = {
  readonly label: string;
  readonly changes: readonly CellChange[];
};

/**
 * Lists the events whose tile passage reads on a cell, as the engine picks them: a tile for a picture, below
 * characters, without Through. The editor reads each event's first page, the page it draws.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's events.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {EventTile[]} The events' tiles, in event id order.
 */
const eventTilesAt = (events: readonly (RmmzMapEvent | null)[], x: number, y: number): EventTile[] =>
{
  return events.flatMap((event) =>
  {
    const page = event?.pages[0];
    if (event === null || page === undefined || event.x !== x || event.y !== y)
    {
      return [];
    }

    return page.image.tileId > 0 && page.priorityType === 0 && page.through === false
      ? [ { eventId: event.id, tileId: page.image.tileId } ]
      : [];
  });
};

/**
 * Works out every tile's passage role in the order passage reads them: looked past until the first tile without a
 * star, which decides, and unread after it.
 * @param {readonly number[]} flags Each tile's flags, in reading order.
 * @returns {PassageRole[]} Each tile's role.
 */
const passageRoles = (flags: readonly number[]): PassageRole[] =>
{
  const deciding = flags.findIndex(flag => (flag & FlagBit.star) === 0);
  return flags.map((_, index) =>
  {
    if (deciding < 0 || index < deciding)
    {
      return 'lookedPast';
    }

    return index === deciding
      ? 'decides'
      : 'unread';
  });
};

/**
 * Reads everything stacked on one cell and works out what it comes to, as Game_Map#checkPassage and its neighbours
 * do: passage from the first tile without a star, event tiles first and then layer 4 down to layer 1; ladders,
 * bushes, counters and damage floors from any layer; the terrain tag from the first layer that has one.
 * @param {StackSource} source The map's tile data and its tileset's flags.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {readonly EventTile[]} eventTiles The tiles of events standing there (see {@link eventTilesAt}).
 * @returns {CellStack} The stack.
 */
const readCellStack = (source: StackSource, x: number, y: number, eventTiles: readonly EventTile[]): CellStack =>
{
  const { width, height, cells, flags } = source;
  const topFirst = [ ...TILE_LAYERS ].reverse();
  const layerTiles = topFirst.map(z => cells[cellIndex(width, height, x, y, z)]);
  const layerFlags = layerTiles.map(tileId => flagsOf(flags, tileId));
  const eventFlags = eventTiles.map(each => flagsOf(flags, each.tileId));
  const roles = passageRoles([ ...eventFlags, ...layerFlags ]);
  const deciding = roles.indexOf('decides');

  // with every tile a star, passage finds nothing to let a step through, and the engine blocks every way out.
  const decidingFlag = [ ...eventFlags, ...layerFlags ][deciding] ?? FlagBit.passage;
  const terrainAt = layerFlags.findIndex(flag => terrainTagOf(flag) > 0);
  const anyLayer = (bit: number) => layerFlags.some(flag => (flag & bit) !== 0);

  return {
    x,
    y,
    layers: topFirst.map((z, index) => ({
      z,
      tileId: layerTiles[index],
      flags: layerFlags[index],
      passage: roles[eventTiles.length + index],
      terrainTag: terrainTagOf(layerFlags[index]),
      decidesTerrain: index === terrainAt,
    })),
    eventTiles: eventTiles.map((each, index) => ({ ...each, flags: eventFlags[index], passage: roles[index] })),
    blocked: decidingFlag & FlagBit.passage,
    ladder: anyLayer(FlagBit.ladder),
    bush: anyLayer(FlagBit.bush),
    counter: anyLayer(FlagBit.counter),
    damage: anyLayer(FlagBit.damage),
    terrainTag: terrainAt < 0 ? 0 : terrainTagOf(layerFlags[terrainAt]),
    shadow: cells[cellIndex(width, height, x, y, 4)],
    region: cells[cellIndex(width, height, x, y, 5)],
  };
};

/**
 * Plans emptying one layer of a cell, leaving the other layers as they are, and reshaping every autotile around it
 * that the change calls for, as painting would.
 * @param {TileGrid} grid The map's tile data.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {TileLayerIndex} z The layer.
 * @param {number} mode The tileset's mode.
 * @returns {CellFix} The fix; no changes when the layer is already empty.
 */
const planClearLayer = (grid: TileGrid, x: number, y: number, z: TileLayerIndex, mode: number): CellFix =>
{
  return {
    label: `Clear layer ${z + 1} at ${x}, ${y}`,
    changes: withReshapes(grid, [ [ cellIndex(grid.width, grid.height, x, y, z), 0 ] ], mode),
  };
};

/**
 * Plans putting a tile on exactly one layer of a cell, replacing whatever that layer holds and nothing else. An
 * autotile goes in unshaped and takes the shape its neighbours call for, and every autotile around it is reshaped as
 * painting would reshape it.
 * @param {TileGrid} grid The map's tile data.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {TileLayerIndex} z The layer.
 * @param {number} tileId The tile, in any shape.
 * @param {number} mode The tileset's mode.
 * @returns {CellFix} The fix; no changes when the layer already holds it, shaped as it would be.
 */
const planPutOnLayer = (grid: TileGrid, x: number, y: number, z: TileLayerIndex, tileId: number, mode: number): CellFix =>
{
  return {
    label: `Put ${describeTile(tileId)} on layer ${z + 1} at ${x}, ${y}`,
    changes: withReshapes(grid, [ [ cellIndex(grid.width, grid.height, x, y, z), unshapedTile(tileId) ] ], mode),
  };
};

/**
 * Plans moving one layer's tile a layer up or down, trading places with whatever is there. Nothing is reshaped: the
 * cell holds the same tiles afterwards, and shapes read a neighbour's tiles on every layer alike, so no shape changes
 * anywhere and a shape drawn by hand survives the move.
 * @param {TileGrid} grid The map's tile data.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {TileLayerIndex} z The layer whose tile moves.
 * @param {'up' | 'down'} direction Which way.
 * @returns {CellFix} The fix; no changes past layer 4 or below layer 1, or when both layers hold the same.
 */
const planMoveLayer = (grid: TileGrid, x: number, y: number, z: TileLayerIndex, direction: 'up' | 'down'): CellFix =>
{
  const other = direction === 'up'
    ? z + 1
    : z - 1;
  const label = `Move layer ${z + 1} ${direction} at ${x}, ${y}`;
  if (other < 0 || other > 3)
  {
    return { label, changes: [] };
  }

  const here = cellIndex(grid.width, grid.height, x, y, z);
  const there = cellIndex(grid.width, grid.height, x, y, other);
  const [ tile, otherTile ] = [ grid.cells[here], grid.cells[there] ];
  if (tile === otherTile)
  {
    return { label, changes: [] };
  }

  const changes: CellChange[] = [ [ here, otherTile ], [ there, tile ] ];
  return { label, changes: changes.sort((a, b) => a[0] - b[0]) };
};

/**
 * Makes a stack view fix as one step in the map's own history, so it undoes from the map like any stroke.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {CellFix} fix The fix.
 * @returns {HistoryStep | null} The step, or null when the fix changes nothing.
 */
const applyCellFix = (hub: DocumentHub, mapId: number, fix: CellFix): HistoryStep | null =>
{
  if (fix.changes.length === 0)
  {
    return null;
  }

  return hub.edit(fix.label, [ mapHistoryKey(mapId) ], tx =>
  {
    tx.tiles(mapDocumentKey(mapId), fix.changes);
  });
};

export { applyCellFix, eventTilesAt, planClearLayer, planMoveLayer, planPutOnLayer, readCellStack };
export type { CellFix, CellStack, EventTile, PassageRole, StackEventTile, StackLayer, StackSource };
