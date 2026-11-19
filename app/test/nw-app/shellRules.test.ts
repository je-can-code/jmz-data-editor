import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import DatabaseFilenames from '../../src/core/enums/DatabaseFilenames.ts';
import { CLIPBOARD_FORMAT as COMMAND_CLIPBOARD_FORMAT } from '../../src/mapEditor/core/commandList/commandClipboard.ts';
import { encodePageClipboard, PAGE_CLIPBOARD_MARKER } from '../../src/mapEditor/core/eventWindow/pageOperations.ts';
import { encodeStampClipboard, STAMP_CLIPBOARD_MARKER } from '../../src/mapEditor/core/stamps/stampClipboard.ts';
import { createEventPage, createMapEvent } from '../../src/mapEditor/core/model/eventModel.ts';
import { ROW_CLIPBOARD_FORMAT, RowClipboard } from '../../src/services/rows/RowClipboard.ts';

/*
 * The NW.js shell's decisions, tested without NW.js. It reads its flags from nw.App.argv, which also carries some
 * of Chromium's own switches and splits "--flag value" into two arguments, so a flag must be found by name and a
 * following flag never mistaken for its value; the shipped --project-root and --api-base take the spaced form. It
 * opens only pages on the UI's own origin (localhost and 127.0.0.1 are different origins, and a window on another
 * shares none of the editors' channels), and it names each window by its page, so a second request for the same
 * page focuses the open window: the hash and the query's order do not make a different window.
 */
const load = createRequire(import.meta.url);
const rules = load('../../../nw-app/shellRules.js') as {
  readFlag(argv: string[], name: string): string | null;
  hasFlag(argv: string[], name: string): boolean;
  trimOrigin(origin: string): string;
  bootPath(argv: string[], bundled: boolean): string;
  resolveWindowUrl(requested: unknown, uiUrl: string): string | null;
  windowKey(url: string): string;
  windowSize(requested: unknown, fallback: number): number;
  serverEnvironment(apiBase: string, uiUrl: string): { JMZ_API_ADDRESS: string; JMZ_UI_ORIGINS: string };
  uiPort(uiUrl: string): number;
  devStackArgs(projectRoot: string, apiBase: string, uiUrl: string): string[];
  clipboardAnswer(request: Record<string, unknown>, readText: () => unknown): { channel: string; message: { type: string; text: string } } | null;
  CLIPBOARD_KINDS: Record<string, string>;
  playReplyChannel(name: unknown): string | null;
  isGameFolder(listing: string[]): boolean;
  cacheDirectory(environment: Record<string, string | undefined>, homeDirectory: string): string;
  playtestProfileDirectory(cacheRoot: string, projectRoot: string): string;
  playArguments(projectRoot: string, profileDirectory: string): string[];
  playOutcome(exit: { code: number | null; signal: string | null } | null): string;
  playtestSpawnOptions(): { detached: boolean; stdio: string };
  healthProjectRoot(answer: { status: number; body: unknown }): string;
  bundleLayout(shellDirectory: string): { root: string; manifest: string; api: string; ui: string };
  isBundled(shellDirectory: string, exists: (filePath: string) => boolean): boolean;
  bundleUserFiles(environment: Record<string, string | undefined>, homeDirectory: string): { config: string; apiLog: string; shellLog: string };
  parseBundleConfig(text: string | null, homeDirectory: string): { projectRoot: string; port: number | null } | null;
  bundleProjectRoot(argv: string[], environment: Record<string, string | undefined>, config: { projectRoot: string }, workingDirectory: string): { projectRoot: string; source: string };
  bundlePort(config: { port: number | null }, defaultPort: number): number;
  bundleOrigin(port: number): string;
  bundleServerEnvironment(origin: string, projectRoot: string, uiDirectory: string): Record<string, string>;
  apiSpawnOptions(environment: Record<string, string | undefined>, serverVariables: Record<string, string>, output: number): { env: Record<string, string | undefined>; stdio: unknown[] };
  projectRootProblem(projectRoot: string, exists: (filePath: string) => boolean): string | null;
  isApiReady(answer: { status: number; body: unknown }): boolean;
  problemText(problem: string, facts: { projectRoot: string; rootSource: string; port: number; config: string; apiLog: string; shellLog: string }): string;
  relaunchAction(state: { problem: string; problemsOpening: number; problemsShown: number; editorReady: boolean }): string;
};

