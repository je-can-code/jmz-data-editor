import { FLOOR_AUTOTILE_TABLE, WALL_AUTOTILE_TABLE, WATERFALL_AUTOTILE_TABLE, type Quadrant } from './autotileTables.ts';
import { isInside, type TileReader } from './tileGrid.ts';
import {
  autotileKind,
  isA1Kind,
  isA5Tile,
  isAutotile,
  isFloorTypeKind,
  isRoofKind,
  isWallSideKind,
  isWallTopKind,
  isWaterfallKind,
  isWaterKind,
  makeAutotileId,
} from './tileIds.ts';

/**
 * A tileset's mode, as {@code Tilesets.json} stores it. Field is MZ's world-map mode, where the A2 base columns pair
 * up and A1 water kinds keep their boundaries; Area is every other map. VX-compatible behaves as Area here.
 */
const TilesetMode = {
  field: 0,
  area: 1,
  vxCompatible: 2,
} as const;

/**
 * The bits of a floor tile's neighbour mask: one per neighbour, set when that neighbour joins the tile.
 */
const Neighbour = {
  northWest: 1,
  north: 2,
  northEast: 4,
  west: 8,
  east: 16,
  southWest: 32,
  south: 64,
  southEast: 128,
} as const;

/**
 * The offsets of the eight neighbours, in the order of their bits in {@link Neighbour}.
 */
const NEIGHBOUR_OFFSETS: readonly (readonly [ number, number ])[] = [
  [ -1, -1 ], [ 0, -1 ], [ 1, -1 ],
  [ -1, 0 ], [ 1, 0 ],
  [ -1, 1 ], [ 0, 1 ], [ 1, 1 ],
];

/**
 * The bits of a wall or waterfall shape. For these the shape number is simply its open edges added up: a wall face
 * open on the left and at the top is shape 3. Waterfalls use only {@code left} and {@code right}, as bits 1 and 2.
 */
const WallEdge = {
  left: 1,
  top: 2,
  right: 4,
  bottom: 8,
} as const;

/**
 * What one corner of a floor shape draws, by which of its neighbours join: the corner's vertical neighbour (north or
 * south), its horizontal one (west or east) and the diagonal between them. The pictures are the quarters of the
 * kind's block, in this order: everything joined, only the diagonal open, the vertical side open, the horizontal
 * side open, both sides open. The diagonal only matters when both sides join, which is why there are exactly 47
 * distinct floor shapes rather than 256.
 */
const FLOOR_CORNERS: readonly { vertical: number; horizontal: number; diagonal: number; pictures: readonly Quadrant[] }[] = [
  { vertical: Neighbour.north, horizontal: Neighbour.west, diagonal: Neighbour.northWest, pictures: [ [ 2, 4 ], [ 2, 0 ], [ 2, 2 ], [ 0, 4 ], [ 0, 2 ] ] },
  { vertical: Neighbour.north, horizontal: Neighbour.east, diagonal: Neighbour.northEast, pictures: [ [ 1, 4 ], [ 3, 0 ], [ 1, 2 ], [ 3, 4 ], [ 3, 2 ] ] },
  { vertical: Neighbour.south, horizontal: Neighbour.west, diagonal: Neighbour.southWest, pictures: [ [ 2, 3 ], [ 2, 1 ], [ 2, 5 ], [ 0, 3 ], [ 0, 5 ] ] },
  { vertical: Neighbour.south, horizontal: Neighbour.east, diagonal: Neighbour.southEast, pictures: [ [ 1, 3 ], [ 3, 1 ], [ 1, 5 ], [ 3, 3 ], [ 3, 5 ] ] },
];

/**
 * Picks which picture a floor corner draws.
 * @param {number} joins The tile's neighbour mask.
 * @param {number} vertical The bit of the corner's vertical neighbour.
 * @param {number} horizontal The bit of the corner's horizontal neighbour.
 * @param {number} diagonal The bit of the corner's diagonal neighbour.
 * @returns {number} The index into the corner's pictures.
 */
