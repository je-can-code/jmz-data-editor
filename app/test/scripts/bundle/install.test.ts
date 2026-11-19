import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  desktopEntry,
  foldersInUse,
  install,
  isSharedLibrary,
  missingLibraries,
  prunable,
  readPublishedBuild,
  Refusal,
} from '../../../../scripts/bundle/install.ts';

/*
 * The installer runs by hand on a machine with nothing but Bun, from a share where nothing executes, and it replaces
 * the editor that machine opens from its app menu. What it decides before switching has to refuse rather than guess,
 * since a wrong guess is an editor that will not open, found on the day it was needed. versions.json has to name a
 * build whose version can name a folder and whose tarball sits beside it. Every library ldd could not find is named,
 * however ldd words it. The menu entry starts the editor by an absolute path, because the laptop's PATH lacks
 * ~/.local/bin, and with no terminal. And pruning only ever removes build folders other than the current and previous
 * ones and those something is running from, never a link, so neither the build in use, the one to go back to, nor one
 * still open from before is ever pulled out from under the person using it.
 */

/**
 * A version as the bundle build writes one.
 */
const VERSION = '20261119.0100-abc1234';

/**
 * A SHA-256 as the bundle build writes one.
 */
const DIGEST = 'a'.repeat(64);

/**
 * Builds the tests publish and install, oldest first.
 */
const FIRST = '20261118.2200-aaa1111';
const SECOND = '20261119.0100-bbb2222';

/**
 * A real program that ldd can read and that runs until it is stopped, standing in for NW.js in every build the tests
 * publish, so a test can run a build the way the editor runs from it.
 */
const SLEEP = '/bin/sleep';

/**
 * The launcher every published build carries. It says which build it belongs to, then starts that build's nw, so a
 * test can tell which build the command line link starts.
 */
const FAKE_LAUNCHER = [
  '#!/bin/sh',
  'HERE="$(dirname "$(readlink -f "$0")")"',
  'echo "$HERE"',
  'exec "$HERE/nwjs/nw" 0',
  '',
].join('\n');

/**
 * A stand-in for the laptop, inside a folder of the test's own: an empty home folder, and a builds folder like the
 * share's.
 */
type Laptop = {
  /**
   * The home folder installs go into.
   */
  readonly home: string;

  /**
   * The builds folder, holding what the desktop published.
   */
  readonly builds: string;

  /**
   * The install folder inside the home folder.
   */
  readonly root: string;
};

/**
 * The folders made for the tests, removed after each.
 */
const folders: string[] = [];

/**
 * The programs the tests start, stopped after each.
 */
const programs: ChildProcess[] = [];

