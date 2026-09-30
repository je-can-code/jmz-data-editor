import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { floorJoins, NEIGHBOUR_OFFSETS } from '../../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import type { ShapeMismatch } from '../../../../../src/mapEditor/core/tiles/shapeAudit.ts';
import {
  autotileKind,
  isA4Kind,
  isAutotile,
  isFloorTypeKind,
  isWaterfallKind,
} from '../../../../../src/mapEditor/core/tiles/tileIds.ts';
import type { ShippedMap } from './shippedGame.ts';

/**
 * Why a stored autotile shape may differ from what its neighbours call for. Each reason carries a test the oracle
 * applies to every cell filed under it, so a cell can never be excused by a reason its data does not support.
 */
type ExceptionReason = 'mapgen' | 'map-edge' | 'water-boundary' | 'suspended-autotiling' | 'stale-open' | 'stamped';

/**
 * The reasons, in the order a mismatch is tried against them, each with the explanation the exceptions file carries.
 */
const EXCEPTION_REASONS: readonly { readonly reason: ExceptionReason; readonly explanation: string }[] = [
  {
    reason: 'mapgen',
    explanation: 'Drafted by mapgen (ca/tools/mapgen/dungeons/nimbus.js, maps 363 to 381), which shapes wall sides with '
      + 'its own approximate table (A4_SIDE_SHAPE in ca/tools/mapgen/terrain.js) instead of MZ\'s rule. Each cell is '
      + 'checked to hold exactly what that table gives; repainting the wall in the editor corrects it.',
  },
  {
    reason: 'map-edge',
    explanation: 'Every edge that differs faces beyond the map. Across the shipped maps these edges are stored both '
      + 'ways, each map consistently, which points at a map resized or shifted after it was drawn: MZ resizes from the '
      + 'bottom-right corner, and its Shift command moves tiles, and neither reshapes the tiles left at the new edge.',
  },
  {
    reason: 'water-boundary',
    explanation: 'Maps 215 and 216 keep an edge between water kind 8 and the ocean, on both sides, where every other '
      + 'map joins open water kinds. The region is consistent with itself, so it is not a stale edge; why MZ drew it '
      + 'is unknown.',
  },
  {
    reason: 'suspended-autotiling',
    explanation: 'The stored shape joins toward neighbours that no longer match. MZ suspends autotiling while Shift is '
      + 'held ("you can temporarily disable the autotile function by holding [Shift] and drawing tiles or using the '
      + 'eyedropper", from its help), so a tile drawn that way keeps shape 0, and a neighbour replaced that way leaves '
      + 'this tile joined toward it.',
  },
  {
    reason: 'stale-open',
    explanation: 'The stored shape shows an edge toward a neighbour that now matches: the neighbour became this kind '
      + 'while autotiling was suspended, so this tile was never reshaped.',
  },
  {
    reason: 'stamped',
    explanation: 'The stored shape joins toward a neighbour that does not match and shows an edge toward one that does, '
      + 'so it was shaped for another neighbourhood entirely: a tile stamped with the eyedropper keeps the shape it '
      + 'was copied with.',
  },
];

/**
 * The exceptions file: for each map id, for each reason, the flat indices of the cells excused by it.
 */
type ExceptionList = {
  readonly maps: Readonly<Record<string, Readonly<Partial<Record<ExceptionReason, readonly number[]>>>>>;
};

/**
 * Where the exceptions file lives, beside the oracle test.
 */
const EXCEPTIONS_FILE = fileURLToPath(new URL('../autotileOracleExceptions.json', import.meta.url));

/**
 * The wall side table mapgen shapes walls with, keyed by its mask of joined neighbours (north 2, west 8, east 16,
 * south 64), copied from {@code A4_SIDE_SHAPE} in {@code ca/tools/mapgen/terrain.js}; masks it lacks draw shape 0.
 */
