import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

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
});
