import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { autotileTableSize, floorJoins, holdsKind, NEIGHBOUR_OFFSETS } from '../../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { auditShapes, type ShapeMismatch } from '../../../../../src/mapEditor/core/tiles/shapeAudit.ts';
import { gridReader, type TileReader } from '../../../../../src/mapEditor/core/tiles/tileGrid.ts';
import {
  autotileKind,
  isA4Kind,
  isAutotile,
  isFloorTypeKind,
  isRoofKind,
  isWaterfallKind,
} from '../../../../../src/mapEditor/core/tiles/tileIds.ts';
import type { ShippedMap } from './shippedGame.ts';

/**
 * Why a stored autotile shape may differ from what its neighbours call for. Every reason but the last carries a test
 * that can refuse a cell, applied to every cell filed under it, so a cell is never excused by a reason its data does
 * not support. The last, {@code unverified}, is no explanation at all: it lists what nothing here accounts for, so a
 * new mismatch still fails and the size of the gap stays in plain view.
 */
type ExceptionReason = 'mapgen' | 'map-edge' | 'shift-drawn' | 'disturbed-edge' | 'unverified';

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
    reason: 'shift-drawn',
    explanation: 'Stored in shape 0, joined on every side, where its neighbours call for another shape. Shape 0 is what '
      + 'MZ stores for a tile drawn while autotiling is suspended ("you can temporarily disable the autotile function '
      + 'by holding [Shift] and drawing tiles or using the eyedropper", from its help), and what a tile keeps when '
      + 'every neighbour once matched it and was later replaced that way. Checked: the stored shape is exactly 0.',
  },
  {
    reason: 'disturbed-edge',
    explanation: 'Every edge that differs is out of step from both sides: the tile across it also holds a shape that '
      + 'disagrees with the rules about that same edge. One of the two was changed without autotiling (Shift held, or '
      + 'the eyedropper) and neither was reshaped. Checked: the neighbour across every differing edge is itself a '
      + 'mismatch whose join toward this tile differs too, and no differing edge is a roof\'s side toward the same roof '
      + 'spanning other rows, since the maps keep a seam there on some maps and join it on others, so a seam there says '
      + 'nothing about how either tile was drawn.',
  },
  {
    reason: 'unverified',
    explanation: 'Not explained. The stored shape disagrees with the rules and no check above accounts for it. Most look '
      + 'like eyedropper stamps (a run of identical shapes copied from somewhere else) or tiles beside a plain tile '
      + 'drawn with autotiling suspended, neither of which leaves anything to check against. One known group is the '
      + 'seams between two columns of one roof that span different rows, which some maps keep and others join with no '
      + 'rule found to tell them apart. Listed so a new mismatch still fails, and counted so the gap stays visible.',
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
 * @returns {number} The joined bits, or -1 for a shape no neighbourhood produces: the floor palette picture, or
 * anything past the end of the kind's table.
 */
const shapeJoins = (kind: number, shape: number): number =>
{
  if (isFloorTypeKind(kind))
  {
    return floorJoins(shape);
  }

  if (shape < 0 || shape >= autotileTableSize(kind))
  {
    return -1;
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
 * Reports whether a mismatch holds a shape a neighbourhood could produce at all; the floor palette picture and
 * anything past a table's end cannot be, and no reason excuses them.
 * @param {ShapeMismatch} cell The mismatch.
 * @returns {boolean} True when the stored shape is one a map placement holds.
 */
const isReadable = (cell: ShapeMismatch): boolean =>
{
  return shapeJoins(cell.kind, cell.stored) >= 0;
};

/**
 * Lists the neighbours whose join differs between the stored and the expected shape.
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
 * Every mismatch on one map, by flat index, for reasons that look at a cell's neighbours.
 */
type MapMismatches = ReadonlyMap<number, ShapeMismatch>;

/**
 * Reports whether the tile across one edge of a mismatch is itself a mismatch that disagrees about that same edge.
 * @param {ShippedMap} map The map.
 * @param {ShapeMismatch} cell The mismatch.
 * @param {number} dx The edge's direction across, -1 to 1.
 * @param {number} dy The edge's direction down, -1 to 1.
 * @param {MapMismatches} mismatches Every mismatch on the map.
 * @returns {boolean} True when some layer across the edge holds such a mismatch.
 */
const isDisturbedAcross = (map: ShippedMap, cell: ShapeMismatch, dx: number, dy: number, mismatches: MapMismatches): boolean =>
{
  const x = cell.x + dx;
  const y = cell.y + dy;
  for (let z = 0; z < 4; z++)
  {
    const other = mismatches.get((z * map.height + y) * map.width + x);
    const back = other === undefined
      ? undefined
      : neighboursRead(other.kind).find(([ , bx, by ]) => bx === -dx && by === -dy);
    if (other !== undefined && back !== undefined
      && ((shapeJoins(other.kind, other.stored) ^ shapeJoins(other.kind, other.expected)) & back[0]) !== 0)
    {
      return true;
    }
  }

  return false;
};

/**
 * Finds the rows a column's run of one kind spans through a cell, walking up and down while the cells hold the kind
 * on any layer.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row inside the run.
 * @param {number} kind The kind.
 * @returns {readonly [ number, number ]} The run's top and bottom rows.
 */
const runRows = (reader: TileReader, x: number, y: number, kind: number): readonly [ number, number ] =>
{
  let top = y;
  while (top > 0 && holdsKind(reader, x, top - 1, kind))
  {
    top -= 1;
  }

  let bottom = y;
  while (bottom + 1 < reader.height && holdsKind(reader, x, bottom + 1, kind))
  {
    bottom += 1;
  }

  return [ top, bottom ];
};

/**
 * Reports whether an edge of a mismatch is a roof's side toward the same roof in a column whose run of it starts or
 * ends on another row. The maps store such seams both ways, map by map (see roofNeighbourJoins in autotileShapes.ts),
 * so one out of step from both sides says nothing about how either tile was drawn.
 * @param {ShippedMap} map The map.
 * @param {ShapeMismatch} cell The mismatch.
 * @param {number} dx The edge's direction across, -1 to 1.
 * @param {number} dy The edge's direction down, -1 to 1.
 * @returns {boolean} True for a side edge between two columns of one roof of different depths.
 */
const isRoofDepthSeam = (map: ShippedMap, cell: ShapeMismatch, dx: number, dy: number): boolean =>
{
  const reader = gridReader(map);
  const x = cell.x + dx;
  if (isRoofKind(cell.kind) === false || dy !== 0 || holdsKind(reader, x, cell.y, cell.kind) === false)
  {
    return false;
  }

  const [ top, bottom ] = runRows(reader, cell.x, cell.y, cell.kind);
  const [ besideTop, besideBottom ] = runRows(reader, x, cell.y, cell.kind);
  return top !== besideTop || bottom !== besideBottom;
};

/**
 * The test each reason applies to a cell filed under it.
 */
const REASON_TESTS: Readonly<Record<ExceptionReason, (map: ShippedMap, cell: ShapeMismatch, mismatches: MapMismatches) => boolean>> = {
  'mapgen': (map, cell) =>
  {
    return map.id >= MAPGEN_MAPS.first && map.id <= MAPGEN_MAPS.last && cell.z === 0 && isA4Kind(cell.kind)
      && mapgenWallShape(map, cell) === cell.stored;
  },
  'map-edge': (map, cell) =>
  {
    const neighbours = differingNeighbours(cell);
    return isReadable(cell) && neighbours.length > 0 && neighbours.every(([ dx, dy ]) =>
    {
      const x = cell.x + dx;
      const y = cell.y + dy;
      return x < 0 || y < 0 || x >= map.width || y >= map.height;
    });
  },
  'shift-drawn': (_map, cell) =>
  {
    return isReadable(cell) && cell.stored === 0;
  },
  'disturbed-edge': (map, cell, mismatches) =>
  {
    // every differing edge inside the map must be out of step from the other side too, and not a roof depth seam.
    const inside = differingNeighbours(cell).filter(([ dx, dy ]) =>
    {
      return cell.x + dx >= 0 && cell.y + dy >= 0 && cell.x + dx < map.width && cell.y + dy < map.height;
    });
    return isReadable(cell) && inside.length > 0 && inside.every(([ dx, dy ]) =>
    {
      return isDisturbedAcross(map, cell, dx, dy, mismatches) && isRoofDepthSeam(map, cell, dx, dy) === false;
    });
  },
  'unverified': (_map, cell) =>
  {
    return isReadable(cell);
  },
};

/**
 * Files a mismatch under the first reason whose test it passes.
 * @param {ShippedMap} map The map.
 * @param {ShapeMismatch} cell The mismatch.
 * @param {MapMismatches} mismatches Every mismatch on the map.
 * @returns {ExceptionReason} The reason.
 */
const classifyMismatch = (map: ShippedMap, cell: ShapeMismatch, mismatches: MapMismatches): ExceptionReason =>
{
  const match = EXCEPTION_REASONS.find(({ reason }) => REASON_TESTS[reason](map, cell, mismatches));
  if (match === undefined)
  {
    throw new Error(`Map${map.id} cell ${cell.index} holds shape ${cell.stored}, which no neighbourhood produces`);
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

/**
 * What the oracle finds wrong with one map, list by list; every list is empty on a map that passes.
 */
type OracleVerdict = {
  /**
   * Autotiles holding a shape past the end of their kind's table, which the engine cannot draw at all. No reason
   * excuses these.
   */
  readonly pastTable: string[];

  /**
   * Mismatches the exceptions list does not name.
   */
  readonly unexplained: string[];

  /**
   * Listed cells that fail the test of the reason they are filed under.
   */
  readonly misfiled: string[];

  /**
   * Listed cells that no longer differ, so the list has fallen behind the map.
   */
  readonly settled: number[];
};

/**
 * Holds one map to the exceptions listed for it: recomputes every autotile, and reports anything the list does not
 * account for.
 * @param {ShippedMap} map The map.
 * @param {number} mode The map's tileset's mode.
 * @param {Partial<Record<ExceptionReason, readonly number[]>>} listed The map's entry in the exceptions list.
 * @returns {OracleVerdict} The findings.
 */
const judgeMap = (map: ShippedMap, mode: number, listed: Readonly<Partial<Record<ExceptionReason, readonly number[]>>>): OracleVerdict =>
{
  const reasonOf = new Map<number, ExceptionReason>();
  EXCEPTION_REASONS.forEach(({ reason }) =>
  {
    (listed[reason] ?? []).forEach(index => reasonOf.set(index, reason));
  });

  const { mismatches } = auditShapes(map, mode);
  const byIndex: MapMismatches = new Map(mismatches.map(cell => [ cell.index, cell ]));
  const describe = (cell: ShapeMismatch): string => `(${cell.x},${cell.y}) layer ${cell.z + 1}: kind ${cell.kind} stored ${cell.stored}, expected ${cell.expected}`;
  const fits = (cell: ShapeMismatch): boolean => REASON_TESTS[reasonOf.get(cell.index) as ExceptionReason](map, cell, byIndex);
  return {
    pastTable: mismatches.filter(cell => cell.stored >= autotileTableSize(cell.kind)).map(describe),
    unexplained: mismatches.filter(cell => reasonOf.has(cell.index) === false).map(describe),
    misfiled: mismatches
      .filter(cell => reasonOf.has(cell.index) && fits(cell) === false)
      .map(cell => `${describe(cell)} does not fit ${reasonOf.get(cell.index)}`),
    settled: [ ...reasonOf.keys() ].filter(index => byIndex.has(index) === false),
  };
};

export { classifyMismatch, EXCEPTION_REASONS, EXCEPTIONS_FILE, judgeMap, readExceptionList, REASON_TESTS };
export type { ExceptionList, ExceptionReason, MapMismatches, OracleVerdict };