const MAPGEN_WALL_SHAPES: Readonly<Record<number, number>> = {
  0: 3, 2: 12, 8: 14, 10: 12, 16: 10, 18: 9, 24: 8, 26: 8, 64: 3, 66: 4, 72: 2, 74: 4, 80: 2, 82: 1, 88: 2, 90: 0,
};

/**
 * The first and last map mapgen's Nimbus recipe writes.
 */
const MAPGEN_MAPS = { first: 363, last: 381 } as const;

/**
 * Lists the neighbours a shape reads, as its join bit and offset. Floor shapes read all eight; walls and roofs read
 * four, and waterfalls two.
 * @param {number} kind The autotile kind.
 * @returns {readonly (readonly [ number, number, number ])[]} Each neighbour's bit, dx and dy.
 */
const neighboursRead = (kind: number): readonly (readonly [ number, number, number ])[] =>
{
  if (isFloorTypeKind(kind))
  {
    return NEIGHBOUR_OFFSETS.map(([ dx, dy ], bit) => [ 1 << bit, dx, dy ] as const);
  }

  return isWaterfallKind(kind)
    ? [ [ 1, -1, 0 ], [ 2, 1, 0 ] ]
    : [ [ 1, -1, 0 ], [ 2, 0, -1 ], [ 4, 1, 0 ], [ 8, 0, 1 ] ];
};

/**
 * Finds which neighbours a shape joins, as a bit set over {@link neighboursRead}.
 * @param {number} kind The autotile kind.
 * @param {number} shape The shape.
 * @returns {number} The joined bits.
 */
const shapeJoins = (kind: number, shape: number): number =>
{
  if (isFloorTypeKind(kind))
  {
    return floorJoins(shape);
  }

  return isWaterfallKind(kind)
    ? ~shape & 3
    : ~shape & 15;
};

/**
 * Reads a cell's kind on layer 1 the way mapgen does: undefined beyond the map, -1 for anything not an autotile.
 * @param {ShippedMap} map The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {number | undefined} The kind.
 */
const mapgenKindAt = (map: ShippedMap, x: number, y: number): number | undefined =>
{
  if (x < 0 || y < 0 || x >= map.width || y >= map.height)
  {
    return undefined;
  }

  const tileId = map.cells[y * map.width + x];
  return isAutotile(tileId)
    ? autotileKind(tileId)
    : -1;
};

/**
 * Works out the shape mapgen gives a wall side.
 * @param {ShippedMap} map The map.
 * @param {ShapeMismatch} cell The wall side.
 * @returns {number} The shape.
 */
const mapgenWallShape = (map: ShippedMap, cell: ShapeMismatch): number =>
{
  let mask = 0;
  const sides: readonly (readonly [ number, number, number ])[] = [ [ 0, -1, 2 ], [ -1, 0, 8 ], [ 1, 0, 16 ], [ 0, 1, 64 ] ];
  sides.forEach(([ dx, dy, bit ]) =>
  {
    const kind = mapgenKindAt(map, cell.x + dx, cell.y + dy);
    if (kind === cell.kind || kind === undefined)
    {
      mask |= bit;
    }
  });

  return MAPGEN_WALL_SHAPES[mask] ?? 0;
};

/**
 * Reports whether a map cell holds a kind on any tile layer.
 * @param {ShippedMap} map The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} kind The kind.
 * @returns {boolean} True when some layer holds it.
 */
const cellHoldsKind = (map: ShippedMap, x: number, y: number, kind: number): boolean =>
{
  for (let z = 0; z < 4; z++)
  {
    const tileId = map.cells[(z * map.height + y) * map.width + x];
    if (isAutotile(tileId) && autotileKind(tileId) === kind)
    {
      return true;
    }
  }

  return false;
};

/**
 * Compares which neighbours the stored and the expected shape join.
 * @param {ShapeMismatch} cell The mismatch.
 * @returns {'superset' | 'subset' | 'mixed' | 'unreadable'} Whether the stored shape joins everything the expected
 * one does and more, a part of it, some of each, or is no shape a map placement holds (such as the palette picture).
 */
