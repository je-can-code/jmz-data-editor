import { describe, expect, it } from 'vitest';
import {
  autotileShapeFor,
  floorJoins,
  floorShape,
  Neighbour,
  shapedTileAt,
  TilesetMode,
  WallEdge,
} from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { WALL_AUTOTILE_TABLE, WATERFALL_AUTOTILE_TABLE } from '../../../../src/mapEditor/core/tiles/autotileTables.ts';
import { gridReader, type TileGrid } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { blankGrid, fill, kindTile, put } from './support/tileGridBuilder.ts';

/*
 * The autotile shape rules.
 *
 * Given a cell's kind and what surrounds it, these answer the shape MZ's editor would store. They were measured
 * from the shipped maps (the oracle test holds them to every one), and each rule here is pinned on a small map with
 * a near miss beside it: a neighbour that must not join, a kind that must not count, a direction that must not be
 * read. A rule that only ever sees the case it was written for cannot tell "joins this" from "joins everything".
 *
 * The shape lookups themselves are derived from the engine's own quadrant tables, and checked here against the
 * table mapgen learned independently from the maps, so the two sources of truth have to agree.
 */
const OCEAN = 0;
const DEEP_SEA = 1;
const LAKE = 4;
const WATERFALL = 5;
const POND = 6;
const GRASS = 16;
const DIRT = 17;
const ROOF = 48;
const OTHER_ROOF = 49;
const BUILDING_WALL = 56;
const CEILING = 80;
const OTHER_CEILING = 81;
const WALL = 88;
const OTHER_WALL = 89;

/**
 * Shapes the given kind at a position of a test map.
 * @param {TileGrid} grid The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} kind The kind to shape.
 * @param {number} mode The tileset's mode.
 * @returns {number} The shape.
 */
const shapeOf = (grid: TileGrid, x: number, y: number, kind: number, mode: number = TilesetMode.area): number =>
{
  return autotileShapeFor(gridReader(grid), x, y, kind, mode);
};

/**
 * The A2 shape table ca/tools/mapgen/learn-tables.js measured from the shipped maps (autotile.js), keyed by the
 * neighbour mask with only the corners that count.
 */
const MAPGEN_LEARNED_FLOOR_SHAPES: Record<number, number> = {
  0: 46, 2: 44, 8: 45, 10: 39, 11: 38, 16: 43, 18: 41, 22: 40, 24: 33, 26: 31, 27: 30, 30: 29, 31: 28, 64: 42, 66: 32,
  72: 37, 74: 27, 75: 25, 80: 35, 82: 19, 86: 18, 88: 23, 90: 15, 91: 14, 94: 13, 95: 12, 104: 36, 106: 26, 107: 24,
  120: 21, 122: 7, 123: 6, 126: 5, 127: 4, 208: 34, 210: 17, 214: 16, 216: 22, 218: 11, 219: 10, 222: 9, 223: 8,
  248: 20, 250: 3, 251: 2, 254: 1, 255: 0,
};

describe('floorShape', () =>
{
  it('agrees with the table mapgen learned from the maps, for every one of the 47 masks', () =>
  {
    // Arrange.
    const masks = Object.keys(MAPGEN_LEARNED_FLOOR_SHAPES).map(Number);

    // Act.
    const derived = masks.map(mask => [ mask, floorShape(mask) ]);

    // Assert.
    expect(derived)
      .toEqual(masks.map(mask => [ mask, MAPGEN_LEARNED_FLOOR_SHAPES[mask] ]));
  });

  it('ignores a diagonal whose sides do not both join', () =>
  {
    // Arrange: north joins with the north-west corner, but west does not.
    const withCorner = Neighbour.north | Neighbour.northWest;

    // Act.
    const shapes = [ floorShape(withCorner), floorShape(Neighbour.north) ];

    // Assert: the corner changes nothing.
    expect(shapes[0])
      .toBe(shapes[1]);
  });

  it('draws an inner corner where both sides join but the diagonal does not', () =>
  {
    // Arrange: everything but the north-west corner.
    const joins = 0xff & ~Neighbour.northWest;

    // Act.
    const shape = floorShape(joins);

    // Assert.
    expect([ shape, floorShape(0xff) ])
      .toEqual([ 1, 0 ]);
  });
});