describe('shellRules', () =>
{
  // nw.App.argv as NW.js 147 actually hands it over, Chromium switches included.
  const ARGV = [
    '--user-data-dir=/tmp/profile',
    '--ozone-platform=x11',
    '--maps',
    '--project-root',
    '/games/chef adventure',
    '--api-base=http://127.0.0.1:8080/',
    '--ui-url',
    '--attach',
  ];

  describe('readFlag', () =>
  {
    it('reads the spaced and the joined forms', () =>
    {
      // Arrange: the arguments above.

      // Act.
      const values = [ rules.readFlag(ARGV, '--project-root'), rules.readFlag(ARGV, '--api-base') ];

      // Assert.
      expect(values)
        .toStrictEqual([ '/games/chef adventure', 'http://127.0.0.1:8080/' ]);
    });

    it('never takes the next flag as a value, and answers null for an absent flag', () =>
    {
      // Arrange: --ui-url is followed by another flag.

      // Act.
      const values = [ rules.readFlag(ARGV, '--ui-url'), rules.readFlag(ARGV, '--log'), rules.readFlag([ '--log=' ], '--log'), rules.readFlag([ '--log' ], '--log') ];

      // Assert.
      expect(values)
        .toStrictEqual([ null, null, null, null ]);
    });

    it('does not match a flag that merely starts the same way', () =>
    {
      // Arrange: a longer flag sharing the prefix.

      // Act.
      const value = rules.readFlag([ '--api-base-url=x', '--maps' ], '--api-base');

      // Assert.
      expect(value)
        .toBeNull();
    });
  });

  describe('bootPath', () =>
  {
    it('boots the map editor under --maps and the data editor otherwise', () =>
    {
      // Arrange: with and without the flag, beside a near miss.

      // Act.
      const paths = [ rules.bootPath(ARGV, false), rules.bootPath([ '--attach' ], false), rules.bootPath([ '--mapsx' ], false) ];

      // Assert.
      expect([ paths, rules.hasFlag(ARGV, '--attach') ])
        .toStrictEqual([ [ '/map.html', '/', '/' ], true ]);
    });

    it('boots a bundle on the map editor, with or without --maps', () =>
    {
      // Arrange: the arguments that boot the data editor in the dev stack, and --maps.

      // Act.
      const paths = [ rules.bootPath([ '--attach' ], true), rules.bootPath(ARGV, true) ];

      // Assert.
      expect(paths)
        .toStrictEqual([ '/map.html', '/map.html' ]);
    });
  });

  describe('resolveWindowUrl', () =>
  {
    it('opens pages on the UI\'s origin, relative or absolute', () =>
    {
      // Arrange: the UI's origin with a trailing slash.
      const ui = 'http://127.0.0.1:3000/';

      // Act.
      const urls = [ rules.resolveWindowUrl('/map.html?view=event&map=1&event=2', ui), rules.resolveWindowUrl('http://127.0.0.1:3000/', ui) ];

      // Assert.
      expect(urls)
        .toStrictEqual([ 'http://127.0.0.1:3000/map.html?view=event&map=1&event=2', 'http://127.0.0.1:3000/' ]);
    });

    it('refuses other origins, localhost included, and anything that is not a URL', () =>
    {
      // Arrange: near misses of the UI's origin.
      const ui = 'http://127.0.0.1:3000';

      // Act.
      const urls = [
        rules.resolveWindowUrl('http://localhost:3000/map.html', ui),
        rules.resolveWindowUrl('http://127.0.0.1:3001/map.html', ui),
        rules.resolveWindowUrl('https://127.0.0.1:3000/map.html', ui),
        rules.resolveWindowUrl('', ui),
        rules.resolveWindowUrl(42, ui),
        rules.resolveWindowUrl('http://[bad', ui),
      ];

      // Assert.
      expect(urls)
        .toStrictEqual([ null, null, null, null, null, null ]);
    });
  });

  describe('windowKey', () =>
  {
    it('names one window for one page, whatever its hash, query order or index.html', () =>
    {
      // Arrange: spellings of the same two pages.

      // Act.
      const keys = [
        rules.windowKey('http://127.0.0.1:3000/#/enemies'),
        rules.windowKey('http://127.0.0.1:3000/index.html'),
        rules.windowKey('http://127.0.0.1:3000/map.html?view=event&map=12&event=5'),
        rules.windowKey('http://127.0.0.1:3000/map.html?event=5&map=12&view=event#x'),
      ];

      // Assert.
      expect(keys)
        .toStrictEqual([
          'http://127.0.0.1:3000/',
          'http://127.0.0.1:3000/',
          'http://127.0.0.1:3000/map.html?event=5&map=12&view=event',
          'http://127.0.0.1:3000/map.html?event=5&map=12&view=event',
        ]);
    });

    it('names different events different windows', () =>
    {
      // Arrange: two events, one digit apart.

      // Act.
      const keys = [ rules.windowKey('http://h/map.html?view=event&map=12&event=5'), rules.windowKey('http://h/map.html?view=event&map=12&event=50') ];

      // Assert.
      expect(keys[0])
        .not.toBe(keys[1]);
    });
  });

  describe('serverEnvironment', () =>
  {
    it('tells the API to listen at the API base and allow exactly the UI\'s page', () =>
    {
      // Arrange: a UI and API moved off their default ports, beside the defaults.

      // Act.
      const environments = [
        rules.serverEnvironment('http://127.0.0.1:18151/', 'http://127.0.0.1:18150/'),
        rules.serverEnvironment('http://127.0.0.1:8080', 'http://127.0.0.1:3000'),
        rules.serverEnvironment('http://localhost', 'https://localhost'),
      ];

      // Assert.
      expect(environments)
        .toStrictEqual([
          { JMZ_API_ADDRESS: '127.0.0.1:18151', JMZ_UI_ORIGINS: 'http://127.0.0.1:18150' },
          { JMZ_API_ADDRESS: '127.0.0.1:8080', JMZ_UI_ORIGINS: 'http://127.0.0.1:3000' },
          { JMZ_API_ADDRESS: 'localhost:80', JMZ_UI_ORIGINS: 'https://localhost' },
        ]);
    });
  });

  describe('dev stack', () =>
  {
    it('starts the UI on its URL\'s port and hands the runner every origin', () =>
    {
      // Arrange: explicit ports, and the schemes' defaults.

      // Act.
      const ports = [ rules.uiPort('http://127.0.0.1:18150'), rules.uiPort('http://127.0.0.1'), rules.uiPort('https://127.0.0.1') ];
      const args = rules.devStackArgs('/games/chef', 'http://127.0.0.1:18151', 'http://127.0.0.1:18150');

      // Assert.
      expect([ ports, args ])
        .toStrictEqual([
          [ 18150, 80, 443 ],
          [ 'run', 'dev', '--project-root', '/games/chef', '--api-base', 'http://127.0.0.1:18151', '--ui-url', 'http://127.0.0.1:18150' ],
        ]);
    });
  });

  describe('windowSize', () =>
  {
    it('keeps sizes sensible and falls back when none is asked for', () =>
    {
      // Arrange: sizes inside, outside and missing.

      // Act.
      const sizes = [ rules.windowSize(960.4, 1400), rules.windowSize(10, 1400), rules.windowSize(99999, 1400), rules.windowSize(undefined, 1400), rules.windowSize(Number.NaN, 900) ];

      // Assert.
      expect([ sizes, rules.trimOrigin(' http://a:1// ') ])
        .toStrictEqual([ [ 960, 320, 7680, 1400, 900 ], 'http://a:1' ]);
    });
  });

  /*
   * A page under NW.js reads the clipboard through the shell, and the shell holds the line on what that hands out:
   * the clipboard's text only when it is the kind of clipboard the page asked for, carrying that kind's marker, and
   * nothing at all from anything else on it (a password, a message). The answer goes only to the reply channel the
   * page opened under a random name, never to the shell channel every window hears, and a read naming no such channel
   * gets no answer, the clipboard not even read.
   */
  describe('clipboardAnswer', () =>
  {
    const REPLY = 'jmz-clipboard-0f8fad5b-d9cb-469f-a165-70867728950e';
    const STAMP = JSON.stringify({ marker: 'jmz-map-editor/stamp', version: 1, stamp: { id: 'a:1', mapId: 3, events: [] } });

    it('answers on the reply channel the page named, with the clipboard\'s text when it carries the marker asked for', () =>
    {
      // Arrange.
      const request = { type: 'clipboard-read', marker: 'jmz-map-editor/stamp', replyTo: REPLY };

      // Act.
      const answer = rules.clipboardAnswer(request, () => STAMP);

      // Assert.
      expect(answer)
        .toStrictEqual({ channel: REPLY, message: { type: 'clipboard-text', text: STAMP } });
    });

    it('answers with nothing when the clipboard holds anything else, or the page asks for a kind the shell never reads', () =>
    {
      // Arrange: plain text, a list, the marker under another field, another program's JSON, the events clipboard the
      // map editor wrote before its copies became stamps, and a kind not read.
      const clipboards = [
        'hunter2',
        JSON.stringify([ 'jmz-map-editor/stamp' ]),
        JSON.stringify({ format: 'jmz-map-editor/stamp' }),
        JSON.stringify({ marker: 'something-else/stamp' }),
        '{"marker":"jmz-map-editor/stamp"',
      ];
      const kindsNotRead = [ '__proto__', 'jmz-map-editor/secrets', 'jmz-map-editor/events' ];

      // Act.
      const texts = [
        ...clipboards.map(text => rules.clipboardAnswer({ marker: 'jmz-map-editor/stamp', replyTo: REPLY }, () => text)),
        ...kindsNotRead.map(marker => rules.clipboardAnswer({ marker, replyTo: REPLY }, () => JSON.stringify({ marker }))),
      ].map(answer => answer?.message.text);

      // Assert.
      expect(texts)
        .toStrictEqual([ '', '', '', '', '', '', '', '' ]);
    });

    it('gives no answer, and never reads the clipboard, for a read naming no proper reply channel', () =>
    {
      // Arrange: none, the shell channel itself, a guessable name, a name with more after the UUID, and not a name.
      const replies: unknown[] = [ undefined, 'jmz-shell', 'jmz-clipboard-1', `${REPLY}-x`, 42 ];
      let reads = 0;

      // Act.
      const answers = replies.map(replyTo => rules.clipboardAnswer({ marker: 'jmz-map-editor/stamp', replyTo }, () =>
      {
        reads += 1;
        return STAMP;
      }));

      // Assert.
      expect([ answers, reads ])
        .toStrictEqual([ [ null, null, null, null, null ], 0 ]);
    });

    it('reads each of the editors\' own clipboards only for a page asking for that one', () =>
    {
      // Arrange: commands, rows, pages and a stamp as the editors write them.
      const commands = JSON.stringify({ format: COMMAND_CLIPBOARD_FORMAT, version: 1, commands: [] });
      const rows = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 9, name: 'Potion' } ]);
      const pages = encodePageClipboard({ marker: PAGE_CLIPBOARD_MARKER, version: 1, pages: [ createEventPage() ] });
      const stamp = encodeStampClipboard({ id: 'a:1', mapId: 3, tilesetId: 1, origin: { x: 0, y: 0 }, width: 1, height: 1, tiles: null, events: [ createMapEvent(1, 0, 0) ] });
      const ask = (marker: string, text: string) => rules.clipboardAnswer({ marker, replyTo: REPLY }, () => text)?.message.text;

      // Act.
      const answers = [
        ask(COMMAND_CLIPBOARD_FORMAT, commands),
        ask(ROW_CLIPBOARD_FORMAT, rows),
        ask(PAGE_CLIPBOARD_MARKER, pages),
        ask(STAMP_CLIPBOARD_MARKER, stamp),
        ask(STAMP_CLIPBOARD_MARKER, commands),
        ask(COMMAND_CLIPBOARD_FORMAT, rows),
        ask(ROW_CLIPBOARD_FORMAT, stamp),
        ask(PAGE_CLIPBOARD_MARKER, stamp),
        ask(STAMP_CLIPBOARD_MARKER, pages),
      ];

      // Assert.
      expect(answers)
        .toStrictEqual([ commands, rows, pages, stamp, '', '', '', '', '' ]);
    });

    it('reads exactly the clipboards the editors write, each by the field its marker sits in', () =>
    {
      // Arrange: nothing to set up; the kinds are the shell's own.

      // Act.
      const kinds = rules.CLIPBOARD_KINDS;

      // Assert.
      expect(kinds)
        .toStrictEqual({
          [STAMP_CLIPBOARD_MARKER]: 'marker',
          [PAGE_CLIPBOARD_MARKER]: 'marker',
          [COMMAND_CLIPBOARD_FORMAT]: 'format',
          [ROW_CLIPBOARD_FORMAT]: 'format',
        });
    });
  });

  /*
   * Play starts the open project as a playtest on the editor's own NW.js, and the shell holds the decisions that make it
   * the game's test mode and nothing else. RPG Maker reads test mode from the first argument after the game's folder
   * alone, and NW.js keeps Chromium's switches among the arguments, so 'test' must come straight after the folder. Each
   * project plays on a profile of its own, the same one every time, since a launch onto a profile in use hands itself to
   * whatever runs there: RPG Maker games all share one default profile, so without one of its own Play would hand off to
   * a copy of the game started some other way. A launch that exits at once with code 0 was handed off, so its game is
   * already running; any other early ending failed; one still running is the game. Only a folder holding a game is
   * launched at all, and the answer goes only to a reply channel the asking page opened under a random name. The game
   * played is the project the API's health check names, since the API knows which project is open, and an answer naming
   * none plays nothing. The game must outlive the editor, so it is started detached and holding nothing of the editor's.
   */
  describe('playtests', () =>
  {
    describe('playReplyChannel', () =>
    {
      it('accepts a play reply channel\'s name', () =>
      {
        // Arrange: a name as the page builds it.
        const name = 'jmz-play-0f8fad5b-d9cb-469f-a165-70867728950e';

        // Act.
        const accepted = rules.playReplyChannel(name);

        // Assert.
        expect(accepted)
          .toBe(name);
      });

      it('refuses every other name, a clipboard reply channel\'s included', () =>
      {
        // Arrange: the clipboard's prefix on a proper UUID, the shell channel, a guessable name, more after the UUID, an
        // upper-case UUID, which crypto.randomUUID never writes, and things that are not names.
        const names: unknown[] = [
          'jmz-clipboard-0f8fad5b-d9cb-469f-a165-70867728950e',
          'jmz-shell',
          'jmz-play-1',
          'jmz-play-0f8fad5b-d9cb-469f-a165-70867728950e-x',
          'jmz-play-0F8FAD5B-D9CB-469F-A165-70867728950E',
          undefined,
          42,
        ];

        // Act.
        const accepted = names.map(name => rules.playReplyChannel(name));

        // Assert.
        expect(accepted)
          .toStrictEqual([ null, null, null, null, null, null, null ]);
      });
    });

    describe('isGameFolder', () =>
    {
      it('finds a game only where the manifest and the page are both there', () =>
      {
        // Arrange: a game, each half of one alone, near misses of both names, and an empty folder.
        const listings = [
          [ 'data', 'img', 'index.html', 'js', 'package.json' ],
          [ 'data', 'package.json' ],
          [ 'data', 'index.html' ],
          [ 'index.htm', 'package.json' ],
          [ 'Index.html', 'package.json' ],
          [ 'index.html', 'package.json.bak' ],
          [],
        ];

        // Act.
        const games = listings.map(listing => rules.isGameFolder(listing));

        // Assert.
        expect(games)
          .toStrictEqual([ true, false, false, false, false, false, false ]);
      });
    });

    describe('cacheDirectory', () =>
    {
      it('uses XDG_CACHE_HOME when it names an absolute folder', () =>
      {
        // Arrange.
        const environment = { XDG_CACHE_HOME: '/scratch/cache' };

        // Act.
        const folder = rules.cacheDirectory(environment, '/home/maker');

        // Assert.
        expect(folder)
          .toBe('/scratch/cache');
      });

      it('falls back to ~/.cache when XDG_CACHE_HOME is unset, empty or relative', () =>
      {
        // Arrange: the three values the spec says to ignore.
        const environments = [ {}, { XDG_CACHE_HOME: '' }, { XDG_CACHE_HOME: 'scratch/cache' } ];

        // Act.
        const folders = environments.map(environment => rules.cacheDirectory(environment, '/home/maker'));

        // Assert.
        expect(folders)
          .toStrictEqual([ '/home/maker/.cache', '/home/maker/.cache', '/home/maker/.cache' ]);
      });
    });

    describe('playtestProfileDirectory', () =>
    {
      it('names a project\'s profile under the cache by the SHA-1 of its folder, the same on every Play', () =>
      {
        // Arrange: one project asked about twice, once with a trailing slash.

        // Act.
        const profiles = [
          rules.playtestProfileDirectory('/home/maker/.cache', '/games/chef adventure'),
          rules.playtestProfileDirectory('/home/maker/.cache', '/games/chef adventure/'),
        ];

        // Assert.
        expect(profiles)
          .toStrictEqual([
            '/home/maker/.cache/jmz-editor/playtest/9872d39051d7ccc4be26344cc0136589a81f8769',
            '/home/maker/.cache/jmz-editor/playtest/9872d39051d7ccc4be26344cc0136589a81f8769',
          ]);
      });

      it('gives two projects two profiles, even when one folder\'s name starts the other\'s', () =>
      {
        // Arrange: two projects whose folders differ only after a shared start.

        // Act.
        const profiles = [
          rules.playtestProfileDirectory('/home/maker/.cache', '/games/chef adventure'),
          rules.playtestProfileDirectory('/home/maker/.cache', '/games/chef'),
        ];

        // Assert.
        expect(profiles)
          .toStrictEqual([
            '/home/maker/.cache/jmz-editor/playtest/9872d39051d7ccc4be26344cc0136589a81f8769',
            '/home/maker/.cache/jmz-editor/playtest/6e8304c44dc3d32b33f589a75148cb6541bd3050',
          ]);
      });
    });

    describe('playArguments', () =>
    {
      it('puts test straight after the game\'s folder, and the profile after that', () =>
      {
        // Arrange: a folder with a space in it, which stays one argument.

        // Act.
        const args = rules.playArguments('/games/chef adventure', '/home/maker/.cache/jmz-editor/playtest/9872d390');

        // Assert.
        expect(args)
          .toStrictEqual([ '/games/chef adventure', 'test', '--user-data-dir=/home/maker/.cache/jmz-editor/playtest/9872d390' ]);
      });
    });

    describe('playOutcome', () =>
    {
      it('calls a launch still running when the watch ends started', () =>
      {
        // Arrange: no exit within the watch.

        // Act.
        const outcome = rules.playOutcome(null);

        // Assert.
        expect(outcome)
          .toBe('started');
      });

      it('calls a launch that exited at once with code 0 handed off to the game already running', () =>
      {
        // Arrange.
        const exit = { code: 0, signal: null };

        // Act.
        const outcome = rules.playOutcome(exit);

        // Assert.
        expect(outcome)
          .toBe('already-running');
      });

      it('calls any other early ending, an error code or a signal, a launch that failed', () =>
      {
        // Arrange: an error code, and a signal, which leaves no code at all.
        const exits = [ { code: 1, signal: null }, { code: null, signal: 'SIGKILL' } ];

        // Act.
        const outcomes = exits.map(exit => rules.playOutcome(exit));

        // Assert.
        expect(outcomes)
          .toStrictEqual([ 'failed', 'failed' ]);
      });
    });

    describe('playtestSpawnOptions', () =>
    {
      it('starts the game detached, in a process group of its own, with no stream tied to the editor, so it outlives it', () =>
      {
        // Arrange: nothing to set up; every playtest starts the same way. Detached, no signal sent to the editor's group
        // reaches the game; with its streams ignored, it holds no pipe to the editor that would end it, or stall it,
        // once the editor is gone.

        // Act.
        const options = rules.playtestSpawnOptions();

        // Assert.
        expect(options)
          .toStrictEqual({ detached: true, stdio: 'ignore' });
      });
    });

    describe('healthProjectRoot', () =>
    {
      it('reads the project the API serves out of a 200\'s data', () =>
      {
        // Arrange: the health check's answer, as the API gives it.
        const answer = { status: 200, body: { path: '/api/health', data: { ok: true, projectRoot: '/games/chef', projectRootOk: true } } };

        // Act.
        const root = rules.healthProjectRoot(answer);

        // Assert.
        expect(root)
          .toBe('/games/chef');
      });

      it('reads no project out of any other answer', () =>
      {
        // Arrange: the same data under an error status, no body, a body that is text, no data, an API serving no project,
        // which leaves the folder out, a folder outside the data, and a folder that is not text.
        const answers = [
          { status: 503, body: { data: { ok: true, projectRoot: '/games/chef' } } },
          { status: 200, body: null },
          { status: 200, body: '/games/chef' },
          { status: 200, body: { data: null } },
          { status: 200, body: { data: { ok: true, projectRootOk: false } } },
          { status: 200, body: { projectRoot: '/games/chef', data: { ok: true } } },
          { status: 200, body: { data: { ok: true, projectRoot: 42 } } },
        ];

        // Act.
        const roots = answers.map(answer => rules.healthProjectRoot(answer));

        // Assert.
        expect(roots)
          .toStrictEqual([ '', '', '', '', '', '', '' ]);
      });
    });
  });

  /*
   * The bundled editor is one folder holding NW.js, the shell, the API and the UI's pages. The shell knows it runs from
   * one by the bundle.json the build wrote beside the shell's folder, and a checkout of the repo, having none there,
   * runs the dev stack exactly as before. A bundle keeps the person's files outside itself, where an update leaves them
   * alone: its config in the XDG config folder and its logs in the XDG state folder, under the editor's own name. It
   * serves its pages and its API from one loopback origin on a fixed port, the config's when it names a usable one,
   * since everything the pages save belongs to that origin. The config is written by hand, so text that is not a config
   * is refused rather than half read, and a folder in it may start from ~ as it would in a terminal, since no shell
   * expands the file first. Before the API starts, the project must be chosen, there, and an RPG Maker MZ project,
   * because the API's health check only says one is set; the API counts as ready only once that check answers ok; and
   * whatever stops the editor is put in plain words that name the log saying more.
   */
  describe('bundle mode', () =>
  {
    describe('isBundled', () =>
    {
      it('finds a bundle by the manifest beside the shell\'s folder', () =>
      {
        // Arrange: a bundle whose build wrote its manifest.
        const exists = (filePath: string) => filePath === '/opt/jmz-editor-1/bundle.json';

        // Act.
        const found = rules.isBundled('/opt/jmz-editor-1/editor', exists);

        // Assert.
        expect(found)
          .toBe(true);
      });

      it('runs a checkout as the dev stack, even beside a manifest in the shell\'s own folder', () =>
      {
        // Arrange: a checkout, and a manifest one folder too deep.
        const exists = (filePath: string) => filePath === '/repo/nw-app/bundle.json';

        // Act.
        const found = rules.isBundled('/repo/nw-app', exists);

        // Assert.
        expect(found)
          .toBe(false);
      });
    });

    describe('bundleLayout', () =>
    {
      it('lays a bundle out around the folder above the shell\'s: the manifest, the API\'s binary and the UI\'s pages', () =>
      {
        // Arrange: nothing to set up; the shell sits in the bundle's editor folder, as the build puts it.

        // Act.
        const layout = rules.bundleLayout('/opt/jmz-editor-1/editor');

        // Assert.
        expect(layout)
          .toStrictEqual({
            root: '/opt/jmz-editor-1',
            manifest: '/opt/jmz-editor-1/bundle.json',
            api: '/opt/jmz-editor-1/server/jmz-api',
            ui: '/opt/jmz-editor-1/ui',
          });
      });
    });

    describe('bundleUserFiles', () =>
    {
      it('keeps the config and the logs in the XDG folders the variables name', () =>
      {
        // Arrange.
        const environment = { XDG_CONFIG_HOME: '/scratch/config', XDG_STATE_HOME: '/scratch/state' };

        // Act.
        const files = rules.bundleUserFiles(environment, '/home/maker');

        // Assert.
        expect(files)
          .toStrictEqual({
            config: '/scratch/config/jmz-editor/config.json',
            apiLog: '/scratch/state/jmz-editor/api.log',
            shellLog: '/scratch/state/jmz-editor/shell.log',
          });
      });

      it('falls back to ~/.config and ~/.local/state when the variables are unset, empty or relative', () =>
      {
        // Arrange: the three values the spec says to ignore, and the cache's variable, which names neither folder.
        const environments = [
          {},
          { XDG_CONFIG_HOME: '', XDG_STATE_HOME: '' },
          { XDG_CONFIG_HOME: 'scratch/config', XDG_STATE_HOME: 'scratch/state' },
          { XDG_CACHE_HOME: '/scratch/cache' },
        ];

        // Act.
        const files = environments.map(environment => rules.bundleUserFiles(environment, '/home/maker'));

        // Assert.
        expect(files)
          .toStrictEqual(environments.map(() => ({
            config: '/home/maker/.config/jmz-editor/config.json',
            apiLog: '/home/maker/.local/state/jmz-editor/api.log',
            shellLog: '/home/maker/.local/state/jmz-editor/shell.log',
          })));
      });
    });

    describe('parseBundleConfig', () =>
    {
      it('reads the project and the port, trimmed, and leaves keys it does not know alone', () =>
      {
        // Arrange: a config with a key a later version may add, beside the lowest and highest ports.
        const texts = [ '{ "projectRoot": " /games/chef ", "port": 47390, "theme": "dark" }', '{ "port": 1 }', '{ "port": 65535 }' ];

        // Act.
        const configs = texts.map(text => rules.parseBundleConfig(text, '/home/maker'));

        // Assert.
        expect(configs)
          .toStrictEqual([ { projectRoot: '/games/chef', port: 47390 }, { projectRoot: '', port: 1 }, { projectRoot: '', port: 65535 } ]);
      });

      it('reads no file, an empty object, and keys set to null as nothing set', () =>
      {
        // Arrange.
        const texts = [ null, '{}', '{ "projectRoot": null, "port": null }' ];

        // Act.
        const configs = texts.map(text => rules.parseBundleConfig(text, '/home/maker'));

        // Assert.
        expect(configs)
          .toStrictEqual([ { projectRoot: '', port: null }, { projectRoot: '', port: null }, { projectRoot: '', port: null } ]);
      });

      it('counts a folder starting with ~ from the home folder, as a terminal does, and leaves any other ~ as written', () =>
      {
        // Arrange: ~ alone, ~ and a folder, the same padded with spaces, then near misses: another person's home folder,
        // a ~ inside a folder, and one at the end.
        const texts = [
          '{ "projectRoot": "~" }',
          '{ "projectRoot": "~/games/chef" }',
          '{ "projectRoot": " ~/games/chef " }',
          '{ "projectRoot": "~maker/games/chef" }',
          '{ "projectRoot": "/games/~/chef" }',
          '{ "projectRoot": "games/~" }',
        ];

        // Act.
        const roots = texts.map(text => rules.parseBundleConfig(text, '/home/maker')?.projectRoot);

        // Assert.
        expect(roots)
          .toStrictEqual([ '/home/maker', '/home/maker/games/chef', '/home/maker/games/chef', '~maker/games/chef', '/games/~/chef', 'games/~' ]);
      });

      it('refuses text that is not a config, rather than reading part of it', () =>
      {
        // Arrange: an empty file, text that is not JSON or is cut short, JSON that is not an object, a folder that is
        // not text, and ports that are text, zero, past the last port, a fraction or negative.
        const texts = [
          '',
          'projectRoot=/games/chef',
          '{ "projectRoot": "/games/chef"',
          '[]',
          'null',
          '42',
          '"/games/chef"',
          '{ "projectRoot": 42 }',
          '{ "port": "47390" }',
          '{ "port": 0 }',
          '{ "port": 65536 }',
          '{ "port": 47390.5 }',
          '{ "port": -47390 }',
        ];

        // Act.
        const configs = texts.map(text => rules.parseBundleConfig(text, '/home/maker'));

        // Assert.
        expect(configs)
          .toStrictEqual(texts.map(() => null));
      });
    });

    describe('bundleProjectRoot', () =>
    {
      it('takes --project-root first, then JMZ_PROJECT_ROOT, then the config, and says which named the folder', () =>
      {
        // Arrange: all three set, then the flag gone, then the variable gone too.
        const config = { projectRoot: '/games/from-config' };
        const environment = { JMZ_PROJECT_ROOT: '/games/from-environment' };

        // Act.
        const roots = [
          rules.bundleProjectRoot([ '--project-root', '/games/from-flag' ], environment, config, '/home/maker'),
          rules.bundleProjectRoot([ '--maps' ], environment, config, '/home/maker'),
          rules.bundleProjectRoot([ '--maps' ], {}, config, '/home/maker'),
        ];

        // Assert.
        expect(roots)
          .toStrictEqual([
            { projectRoot: '/games/from-flag', source: 'flag' },
            { projectRoot: '/games/from-environment', source: 'variable' },
            { projectRoot: '/games/from-config', source: 'config' },
          ]);
      });

      it('makes a relative folder absolute from where the editor was started, wherever it came from', () =>
      {
        // Arrange: a relative flag, a relative variable, and a relative config.

        // Act.
        const roots = [
          rules.bundleProjectRoot([ '--project-root=games/chef' ], {}, { projectRoot: '' }, '/home/maker'),
          rules.bundleProjectRoot([], { JMZ_PROJECT_ROOT: 'games/env' }, { projectRoot: '' }, '/home/maker'),
          rules.bundleProjectRoot([], {}, { projectRoot: './chef/' }, '/home/maker'),
        ];

        // Assert.
        expect(roots)
          .toStrictEqual([
            { projectRoot: '/home/maker/games/chef', source: 'flag' },
            { projectRoot: '/home/maker/games/env', source: 'variable' },
            { projectRoot: '/home/maker/chef', source: 'config' },
          ]);
      });

      it('answers an empty folder when none is set, a blank variable included, and the config as the place to set one', () =>
      {
        // Arrange: no flag, a variable of spaces, and an empty config.

        // Act.
        const root = rules.bundleProjectRoot([], { JMZ_PROJECT_ROOT: '   ' }, { projectRoot: '' }, '/home/maker');

        // Assert.
        expect(root)
          .toStrictEqual({ projectRoot: '', source: 'config' });
      });

      it('passes over a blank variable to the config\'s folder', () =>
      {
        // Arrange: no flag, a variable of spaces, and a config naming a folder.

        // Act.
        const root = rules.bundleProjectRoot([], { JMZ_PROJECT_ROOT: '   ' }, { projectRoot: '/games/from-config' }, '/home/maker');

        // Assert.
        expect(root)
          .toStrictEqual({ projectRoot: '/games/from-config', source: 'config' });
      });
    });

    describe('bundlePort', () =>
    {
      it('uses the config\'s port when it sets one, and the bundle\'s own otherwise', () =>
      {
        // Arrange: a config with a port, and one without.

        // Act.
        const ports = [ rules.bundlePort({ port: 47390 }, 47380), rules.bundlePort({ port: null }, 47380) ];

        // Assert.
        expect(ports)
          .toStrictEqual([ 47390, 47380 ]);
      });
    });

    describe('bundleOrigin', () =>
    {
      it('serves the pages and the API from one loopback origin on the port', () =>
      {
        // Arrange: the bundle's own port.

        // Act.
        const origin = rules.bundleOrigin(47380);

        // Assert.
        expect(origin)
          .toBe('http://127.0.0.1:47380');
      });
    });

    describe('bundleServerEnvironment', () =>
    {
      it('starts the API on the bundle\'s origin, allowing it alone, on the project, serving the pages, and ending with the shell', () =>
      {
        // Arrange: a project folder with a space in it.

        // Act.
        const environment = rules.bundleServerEnvironment('http://127.0.0.1:47380', '/games/chef adventure', '/opt/jmz-editor-1/ui');

        // Assert.
        expect(environment)
          .toStrictEqual({
            JMZ_API_ADDRESS: '127.0.0.1:47380',
            JMZ_UI_ORIGINS: 'http://127.0.0.1:47380',
            JMZ_PROJECT_ROOT: '/games/chef adventure',
            JMZ_UI_DIR: '/opt/jmz-editor-1/ui',
            JMZ_EXIT_WITH_PARENT: '1',
          });
      });
    });

    describe('apiSpawnOptions', () =>
    {
      it('gives the API a stdin the shell holds open, since it ends once that closes, and its log for both its outputs', () =>
      {
        // Arrange: the API's log, opened as descriptor 7. The API ends the moment its stdin closes, which is how it ends
        // with the shell however the shell ends; a stdin ignored would end it the moment it started.

        // Act.
        const { stdio } = rules.apiSpawnOptions({}, {}, 7);

        // Assert.
        expect(stdio)
          .toStrictEqual([ 'pipe', 7, 7 ]);
      });

      it('runs the API on the shell\'s environment, with the bundle\'s variables over any the environment already sets', () =>
      {
        // Arrange: an environment carrying a variable the API needs from it, and stale values of two the bundle sets,
        // one of which would keep the API running after the shell is gone.
        const environment = { PATH: '/usr/bin:/bin', JMZ_PROJECT_ROOT: '/games/elsewhere', JMZ_EXIT_WITH_PARENT: '0' };
        const variables = rules.bundleServerEnvironment('http://127.0.0.1:47380', '/games/chef', '/opt/jmz-editor-1/ui');

        // Act.
        const { env } = rules.apiSpawnOptions(environment, variables, 7);

        // Assert.
        expect(env)
          .toStrictEqual({
            PATH: '/usr/bin:/bin',
            JMZ_API_ADDRESS: '127.0.0.1:47380',
            JMZ_UI_ORIGINS: 'http://127.0.0.1:47380',
            JMZ_PROJECT_ROOT: '/games/chef',
            JMZ_UI_DIR: '/opt/jmz-editor-1/ui',
            JMZ_EXIT_WITH_PARENT: '1',
          });
      });
    });

    describe('projectRootProblem', () =>
    {
      // a project, a folder with no data/System.json, and one keeping System.json outside its data folder.
      const present = new Set([
        '/games/chef',
        '/games/chef/data/System.json',
        '/games/empty',
        '/games/stray',
        '/games/stray/data',
        '/games/stray/System.json',
      ]);
      const exists = (filePath: string) => present.has(filePath);

      it('passes a folder holding data/System.json', () =>
      {
        // Arrange: the project above.

        // Act.
        const problem = rules.projectRootProblem('/games/chef', exists);

        // Assert.
        expect(problem)
          .toBeNull();
      });

      it('names what is wrong with no project, a folder that is not there, and a folder that is not a project', () =>
      {
        // Arrange: the folders above, and one that is not there.

        // Act.
        const problems = [ '', '/games/gone', '/games/empty', '/games/stray' ].map(root => rules.projectRootProblem(root, exists));

        // Assert.
        expect(problems)
          .toStrictEqual([ 'no-project', 'missing-project', 'not-a-project', 'not-a-project' ]);
      });
    });

    describe('isApiReady', () =>
    {
      it('calls the API ready on a 200 whose data says ok', () =>
      {
        // Arrange: the health check's answer.
        const answer = { status: 200, body: { path: '/api/health', data: { ok: true, projectRoot: '/games/chef', projectRootOk: true } } };

        // Act.
        const ready = rules.isApiReady(answer);

        // Assert.
        expect(ready)
          .toBe(true);
      });

      it('calls any other answer not ready', () =>
      {
        // Arrange: the same body under an error status, no body, a body that is text, no data, data saying not ok, ok
        // outside the data, and ok as text.
        const answers = [
          { status: 503, body: { data: { ok: true } } },
          { status: 200, body: null },
          { status: 200, body: 'ok' },
          { status: 200, body: { data: null } },
          { status: 200, body: { data: { ok: false } } },
          { status: 200, body: { ok: true } },
          { status: 200, body: { data: { ok: 'true' } } },
        ];

        // Act.
        const ready = answers.map(answer => rules.isApiReady(answer));

        // Assert.
        expect(ready)
          .toStrictEqual([ false, false, false, false, false, false, false ]);
      });
    });

    // what the shell knows when something stops the bundled editor, and every problem it can report.
    const FACTS = {
      projectRoot: '/games/gone',
      rootSource: 'config',
      port: 47380,
      config: '/home/maker/.config/jmz-editor/config.json',
      apiLog: '/home/maker/.local/state/jmz-editor/api.log',
      shellLog: '/home/maker/.local/state/jmz-editor/shell.log',
    };
    const PROBLEMS = [ 'no-project', 'missing-project', 'not-a-project', 'bad-config', 'port-in-use', 'api-start-failed', 'api-stopped', 'api-silent', 'crashed' ];

    describe('problemText', () =>
    {
      it('says a port is taken in plain words, how to free it, how to start afresh, and where the log is', () =>
      {
        // Arrange: the facts above.

        // Act.
        const text = rules.problemText('port-in-use', FACTS);

        // Assert.
        expect(text)
          .toBe([
            'Port 47380 is already in use by another program.',
            '',
            'Close that program, or set "port" in /home/maker/.config/jmz-editor/config.json to a free port.',
            'Then close this window and open the editor again.',
            '',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
          ].join('\n'));
      });

      it('points the fix for a folder that is not there at the config, when the config named it', () =>
      {
        // Arrange: the facts above, whose folder came from the config.

        // Act.
        const text = rules.problemText('missing-project', FACTS);

        // Assert.
        expect(text)
          .toBe([
            'The project folder isn\'t there:',
            '/games/gone',
            '',
            'Set "projectRoot" in /home/maker/.config/jmz-editor/config.json to your game\'s folder.',
            'Then close this window and open the editor again.',
            '',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
          ].join('\n'));
      });

      it('names JMZ_PROJECT_ROOT as where the folder came from, since it wins over the config, and points the fix at it', () =>
      {
        // Arrange: the folder named by the variable, which a fix made in the config would never reach.
        const facts = { ...FACTS, rootSource: 'variable' };

        // Act.
        const text = rules.problemText('missing-project', facts);

        // Assert.
        expect(text)
          .toBe([
            'The project folder isn\'t there:',
            '/games/gone',
            '',
            'This folder comes from JMZ_PROJECT_ROOT, which wins over the config.',
            'Set it to your game\'s folder, or remove it to use "projectRoot" in /home/maker/.config/jmz-editor/config.json.',
            'Then close this window and open the editor again.',
            '',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
          ].join('\n'));
      });

      it('names --project-root as where the folder came from, since it wins over the config, and points the fix at it', () =>
      {
        // Arrange: the folder named by the flag the editor was started with.
        const facts = { ...FACTS, rootSource: 'flag' };

        // Act.
        const text = rules.problemText('missing-project', facts);

        // Assert.
        expect(text)
          .toBe([
            'The project folder isn\'t there:',
            '/games/gone',
            '',
            'This folder comes from the --project-root the editor was started with, which wins over the config.',
            'Use your game\'s folder there, or leave the flag out to use "projectRoot" in /home/maker/.config/jmz-editor/config.json.',
            'Then close this window and open the editor again.',
            '',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
          ].join('\n'));
      });

      it('points the fix for a folder that is not a project at where the folder came from, as for one not there', () =>
      {
        // Arrange: a folder that is not a project, named by each of the three.
        const sources = [ 'config', 'variable', 'flag' ];

        // Act.
        const fixes = sources.map(rootSource => rules.problemText('not-a-project', { ...FACTS, rootSource })
          .split('\n')[3]);

        // Assert.
        expect(fixes)
          .toStrictEqual([
            'Set "projectRoot" in /home/maker/.config/jmz-editor/config.json to your game\'s folder.',
            'This folder comes from JMZ_PROJECT_ROOT, which wins over the config.',
            'This folder comes from the --project-root the editor was started with, which wins over the config.',
          ]);
      });

      it('says the config cannot be read, what to make it hold, how to start afresh, and where the log is', () =>
      {
        // Arrange: the facts above.

        // Act.
        const text = rules.problemText('bad-config', FACTS);

        // Assert.
        expect(text)
          .toBe([
            'The settings in /home/maker/.config/jmz-editor/config.json can\'t be read.',
            '',
            'Make it hold { "projectRoot": "/path/to/your/game" }, and "port" too when the editor needs another port:',
            'a whole number from 1 to 65535.',
            'Then close this window and open the editor again.',
            '',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
          ].join('\n'));
      });

      it('asks the person to close this window before opening the editor again wherever they have something to put right', () =>
      {
        // Arrange: every problem above: first the ones the person fixes in the config or by closing another program,
        // then the ones they cannot fix, where there is nothing to start afresh for.

        // Act.
        const asked = PROBLEMS.map(problem => rules.problemText(problem, FACTS)
          .includes('close this window and open the editor again.'));

        // Assert.
        expect(asked)
          .toStrictEqual([ true, true, true, true, true, false, false, false, false ]);
      });

      it('names the API\'s log where the API ran and could have written to it, and the shell\'s everywhere else', () =>
      {
        // Arrange: every problem above.

        // Act.
        const lastLines = PROBLEMS.map(problem => rules.problemText(problem, FACTS)
          .split('\n')
          .at(-1));

        // Assert.
        expect(lastLines)
          .toStrictEqual([
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
            'The log is at /home/maker/.local/state/jmz-editor/api.log',
            'The log is at /home/maker/.local/state/jmz-editor/api.log',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
          ]);
      });

      it('says the server could not start, apart from its stopping, and names the shell\'s log, the one holding the reason', () =>
      {
        // Arrange: the facts above, for a server that never ran, so never wrote a word to its own log.

        // Act.
        const text = rules.problemText('api-start-failed', FACTS);

        // Assert.
        expect(text)
          .toBe([
            'The editor\'s server couldn\'t start.',
            '',
            'The log is at /home/maker/.local/state/jmz-editor/shell.log',
          ].join('\n'));
      });

      it('names the folder and the config wherever the person has a project to fix', () =>
      {
        // Arrange: the problems with the project or its config.
        const problems = [ 'no-project', 'missing-project', 'not-a-project', 'bad-config' ];

        // Act.
        const named = problems.map(problem =>
        {
          const text = rules.problemText(problem, FACTS);
          return [ text.includes(FACTS.projectRoot), text.includes(FACTS.config) ];
        });

        // Assert.
        expect(named)
          .toStrictEqual([ [ false, true ], [ true, true ], [ true, true ], [ false, true ] ]);
      });
    });

    /*
     * A second launch hands itself over to the copy already running, which decides what to do with it. When a problem
     * the person can put right stopped the start, they have likely just put it right, so the start runs again; the very
     * problems whose window asks for a fresh start are the ones that run again, so the window never promises a fresh
     * start a relaunch would not give. The start runs again only once its error window is on screen to be replaced, since
     * one still opening could not be closed, and would stay up. Otherwise an error window comes forward, since it says
     * what is wrong; then the editor's window, opened again when it was closed; and before the windows can open, nothing,
     * since the first one is on its way already.
     */
    describe('relaunchAction', () =>
    {
      // nothing stopped the start, no error window is up or opening, and the windows cannot open yet.
      const STATE = { problem: '', problemsOpening: 0, problemsShown: 0, editorReady: false };

      it('runs the start again when a problem the person can put right stopped it and its window is on screen', () =>
      {
        // Arrange: a project folder that was not there, its window up.
        const state = { ...STATE, problem: 'missing-project', problemsShown: 1 };

        // Act.
        const action = rules.relaunchAction(state);

        // Assert.
        expect(action)
          .toBe('run-again');
      });

      it('runs the start again for exactly the problems whose window asks for a fresh start', () =>
      {
        // Arrange: every problem above, each with its window up.

        // Act.
        const runsAgain = PROBLEMS.map(problem => rules.relaunchAction({ ...STATE, problem, problemsShown: 1 }) === 'run-again');
        const asksForFreshStart = PROBLEMS.map(problem => rules.problemText(problem, FACTS)
          .includes('close this window and open the editor again.'));

        // Assert.
        expect([ runsAgain, asksForFreshStart ])
          .toStrictEqual([
            [ true, true, true, true, true, false, false, false, false ],
            [ true, true, true, true, true, false, false, false, false ],
          ]);
      });

      it('brings the error window forward for a problem a fresh start would not put right', () =>
      {
        // Arrange: a server that never answered, its window up.
        const state = { ...STATE, problem: 'api-silent', problemsShown: 1 };

        // Act.
        const action = rules.relaunchAction(state);

        // Assert.
        expect(action)
          .toBe('focus-problem');
      });

      it('runs nothing again while the error window is still opening, bringing forward one already up', () =>
      {
        // Arrange: a problem that runs again, its window still opening, alone and beside one already up.
        const states = [
          { ...STATE, problem: 'missing-project', problemsOpening: 1 },
          { ...STATE, problem: 'missing-project', problemsOpening: 1, problemsShown: 1 },
        ];

        // Act.
        const actions = states.map(state => rules.relaunchAction(state));

        // Assert.
        expect(actions)
          .toStrictEqual([ 'wait', 'focus-problem' ]);
      });

      it('brings an error window forward while nothing has stopped the start, as while it runs again', () =>
      {
        // Arrange: the start running again, the window it will replace still up, and the windows able to open.
        const state = { ...STATE, problemsShown: 1, editorReady: true };

        // Act.
        const action = rules.relaunchAction(state);

        // Assert.
        expect(action)
          .toBe('focus-problem');
      });

      it('opens the editor\'s window again, or brings it forward, once the windows can open', () =>
      {
        // Arrange: the editor running, no error window up.
        const state = { ...STATE, editorReady: true };

        // Act.
        const action = rules.relaunchAction(state);

        // Assert.
        expect(action)
          .toBe('open-editor');
      });

      it('does nothing before the windows can open, since the first one is on its way already', () =>
      {
        // Arrange: nothing to set up; the state above is a start still on its way.

        // Act.
        const action = rules.relaunchAction(STATE);

        // Assert.
        expect(action)
          .toBe('wait');
      });
    });
  });
});
