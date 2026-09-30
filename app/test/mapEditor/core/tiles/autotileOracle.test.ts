import { describe, expect, it } from 'vitest';
import { auditShapes } from '../../../../src/mapEditor/core/tiles/shapeAudit.ts';
import { EXCEPTION_REASONS, readExceptionList, REASON_TESTS, type ExceptionReason } from './support/oracleExceptions.ts';
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
    // Arrange: this map's listed exceptions, cell by cell.
    const listed = new Map<number, ExceptionReason>();
    const byReason = exceptions.maps[String(map.id)] ?? {};
    EXCEPTION_REASONS.forEach(({ reason }) =>
    {
      (byReason[reason] ?? []).forEach(index => listed.set(index, reason));
    });

    // Act.
    const { mismatches } = auditShapes(map, modeOf(map));

    // Assert: every mismatch is listed under a reason it passes, and every listed cell still differs.
    const unexplained = mismatches
      .filter(cell => listed.has(cell.index) === false)
      .map(cell => `(${cell.x},${cell.y}) layer ${cell.z + 1}: kind ${cell.kind} stored ${cell.stored}, expected ${cell.expected}`);
    const misfiled = mismatches
      .filter(cell => listed.has(cell.index) && REASON_TESTS[listed.get(cell.index) as ExceptionReason](map, cell) === false)
      .map(cell => `cell ${cell.index} does not fit ${listed.get(cell.index)}`);
    const differing = new Set(mismatches.map(cell => cell.index));
    const settled = [ ...listed.keys() ].filter(index => differing.has(index) === false);

    expect({ unexplained, misfiled, settled })
      .toEqual({ unexplained: [], misfiled: [], settled: [] });
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
