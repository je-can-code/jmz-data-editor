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
  bootPath(argv: string[]): string;
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
      const paths = [ rules.bootPath(ARGV), rules.bootPath([ '--attach' ]), rules.bootPath([ '--mapsx' ]) ];

      // Assert.
      expect([ paths, rules.hasFlag(ARGV, '--attach') ])
        .toStrictEqual([ [ '/map.html', '/', '/' ], true ]);
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
   * launched at all, and the answer goes only to a reply channel the asking page opened under a random name.
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
  });
});
