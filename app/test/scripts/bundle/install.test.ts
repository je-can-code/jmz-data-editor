import { describe, expect, it } from 'vitest';
import {
  desktopEntry,
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
 * ones, never a link, so the build in use and the one to go back to are never at risk.
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
  try
  {
    readPublishedBuild(text);
    return 'nothing was refused';
  }
  catch (error)
  {
    return error instanceof Refusal
      ? error.message
      : `not a refusal: ${String(error)}`;
  }
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
      // Arrange- a path, a hidden name, each link's name, and a number.
      const versions = [ '../elsewhere', '.hidden', 'current', 'previous', 20261119 ];

      // Act
      const messages = versions.map(version => refusalOf(versionsNaming({ version, file: 'a.gz', sha256: DIGEST })));

      // Assert
      expect(messages)
        .toEqual([
          'versions.json names a version no folder can be named after: "../elsewhere".',
          'versions.json names a version no folder can be named after: ".hidden".',
          'versions.json names a version no folder can be named after: "current".',
          'versions.json names a version no folder can be named after: "previous".',
          'versions.json names a version no folder can be named after: 20261119.',
        ]);
    });

    it('refuses a tarball named by anything but a file beside versions.json', () =>
    {
      // Arrange- a path out of the builds folder, and no name at all.
      const files = [ '../jmz-editor.tar.gz', undefined ];

      // Act
      const messages = files.map(file => refusalOf(versionsNaming({ version: VERSION, file, sha256: DIGEST })));

      // Assert
      expect(messages)
        .toEqual([
          'versions.json names a tarball that is not a file beside it: "../jmz-editor.tar.gz".',
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

  describe('prunable', () =>
  {
    it('removes every build folder but the current and previous, and what a run that stopped part-way left', () =>
    {
      // Arrange- both links, three builds, a half-unpacked build, and a link left mid-switch.
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
      const removed = prunable(entries, [ '20261119.0100-ccc', '20261118.2300-bbb' ]);

      // Assert
      expect(removed)
        .toEqual([ '20261118.2200-aaa', '.incoming-x1y2z3' ]);
    });

    it('keeps the only build there is after a first install', () =>
    {
      // Arrange
      const entries = [ { name: 'current', isFolder: false }, { name: '20261119.0100-ccc', isFolder: true } ];

      // Act
      const removed = prunable(entries, [ '20261119.0100-ccc' ]);

      // Assert
      expect(removed)
        .toEqual([]);
    });
  });
});