describe('floorJoins', () =>
{
  it('undoes floorShape for every shape a map can hold', () =>
  {
    // Arrange: shapes 0 to 46.
    const shapes = Array.from({ length: 47 }, (_, shape) => shape);

    // Act.
    const roundTrips = shapes.map(shape => floorShape(floorJoins(shape)));

    // Assert.
    expect(roundTrips)
      .toEqual(shapes);
  });

  it('answers -1 for the palette picture and anything past it', () =>
  {
    // Arrange.
    const shapes = [ 47, 48, -1 ];

    // Act.
    const joins = shapes.map(floorJoins);

    // Assert.
    expect(joins)
      .toEqual([ -1, -1, -1 ]);
  });
});

describe('wall and waterfall shape numbers', () =>
{
  it('read as the open edges added up, as the engine table draws them', () =>
  {
    // Arrange: the wall table's top-left and bottom-right quarters show the left and top, and right and bottom edges.
    const shapes = Array.from({ length: 16 }, (_, shape) => shape);

    // Act.
    const edges = shapes.map((shape) =>
    {
      const [ topLeft, , , bottomRight ] = WALL_AUTOTILE_TABLE[shape];
      return (topLeft[0] === 0 ? WallEdge.left : 0) | (topLeft[1] === 0 ? WallEdge.top : 0)
        | (bottomRight[0] === 3 ? WallEdge.right : 0) | (bottomRight[1] === 3 ? WallEdge.bottom : 0);
    });

    // Assert.
    expect(edges)
      .toEqual(shapes);
  });

  it('give a waterfall its left edge as 1 and its right edge as 2', () =>
  {
    // Arrange.
    const shapes = [ 0, 1, 2, 3 ];

    // Act.
    const edges = shapes.map((shape) =>
    {
      const [ topLeft, topRight ] = WATERFALL_AUTOTILE_TABLE[shape];
      return (topLeft[0] === 0 ? 1 : 0) | (topRight[0] === 3 ? 2 : 0);
    });

    // Assert.
    expect(edges)
      .toEqual(shapes);
  });
});