const cornerPicture = (joins: number, vertical: number, horizontal: number, diagonal: number): number =>
{
  const verticalJoined = (joins & vertical) !== 0;
  const horizontalJoined = (joins & horizontal) !== 0;

  // both sides joined: the diagonal decides between a full interior and an inner corner.
  if (verticalJoined && horizontalJoined)
  {
    return (joins & diagonal) !== 0
      ? 0
      : 1;
  }

  // one side joined: an edge along the open side.
  if (horizontalJoined)
  {
    return 2;
  }

  if (verticalJoined)
  {
    return 3;
  }

  // neither side joined: an outer corner.
  return 4;
};

/**
 * Builds the lookup from every neighbour mask to the floor shape the engine's table draws for it, by working out
 * each corner's picture and finding the shape made of those four pictures.
 * @returns {Uint8Array} The shape for each of the 256 masks.
 */
const buildFloorShapes = (): Uint8Array =>
{
  // index every shape by its four quarters, so a set of pictures finds its shape directly.
  const shapeByQuarters = new Map<string, number>();
  FLOOR_AUTOTILE_TABLE.forEach((quarters, shape) =>
  {
    shapeByQuarters.set(JSON.stringify(quarters), shape);
  });

  const shapes = new Uint8Array(256);
  for (let joins = 0; joins < 256; joins++)
  {
    const quarters = FLOOR_CORNERS.map(({ vertical, horizontal, diagonal, pictures }) =>
    {
      return pictures[cornerPicture(joins, vertical, horizontal, diagonal)];
    });

    // every mask must land on a real shape; anything else means the corner pictures above are wrong.
    const shape = shapeByQuarters.get(JSON.stringify(quarters));
    if (shape === undefined)
    {
      throw new Error(`no floor shape draws the corners of neighbour mask ${joins}`);
    }

    shapes[joins] = shape;
  }

  return shapes;
};

/**
 * The floor shape for every neighbour mask, derived once from the engine's own table.
 */
const FLOOR_SHAPE_BY_JOINS = buildFloorShapes();

/**
 * The smallest neighbour mask that draws each floor shape, which is the mask with only the corners that count; -1
 * for shape 47, which no mask draws.
 */
const FLOOR_JOINS_BY_SHAPE = ((): Int16Array =>
{
  const joinsByShape = new Int16Array(48).fill(-1);
  for (let joins = 255; joins >= 0; joins--)
  {
    joinsByShape[FLOOR_SHAPE_BY_JOINS[joins]] = joins;
  }

  return joinsByShape;
})();

/**
 * Finds the floor shape for a neighbour mask.
 * @param {number} joins The neighbour mask: a {@link Neighbour} bit set for every neighbour that joins.
 * @returns {number} The shape, 0 to 46.
 */
const floorShape = (joins: number): number =>
{
  return FLOOR_SHAPE_BY_JOINS[joins & 0xff];
};

/**
 * Finds which neighbours a floor shape joins, counting a diagonal only where both of its sides join too.
 * @param {number} shape The floor shape.
 * @returns {number} The neighbour mask, or -1 for shape 47 and anything that is not a floor shape.
 */
const floorJoins = (shape: number): number =>
{
  return shape >= 0 && shape < 48
    ? FLOOR_JOINS_BY_SHAPE[shape]
    : -1;
};

/**
 * Reports whether any of a cell's four tile layers holds an autotile of the given kind.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True when one of the layers holds that kind.
 */
const holdsKind = (reader: TileReader, x: number, y: number, kind: number): boolean =>
{
  for (let z = 0; z < 4; z++)
  {
    const tileId = reader.tileAt(x, y, z);
    if (isAutotile(tileId) && autotileKind(tileId) === kind)
    {
      return true;
    }
  }

  return false;
};

/**
 * Reports whether any of a cell's four tile layers holds an autotile whose kind passes a test.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {(kind: number) => boolean} test The test.
 * @returns {boolean} True when one of the layers holds such a kind.
 */
const holdsKindWhere = (reader: TileReader, x: number, y: number, test: (kind: number) => boolean): boolean =>
{
  for (let z = 0; z < 4; z++)
  {
    const tileId = reader.tileAt(x, y, z);
    if (isAutotile(tileId) && test(autotileKind(tileId)))
    {
      return true;
    }
  }

  return false;
};

