import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bundleFolderName,
  bundleManifest,
  bundleVersion,
  editorManifest,
  isDirtyTree,
  LAUNCHER,
  nwjsProblem,
  nwjsVersionIn,
  parseBuildArguments,
  tarballName,
  TARGETS,
  uiBuildEnvironment,
  versionsFile,
} from '../../../../scripts/bundle/buildRules.ts';

/*
 * The bundle build turns the repo into one folder that runs on a machine with nothing installed, so what it decides is
 * what the laptop gets. It ships one NW.js only, the pinned version in the SDK flavor, read from the files themselves,
 * because a bundle on another runtime would play the game on something it was never tested on. It names every build by
 * when it was made and the commit it came from, marked dirty when the tree held a change the build could carry, so a
 * build on the laptop can always be traced back, while a stray note beside the code never marks it. The bundle runs
 * under a name of its own, so it never hands its launch to a dev shell, and its launcher must find the bundle through
 * the link the installer puts on the PATH. A mistyped flag is refused rather than quietly building something other than
 * what was asked for.
 */

/**
 * The folders made for the tests, removed after each.
 */
const folders: string[] = [];

afterEach(() =>
{
  folders.splice(0)
    .forEach(folder => rmSync(folder, { recursive: true, force: true }));
});

describe('buildRules', () =>
{
  describe('parseBuildArguments', () =>
  {
    it('builds without publishing, on the NW.js behind the PATH, when given nothing', () =>
    {
      // Arrange: no arguments.

      // Act.
      const options = parseBuildArguments([]);

      // Assert.
      expect(options)
        .toStrictEqual({ nwjs: null, publish: false, publishDir: '/mnt/exdrive/dev/jmz-builds' });
    });

    it('reads every flag, spaced or joined, in any order', () =>
    {
      // Arrange: the same request written two ways.
      const spaced = [ '--nwjs', '/opt/nwjs', '--publish', '--publish-dir', '/scratch/builds' ];
      const joined = [ '--publish-dir=/scratch/builds', '--publish', '--nwjs=/opt/nwjs' ];

      // Act.
      const options = [ parseBuildArguments(spaced), parseBuildArguments(joined) ];

      // Assert.
      expect(options)
        .toStrictEqual([
          { nwjs: '/opt/nwjs', publish: true, publishDir: '/scratch/builds' },
          { nwjs: '/opt/nwjs', publish: true, publishDir: '/scratch/builds' },
        ]);
    });

    it('refuses an unknown flag, a flag missing its folder, and a publish folder without --publish', () =>
    {
      // Arrange: a mistyped --publish, a folder that never came, another flag where the folder should be, an empty
      // joined folder, and a publish folder alone.
      const mistakes = [
        [ '--publsh' ],
        [ '--nwjs' ],
        [ '--nwjs', '--publish' ],
        [ '--publish', '--publish-dir=' ],
        [ '--publish-dir', '/scratch/builds' ],
      ];

      // Act.
      const messages = mistakes.map(argv =>
      {
        try
        {
          parseBuildArguments(argv);
          return 'accepted';
        }
        catch (error)
        {
          return (error as Error).message;
        }
      });

      // Assert.
      expect(messages)
        .toStrictEqual([
          'Unknown argument: --publsh. The build takes --nwjs <folder>, --publish and --publish-dir <folder>.',
          '--nwjs needs a folder after it.',
          '--nwjs needs a folder after it.',
          '--publish-dir needs a folder after it.',
          '--publish-dir only means something with --publish.',
        ]);
    });
  });

  describe('nwjsVersionIn', () =>
  {
    it('reads the version off the line that sets process.versions.nw, and no other', () =>
    {
      // Arrange: a library whose neighboring versions differ from its own, among bytes that are not text.
      const library = Buffer.concat([
        Buffer.from([ 0, 255, 7 ]),
        Buffer.from('process.versions[\'node-webkit\'] = \'9.9.9\';process.versions[\'nw-commit-id\'] = \'11a87ca\';'),
        Buffer.from('process.versions[\'nw\'] = \'0.118.0\'; ../../third_party'),
        Buffer.from([ 0, 1 ]),
      ]);

      // Act.
      const version = nwjsVersionIn(library);

      // Assert.
      expect(version)
        .toBe('0.118.0');
    });

    it('answers an empty string for a library carrying no version, or something else where one should be', () =>
    {
      // Arrange: no line at all, a line never closed, and a value that is not a version.
      const libraries = [
        Buffer.from('process.versions[\'node-webkit\'] = \'0.118.0\';'),
        Buffer.from('process.versions[\'nw\'] = \'0.118.0'),
        Buffer.from('process.versions[\'nw\'] = \' ScheduleNextScan\';'),
      ];

      // Act.
      const versions = libraries.map(library => nwjsVersionIn(library));

      // Assert.
      expect(versions)
        .toStrictEqual([ '', '', '' ]);
    });
  });

  describe('nwjsProblem', () =>
  {
    const SDK = [ 'chromedriver', 'lib', 'locales', 'nw', 'nwjc', 'resources.pak' ];

    it('accepts the pinned version in the SDK flavor', () =>
    {
      // Arrange: the pinned NW.js's folder.

      // Act.
      const problem = nwjsProblem('0.118.0', SDK);

      // Assert.
      expect(problem)
        .toBeNull();
    });

    it('refuses another version, the normal flavor, and a folder that is not NW.js', () =>
    {
      // Arrange: the older SDK beside it, the normal flavor, an SDK missing chromedriver, a library with no version,
      // and a folder with no nw binary.
      const candidates = [
        [ '0.110.1', SDK ],
        [ '0.118.0', [ 'lib', 'locales', 'nw', 'resources.pak' ] ],
        [ '0.118.0', [ 'lib', 'nw', 'nwjc' ] ],
        [ '', SDK ],
        [ '0.118.0', [ 'chromedriver', 'lib', 'nwjc' ] ],
      ] as const;

      // Act.
      const problems = candidates.map(([ version, names ]) => nwjsProblem(version, [ ...names ]));

      // Assert.
      expect(problems)
        .toStrictEqual([
          'it is NW.js 0.110.1, and the bundle ships NW.js 0.118.0 (SDK).',
          'it is the normal flavor of NW.js 0.118.0, and the bundle ships the SDK flavor, which keeps DevTools.',
          'it is the normal flavor of NW.js 0.118.0, and the bundle ships the SDK flavor, which keeps DevTools.',
          'it is not a build of NW.js: it needs an nw binary and a version in lib/libnw.so. The bundle ships NW.js 0.118.0 (SDK).',
          'it is not a build of NW.js: it needs an nw binary and a version in lib/libnw.so. The bundle ships NW.js 0.118.0 (SDK).',
        ]);
    });
  });

  describe('bundleVersion', () =>
  {
    it('names a build by its UTC minute, padded, and its commit', () =>
    {
      // Arrange: a moment whose month, day, hour and minute all take one digit.
      const builtAt = new Date(Date.UTC(2027, 0, 5, 3, 7, 59));

      // Act.
      const version = bundleVersion(builtAt, '925c73f', false);

      // Assert.
      expect(version)
        .toBe('20270105.0307-925c73f');
    });

    it('marks a build from a tree with changes not committed', () =>
    {
      // Arrange.
      const builtAt = new Date(Date.UTC(2026, 10, 18, 21, 45));

      // Act.
      const version = bundleVersion(builtAt, '925c73f', true);

      // Assert.
      expect(version)
        .toBe('20261118.2145-925c73f-dirty');
    });
  });

  describe('isDirtyTree', () =>
  {
    it('calls a tree with nothing changed clean', () =>
    {
      // Arrange: git status printing nothing at all.
      const status = '';

      // Act.
      const dirty = isDirtyTree(status);

      // Assert.
      expect(dirty)
        .toBe(false);
    });

    it('calls a tree clean when its only untracked files are outside what the build reads', () =>
    {
      // Arrange: a note in docs/, one with a quoted name, and names that only start the way a build input does.
      const status = [
        '?? docs/notes.md',
        '?? "docs/caf\\303\\251.md"',
        '?? app-notes.md',
        '?? scripts.txt',
        '?? package.json.bak',
        '',
      ].join('\n');

      // Act.
      const dirty = isDirtyTree(status);

      // Assert.
      expect(dirty)
        .toBe(false);
    });

    it('calls a tree dirty for an untracked file in anything the build reads', () =>
    {
      // Arrange: one untracked file under each folder the build reads, a folder git lists whole, a quoted name, and
      // the root lockfile under either name Bun writes.
      const statuses = [
        '?? app/src/notes.ts',
        '?? server/internal/extra.go',
        '?? nw-app/extra.js',
        '?? scripts/bundle/extra.ts',
        '?? app/src/newBoard/',
        '?? "app/src/a b.ts"',
        '?? bun.lock',
        '?? bun.lockb',
      ];

      // Act.
      const dirty = statuses.map(status => isDirtyTree(status));

      // Assert.
      expect(dirty)
        .toStrictEqual([ true, true, true, true, true, true, true, true ]);
    });

    it('calls a tree dirty for any change to a tracked file, wherever it is', () =>
    {
      // Arrange: a doc edited, staged, deleted and renamed, none of them in what the build reads.
      const statuses = [ ' M docs/bundle-and-play-plan.md', 'M  README.md', 'D  LICENSE', 'R  a.md -> b.md' ];

      // Act.
      const dirty = statuses.map(status => isDirtyTree(status));

      // Assert.
      expect(dirty)
        .toStrictEqual([ true, true, true, true ]);
    });
  });

  describe('uiBuildEnvironment', () =>
  {
    it('builds the pages for production with no API base, whatever the build inherited, and passes the rest on', () =>
    {
      // Arrange: a shell left set up for the dev stack, beside settings the UI build still needs, another Vite
      // setting among them.
      const inherited = {
        PATH: '/usr/bin:/bin',
        HOME: '/home/je',
        NODE_ENV: 'development',
        VITE_JMZ_API_BASE: 'http://127.0.0.1:8080',
        VITE_JMZ_FEATURE: 'on',
      };

      // Act.
      const environment = uiBuildEnvironment(inherited);

      // Assert.
      expect(environment)
        .toStrictEqual({ PATH: '/usr/bin:/bin', HOME: '/home/je', NODE_ENV: 'production', VITE_JMZ_FEATURE: 'on' });
    });
  });

  describe('editorManifest', () =>
  {
    it('keeps the dev shell\'s manifest but for the bundle\'s own name and the target\'s switches', () =>
    {
      // Arrange: a manifest shaped as the dev shell's is.
      const source = {
        name: 'jmz-data-editor-nw',
        main: 'main.js',
        'chromium-args': '--disable-popup-blocking --use-angle=vulkan',
        window: { title: 'JMZ Data Editor', width: 1920 },
      };

      // Act.
      const manifest = editorManifest(source, { goos: 'linux', goarch: 'amd64', chromiumArgs: '--disable-popup-blocking' });

      // Assert.
      expect(manifest)
        .toStrictEqual({
          name: 'jmz-editor',
          main: 'main.js',
          'chromium-args': '--disable-popup-blocking',
          window: { title: 'JMZ Data Editor', width: 1920 },
        });
    });
  });

  describe('TARGETS', () =>
  {
    it('starts the Linux build with popups unblocked, for the windows the shell opens', () =>
    {
      // Arrange: nothing to set up; the targets are the build's own.

      // Act.
      const target = TARGETS['linux-x64'];

      // Assert.
      expect(target)
        .toStrictEqual({ goos: 'linux', goarch: 'amd64', chromiumArgs: '--disable-popup-blocking --use-angle=vulkan' });
    });
  });

  describe('bundleManifest', () =>
  {
    it('writes what the bundle is into bundle.json, with its NW.js and its default port', () =>
    {
      // Arrange.
      const builtAt = new Date(Date.UTC(2026, 10, 18, 21, 45, 3));

      // Act.
      const manifest = bundleManifest('20261118.2145-925c73f', '925c73f2d1e5a9b07c4a2f1b9e0d8c7b6a5f4e3d', false, builtAt);

      // Assert.
      expect(manifest)
        .toStrictEqual({
          version: '20261118.2145-925c73f',
          commit: '925c73f2d1e5a9b07c4a2f1b9e0d8c7b6a5f4e3d',
          dirty: false,
          builtAt: '2026-11-18T21:45:03.000Z',
          nwjs: '0.118.0-sdk',
          port: 47380,
        });
    });
  });

  describe('bundleFolderName', () =>
  {
    it('names the folder a build is laid out in by the bundle\'s name and the version', () =>
    {
      // Arrange.
      const version = '20261118.2145-925c73f';

      // Act.
      const folder = bundleFolderName(version);

      // Assert.
      expect(folder)
        .toBe('jmz-editor-20261118.2145-925c73f');
    });
  });

  describe('tarballName', () =>
  {
    it('names the tarball by the bundle\'s name, the target and the version', () =>
    {
      // Arrange.
      const version = '20261118.2145-925c73f';

      // Act.
      const tarball = tarballName('linux-x64', version);

      // Assert.
      expect(tarball)
        .toBe('jmz-editor-linux-x64-20261118.2145-925c73f.tar.gz');
    });
  });

  describe('versionsFile', () =>
  {
    it('names the tarball, its version and its SHA-256 under the target it runs on', () =>
    {
      // Arrange.
      const file = 'jmz-editor-linux-x64-20261118.2145-925c73f.tar.gz';

      // Act.
      const versions = versionsFile('linux-x64', '20261118.2145-925c73f', file, 'ab12');

      // Assert.
      expect(versions)
        .toStrictEqual({
          'linux-x64': {
            version: '20261118.2145-925c73f',
            file: 'jmz-editor-linux-x64-20261118.2145-925c73f.tar.gz',
            sha256: 'ab12',
          },
        });
    });
  });

  describe('LAUNCHER', () =>
  {
    it('starts the bundle\'s own NW.js on its editor folder through a link, passing every argument on whole', () =>
    {
      // Arrange: a bundle whose nw only reports what it was given, and a link to its launcher from another folder, as
      // the installer puts one on the PATH.
      const root = mkdtempSync(join(tmpdir(), 'bundle-launcher-test-'));
      folders.push(root);
      const bundle = join(root, 'jmz-editor-1');
      mkdirSync(join(bundle, 'nwjs'), { recursive: true });
      writeFileSync(join(bundle, 'nwjs', 'nw'), '#!/bin/sh\nprintf \'%s\\n\' "$0" "$@"\n');
      chmodSync(join(bundle, 'nwjs', 'nw'), 0o755);
      writeFileSync(join(bundle, 'jmz-editor'), LAUNCHER);
      chmodSync(join(bundle, 'jmz-editor'), 0o755);
      mkdirSync(join(root, 'bin'));
      symlinkSync(join(bundle, 'jmz-editor'), join(root, 'bin', 'jmz-editor'));

      // Act.
      const result = spawnSync(join(root, 'bin', 'jmz-editor'), [ '--project-root', '/games/chef adventure' ], { encoding: 'utf-8' });

      // Assert.
      expect([ result.status, result.stdout.split('\n') ])
        .toStrictEqual([
          0,
          [ join(bundle, 'nwjs', 'nw'), join(bundle, 'editor'), '--project-root', '/games/chef adventure', '' ],
        ]);
    });
  });
});
