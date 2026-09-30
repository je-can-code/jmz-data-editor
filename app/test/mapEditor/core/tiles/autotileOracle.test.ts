import { describe, expect, it } from 'vitest';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { EXCEPTION_REASONS, judgeMap, readExceptionList } from './support/oracleExceptions.ts';
import { locateShippedGame, readShippedMaps, readShippedTilesets, type ShippedMap } from './support/shippedGame.ts';

/*
 * The autotile oracle.
 *
 * MZ's editor decides every autotile's shape when a tile is painted, and that logic lives in the editor, not the
 * engine, so the only record of it is what the editor stored. The shape rules owe the map editor exactly MZ's
 * answers, or the first stroke painted in it would redraw coastlines, walls and roofs that looked right before. So
 * this recomputes every autotile in every shipped map from its kind and its neighbours and compares the result with
 * what MZ stored.
 *
 * The shipped maps are not a clean record: MZ suspends autotiling while Shift is held, the eyedropper stamps copied
 * shapes, resizing leaves old edges at the new border, and mapgen drafted the Nimbus maps with its own wall table.
 * Those cells are listed in autotileOracleExceptions.json, each under a reason, and each reason has a test the cell
 * must pass, so a cell cannot be excused by a reason its data contradicts. Any mismatch missing from the list fails,
 * and so does a listed cell that no longer differs, which keeps the list honest as the maps change; rewrite it with
 * support/writeOracleExceptions.ts and read the diff.
 *
 * The game is not part of this repository: set JMZ_PROJECT_ROOT to it. When that is unset and the game does not sit
 * beside the repository, the oracle skips; when it is set and wrong, it fails.
 */
const game = locateShippedGame();
const maps: ShippedMap[] = game === null
  ? []
  : readShippedMaps(game);
const tilesets = game === null
  ? new Map<number, { mode: number }>()
  : readShippedTilesets(game);
const exceptions = readExceptionList();

/**
 * Finds the mode of a map's tileset.
 * @param {ShippedMap} map The map.
 * @returns {number} The tileset's mode.
 */
const modeOf = (map: ShippedMap): number =>
{
  const tileset = tilesets.get(map.tilesetId);
  if (tileset === undefined)
  {
    throw new Error(`Map${map.id} uses tileset ${map.tilesetId}, which Tilesets.json does not have`);
  }

  return tileset.mode;
};

describe.skipIf(game === null)('autotile shapes in every shipped map', () =>
{
  it('finds the shipped maps to check', () =>
  {
    // Arrange: the maps read above.

    // Act.
    const count = maps.length;

    // Assert: a wrong folder would otherwise pass by checking nothing.
    expect(count)
      .toBeGreaterThan(300);
  });

  it.each(maps.length > 0 ? maps : [ { id: 0 } as ShippedMap ])('Map$id holds the shape MZ would store, or a known exception', (map) =>
  {
    // Arrange: this map's listed exceptions.
    const listed = exceptions.maps[String(map.id)] ?? {};

    // Act.
    const verdict = judgeMap(map, modeOf(map), listed);

    // Assert: nothing past a table's end, every mismatch listed under a reason it passes, every listed cell differing.
    expect(verdict)
      .toEqual({ pastTable: [], unexplained: [], misfiled: [], settled: [] });
  });

  it('lists exceptions only for maps the game ships', () =>
  {
    // Arrange.
    const shipped = new Set(maps.map(map => String(map.id)));

    // Act.
    const strays = Object.keys(exceptions.maps).filter(id => shipped.has(id) === false);

    // Assert.
    expect(strays)
      .toEqual([]);
  });
});

describe('judgeMap', () =>
{
  /**
   * Builds a one-row test map on an Area tileset.
   * @param {number} width The width in tiles.
   * @returns {ShippedMap} The map, all layers empty.
   */
  const testMap = (width: number): ShippedMap => ({ id: 1, width, height: 1, tilesetId: 1, cells: new Uint16Array(width * 6) });

  it('passes a map whose autotiles all hold the shape their neighbours call for', () =>
  {
    // Arrange: two grass tiles side by side, joined.
    const map = testMap(2);
    map.cells[0] = makeAutotileId(16, 0);
    map.cells[1] = makeAutotileId(16, 0);

    // Act.
    const verdict = judgeMap(map, TilesetMode.area, {});

    // Assert.
    expect(verdict)
      .toEqual({ pastTable: [], unexplained: [], misfiled: [], settled: [] });
  });

  it('fails a mismatch the list does not name, and a listed cell that no longer differs', () =>
  {
    // Arrange: grass in shape 0 beside an empty cell (the map's edges join it on three sides, calling for shape 24),
    // and cell 1 listed though it is empty.
    const map = testMap(2);
    map.cells[0] = makeAutotileId(16, 0);

    // Act.
    const verdict = judgeMap(map, TilesetMode.area, { 'stale-open': [ 1 ] });

    // Assert.
    expect([ verdict.unexplained, verdict.settled ])
      .toEqual([ [ '(0,0) layer 1: kind 16 stored 0, expected 24' ], [ 1 ] ]);
  });

  it('fails a cell filed under a reason its shapes contradict', () =>
  {
    // Arrange: grass joined all round (shape 0) where it should be open to the east: it joins more, not less.
    const map = testMap(2);
    map.cells[0] = makeAutotileId(16, 0);

    // Act.
    const verdict = judgeMap(map, TilesetMode.area, { 'stale-open': [ 0 ] });

    // Assert.
    expect(verdict.misfiled)
      .toEqual([ '(0,0) layer 1: kind 16 stored 0, expected 24 does not fit stale-open' ]);
  });

  it('fails a shape past the end of its table outright, whatever reason it is filed under', () =>
  {
    // Arrange: a roof stored in shape 20, which the 16-shape wall table does not hold.
    const map = testMap(1);
    map.cells[0] = makeAutotileId(48, 20);

    // Act.
    const filed = EXCEPTION_REASONS.map(({ reason }) => judgeMap(map, TilesetMode.area, { [reason]: [ 0 ] }));

    // Assert: flagged every time, and no reason accepts it.
    expect(filed.map(verdict => [ verdict.pastTable.length, verdict.misfiled.length ]))
      .toEqual(EXCEPTION_REASONS.map(() => [ 1, 1 ]));
  });
});

describe('the exceptions file', () =>
{
  it('explains every reason in the words the oracle uses', () =>
  {
    // Arrange.
    const file = readExceptionList() as unknown as { reasons: Record<string, string> };

    // Act.
    const explained = EXCEPTION_REASONS.map(({ reason, explanation }) => [ reason, file.reasons[reason] === explanation ]);

    // Assert.
    expect(explained)
      .toEqual(EXCEPTION_REASONS.map(({ reason }) => [ reason, true ]));
  });
});