/**
 * Reports whether an A5 tile lies over a cell, on any layer above the ground layer.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {boolean} True when layer 2, 3 or 4 holds an A5 tile.
 */
const holdsA5Above = (reader: TileReader, x: number, y: number): boolean =>
{
  for (let z = 1; z < 4; z++)
  {
    if (isA5Tile(reader.tileAt(x, y, z)))
    {
      return true;
    }
  }

  return false;
};

/**
 * Reports whether a neighbouring cell joins a floor tile (A1 water, A2 ground, or an A4 wall top). These are MZ's
 * rules as the shipped maps show them; the counts are the edges between a floor tile and a neighbour, across every
 * shipped map, that MZ stored joined and open:
 *
 * - beyond the edge of the map counts as joined, so a map's border never draws a coastline (38,974 to 121);
 * - a neighbour holding the same kind on any of its four layers joins, not only one on the tile's own layer, so a
 *   wall top laid on layer 2 joins the same wall top on layer 1 beside it (1,449 to 7 where the kind sits only on
 *   another layer);
 * - open water (the ocean, and the plain water kinds) joins every waterfall, since a waterfall pours into it (304 to
 *   3);
 * - open water joins other open water kinds too, as MZ's help says A1 tiles do not draw a boundary where they touch
 *   (363 to 21), except where an A5 tile lies over either of the two cells, which keeps a shore between them (36 open
 *   to 2), and except on a Field-mode tileset, where every A1 kind keeps its own shore (0 to 84).
 *
 * Nothing else joins: a different ground kind, a wall, an A5 tile or an empty cell all draw an edge (162,774 open;
 * the 6,772 stored joined are tiles drawn or neighbours changed while MZ's autotiling was suspended).
 * @param {TileReader} reader The map.
 * @param {number} x The floor tile's column.
 * @param {number} y The floor tile's row.
 * @param {number} dx The neighbour's offset across, -1 to 1.
 * @param {number} dy The neighbour's offset down, -1 to 1.
 * @param {number} kind The floor tile's kind.
 * @param {number} mode The tileset's mode.
 * @returns {boolean} True when the neighbour joins.
 */
const floorNeighbourJoins = (reader: TileReader, x: number, y: number, dx: number, dy: number, kind: number, mode: number): boolean =>
{
  const nx = x + dx;
  const ny = y + dy;
  if (isInside(reader, nx, ny) === false || holdsKind(reader, nx, ny, kind))
  {
    return true;
  }

  // only open water joins anything but its own kind.
  if (isWaterKind(kind) === false)
  {
    return false;
  }

  if (holdsKindWhere(reader, nx, ny, isWaterfallKind))
  {
    return true;
  }

  // other open water joins, unless the tileset keeps A1 shores or an A5 tile lies over either cell.
  return mode !== TilesetMode.field
    && holdsKindWhere(reader, nx, ny, isWaterKind)
    && holdsA5Above(reader, x, y) === false
    && holdsA5Above(reader, nx, ny) === false;
};

/**
 * Reports whether the cell beside a waterfall joins it. A waterfall only looks sideways: beyond the edge of the
 * map (22 to 0), the same waterfall on any layer, or any other A1 tile, water, ocean or another waterfall (1,216 to
 * 2), joins; anything else draws the waterfall's edge (404 open to 86 joined).
 * @param {TileReader} reader The map.
 * @param {number} x The neighbour's column.
 * @param {number} y The neighbour's row.
 * @returns {boolean} True when the neighbour joins.
 */
const waterfallNeighbourJoins = (reader: TileReader, x: number, y: number): boolean =>
{
  return isInside(reader, x, y) === false || holdsKindWhere(reader, x, y, isA1Kind);
};

/**
 * Reports whether a neighbouring cell joins a roof. Roofs join only their own kind, on any layer (8,663 joined to
 * 349); a building wall beside or below a roof draws the roof's edge (1,022 open to 64). Beyond the edge of the map,
 * a roof joins downwards (43 to 6) but shows its edge at the top (45 to 15) and the sides (75 to 6).
 * @param {TileReader} reader The map.
 * @param {number} x The neighbour's column.
 * @param {number} y The neighbour's row.
 * @param {number} kind The roof's kind.
 * @param {boolean} beyondEdge Whether a neighbour beyond the map joins in this direction.
 * @returns {boolean} True when the neighbour joins.
 */