afterEach(() =>
{
  programs.splice(0)
    .forEach(program => program.kill('SIGKILL'));
  folders.splice(0)
    .forEach(folder => rmSync(folder, { recursive: true, force: true }));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/**
 * Makes a stand-in laptop with nothing installed and nothing published.
 * @returns {Laptop} The laptop.
 */
const laptop = (): Laptop =>
{
  const folder = mkdtempSync(join(tmpdir(), 'bundle-install-test-'));
  folders.push(folder);
  const home = join(folder, 'home');
  const builds = join(folder, 'builds');
  mkdirSync(home);
  mkdirSync(builds);
  return { home, builds, root: join(home, '.local', 'jmz-editor') };
};

/**
 * Hashes a file the way the bundle build does.
 * @param {string} path The file.
 * @returns {string} Its SHA-256, in lowercase hex.
 */
const sha256Of = (path: string): string =>
{
  return createHash('sha256')
    .update(readFileSync(path))
    .digest('hex');
};

/**
 * Publishes a small build to a laptop's builds folder the way the desktop does: its tarball, and versions.json naming
 * it, neither one executable, as the share mounts them. The build is laid out as a bundle is: the launcher, an API
 * that reports the build's version, NW.js with its lib folder, and the UI's icon.
 * @param {Laptop} machine The laptop.
 * @param {string} version The build's version.
 * @param {(build: string) => void} damage What to do to the build's folder before it is packed, for a build that should
 * be refused; nothing by default.
 */
const publishBuild = (machine: Laptop, version: string, damage: (build: string) => void = () => undefined): void =>
{
  const packing = mkdtempSync(join(tmpdir(), 'bundle-install-build-'));
  folders.push(packing);
  const build = join(packing, `jmz-editor-${version}`);
  mkdirSync(join(build, 'server'), { recursive: true });
  mkdirSync(join(build, 'nwjs', 'lib'), { recursive: true });
  mkdirSync(join(build, 'ui'));
  writeFileSync(join(build, 'jmz-editor'), FAKE_LAUNCHER);
  writeFileSync(join(build, 'server', 'jmz-api'), `#!/bin/sh\necho ${version}\n`);
  copyFileSync(SLEEP, join(build, 'nwjs', 'nw'));
  writeFileSync(join(build, 'ui', 'favicon.ico'), `the icon of ${version}`);
  [ 'jmz-editor', 'server/jmz-api', 'nwjs/nw' ].forEach(file => chmodSync(join(build, file), 0o755));
  damage(build);

  // the tarball keeps every mode; the share then takes every execute bit off the published files themselves.
  const file = `jmz-editor-linux-x64-${version}.tar.gz`;
  const tarball = join(machine.builds, file);
  spawnSync('tar', [ '-czf', tarball, '-C', packing, `jmz-editor-${version}` ]);
  const versions = join(machine.builds, 'versions.json');
  writeFileSync(versions, JSON.stringify({ 'linux-x64': { version, file, sha256: sha256Of(tarball) } }));
  [ tarball, versions ].forEach(path => chmodSync(path, 0o664));
};

/**
 * Starts a program from inside an installed build and waits until it runs, the way the editor's NW.js, its API or a
 * playtest runs from the build that holds it.
 * @param {string} executable The program.
 * @returns {Promise<ChildProcess>} The running program, which the test's cleanup stops.
 */
const startFrom = async (executable: string): Promise<ChildProcess> =>
{
  const program = spawn(executable, [ '600' ], { stdio: 'ignore' });
  programs.push(program);
  await once(program, 'spawn');
  return program;
};

/**
 * Lists everything under a folder: each folder and file by its path and the inode it is, and each link by what it
 * names. Two listings taken around an install tell whether it changed anything there, a folder replaced by one of the
 * same name included.
 * @param {string} folder The folder.
 * @param {string} inside Where inside it to list from, empty for all of it.
 * @returns {string[]} One line per thing, in name order.
 */
const listing = (folder: string, inside = ''): string[] =>
{
  return readdirSync(join(folder, inside))
    .sort()
    .flatMap(name =>
    {
      const path = join(inside, name);
      const stats = lstatSync(join(folder, path));
      if (stats.isSymbolicLink())
      {
        return [ `${path} -> ${readlinkSync(join(folder, path))}` ];
      }

      return stats.isDirectory()
        ? [ `${path}/ #${stats.ino}`, ...listing(folder, path) ]
        : [ `${path} #${stats.ino}` ];
    });
};

/**
 * Runs something that is expected to be refused and hands back what the refusal said.
 * @param {() => unknown} attempt What to run.
 * @returns {string} The refusal's message, or a note that nothing was refused.
 */
const refusalFrom = (attempt: () => unknown): string =>
{
  try
  {
    attempt();
    return 'nothing was refused';
  }
  catch (error)
  {
    return error instanceof Refusal
      ? error.message
      : `not a refusal: ${String(error)}`;
  }
};

/**
 * Builds versions.json naming one Linux build, beside a Windows build the installer must leave alone.
 * @param {Record<string, unknown>} linux The Linux build's fields.
 * @returns {string} The file's text.
 */
const versionsNaming = (linux: Record<string, unknown>): string =>
{
  return JSON.stringify({
    'win-x64': { version: 'windows-build', file: 'jmz-editor-win-x64.zip', sha256: 'b'.repeat(64) },
    'linux-x64': linux,
  });
};

/**
 * Reads a versions.json that is expected to be refused and hands back what the refusal said.
 * @param {string} text The file's text.
 * @returns {string} The refusal's message, or a note that nothing was refused.
 */
const refusalOf = (text: string): string =>
{
  return refusalFrom(() => readPublishedBuild(text));
};

describe('install', () =>
{
  describe('readPublishedBuild', () =>
  {
    it('reads the build named for this machine, and no other', () =>
    {
      // Arrange
      const text = versionsNaming({ version: VERSION, file: 'jmz-editor-linux-x64.tar.gz', sha256: DIGEST });

      // Act
      const build = readPublishedBuild(text);

      // Assert
      expect(build)
        .toEqual({ version: VERSION, file: 'jmz-editor-linux-x64.tar.gz', sha256: DIGEST });
    });

    it('refuses a file that is not JSON', () =>
    {
      // Arrange
      const text = '{ "linux-x64": ';

      // Act
      const message = refusalOf(text);

      // Assert
      expect(message)
        .toBe('versions.json is not JSON.');
    });

    it('refuses a file naming builds for other machines only', () =>
    {
      // Arrange- only the Windows build, and a file whose top level is not an object at all.
      const windowsOnly = JSON.stringify({ 'win-x64': { version: 'windows-build', file: 'a.zip', sha256: DIGEST } });
      const notAnObject = JSON.stringify([ 'linux-x64' ]);

      // Act
      const messages = [ windowsOnly, notAnObject ].map(refusalOf);

      // Assert
      expect(messages)
        .toEqual([ 'versions.json names no build for linux-x64.', 'versions.json names no build for linux-x64.' ]);
    });

    it('refuses a version that cannot name a folder of its own', () =>
    {
      // Arrange- a path, a hidden name, each link's name, and a number. The second path starts with a plain name, so
      // where the first is also refused for starting with a dot, only refusing its slashes keeps it from climbing to
      // the home folder, which the installer would then remove as a build of that version.
      const versions = [ '../elsewhere', 'a/../../..', '.hidden', 'current', 'previous', 20261119 ];

      // Act
      const messages = versions.map(version => refusalOf(versionsNaming({ version, file: 'a.gz', sha256: DIGEST })));

      // Assert
      expect(messages)
        .toEqual([
          'versions.json names a version no folder can be named after: "../elsewhere".',
          'versions.json names a version no folder can be named after: "a/../../..".',
          'versions.json names a version no folder can be named after: ".hidden".',
          'versions.json names a version no folder can be named after: "current".',
          'versions.json names a version no folder can be named after: "previous".',
          'versions.json names a version no folder can be named after: 20261119.',
        ]);
    });

    it('refuses a tarball named by anything but a file beside versions.json', () =>
    {
      // Arrange- two paths out of the builds folder, and no name at all. The second path starts with a plain name, so
      // only refusing its slash keeps it in the builds folder.
      const files = [ '../jmz-editor.tar.gz', 'x/../y.tar.gz', undefined ];

      // Act
      const messages = files.map(file => refusalOf(versionsNaming({ version: VERSION, file, sha256: DIGEST })));

      // Assert
      expect(messages)
        .toEqual([
          'versions.json names a tarball that is not a file beside it: "../jmz-editor.tar.gz".',
          'versions.json names a tarball that is not a file beside it: "x/../y.tar.gz".',
          'versions.json names a tarball that is not a file beside it: undefined.',
        ]);
    });

    it('refuses a digest that is not a SHA-256 as the bundle build writes one', () =>
    {
      // Arrange- one character short, and in capitals.
      const digests = [ 'a'.repeat(63), 'A'.repeat(64) ];

      // Act
      const messages = digests.map(sha256 => refusalOf(versionsNaming({ version: VERSION, file: 'a.tar.gz', sha256 })));

      // Assert
      expect(messages)
        .toEqual([
          `versions.json gives a SHA-256 that is not one: "${'a'.repeat(63)}".`,
          `versions.json gives a SHA-256 that is not one: "${'A'.repeat(64)}".`,
        ]);
    });
  });

  describe('missingLibraries', () =>
  {
    it('names every library ldd could not find, whichever way it words it', () =>
    {
      // Arrange- one library found, one missing outright, and one too old for the build.
      const report = [
        '\tlinux-vdso.so.1 (0x00007ffd5b9f2000)',
        '\tlibnw.so => /home/je/.local/jmz-editor/v2/nwjs/lib/libnw.so (0x00007f509a000000)',
        '\tlibjmz-gone.so.1 => not found',
        '\t/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.45\' not found (required by nwjs/nw)',
        '',
      ].join('\n');

      // Act
      const missing = missingLibraries(report);

      // Assert
      expect(missing)
        .toEqual([
          'libjmz-gone.so.1 => not found',
          '/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.45\' not found (required by nwjs/nw)',
        ]);
    });

    it('finds nothing missing when everything was found', () =>
    {
      // Arrange
      const report = '\tlibnw.so => /opt/nwjs/lib/libnw.so (0x00007f509a000000)\n\tlibc.so.6 => /lib/libc.so.6 (0x1)\n';

      // Act
      const missing = missingLibraries(report);

      // Assert
      expect(missing)
        .toEqual([]);
    });
  });

  describe('isSharedLibrary', () =>
  {
    it('looks over every shared library beside NW.js, versioned names included, and nothing else', () =>
    {
      // Arrange- names from a real NW.js lib folder, and a backup that only looks like a library.
      const names = [ 'libnw.so', 'libvulkan.so.1', 'libfoo.so.1.2', 'vk_swiftshader_icd.json', 'libnw.so.bak' ];

      // Act
      const looked = names.map(isSharedLibrary);

      // Assert
      expect(looked)
        .toEqual([ true, true, true, false, false ]);
    });
  });

  describe('desktopEntry', () =>
  {
    it('starts the editor by the absolute path of its link, with no terminal, and shows the build\'s icon', () =>
    {
      // Arrange
      const launcher = '/home/je/.local/bin/jmz-editor';
      const icon = '/home/je/.local/jmz-editor/current/ui/favicon.ico';

      // Act
      const entry = desktopEntry(launcher, icon);

      // Assert
      expect(entry.split('\n'))
        .toEqual([
          '[Desktop Entry]',
          'Type=Application',
          'Name=JMZ Editor',
          'Comment=Edit and playtest an RPG Maker MZ project',
          'Exec=/home/je/.local/bin/jmz-editor',
          'Icon=/home/je/.local/jmz-editor/current/ui/favicon.ico',
          'Terminal=false',
          'Categories=Development;',
          '',
        ]);
    });

    it('quotes and escapes a path the menu would otherwise split or read as something else', () =>
    {
      // Arrange- a space, a dollar sign, a backslash and a percent sign in one home folder.
      const launcher = '/home/j e/$x\\y%/.local/bin/jmz-editor';

      // Act
      const entry = desktopEntry(launcher, '/icon.ico');

      // Assert
      expect(entry.split('\n')[4])
        .toBe('Exec="/home/j e/\\\\$x\\\\\\\\y%%/.local/bin/jmz-editor"');
    });
  });

  describe('foldersInUse', () =>
  {
    it('names each folder something runs from by its whole name, never one whose name only starts the same', () =>
    {
      // Arrange- a build beside its dirty twin, whose name the clean one's begins, a staging folder, a link, and
      // programs running from the twin, from the staging folder, from outside, and from a folder beside the install
      // folder whose name the install folder's begins.
      const root = '/home/je/.local/jmz-editor';
      const entries = [
        { name: 'current', isFolder: false },
        { name: '20261119.0100-abc1234', isFolder: true },
        { name: '20261119.0100-abc1234-dirty', isFolder: true },
        { name: '.incoming-x1y2z3', isFolder: true },
        { name: '20261118.2300-bbb', isFolder: true },
      ];
      const executables = [
        '/home/je/.local/jmz-editor/20261119.0100-abc1234-dirty/nwjs/nw',
        '/home/je/.local/jmz-editor/.incoming-x1y2z3/jmz-editor-20261119.0100-ccc/server/jmz-api',
        '/usr/bin/bash',
        '/home/je/.local/jmz-editor-old/20261118.2300-bbb/nwjs/nw',
      ];

      // Act
      const inUse = foldersInUse(root, entries, { readable: true, executables });

      // Assert
      expect(inUse)
        .toEqual([ '20261119.0100-abc1234-dirty', '.incoming-x1y2z3' ]);
    });

    it('counts every folder as in use when /proc could not be read, and never a link', () =>
    {
      // Arrange- both links and two builds, with nothing known about what runs.
      const entries = [
        { name: 'current', isFolder: false },
        { name: 'previous', isFolder: false },
        { name: '20261119.0100-ccc', isFolder: true },
        { name: '20261118.2200-aaa', isFolder: true },
      ];

      // Act
      const inUse = foldersInUse('/home/je/.local/jmz-editor', entries, { readable: false, executables: [] });

      // Assert
      expect(inUse)
        .toEqual([ '20261119.0100-ccc', '20261118.2200-aaa' ]);
    });
  });

  describe('prunable', () =>
  {
    it('removes every build folder but the current and previous, and what a run that stopped part-way left', () =>
    {
      // Arrange- both links, three builds, a half-unpacked build, and a link left mid-switch, with nothing running.
      const entries = [
        { name: 'current', isFolder: false },
        { name: 'previous', isFolder: false },
        { name: '20261119.0100-ccc', isFolder: true },
        { name: '20261118.2300-bbb', isFolder: true },
        { name: '20261118.2200-aaa', isFolder: true },
        { name: '.incoming-x1y2z3', isFolder: true },
        { name: 'current.next', isFolder: false },
      ];

      // Act
      const removed = prunable(entries, [ '20261119.0100-ccc', '20261118.2300-bbb' ], []);

      // Assert
      expect(removed)
        .toEqual([ '20261118.2200-aaa', '.incoming-x1y2z3' ]);
    });

    it('keeps every folder something runs from, and still removes the one beside it that nothing does', () =>
    {
      // Arrange- the current and previous builds, an older one a rollback still runs from, and one older still.
      const entries = [
        { name: 'current', isFolder: false },
        { name: 'previous', isFolder: false },
        { name: '20261119.0100-ccc', isFolder: true },
        { name: '20261118.2300-bbb', isFolder: true },
        { name: '20261118.2200-aaa', isFolder: true },
        { name: '20261118.2100-zzz', isFolder: true },
      ];

      // Act
      const removed = prunable(entries, [ '20261119.0100-ccc', '20261118.2300-bbb' ], [ '20261118.2200-aaa' ]);

      // Assert
      expect(removed)
        .toEqual([ '20261118.2100-zzz' ]);
    });

    it('keeps the only build there is after a first install', () =>
    {
      // Arrange
      const entries = [ { name: 'current', isFolder: false }, { name: '20261119.0100-ccc', isFolder: true } ];

      // Act
      const removed = prunable(entries, [ '20261119.0100-ccc' ], []);

      // Assert
      expect(removed)
        .toEqual([]);
    });
  });

  describe('install', () =>
  {
    beforeEach(() =>
    {
      // the installer says what it did on the console; these tests read what it did from the folders instead.
      vi.spyOn(console, 'log')
        .mockImplementation(() => undefined);
    });

    it('refuses to replace a build of its own version while something runs from it, and changes nothing', async () =>
    {
      // Arrange- the first build kept as previous behind the second, started through previous as a rollback is, and
      // then published again.
      const machine = laptop();
      publishBuild(machine, FIRST);
      install(machine.builds, machine.home);
      publishBuild(machine, SECOND);
      install(machine.builds, machine.home);
      const editor = await startFrom(join(machine.root, 'previous', 'nwjs', 'nw'));
      publishBuild(machine, FIRST);
      const before = listing(machine.home);

      // Act
      const message = refusalFrom(() => install(machine.builds, machine.home));

      // Assert- the running editor's own file is still there, rather than deleted from under it.
      expect([ message, listing(machine.home), readlinkSync(`/proc/${editor.pid}/exe`) ])
        .toEqual([
          `jmz-editor ${FIRST} is running from ${join(machine.root, FIRST)}. Close it, then run this again.`,
          before,
          join(realpathSync(machine.root), FIRST, 'nwjs', 'nw'),
        ]);
    });

    it('puts back the menu entry and the command line link when the build is already the current one', () =>
    {
      // Arrange- an installed build whose menu entry and link are gone, as a run cut short after switching leaves it.
      const machine = laptop();
      publishBuild(machine, FIRST);
      install(machine.builds, machine.home);
      const binLink = join(machine.home, '.local', 'bin', 'jmz-editor');
      const desktopFile = join(machine.home, '.local', 'share', 'applications', 'jmz-editor.desktop');
      rmSync(binLink);
      rmSync(desktopFile);
      vi.mocked(console.log)
        .mockClear();

      // Act
      install(machine.builds, machine.home);

      // Assert
      expect([ vi.mocked(console.log).mock.calls, readlinkSync(binLink), readFileSync(desktopFile, 'utf8').split('\n') ])
        .toEqual([
          [ [ `jmz-editor ${FIRST} is already installed.` ] ],
          join(machine.root, 'current', 'jmz-editor'),
          [
            '[Desktop Entry]',
            'Type=Application',
            'Name=JMZ Editor',
            'Comment=Edit and playtest an RPG Maker MZ project',
            `Exec=${binLink}`,
            `Icon=${join(machine.root, 'current', 'ui', 'favicon.ico')}`,
            'Terminal=false',
            'Categories=Development;',
            '',
          ],
        ]);
    });

    it('refuses a build whose launcher has lost its execute bit, and changes nothing', () =>
    {
      // Arrange- a build installed, then a newer one packed with its launcher no longer executable.
      const machine = laptop();
      publishBuild(machine, FIRST);
      install(machine.builds, machine.home);
      publishBuild(machine, SECOND, build => chmodSync(join(build, 'jmz-editor'), 0o644));
      const before = listing(machine.home);

      // Act
      const message = refusalFrom(() => install(machine.builds, machine.home));

      // Assert
      expect([ message, listing(machine.home) ])
        .toEqual([ 'The build\'s jmz-editor launcher is not executable.', before ]);
    });

    it('refuses a build whose NW.js has lost its execute bit, and changes nothing', () =>
    {
      // Arrange- a build installed, then a newer one packed with its NW.js no longer executable, which ldd still reads.
      const machine = laptop();
      publishBuild(machine, FIRST);
      install(machine.builds, machine.home);
      publishBuild(machine, SECOND, build => chmodSync(join(build, 'nwjs', 'nw'), 0o644));
      const before = listing(machine.home);

      // Act
      const message = refusalFrom(() => install(machine.builds, machine.home));

      // Assert
      expect([ message, listing(machine.home) ])
        .toEqual([ 'The build\'s nwjs/nw is not executable.', before ]);
    });

    it('refuses a build with no NW.js as the build\'s fault, not the machine\'s, and changes nothing', () =>
    {
      // Arrange- a build installed, then a newer one packed without its NW.js.
      const machine = laptop();
      publishBuild(machine, FIRST);
      install(machine.builds, machine.home);
      publishBuild(machine, SECOND, build => rmSync(join(build, 'nwjs', 'nw')));
      const before = listing(machine.home);

      // Act
      const message = refusalFrom(() => install(machine.builds, machine.home));

      // Assert
      expect([ message, listing(machine.home) ])
        .toEqual([ 'The build has no nwjs/nw.', before ]);
    });

    it('stages nothing in the system\'s temporary folder, where a run cut short would leave its tarball in RAM', () =>
    {
      // Arrange- a TMPDIR that is not there, so anything staged in it would stop the install.
      const machine = laptop();
      publishBuild(machine, FIRST);
      vi.stubEnv('TMPDIR', join(machine.builds, 'not-there'));

      // Act
      install(machine.builds, machine.home);

      // Assert
      expect(readlinkSync(join(machine.root, 'current')))
        .toBe(FIRST);
    });

    it('removes the staging folder a run cut short left, tarball copy and all, at the next install', () =>
    {
      // Arrange- a staging folder holding a tarball copy and a half-unpacked build, as Ctrl-C or a dropped SSH session
      // leaves one, beside an installed build.
      const machine = laptop();
      publishBuild(machine, FIRST);
      install(machine.builds, machine.home);
      const leftover = join(machine.root, '.incoming-cutoff');
      mkdirSync(join(leftover, 'unpacked', `jmz-editor-${SECOND}`), { recursive: true });
      writeFileSync(join(leftover, `jmz-editor-linux-x64-${SECOND}.tar.gz`), 'the first half of a tarball');
      publishBuild(machine, SECOND);

      // Act
      install(machine.builds, machine.home);

      // Assert
      expect(readdirSync(machine.root)
        .sort())
        .toEqual([ FIRST, SECOND, 'current', 'previous' ]);
    });
  });
});