describe('floor tiles', () =>
{
  it('join their own kind and draw an edge against a different ground kind', () =>
  {
    // Arrange: grass everywhere on a 3x3 map, dirt to the east of the centre.
    const grid = put(fill(blankGrid(3, 3), 0, 0, 2, 2, 0, kindTile(GRASS)), 2, 1, 0, kindTile(DIRT));

    // Act.
    const shape = shapeOf(grid, 1, 1, GRASS);

    // Assert: only the east side and its corners are open.
    expect(shape)
      .toBe(floorShape(0xff & ~(Neighbour.east | Neighbour.northEast | Neighbour.southEast)));
  });

  it('count beyond the edge of the map as joined, but not an empty cell inside it', () =>
  {
    // Arrange: grass in the top-left corner of a map, with nothing around it.
    const grid = put(blankGrid(3, 3), 0, 0, 0, kindTile(GRASS));

    // Act.
    const shape = shapeOf(grid, 0, 0, GRASS);

    // Assert: the edges beyond the map join; east, south and the corner between them are open.
    expect(shape)
      .toBe(floorShape(Neighbour.northWest | Neighbour.north | Neighbour.northEast | Neighbour.west | Neighbour.southWest));
  });

  it('join the same kind on another layer, but not another kind on it', () =>
  {
    // Arrange: a wall top on layer 1, the same wall top on layer 2 to its east, a different one on layer 2 to its west.
    const grid = blankGrid(3, 1);
    put(grid, 1, 0, 0, kindTile(CEILING));
    put(grid, 2, 0, 1, kindTile(CEILING));
    put(grid, 0, 0, 1, kindTile(OTHER_CEILING));

    // Act.
    const shape = shapeOf(grid, 1, 0, CEILING);

    // Assert: east joins; west is open.
    expect(shape)
      .toBe(floorShape(0xff & ~Neighbour.west & ~Neighbour.northWest & ~Neighbour.southWest));
  });

  it('let water join a waterfall, but not ground', () =>
  {
    // Arrange: a waterfall with a lake to its west and grass to its east, in a map of the waterfall's kind above.
    const grid = blankGrid(3, 1);
    put(grid, 0, 0, 0, kindTile(LAKE));
    put(grid, 1, 0, 0, kindTile(WATERFALL));
    put(grid, 2, 0, 0, kindTile(GRASS));

    // Act.
    const lake = shapeOf(grid, 0, 0, LAKE);
    const grass = shapeOf(grid, 2, 0, GRASS);

    // Assert: the lake is joined all round; the grass keeps its west edge.
    expect([ lake, grass ])
      .toEqual([ 0, floorShape(0xff & ~Neighbour.west & ~Neighbour.northWest & ~Neighbour.southWest) ]);
  });

  it('let open water kinds join each other on an Area tileset but keep their shores on a Field one', () =>
  {
    // Arrange: ocean beside a pond.
    const grid = put(put(blankGrid(2, 1), 0, 0, 0, kindTile(OCEAN)), 1, 0, 0, kindTile(POND));

    // Act.
    const area = shapeOf(grid, 0, 0, OCEAN, TilesetMode.area);
    const field = shapeOf(grid, 0, 0, OCEAN, TilesetMode.field);

    // Assert.
    expect([ area, field ])
      .toEqual([ 0, floorShape(0xff & ~Neighbour.east & ~Neighbour.northEast & ~Neighbour.southEast) ]);
  });

  it('keep a shore between open water kinds where an A5 tile lies over either cell', () =>
  {
    // Arrange: ocean beside a pond twice, once with an A5 tile over the pond and once over the ocean.
    const overPond = put(put(put(blankGrid(2, 1), 0, 0, 0, kindTile(OCEAN)), 1, 0, 0, kindTile(POND)), 1, 0, 1, TileId.A5 + 8);
    const overOcean = put(put(put(blankGrid(2, 1), 0, 0, 0, kindTile(OCEAN)), 1, 0, 0, kindTile(POND)), 0, 0, 1, TileId.A5 + 8);

    // Act.
    const shapes = [ shapeOf(overPond, 0, 0, OCEAN), shapeOf(overOcean, 0, 0, OCEAN) ];

    // Assert: both keep the east shore that the pair without an A5 tile joins across.
    const eastShore = floorShape(0xff & ~Neighbour.east & ~Neighbour.northEast & ~Neighbour.southEast);
    expect(shapes)
      .toEqual([ eastShore, eastShore ]);
  });

  it('keep deep sea bordered against the ocean around it, even on an Area tileset', () =>
  {
    // Arrange: ocean on layer 1 of both cells, deep sea on layer 2 of the western one.
    const grid = fill(blankGrid(2, 1), 0, 0, 1, 0, 0, kindTile(OCEAN));
    put(grid, 0, 0, 1, kindTile(DEEP_SEA));

    // Act.
    const deep = shapeOf(grid, 0, 0, DEEP_SEA);
    const ocean = shapeOf(grid, 1, 0, OCEAN);

    // Assert: deep sea draws its east shore; the ocean beside it stays joined.
    expect([ deep, ocean ])
      .toEqual([ floorShape(0xff & ~Neighbour.east & ~Neighbour.northEast & ~Neighbour.southEast), 0 ]);
  });
});

describe('waterfalls', () =>
{
  it('join water, the ocean and the map edge sideways, and nothing above or below matters', () =>
  {
    // Arrange: ocean to the west, a lake to the east, grass above and below.
    const grid = blankGrid(3, 3);
    put(grid, 0, 1, 0, kindTile(OCEAN));
    put(grid, 1, 1, 0, kindTile(WATERFALL));
    put(grid, 2, 1, 0, kindTile(LAKE));
    put(grid, 1, 0, 0, kindTile(GRASS));
    put(grid, 1, 2, 0, kindTile(GRASS));

    // Act.
    const shape = shapeOf(grid, 1, 1, WATERFALL);

    // Assert.
    expect(shape)
      .toBe(0);
  });

  it('draw an edge against ground beside them', () =>
  {
    // Arrange: grass to the west, the map edge to the east.
    const grid = put(put(blankGrid(2, 1), 0, 0, 0, kindTile(GRASS)), 1, 0, 0, kindTile(WATERFALL));

    // Act.
    const shape = shapeOf(grid, 1, 0, WATERFALL);

    // Assert: open on the left only.
    expect(shape)
      .toBe(1);
  });
});