const compareJoins = (cell: ShapeMismatch): 'superset' | 'subset' | 'mixed' | 'unreadable' =>
{
  const stored = shapeJoins(cell.kind, cell.stored);
  const expected = shapeJoins(cell.kind, cell.expected);
  if (stored < 0)
  {
    return 'unreadable';
  }

  if ((stored & expected) === expected)
  {
    return 'superset';
  }

  return (stored & expected) === stored
    ? 'subset'
    : 'mixed';
};

/**
 * Lists the offsets of the neighbours whose join differs between the stored and the expected shape.
 * @param {ShapeMismatch} cell The mismatch.
 * @returns {(readonly [ number, number ])[]} The differing neighbours' dx and dy.
 */
const differingNeighbours = (cell: ShapeMismatch): (readonly [ number, number ])[] =>
{
  const differs = shapeJoins(cell.kind, cell.stored) ^ shapeJoins(cell.kind, cell.expected);
  return neighboursRead(cell.kind)
    .filter(([ bit ]) => (differs & bit) !== 0)
    .map(([ , dx, dy ]) => [ dx, dy ] as const);
};

/**
 * The test each reason applies to a cell filed under it.
 */
const REASON_TESTS: Readonly<Record<ExceptionReason, (map: ShippedMap, cell: ShapeMismatch) => boolean>> = {
  'mapgen': (map, cell) =>
  {
    return map.id >= MAPGEN_MAPS.first && map.id <= MAPGEN_MAPS.last && cell.z === 0 && isA4Kind(cell.kind)
      && mapgenWallShape(map, cell) === cell.stored;
  },
  'map-edge': (map, cell) =>
  {
    const neighbours = differingNeighbours(cell);
    return compareJoins(cell) !== 'unreadable' && neighbours.length > 0 && neighbours.every(([ dx, dy ]) =>
    {
      const x = cell.x + dx;
      const y = cell.y + dy;
      return x < 0 || y < 0 || x >= map.width || y >= map.height;
    });
  },
  'water-boundary': (map, cell) =>
  {
    // only the ocean and water kind 8, on the two maps that keep a shore between them.
    if ((map.id !== 215 && map.id !== 216) || (cell.kind !== 0 && cell.kind !== 8))
    {
      return false;
    }

    const other = cell.kind === 0
      ? 8
      : 0;
    const neighbours = differingNeighbours(cell);
    return compareJoins(cell) !== 'unreadable' && neighbours.length > 0 && neighbours.every(([ dx, dy ]) =>
    {
      return cellHoldsKind(map, cell.x + dx, cell.y + dy, other) && cellHoldsKind(map, cell.x + dx, cell.y + dy, cell.kind) === false;
    });
  },
  'suspended-autotiling': (_map, cell) =>
  {
    return compareJoins(cell) === 'superset';
  },
  'stale-open': (_map, cell) =>
  {
    return compareJoins(cell) === 'subset';
  },
  'stamped': (_map, cell) =>
  {
    return compareJoins(cell) === 'mixed';
  },
};

/**
 * Files a mismatch under the first reason whose test it passes.
 * @param {ShippedMap} map The map.
 * @param {ShapeMismatch} cell The mismatch.
 * @returns {ExceptionReason} The reason.
 */
const classifyMismatch = (map: ShippedMap, cell: ShapeMismatch): ExceptionReason =>
{
  const match = EXCEPTION_REASONS.find(({ reason }) => REASON_TESTS[reason](map, cell));
  if (match === undefined)
  {
    throw new Error(`Map${map.id} cell ${cell.index} differs but fits no reason`);
  }

  return match.reason;
};

/**
 * Reads the exceptions file.
 * @returns {ExceptionList} The list.
 */
const readExceptionList = (): ExceptionList =>
{
  return JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8')) as ExceptionList;
};

export { classifyMismatch, EXCEPTION_REASONS, EXCEPTIONS_FILE, readExceptionList, REASON_TESTS };
export type { ExceptionList, ExceptionReason };
