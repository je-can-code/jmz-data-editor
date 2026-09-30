import { writeFileSync } from 'node:fs';
import { auditShapes } from '../../../../../src/mapEditor/core/tiles/shapeAudit.ts';
import { classifyMismatch, EXCEPTION_REASONS, EXCEPTIONS_FILE, type ExceptionReason } from './oracleExceptions.ts';
import { locateShippedGame, readShippedMaps, readShippedTilesets } from './shippedGame.ts';

/*
 * Rewrites the autotile oracle's exceptions file from the shipped maps as they stand.
 *
 * Run it after the game's maps change and the oracle reports mismatches it does not know, then read the diff before
 * committing it: every new cell should be one somebody drew with Shift held, stamped with the eyedropper, or a map
 * resized since, and a cell that fits no reason stops the run instead of being written down.
 *
 * Usage, from app/: JMZ_PROJECT_ROOT=/path/to/game bun test/mapEditor/core/tiles/support/writeOracleExceptions.ts
 */
const root = locateShippedGame();
if (root === null)
{
  throw new Error('no game to read: set JMZ_PROJECT_ROOT to the RMMZ project');
}

const tilesets = readShippedTilesets(root);
const maps = readShippedMaps(root);
const perMap: string[] = [];
const totals = new Map<ExceptionReason, number>();
let checked = 0;

maps.forEach((map) =>
{
  const tileset = tilesets.get(map.tilesetId);
  if (tileset === undefined)
  {
    throw new Error(`Map${map.id} uses tileset ${map.tilesetId}, which Tilesets.json does not have`);
  }

  // file every mismatch on the map under its reason.
  const audit = auditShapes(map, tileset.mode);
  checked += audit.checked;
  const byReason = new Map<ExceptionReason, number[]>();
  audit.mismatches.forEach((cell) =>
  {
    const reason = classifyMismatch(map, cell);
    const cells = byReason.get(reason) ?? [];
    cells.push(cell.index);
    byReason.set(reason, cells);
  });

  if (byReason.size === 0)
  {
    return;
  }

  // one line per map, its reasons in the file's reason order.
  const entries = EXCEPTION_REASONS
    .filter(({ reason }) => byReason.has(reason))
    .map(({ reason }) =>
    {
      const cells = byReason.get(reason) ?? [];
      totals.set(reason, (totals.get(reason) ?? 0) + cells.length);
      return `${JSON.stringify(reason)}: [ ${cells.join(', ')} ]`;
    });
  perMap.push(`    "${map.id}": { ${entries.join(', ')} }`);
});

const reasonLines = EXCEPTION_REASONS.map(({ reason, explanation }) => `    ${JSON.stringify(reason)}: ${JSON.stringify(explanation)}`);
const about = 'Every autotile in the shipped maps whose stored shape differs from what its neighbours call for, by map id '
  + 'and reason, as flat indices into the map\'s six-layer array. Written by '
  + 'test/mapEditor/core/tiles/support/writeOracleExceptions.ts; the oracle test fails on any mismatch missing here.';
const content = `{\n  "about": ${JSON.stringify(about)},\n  "reasons": {\n${reasonLines.join(',\n')}\n  },\n  "maps": {\n${perMap.join(',\n')}\n  }\n}\n`;
writeFileSync(EXCEPTIONS_FILE, content);

const listed = [ ...totals.values() ].reduce((sum, count) => sum + count, 0);
process.stdout.write(`checked ${checked} autotiles on ${maps.length} maps; ${listed} exceptions on ${perMap.length} maps\n`);
EXCEPTION_REASONS.forEach(({ reason }) =>
{
  process.stdout.write(`  ${reason}: ${totals.get(reason) ?? 0}\n`);
});