describe('roofs', () =>
{
  it('join their own kind and draw an edge against the building wall below', () =>
  {
    // Arrange: a roof row above a wall row, on a map one row taller so the wall is not on the edge.
    const grid = blankGrid(3, 3);
    fill(grid, 0, 0, 2, 0, 0, kindTile(ROOF));
    fill(grid, 0, 1, 2, 1, 0, kindTile(BUILDING_WALL));

    // Act.
    const shape = shapeOf(grid, 1, 0, ROOF);

    // Assert: the roof on the top row shows its top edge, and its bottom edge against the wall.
    expect(shape)
      .toBe(WallEdge.top | WallEdge.bottom);
  });

  it('join the same roof beside them whatever rows each column spans, but not another roof', () =>
  {
    // Arrange: a 3x4 map; column 0 holds another roof kind on rows 1 and 2, column 1 this roof on rows 1 and 2, and
    // column 2 this roof on row 1 only; building wall below each.
    const grid = blankGrid(3, 4);
    fill(grid, 0, 1, 0, 2, 0, kindTile(OTHER_ROOF));
    fill(grid, 1, 1, 1, 2, 0, kindTile(ROOF));
    put(grid, 2, 1, 0, kindTile(ROOF));
    fill(grid, 0, 3, 1, 3, 0, kindTile(BUILDING_WALL));
    put(grid, 2, 2, 0, kindTile(BUILDING_WALL));

    // Act.
    const middle = shapeOf(grid, 1, 1, ROOF);

    // Assert: an edge toward the other roof on the left; joined to the shallower column of the same roof on the right.
    expect([ middle & WallEdge.left, middle & WallEdge.right ])
      .toEqual([ WallEdge.left, 0 ]);
  });

  it('show their edge at the top and sides of the map, but join past the bottom', () =>
  {
    // Arrange: a single roof tile filling a 1x1 map.
    const grid = put(blankGrid(1, 1), 0, 0, 0, kindTile(ROOF));

    // Act.
    const shape = shapeOf(grid, 0, 0, ROOF);

    // Assert.
    expect(shape)
      .toBe(WallEdge.left | WallEdge.top | WallEdge.right);
  });
});

