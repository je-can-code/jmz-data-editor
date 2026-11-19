import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { publishFiles } from '../../../../scripts/bundle/publish.ts';

/*
 * Publishing puts a build where the laptop's installer finds it: the tarball, the installer and versions.json, side by
 * side in the builds folder, which the laptop may be reading at that very moment over the share. So every file lands
 * whole under its own name, nothing is left behind under a temporary one, a newer versions.json replaces the older one
 * outright, and builds published before are left where they are.
 */

/**
 * The folders made for the tests, removed after each.
 */
const folders: string[] = [];

/**
 * Makes a folder of the test's own holding a build's three files, as the build leaves them in release/.
 * @param {string} tag Text that tells this build's files from another's.
 * @returns {{ root: string, files: string[] }} The folder, and the files in the order publish lands them.
 */
const release = (tag: string): { root: string; files: string[] } =>
{
  const root = mkdtempSync(join(tmpdir(), 'bundle-publish-test-'));
  folders.push(root);
  const files = [ `jmz-editor-linux-x64-${tag}.tar.gz`, 'install.ts', 'versions.json' ].map(name => join(root, name));
  files.forEach(file => writeFileSync(file, `${tag}:${file}`));
  return { root, files };
};

afterEach(() =>
{
  folders.splice(0)
    .forEach(folder => rmSync(folder, { recursive: true, force: true }));
});

describe('publishFiles', () =>
{
  it('lands every file whole under its own name, making the folder, with nothing left under a temporary name', () =>
  {
    // Arrange: a build, and a builds folder nothing has made yet.
    const { root, files } = release('b1');
    const builds = join(root, 'share', 'jmz-builds');

    // Act.
    const landed = publishFiles(files, builds);

    // Assert.
    expect([
      landed,
      readdirSync(builds)
        .sort(),
      landed.map(file => readFileSync(file, 'utf-8')),
    ])
      .toStrictEqual([
        [ join(builds, 'jmz-editor-linux-x64-b1.tar.gz'), join(builds, 'install.ts'), join(builds, 'versions.json') ],
        [ 'install.ts', 'jmz-editor-linux-x64-b1.tar.gz', 'versions.json' ],
        files.map(file => `b1:${file}`),
      ]);
  });

  it('replaces the older versions.json and installer outright, and leaves the older build beside the new one', () =>
  {
    // Arrange: a builds folder an older build was published to.
    const older = release('b1');
    const newer = release('b2');
    const builds = join(older.root, 'jmz-builds');
    mkdirSync(builds);
    publishFiles(older.files, builds);

    // Act.
    publishFiles(newer.files, builds);

    // Assert.
    expect([
      readdirSync(builds)
        .sort(),
      readFileSync(join(builds, 'versions.json'), 'utf-8'),
      readFileSync(join(builds, 'install.ts'), 'utf-8'),
    ])
      .toStrictEqual([
        [ 'install.ts', 'jmz-editor-linux-x64-b1.tar.gz', 'jmz-editor-linux-x64-b2.tar.gz', 'versions.json' ],
        `b2:${newer.files[2]}`,
        `b2:${newer.files[1]}`,
      ]);
  });
});