const roofNeighbourJoins = (reader: TileReader, x: number, y: number, kind: number, beyondEdge: boolean): boolean =>
{
  return isInside(reader, x, y)
    ? holdsKind(reader, x, y, kind)
    : beyondEdge;
};

/**
 * Finds the row where a column's run of one kind starts: walking up from a cell while the cell above holds the same
 * kind. The walk stops at the top of the map.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row to start from.
 * @param {number} kind The kind.
 * @returns {number} The top row of the run.
 */
const wallRunTop = (reader: TileReader, x: number, y: number, kind: number): number =>
{
  let top = y;
  while (top > 0 && holdsKind(reader, x, top - 1, kind))
  {
    top -= 1;
  }

  return top;
};

/**
 * Finds the row where a column's run of one kind ends: walking down from a cell while the cell below holds the same
 * kind. The walk stops at the bottom of the map.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row to start from.
 * @param {number} kind The kind.
 * @returns {number} The bottom row of the run.
 */
const wallRunBottom = (reader: TileReader, x: number, y: number, kind: number): number =>
{
  let bottom = y;
  while (bottom + 1 < reader.height && holdsKind(reader, x, bottom + 1, kind))
  {
    bottom += 1;
  }

  return bottom;
};

/**
 * Finds the wall face kind a cell holds, preferring a given kind when the cell holds it on any layer.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} preferred The kind to answer if the cell holds it.
 * @returns {number} The wall face kind, or -1 when the cell holds none.
 */
const wallSideKindAt = (reader: TileReader, x: number, y: number, preferred: number): number =>
{
  if (holdsKind(reader, x, y, preferred))
  {
    return preferred;
  }

  for (let z = 0; z < 4; z++)
  {
    const tileId = reader.tileAt(x, y, z);
    if (isAutotile(tileId) && isWallSideKind(autotileKind(tileId)))
    {
      return autotileKind(tileId);
    }
  }

  return -1;
};

/**
 * Reports whether a kind is a wall top or a roof: the tops a wall face runs into sideways.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for wall tops and roofs.
 */
const isTopKind = (kind: number): boolean =>
{
  return isWallTopKind(kind) || isRoofKind(kind);
};

/**
 * Reports whether the cell beside a wall face (an A3 building wall or A4 wall side) joins it. A wall face is a
 * column that hangs down from its top edge, and its sides follow that (counts are side edges MZ stored joined and
 * open, leaving out the maps mapgen drafted):
 *
 * - a wall face beside it, of this kind or any other, joins unless that column's wall starts higher up or ends
 *   higher up, in which case every row of this wall draws its edge against that one (between walls of one kind not
 *   stored in shape 0: 34,732 joined to 178 open where neither happens, 1,104 open to 45 joined where either does);
 * - a wall top (ceiling) or a roof beside it always joins, so a wall face runs cleanly into the ceiling that turns
 *   the corner beside it (3,010 to 155);
 * - beyond the edge of the map counts as the same wall, starting at the map's top row: it joins a wall that starts
 *   there too (37 to 14), and not one that starts lower (298 open to 73).
 *
 * Anything else beside it draws the edge (4,092 open to 63).
 * @param {TileReader} reader The map.
 * @param {number} x The wall face's column.
 * @param {number} y The wall face's row.
 * @param {number} dx -1 for the left neighbour, 1 for the right.
 * @param {number} kind The wall face's kind.
 * @returns {boolean} True when the neighbour joins.
 */
const wallSideNeighbourJoins = (reader: TileReader, x: number, y: number, dx: number, kind: number): boolean =>
{
  const nx = x + dx;
  if (isInside(reader, nx, y) === false)
  {
    return wallRunTop(reader, x, y, kind) === 0;
  }

  // a neighbouring wall face joins unless its own wall starts higher, or ends higher, than this one.
  const neighbourKind = wallSideKindAt(reader, nx, y, kind);
  if (neighbourKind >= 0)
  {
    return wallRunTop(reader, nx, y, neighbourKind) >= wallRunTop(reader, x, y, kind)
      && wallRunBottom(reader, nx, y, neighbourKind) >= wallRunBottom(reader, x, y, kind);
  }

  return holdsKindWhere(reader, nx, y, isTopKind);
};