describe('wall faces', () =>
{
  it('join a neighbouring wall that starts on the same row, or lower', () =>
  {
    // Arrange: two-tall wall in columns 0 and 1 under a ceiling row; column 2's wall starts a row lower.
    const grid = blankGrid(3, 4);
    fill(grid, 0, 0, 2, 0, 0, kindTile(CEILING));
    fill(grid, 0, 1, 1, 2, 0, kindTile(WALL));
    put(grid, 2, 1, 0, kindTile(CEILING));
    put(grid, 2, 2, 0, kindTile(WALL));

    // Act.
    const middle = shapeOf(grid, 1, 2, WALL);

    // Assert: joined both ways, bottom edge open above the empty floor row.
    expect(middle)
      .toBe(WallEdge.bottom);
  });

  it('draw an edge on every row of a shorter wall beside a taller one', () =>
  {
    // Arrange: the same map as above; column 2 is the shorter wall.
    const grid = blankGrid(3, 4);
    fill(grid, 0, 0, 2, 0, 0, kindTile(CEILING));
    fill(grid, 0, 1, 1, 2, 0, kindTile(WALL));
    put(grid, 2, 1, 0, kindTile(CEILING));
    put(grid, 2, 2, 0, kindTile(WALL));

    // Act.
    const shorter = shapeOf(grid, 2, 2, WALL);

    // Assert: open to the left toward the taller wall, top under its ceiling, bottom over the floor; the map's
    // right edge counts as a wall starting at row 0, which is taller still.
    expect(shorter)
      .toBe(WallEdge.left | WallEdge.top | WallEdge.right | WallEdge.bottom);
  });

  it('draw an edge beside a wall that ends higher, but join one that ends lower', () =>
  {
    // Arrange: a 3x5 map with walls starting on row 1 in all three columns; the left one ends on row 2, the middle on
    // row 3 and the right one on row 4.
    const grid = blankGrid(3, 5);
    fill(grid, 0, 1, 0, 2, 0, kindTile(WALL));
    fill(grid, 1, 1, 1, 3, 0, kindTile(WALL));
    fill(grid, 2, 1, 2, 4, 0, kindTile(WALL));

    // Act.
    const middle = shapeOf(grid, 1, 2, WALL);

    // Assert.
    expect([ middle & WallEdge.left, middle & WallEdge.right ])
      .toEqual([ WallEdge.left, 0 ]);
  });

  it('apply the same rule to a wall face of another kind', () =>
  {
    // Arrange: one-row walls side by side, the other kind's wall a row taller.
    const grid = blankGrid(2, 3);
    put(grid, 0, 1, 0, kindTile(WALL));
    put(grid, 1, 0, 0, kindTile(OTHER_WALL));
    put(grid, 1, 1, 0, kindTile(OTHER_WALL));

    // Act.
    const beside = shapeOf(grid, 0, 1, WALL);
    const taller = shapeOf(grid, 1, 1, OTHER_WALL);

    // Assert: the shorter wall opens toward the taller one; the taller one joins back.
    expect([ beside & WallEdge.right, taller & WallEdge.left ])
      .toEqual([ WallEdge.right, 0 ]);
  });

  it('join a ceiling beside them, but not ground', () =>
  {
    // Arrange: a wall face with a ceiling to the west and grass to the east.
    const grid = blankGrid(3, 3);
    put(grid, 0, 1, 0, kindTile(CEILING));
    put(grid, 1, 1, 0, kindTile(WALL));
    put(grid, 2, 1, 0, kindTile(GRASS));

    // Act.
    const shape = shapeOf(grid, 1, 1, WALL);

    // Assert: left joined, right open, top and bottom open.
    expect(shape)
      .toBe(WallEdge.top | WallEdge.right | WallEdge.bottom);
  });

  it('show their top edge on the map\'s top row, and join past its bottom row', () =>
  {
    // Arrange: a wall column filling a 1x2 map.
    const grid = fill(blankGrid(1, 2), 0, 0, 0, 1, 0, kindTile(WALL));

    // Act.
    const top = shapeOf(grid, 0, 0, WALL);
    const bottom = shapeOf(grid, 0, 1, WALL);

    // Assert: the side edges join, since the wall starts on the map's top row.
    expect([ top, bottom ])
      .toEqual([ WallEdge.top, 0 ]);
  });

  it('show their side edge at the map\'s edge when the wall starts below the top row', () =>
  {
    // Arrange: a ceiling over a wall face on the map's left edge.
    const grid = put(put(blankGrid(1, 3), 0, 0, 0, kindTile(CEILING)), 0, 1, 0, kindTile(WALL));

    // Act.
    const shape = shapeOf(grid, 0, 1, WALL);

    // Assert.
    expect(shape)
      .toBe(WallEdge.left | WallEdge.top | WallEdge.right | WallEdge.bottom);
  });
});

describe('shapedTileAt', () =>
{
  it('keeps the kind and gives it the shape its neighbours call for', () =>
  {
    // Arrange: an isolated grass tile stored in the wrong shape.
    const grid = put(blankGrid(3, 3), 1, 1, 0, makeAutotileId(GRASS, 12));

    // Act.
    const tileId = shapedTileAt(gridReader(grid), 1, 1, 0, TilesetMode.area);

    // Assert.
    expect(tileId)
      .toBe(makeAutotileId(GRASS, 46));
  });

  it('passes plain tiles through untouched', () =>
  {
    // Arrange: an A5 tile.
    const grid = put(blankGrid(1, 1), 0, 0, 0, TileId.A5 + 3);

    // Act.
    const tileId = shapedTileAt(gridReader(grid), 0, 0, 0, TilesetMode.area);

    // Assert.
    expect(tileId)
      .toBe(TileId.A5 + 3);
  });
});
