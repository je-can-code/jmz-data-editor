import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FLOOR_AUTOTILE_TABLE,
  WALL_AUTOTILE_TABLE,
  WATERFALL_AUTOTILE_TABLE,
} from '../../../../src/mapEditor/render/engine/autotileTables.ts';
import { locateGameProject } from '../../../support/gameProject.ts';

/*
 * The quadrant tables decide which quarter of a sheet every autotile quarter is cut from; one wrong pair and a wall
 * corner draws the wrong corner. The editor's copies are held to the engine's own file, js/rmmz_core.js in the game,
 * rather than to a hand-typed expectation, so they cannot drift from what the game draws.
 */
const project = locateGameProject();

/**
 * Reads one of the engine's tables out of its source.
 * @param {string} source The text of js/rmmz_core.js.
 * @param {string} name The table's name, such as FLOOR_AUTOTILE_TABLE.
 * @returns {unknown} The table, parsed.
 */
const engineTable = (source: string, name: string): unknown =>
{
  const start = source.indexOf(`Tilemap.${name} = `);
  const end = source.indexOf('];', start);
  return JSON.parse(source.slice(source.indexOf('[', start), end + 1));
};

describe('autotileTables', () =>
{
  it.skipIf(project === null)('copies the engine\'s floor, wall and waterfall tables exactly', () =>
  {
    // Arrange.
    const source = readFileSync(`${project}/js/rmmz_core.js`, 'utf8');

    // Act.
    const tables = [ 'FLOOR_AUTOTILE_TABLE', 'WALL_AUTOTILE_TABLE', 'WATERFALL_AUTOTILE_TABLE' ].map(name => engineTable(source, name));

    // Assert.
    expect(tables)
      .toStrictEqual([ FLOOR_AUTOTILE_TABLE, WALL_AUTOTILE_TABLE, WATERFALL_AUTOTILE_TABLE ]);
  });

  it('holds 48 floor shapes, 16 wall shapes and 4 waterfall shapes, four quarters each', () =>
  {
    // Arrange: nothing to set up; the tables are the subject.

    // Act.
    const shapes = [ FLOOR_AUTOTILE_TABLE, WALL_AUTOTILE_TABLE, WATERFALL_AUTOTILE_TABLE ].map(table => [
      table.length,
      table.every(shape => shape.length === 4),
    ]);

    // Assert.
    expect(shapes)
      .toStrictEqual([ [ 48, true ], [ 16, true ], [ 4, true ] ]);
  });
});