/**
 * Works out a wall face's shape. Its sides follow {@link wallSideNeighbourJoins}. Its top edge shows unless the cell
 * above holds the same kind (15,447 joined to 100 under its own kind; 10,493 open to 39 under anything else); on the
 * map's top row it shows too, which is what 18 shipped maps store (184 cells) against 8 maps that store it joined
 * (137). Its bottom edge shows unless the cell below holds the same kind (15,547 to 0) or lies beyond the map's bottom
 * row (58 to 4).
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} kind The wall face's kind.
 * @returns {number} The shape, 0 to 15.
 */
const wallSideShape = (reader: TileReader, x: number, y: number, kind: number): number =>
{
  let shape = 0;
  if (wallSideNeighbourJoins(reader, x, y, -1, kind) === false)
  {
    shape |= WallEdge.left;
  }

  if (y === 0 || holdsKind(reader, x, y - 1, kind) === false)
  {
    shape |= WallEdge.top;
  }

  if (wallSideNeighbourJoins(reader, x, y, 1, kind) === false)
  {
    shape |= WallEdge.right;
  }

  if (y + 1 < reader.height && holdsKind(reader, x, y + 1, kind) === false)
  {
    shape |= WallEdge.bottom;
  }

  return shape;
};

/**
 * Works out a roof's shape from its four neighbours; see {@link roofNeighbourJoins}.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} kind The roof's kind.
 * @returns {number} The shape, 0 to 15.
 */
const roofShape = (reader: TileReader, x: number, y: number, kind: number): number =>
{
  // each side: its offset, its edge bit, and whether the map's edge joins on that side.
  const sides: readonly (readonly [ number, number, number, boolean ])[] = [
    [ -1, 0, WallEdge.left, false ],
    [ 0, -1, WallEdge.top, false ],
    [ 1, 0, WallEdge.right, false ],
    [ 0, 1, WallEdge.bottom, true ],
  ];

  return sides.reduce((shape, [ dx, dy, edge, beyondEdge ]) =>
  {
    const joins = roofNeighbourJoins(reader, x + dx, y + dy, kind, beyondEdge)
      && (dx === 0 || roofRunsMatch(reader, x, y, dx, kind));
    return joins
      ? shape
      : shape | edge;
  }, 0);
};

/**
 * Reports whether a roof and the same roof beside it span the same rows. Two columns of one roof kind join sideways
 * only when their runs of it start and end on the same rows, so roofs of different depths, side by side, keep a seam
 * between them (1,439 joined to 78 open where the runs match; 270 open to 89 joined where either end differs, counting
 * only roofs not stored in shape 0).
 * @param {TileReader} reader The map.
 * @param {number} x The roof's column.
 * @param {number} y The roof's row.
 * @param {number} dx -1 for the left neighbour, 1 for the right.
 * @param {number} kind The roof's kind.
 * @returns {boolean} True when both columns' runs span the same rows.
 */
const roofRunsMatch = (reader: TileReader, x: number, y: number, dx: number, kind: number): boolean =>
{
  return wallRunTop(reader, x, y, kind) === wallRunTop(reader, x + dx, y, kind)
    && wallRunBottom(reader, x, y, kind) === wallRunBottom(reader, x + dx, y, kind);
};

/**
 * Reports whether some shape rule reads a whole vertical run of a kind, not only the cells beside a tile: a wall
 * face's sides compare where its column's wall starts and ends with the wall beside it (see
 * {@link wallSideNeighbourJoins}), and a roof joins the roof beside it only when both span the same rows (see
 * {@link roofRunsMatch}). So a change to one cell of such a run can reshape every row of that run, and the rows
 * beside it, however far they reach from the change; reshaping after a stroke follows these runs for that reason.
 * @param {number} kind The autotile kind.
 * @returns {boolean} True for wall faces and roofs.
 */
