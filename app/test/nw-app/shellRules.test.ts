import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import DatabaseFilenames from '../../src/core/enums/DatabaseFilenames.ts';
import { CLIPBOARD_FORMAT as COMMAND_CLIPBOARD_FORMAT } from '../../src/mapEditor/core/commandList/commandClipboard.ts';
import { EVENT_CLIPBOARD_MARKER } from '../../src/mapEditor/core/events/eventClipboard.ts';
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
    const EVENTS = JSON.stringify({ marker: 'jmz-map-editor/events', version: 1, mapId: 3, events: [] });

    it('answers on the reply channel the page named, with the clipboard\'s text when it carries the marker asked for', () =>
    {
      // Arrange.
      const request = { type: 'clipboard-read', marker: 'jmz-map-editor/events', replyTo: REPLY };

      // Act.
      const answer = rules.clipboardAnswer(request, () => EVENTS);

      // Assert.
      expect(answer)
        .toStrictEqual({ channel: REPLY, message: { type: 'clipboard-text', text: EVENTS } });
    });

    it('answers with nothing when the clipboard holds anything else, or the page asks for a kind the shell never reads', () =>
    {
      // Arrange: plain text, a list, the marker under another field, another program's JSON, and a kind not read.
      const clipboards = [
        'hunter2',
        JSON.stringify([ 'jmz-map-editor/events' ]),
        JSON.stringify({ format: 'jmz-map-editor/events' }),
        JSON.stringify({ marker: 'something-else/events' }),
        '{"marker":"jmz-map-editor/events"',
      ];
      const kindsNotRead = [ '__proto__', 'jmz-map-editor/secrets' ];

      // Act.
      const texts = [
        ...clipboards.map(text => rules.clipboardAnswer({ marker: 'jmz-map-editor/events', replyTo: REPLY }, () => text)),
        ...kindsNotRead.map(marker => rules.clipboardAnswer({ marker, replyTo: REPLY }, () => EVENTS)),
      ].map(answer => answer?.message.text);

      // Assert.
      expect(texts)
        .toStrictEqual([ '', '', '', '', '', '', '' ]);
    });

    it('gives no answer, and never reads the clipboard, for a read naming no proper reply channel', () =>
    {
      // Arrange: none, the shell channel itself, a guessable name, a name with more after the UUID, and not a name.
      const replies: unknown[] = [ undefined, 'jmz-shell', 'jmz-clipboard-1', `${REPLY}-x`, 42 ];
      let reads = 0;

      // Act.
      const answers = replies.map(replyTo => rules.clipboardAnswer({ marker: 'jmz-map-editor/events', replyTo }, () =>
      {
        reads += 1;
        return EVENTS;
      }));

      // Assert.
      expect([ answers, reads ])
        .toStrictEqual([ [ null, null, null, null, null ], 0 ]);
    });

    it('reads each of the editors\' own clipboards only for a page asking for that one', () =>
    {
      // Arrange: commands and rows as the editors write them.
      const commands = JSON.stringify({ format: COMMAND_CLIPBOARD_FORMAT, version: 1, commands: [] });
      const rows = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 9, name: 'Potion' } ]);
      const ask = (marker: string, text: string) => rules.clipboardAnswer({ marker, replyTo: REPLY }, () => text)?.message.text;

      // Act.
      const answers = [
        ask(COMMAND_CLIPBOARD_FORMAT, commands),
        ask(ROW_CLIPBOARD_FORMAT, rows),
        ask(EVENT_CLIPBOARD_MARKER, commands),
        ask(COMMAND_CLIPBOARD_FORMAT, rows),
        ask(ROW_CLIPBOARD_FORMAT, EVENTS),
      ];

      // Assert.
      expect(answers)
        .toStrictEqual([ commands, rows, '', '', '' ]);
    });

    it('reads exactly the clipboards the editors write, each by the field its marker sits in', () =>
    {
      // Arrange: nothing to set up; the kinds are the shell's own.

      // Act.
      const kinds = rules.CLIPBOARD_KINDS;

      // Assert.
      expect(kinds)
        .toStrictEqual({ [EVENT_CLIPBOARD_MARKER]: 'marker', [COMMAND_CLIPBOARD_FORMAT]: 'format', [ROW_CLIPBOARD_FORMAT]: 'format' });
    });
  });
});
