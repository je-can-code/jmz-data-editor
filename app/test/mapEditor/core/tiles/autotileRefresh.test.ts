import { describe, expect, it } from 'vitest';
import { cellsToReshape, reshapeAround, withReshapes } from '../../../../src/mapEditor/core/tiles/autotileRefresh.ts';
import { autotileShapeFor, TilesetMode, WallEdge } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { paintTiles, swapTiles, type TilePlacement } from '../../../../src/mapEditor/core/tiles/layering.ts';
import { auditShapes, type ShapeMismatch } from '../../../../src/mapEditor/core/tiles/shapeAudit.ts';
import { cellIndex, gridReader, TileDraft, type CellChange, type TileReader } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { autotileKind, autotileShape, isAutotile, isRoofKind, isWallSideKind, makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { locateGameProject } from '../../../support/gameProject.ts';
import { readShippedMaps, readShippedTilesets, type ShippedMap, type ShippedTileset } from './support/shippedGame.ts';
import { blankGrid, fill, kindTile, put } from './support/tileGridBuilder.ts';

/*
 * Reshaping after a change.
 *
 * When tiles change, every autotile that reads them must be reshaped, and nothing else. Too little leaves a seam
 * where a coastline or wall edge no longer matches what is beside it; too much quietly redraws tiles somebody drew
 * with Shift held on purpose, far from where they painted. So the area reshaped is each changed cell and its eight
 * neighbours, plus every row of the wall and roof runs reaching up and down from a changed cell and the cells either
 * side of them, since those shapes read where their column's run starts and ends, and where the run beside it does.
 *
 * The strokes over the shipped maps hold the editor to that on real walls and roofs: every stroke that lengthens,
 * shortens, extends by a row or swaps one must leave no cell the autotile oracle would call stale, and must redraw no
 * tile it did not paint unless what that tile's neighbours call for changed. They skip when the game is not beside
 * the repository and JMZ_PROJECT_ROOT is unset, as the oracle does.
 */
const GRASS = 16;
const DIRT = 17;
const ROOF = 48;
const CEILING = 80;
const WALL = 88;

/**
 * Lists the rows of one column that a reshape set reaches.
 * @param {readonly (readonly [ number, number ])[]} cells The reshape set.
 * @param {number} x The column.
 * @returns {number[]} The rows, ascending.
 */
const rowsIn = (cells: readonly (readonly [ number, number ])[], x: number): number[] =>
{
  return cells.filter(([ cx ]) => cx === x).map(([ , y ]) => y).sort((a, b) => a - b);
};

describe('cellsToReshape', () =>
{
  it('takes each changed cell and its eight neighbours, clipped to the map', () =>
  {
    // Arrange: a 4x4 map with a change in its top-left corner.
    const reader = gridReader(blankGrid(4, 4));

    // Act.
    const cells = cellsToReshape(reader, [ [ 0, 0 ] ]);

    // Assert: four cells inside the map; (2, 0), two steps away, is not among them.
    expect(cells)
      .toEqual([ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ]);
  });

  it('follows the wall faces hanging below a changed cell, with the cells either side', () =>
  {
    // Arrange: a wall column two tall under row 0, then floor at row 3 on a 3x5 map.
    const grid = fill(blankGrid(3, 5), 1, 1, 1, 2, 0, kindTile(WALL));

    // Act.
    const cells = cellsToReshape(gridReader(grid), [ [ 1, 0 ] ]);

    // Assert: rows 0 and 1 from the neighbourhood, row 2 from the wall; row 3 holds no wall face and stops the walk.
    expect(cells.filter(([ , y ]) => y >= 2))
      .toEqual([ [ 0, 2 ], [ 1, 2 ], [ 2, 2 ] ]);
  });

  it('follows the wall faces reaching up from a changed cell too, and stops where they do', () =>
  {
    // Arrange: on a 4x7 map, column 1 holds a wall face on row 0 and a wall from row 2 to row 4; the change is on row
    // 5, the row the wall just lost.
    const grid = blankGrid(4, 7);
    put(grid, 1, 0, 0, kindTile(WALL));
    fill(grid, 1, 2, 1, 4, 0, kindTile(WALL));

    // Act.
    const cells = cellsToReshape(gridReader(grid), [ [ 1, 5 ] ]);

    // Assert: rows 3 and 2 from the wall, beyond the neighbourhood's rows 4 to 6; the gap on row 1 stops the walk, so
    // row 0 stays out, and so does column 3, two columns over.
    expect(cells.filter(([ , y ]) => y < 4))
      .toEqual([ [ 0, 3 ], [ 1, 3 ], [ 2, 3 ], [ 0, 2 ], [ 1, 2 ], [ 2, 2 ] ]);
  });

  it('follows a roof run up and down as it does a wall, but not a column of ceiling', () =>
  {
    // Arrange: a 5x7 map with a roof down column 1 and a ceiling down column 3, each from top to bottom.
    const grid = blankGrid(5, 7);
    fill(grid, 1, 0, 1, 6, 0, kindTile(ROOF));
    fill(grid, 3, 0, 3, 6, 0, kindTile(CEILING));
    const reader = gridReader(grid);

    // Act: a change in the middle of each column.
    const roof = cellsToReshape(reader, [ [ 1, 3 ] ]);
    const ceiling = cellsToReshape(reader, [ [ 3, 3 ] ]);

    // Assert: the roof's whole column; only the neighbourhood of the ceiling, whose runs no shape reads.
    expect([ rowsIn(roof, 1), rowsIn(ceiling, 3) ])
      .toEqual([ [ 0, 1, 2, 3, 4, 5, 6 ], [ 2, 3, 4 ] ]);
  });
});

describe('reshapeAround', () =>
{
  it('reshapes the neighbours of a changed cell but leaves a stale tile further off alone', () =>
  {
    // Arrange: grass across a 4x1 map, the last tile stored in a wrong shape; dirt is staged at (0,0).
    const grid = put(fill(blankGrid(4, 1), 0, 0, 3, 0, 0, kindTile(GRASS)), 3, 0, 0, makeAutotileId(GRASS, 5));
    const draft = new TileDraft(grid);
    draft.setTile(0, 0, 0, kindTile(DIRT));

    // Act.
    reshapeAround(draft, [ [ 0, 0 ] ], TilesetMode.area);

    // Assert: (1,0) now shows its west edge, while (3,0), three cells off, keeps the wrong shape it was drawn with.
    expect([ autotileShape(draft.tileAt(1, 0, 0)), autotileShape(draft.tileAt(3, 0, 0)) ])
      .toEqual([ 16, 5 ]);
  });

  it('leaves a hand-shaped neighbour alone when the change does not alter what it joins', () =>
  {
    // Arrange: grass drawn in a wrong shape at (0,0); a rock is staged at (1,0), which grass never joins anyway.
    const grid = put(blankGrid(2, 1), 0, 0, 0, makeAutotileId(GRASS, 5));
    const draft = new TileDraft(grid);
    draft.setTile(1, 0, 0, 1536);

    // Act.
    reshapeAround(draft, [ [ 1, 0 ] ], TilesetMode.area);

    // Assert: the empty cell before and the rock after both leave the grass's east side open, so it keeps shape 5.
    expect(draft.changes())
      .toEqual([ [ 1, 1536 ] ]);
  });

  it('moves the side edges of every row of a wall when the wall beside it grows taller', () =>
  {
    // Arrange: two wall columns under a ceiling row, both starting at row 1; then column 0 grows up into row 0.
    const grid = blankGrid(2, 4);
    fill(grid, 0, 0, 1, 0, 0, kindTile(CEILING));
    fill(grid, 0, 1, 1, 2, 0, kindTile(WALL));
    const draft = new TileDraft(grid);
    draft.setTile(0, 0, 0, kindTile(WALL));

    // Act.
    reshapeAround(draft, [ [ 0, 0 ] ], TilesetMode.area);

    // Assert: column 1's wall is now the shorter one, so its row 2, two rows below the change, opens toward it.
    expect(autotileShape(draft.tileAt(1, 2, 0)) & WallEdge.left)
      .toBe(WallEdge.left);
  });

  it('opens every row of a wall toward the wall beside it when that one loses its bottom row', () =>
  {
    // Arrange: walls down both columns of a 2x5 map from row 0 to row 3, over a floor row; column 1 loses row 3.
    const grid = fill(blankGrid(2, 5), 0, 0, 1, 3, 0, kindTile(WALL));
    const draft = new TileDraft(grid);
    draft.setTile(1, 3, 0, 0);

    // Act.
    reshapeAround(draft, [ [ 1, 3 ] ], TilesetMode.area);

    // Assert: column 0's row 0, three rows above the change, now keeps its edge against the wall that ends higher;
    // column 1's row 0 still joins column 0, whose wall ends lower.
    expect([ autotileShape(draft.tileAt(0, 0, 0)) & WallEdge.right, autotileShape(draft.tileAt(1, 0, 0)) & WallEdge.left ])
      .toEqual([ WallEdge.right, 0 ]);
  });

  it('reshapes the roof beside a roof column that grows a row, all the way up', () =>
  {
    // Arrange: roofs down both columns of a 2x6 map from row 0 to row 3; column 1 grows into row 4.
    const grid = fill(blankGrid(2, 6), 0, 0, 1, 3, 0, kindTile(ROOF));
    const draft = new TileDraft(grid);
    draft.setTile(1, 4, 0, kindTile(ROOF));

    // Act.
    reshapeAround(draft, [ [ 1, 4 ] ], TilesetMode.area);

    // Assert: column 0's row 0, four rows above the change, now keeps a seam toward the deeper roof.
    expect(autotileShape(draft.tileAt(0, 0, 0)) & WallEdge.right)
      .toBe(WallEdge.right);
  });
});

describe('withReshapes', () =>
{
  it('returns the writes together with the reshapes they cause', () =>
  {
    // Arrange: grass across a 3x1 map; dirt is written into the middle.
    const grid = fill(blankGrid(3, 1), 0, 0, 2, 0, 0, kindTile(GRASS));
    const write = [ cellIndex(3, 1, 1, 0, 0), kindTile(DIRT) ] as const;

    // Act.
    const changes = withReshapes(grid, [ write ], TilesetMode.area);

    // Assert: the grass either side opens toward the dirt, and the dirt joins only the map's edges above and below.
    expect(changes)
      .toEqual([ [ 0, makeAutotileId(GRASS, 24) ], [ 1, makeAutotileId(DIRT, 32) ], [ 2, makeAutotileId(GRASS, 16) ] ]);
  });

  it('writes shadows and regions without reshaping anything', () =>
  {
    // Arrange: a lone grass tile stored in the wrong shape, beside the region cell being written.
    const grid = put(blankGrid(2, 1), 0, 0, 0, makeAutotileId(GRASS, 5));
    const regionWrite = [ cellIndex(2, 1, 1, 0, 5), 7 ] as const;

    // Act.
    const changes = withReshapes(grid, [ regionWrite ], TilesetMode.area);

    // Assert: only the region; the grass keeps its shape.
    expect(changes)
      .toEqual([ regionWrite ]);
  });
});

/**
 * One vertical run of a wall face or roof on one layer of a shipped map: the stretch a stroke lengthens or shortens.
 */
type ColumnRun = {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly z: number;
  readonly kind: number;
};

/**
 * One stroke over a shipped map: what it did, the cells it painted (as {@code y * width + x}), and the changes the
 * editor answered with.
 */
type Stroke = {
  readonly label: string;
  readonly painted: ReadonlySet<number>;
  readonly changes: readonly CellChange[];
};

const game = locateGameProject();
const shippedMaps: ShippedMap[] = game === null
  ? []
  : readShippedMaps(game);
const shippedTilesets = game === null
  ? new Map<number, ShippedTileset>()
  : readShippedTilesets(game);

/**
 * Reads the kind of an autotile on one layer of a map, or -1 for anything else and anywhere off the map.
 * @param {ShippedMap} map The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} z The layer.
 * @returns {number} The kind.
 */
const kindOn = (map: ShippedMap, x: number, y: number, z: number): number =>
{
  if (x < 0 || y < 0 || x >= map.width || y >= map.height)
  {
    return -1;
  }

  const tileId = map.cells[cellIndex(map.width, map.height, x, y, z)];
  return isAutotile(tileId)
    ? autotileKind(tileId)
    : -1;
};

/**
 * Lists every vertical run of a wall face or roof kind on a map, layer by layer, in the order the layers, columns and
 * rows are scanned.
 * @param {ShippedMap} map The map.
 * @returns {ColumnRun[]} The runs.
 */
const columnRuns = (map: ShippedMap): ColumnRun[] =>
{
  const runs: ColumnRun[] = [];
  for (let z = 0; z < 4; z++)
  {
    for (let x = 0; x < map.width; x++)
    {
      for (let y = 0; y < map.height; y++)
      {
        // a run starts where its kind does not continue from the row above.
        const kind = kindOn(map, x, y, z);
        if ((isWallSideKind(kind) === false && isRoofKind(kind) === false) || kindOn(map, x, y - 1, z) === kind)
        {
          continue;
        }

        let bottom = y;
        while (kindOn(map, x, bottom + 1, z) === kind)
        {
          bottom += 1;
        }

        runs.push({ x, top: y, bottom, z, kind });
      }
    }
  }

  return runs;
};

/**
 * Picks up to a number of entries spread evenly through a list, the same ones every run.
 * @param {readonly T[]} list The list.
 * @param {number} count How many to pick.
 * @returns {T[]} The picks, in list order.
 */
const spread = <T>(list: readonly T[], count: number): T[] =>
{
  const picks = Math.min(count, list.length);
  return Array.from({ length: picks }, (_, pick) => list[Math.floor(pick * list.length / picks)]);
};

/**
 * Paints a stroke through the editor's pen, with automatic layering and nothing marked.
 * @param {ShippedMap} map The map.
 * @param {number} mode The tileset's mode.
 * @param {string} label What the stroke does.
 * @param {readonly TilePlacement[]} placements The tiles to paint.
 * @returns {Stroke} The stroke.
 */
const penStroke = (map: ShippedMap, mode: number, label: string, placements: readonly TilePlacement[]): Stroke =>
{
  const layering = { mode, marks: { tiles: new Set<number>(), kinds: new Set<number>() } };
  return {
    label,
    painted: new Set(placements.map(({ x, y }) => y * map.width + x)),
    changes: paintTiles(map, placements, layering, 'auto'),
  };
};

/**
 * Erases one layer of one cell through the editor's eraser path, which reshapes around what it writes.
 * @param {ShippedMap} map The map.
 * @param {number} mode The tileset's mode.
 * @param {string} label What the stroke does.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} z The layer.
 * @returns {Stroke} The stroke.
 */
const eraseStroke = (map: ShippedMap, mode: number, label: string, x: number, y: number, z: number): Stroke =>
{
  return {
    label,
    painted: new Set([ y * map.width + x ]),
    changes: withReshapes(map, [ [ cellIndex(map.width, map.height, x, y, z), 0 ] ], mode),
  };
};

/**
 * Plans the strokes painted over one run: lengthening it by a row at either end, painting a row under the whole
 * stretch of it that shares its bottom row, and erasing its top and bottom rows.
 * @param {ShippedMap} map The map.
 * @param {number} mode The tileset's mode.
 * @param {ColumnRun} run The run.
 * @returns {Stroke[]} The strokes.
 */
const strokesOverRun = (map: ShippedMap, mode: number, run: ColumnRun): Stroke[] =>
{
  const { x, top, bottom, z, kind } = run;
  const tileId = makeAutotileId(kind, 0);
  const at = `(${x},${top}..${bottom}) layer ${z + 1} kind ${kind}`;
  const strokes = [
    eraseStroke(map, mode, `erase the top of ${at}`, x, top, z),
    eraseStroke(map, mode, `erase the bottom of ${at}`, x, bottom, z),
  ];

  if (top > 0)
  {
    strokes.push(penStroke(map, mode, `lengthen ${at} upward`, [ { x, y: top - 1, tileId } ]));
  }

  if (bottom + 1 < map.height)
  {
    // the stretch of the same kind along the run's bottom row, which a row painted under it extends as a whole.
    let left = x;
    let right = x;
    while (kindOn(map, left - 1, bottom, z) === kind)
    {
      left -= 1;
    }

    while (kindOn(map, right + 1, bottom, z) === kind)
    {
      right += 1;
    }

    strokes.push(penStroke(map, mode, `lengthen ${at} downward`, [ { x, y: bottom + 1, tileId } ]));
    if (right > left)
    {
      const row = Array.from({ length: right - left + 1 }, (_, step) => ({ x: left + step, y: bottom + 1, tileId }));
      strokes.push(penStroke(map, mode, `paint a row under ${at} from column ${left} to ${right}`, row));
    }
  }

  return strokes;
};

/**
 * Plans a swap of one run kind for another across the whole map, when the map holds two.
 * @param {ShippedMap} map The map.
 * @param {number} mode The tileset's mode.
 * @param {readonly ColumnRun[]} runs The map's runs.
 * @returns {Stroke[]} The swap, or nothing when the map holds a single run kind.
 */
const swapStrokes = (map: ShippedMap, mode: number, runs: readonly ColumnRun[]): Stroke[] =>
{
  const kinds = [ ...new Set(runs.map(run => run.kind)) ];
  if (kinds.length < 2)
  {
    return [];
  }

  // every cell holding the kind swapped out is one the swap paints.
  const [ from, to ] = kinds;
  const painted = new Set<number>();
  for (let index = 0; index < map.width * map.height * 4; index++)
  {
    const tileId = map.cells[index];
    if (isAutotile(tileId) && autotileKind(tileId) === from)
    {
      painted.add(index % (map.width * map.height));
    }
  }

  const changes = swapTiles(map, makeAutotileId(from, 0), makeAutotileId(to, 0), mode);
  return [ { label: `swap kind ${from} for kind ${to}`, painted, changes } ];
};

/**
 * Describes one autotile for a failure message.
 * @param {ShapeMismatch} cell The autotile.
 * @returns {string} Where it is and what it holds.
 */
const describeCell = (cell: ShapeMismatch): string =>
{
  return `(${cell.x},${cell.y}) layer ${cell.z + 1} kind ${cell.kind} holds ${cell.stored}, its neighbours call for ${cell.expected}`;
};

/**
 * Checks what one stroke left behind against the oracle's rules. Every autotile afterwards must hold the shape its
 * neighbours call for, unless it was already out of step before the stroke and the stroke changed neither it nor what
 * its neighbours call for. And a tile the stroke did not paint may change only by taking a new shape because what its
 * neighbours call for changed.
 * @param {ShippedMap} map The map before the stroke.
 * @param {number} mode The tileset's mode.
 * @param {ReadonlyMap<number, ShapeMismatch>} before The map's mismatches before the stroke, by flat index.
 * @param {Stroke} stroke The stroke.
 * @returns {string[]} A line for every cell left stale and every tile redrawn without cause.
 */
const strokeFaults = (map: ShippedMap, mode: number, before: ReadonlyMap<number, ShapeMismatch>, stroke: Stroke): string[] =>
{
  const cells = Uint16Array.from(map.cells);
  stroke.changes.forEach(([ index, value ]) =>
  {
    cells[index] = value;
  });

  // stale: out of step afterwards, where the stroke touched it or what it should be.
  const after = { width: map.width, height: map.height, cells };
  const stale = auditShapes(after, mode).mismatches
    .filter((cell) =>
    {
      const earlier = before.get(cell.index);
      return earlier === undefined || earlier.expected !== cell.expected || map.cells[cell.index] !== cells[cell.index];
    })
    .map(cell => `${stroke.label} left ${describeCell(cell)}`);

  // redrawn: a tile beyond the painted cells that changed although what its neighbours call for did not.
  const plane = map.width * map.height;
  const beforeReader: TileReader = gridReader(map);
  const afterReader: TileReader = gridReader(after);
  const redrawn = stroke.changes
    .filter(([ index, value ]) =>
    {
      const was = map.cells[index];
      const position = index % plane;
      if (index >= plane * 4 || stroke.painted.has(position))
      {
        return false;
      }

      if (isAutotile(was) === false || isAutotile(value) === false || autotileKind(was) !== autotileKind(value))
      {
        return true;
      }

      const [ x, y, kind ] = [ position % map.width, Math.floor(position / map.width), autotileKind(value) ];
      return autotileShapeFor(beforeReader, x, y, kind, mode) === autotileShapeFor(afterReader, x, y, kind, mode);
    })
    .map(([ index, value ]) => `${stroke.label} redrew cell ${index} from ${map.cells[index]} to ${value} without cause`);

  return [ ...stale, ...redrawn ];
};

/**
 * Finds the mode of a map's tileset.
 * @param {ShippedMap} map The map.
 * @returns {number} The tileset's mode.
 */
const modeOf = (map: ShippedMap): number =>
{
  const tileset = shippedTilesets.get(map.tilesetId);
  if (tileset === undefined)
  {
    throw new Error(`Map${map.id} uses tileset ${map.tilesetId}, which Tilesets.json does not have`);
  }

  return tileset.mode;
};

const mapsWithRuns = shippedMaps.filter(map => columnRuns(map).length > 0);

describe.skipIf(game === null)('strokes over the shipped maps', () =>
{
  it('finds walls and roofs to paint over, roofs included', () =>
  {
    // Arrange: the maps read above.

    // Act.
    const roofMaps = mapsWithRuns.filter(map => columnRuns(map).some(run => isRoofKind(run.kind)));

    // Assert: a wrong folder, or a broken run finder, would otherwise pass by painting nothing.
    expect([ mapsWithRuns.length > 200, roofMaps.length > 5 ])
      .toEqual([ true, true ]);
  });

  it.each(mapsWithRuns.length > 0 ? mapsWithRuns : [ { id: 0 } as ShippedMap ])('Map$id: strokes over its walls and roofs leave no stale cell and redraw nothing else', (map) =>
  {
    // Arrange: the map's mismatches as it stands, and strokes over a spread of its walls and a wider one of its roofs,
    // which are fewer.
    const mode = modeOf(map);
    const before = new Map(auditShapes(map, mode).mismatches.map(cell => [ cell.index, cell ]));
    const runs = columnRuns(map);
    const sampled = [ ...spread(runs.filter(run => isWallSideKind(run.kind)), 2), ...spread(runs.filter(run => isRoofKind(run.kind)), 5) ];
    const strokes = [ ...sampled.flatMap(run => strokesOverRun(map, mode, run)), ...swapStrokes(map, mode, runs) ];

    // Act.
    const faults = strokes.flatMap(stroke => strokeFaults(map, mode, before, stroke));

    // Assert: no faults, and some stroke reshaped tiles beyond the cells it painted, so the check had work to do.
    const reshaped = strokes.some(stroke => stroke.changes.length > stroke.painted.size);
    expect({ faults, reshaped })
      .toEqual({ faults: [], reshaped: true });
  });
});