const isRunKind = (kind: number): boolean =>
{
  return isWallSideKind(kind) || isRoofKind(kind);
};

/**
 * Works out a waterfall's shape from the cells either side of it; see {@link waterfallNeighbourJoins}.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {number} The shape, 0 to 3.
 */
const waterfallShape = (reader: TileReader, x: number, y: number): number =>
{
  const left = waterfallNeighbourJoins(reader, x - 1, y)
    ? 0
    : WallEdge.left;
  const right = waterfallNeighbourJoins(reader, x + 1, y)
    ? 0
    : 2;

  return left | right;
};

/**
 * Works out a floor tile's shape from its eight neighbours; see {@link floorNeighbourJoins}.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} kind The floor tile's kind.
 * @param {number} mode The tileset's mode.
 * @returns {number} The shape, 0 to 46.
 */
const floorShapeAt = (reader: TileReader, x: number, y: number, kind: number, mode: number): number =>
{
  let joins = 0;
  NEIGHBOUR_OFFSETS.forEach(([ dx, dy ], bit) =>
  {
    if (floorNeighbourJoins(reader, x, y, dx, dy, kind, mode))
    {
      joins |= 1 << bit;
    }
  });

  return floorShape(joins);
};

/**
 * Finds how many shapes the engine's table holds for a kind: 48 for floor kinds, 16 for roofs and wall faces, 4 for
 * waterfalls. The engine reads a shape straight out of that table, so a stored shape at or past the count leaves it
 * nothing to draw and breaks the map.
 * @param {number} kind The autotile kind.
 * @returns {number} The number of shapes in the kind's table.
 */
const autotileTableSize = (kind: number): number =>
{
  if (isFloorTypeKind(kind))
  {
    return FLOOR_AUTOTILE_TABLE.length;
  }

  return isWaterfallKind(kind)
    ? WATERFALL_AUTOTILE_TABLE.length
    : WALL_AUTOTILE_TABLE.length;
};

/**
 * Works out the shape MZ's editor would store for an autotile of a given kind at a position, from what surrounds
 * it. The tile's own layer does not matter, because every rule reads its neighbours on all four layers. A2 table
 * tiles (ground with the counter flag) shape exactly like other ground, as all 202 in the shipped maps do; only the
 * engine's drawing of them differs.
 * @param {TileReader} reader The map, holding the neighbours as they should be judged.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} kind The autotile kind being shaped.
 * @param {number} mode The tileset's mode.
 * @returns {number} The shape.
 */
const autotileShapeFor = (reader: TileReader, x: number, y: number, kind: number, mode: number): number =>
{
  if (isFloorTypeKind(kind))
  {
    return floorShapeAt(reader, x, y, kind, mode);
  }

  if (isWaterfallKind(kind))
  {
    return waterfallShape(reader, x, y);
  }

  return isWallSideKind(kind)
    ? wallSideShape(reader, x, y, kind)
    : roofShape(reader, x, y, kind);
};

/**
 * Works out the tile id MZ's editor would store for the autotile on a layer of a cell: the same kind, in the shape
 * its neighbours call for.
 * @param {TileReader} reader The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} z The tile layer, 0 to 3.
 * @param {number} mode The tileset's mode.
 * @returns {number} The shaped tile id, or the tile as it stands when it is not an autotile.
 */
const shapedTileAt = (reader: TileReader, x: number, y: number, z: number, mode: number): number =>
{
  const tileId = reader.tileAt(x, y, z);
  if (isAutotile(tileId) === false)
  {
    return tileId;
  }

  const kind = autotileKind(tileId);
  return makeAutotileId(kind, autotileShapeFor(reader, x, y, kind, mode));
};

export {
  autotileShapeFor,
  autotileTableSize,
  floorJoins,
  floorNeighbourJoins,
  floorShape,
  holdsKind,
  isRunKind,
  Neighbour,
  NEIGHBOUR_OFFSETS,
  roofNeighbourJoins,
  shapedTileAt,
  TilesetMode,
  wallRunTop,
  wallSideNeighbourJoins,
  WallEdge,
  waterfallNeighbourJoins,
};
