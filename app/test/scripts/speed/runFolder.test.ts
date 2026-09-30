import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunFolder } from '../../../../scripts/speed/runFolder.ts';

/*
 * Every speed and parity run works in a folder of its own: its builds, its project mirror, its copy of the game and
 * its pictures. A shared folder let a run time whatever build an earlier run left there, and let one run wipe the
 * mirror another was still reading, so each run's folder must be new, empty, and never handed to a second run.
 */

/**
 * The base folders made for the tests, removed after each.
 */
const bases: string[] = [];

afterEach(() =>
{
  bases.splice(0).forEach(base => rmSync(base, { recursive: true, force: true }));
});

describe('createRunFolder', () =>
{
  it('makes a new, empty folder inside the base for every run, never the same one twice', () =>
  {
    // Arrange: a base folder of the test's own.
    const base = mkdtempSync(join(tmpdir(), 'run-folder-test-'));
    bases.push(base);

    // Act: two runs starting from the same base.
    const first = createRunFolder(base, 'jmz-speed-');
    const second = createRunFolder(base, 'jmz-speed-');

    // Assert.
    expect([
      first === second,
      [ dirname(first), dirname(second) ],
      [ readdirSync(first), readdirSync(second) ],
      [ first, second ].every(folder => folder.startsWith(join(base, 'jmz-speed-'))),
    ])
      .toStrictEqual([ false, [ base, base ], [ [], [] ], true ]);
  });

  it('makes the base first when it does not exist yet', () =>
  {
    // Arrange: a base path under the test's own folder that nothing has made.
    const root = mkdtempSync(join(tmpdir(), 'run-folder-test-'));
    bases.push(root);
    const base = join(root, 'not', 'there');

    // Act.
    const folder = createRunFolder(base, 'jmz-parity-');

    // Assert.
    expect([ existsSync(folder), dirname(folder) ])
      .toStrictEqual([ true, base ]);
  });
});
