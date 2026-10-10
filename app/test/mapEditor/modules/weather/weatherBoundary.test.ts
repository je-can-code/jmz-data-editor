import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Weather must cost a map without any nothing, and a new game's sky is picked by nobody, so the code that draws weather,
 * its motions, its looks, its particles and its pictures, is loaded only the first time a map has weather to draw,
 * through the one import J-Weather's module makes on demand. Everything the module needs to switch on, to say which maps
 * have weather, to read the sky and to offer its picker is loaded with the editor, and none of it may reach the drawing
 * code by a static import, or every window would load, parse and build it whether any map ever had weather or not.
 *
 * So this walks every static import from the weather module, the sky's picker and its follower, and fails if any reaches
 * the drawing code; the walk is checked against the drawing code's own entry, which reaches all of it, so a walker that
 * follows nothing cannot pass.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../src');

/**
 * Where the weather's files live.
 */
const WEATHER = join(SRC, 'mapEditor', 'modules', 'weather');

/**
 * The files that draw weather, loaded only once a map has weather to draw.
 */
const DRAWING = [ 'mapWeather.ts', 'particlePipe.ts', 'weatherField.ts', 'weatherLeap.ts', 'weatherMotion.ts', 'weatherPictures.ts', 'weatherPresets.ts', 'weatherRandom.ts', 'weatherStats.ts' ]
  .map(name => join(WEATHER, name));

/**
 * Finds every static import specifier in a source file, leaving out the dynamic import() a file loads code on demand
 * with.
 */
const STATIC_IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/gu;

/**
 * Resolves a relative import specifier to a file under src, or null for a package.
 * @param {string} specifier The specifier.
 * @param {string} from The importing file.
 * @returns {string | null} The file.
 */
const resolveImport = (specifier: string, from: string): string | null =>
{
  if (specifier.startsWith('.') === false)
  {
    return null;
  }

  const base = resolve(dirname(from), specifier);
  const candidates = [ base, `${base}.ts`, `${base}.tsx` ];
  return candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
};

/**
 * Walks every static import reachable from some files.
 * @param {readonly string[]} roots Where to start.
 * @returns {Set<string>} Every file reached, the roots included.
 */
const staticallyReachable = (roots: readonly string[]): Set<string> =>
{
  const seen = new Set<string>();
  const queue = [ ...roots ];
  while (queue.length > 0)
  {
    const file = queue.pop() as string;
    if (seen.has(file) === false)
    {
      seen.add(file);
      [ ...readFileSync(file, 'utf8').matchAll(STATIC_IMPORT) ].forEach(match =>
      {
        const target = resolveImport(match[1] ?? match[2], file);
        if (target !== null)
        {
          queue.push(target);
        }
      });
    }
  }

  return seen;
};

describe('the weather\'s loading boundary', () =>
{
  it('reaches none of the drawing code by a static import from the weather module, the sky\'s picker or its follower', () =>
  {
    // Arrange: everything a window loads to switch the weather on and offer the sky.
    const roots = [ join(WEATHER, 'weatherModule.ts'), join(SRC, 'mapEditor', 'render', 'SkyChip.tsx'), join(SRC, 'mapEditor', 'render', 'skyFollower.ts') ];

    // Act.
    const reached = staticallyReachable(roots);

    // Assert: none of the drawing code, and the walk did reach the sky's own files.
    expect([ DRAWING.filter(file => reached.has(file)).map(file => relative(SRC, file)), reached.has(join(WEATHER, 'skyWeather.ts')) ])
      .toStrictEqual([ [], true ]);
  });

  it('would notice: the same walk from the drawing code\'s entry reaches every part of it', () =>
  {
    // Arrange: the drawing code's entry, which the module loads on demand.
    const entry = join(WEATHER, 'mapWeather.ts');

    // Act.
    const reached = staticallyReachable([ entry ]);

    // Assert.
    expect(DRAWING.filter(file => reached.has(file) === false).map(file => relative(SRC, file)))
      .toStrictEqual([]);
  });
});
