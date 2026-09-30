import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The map editor is its own bundle, and it never loads the data editor's board code: a slow board must never stall
 * a paint stroke, and a board's imports must never grow the map editor. A lint rule on the map editor's own files
 * is not enough, because one hop through a shared module that imports a board would break the rule invisibly
 * (the routing config does exactly that). So this walks every import, transitively, from every file under
 * src/mapEditor, and fails if any path reaches src/presentation/boards. Type-only imports count too.
 *
 * The walker is checked against a file known to reach the boards, so a walker that silently follows nothing
 * cannot pass this test.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(APP, 'src');
const BOARDS = join(SRC, 'presentation', 'boards');

/**
 * The path aliases, as vite.config.ts and tsconfig.json declare them.
 */
const ALIASES: Readonly<Record<string, string>> = {
  '@core/': 'core/',
  '@components/': 'components/',
  '@infrastructure/': 'infrastructure/',
  '@presentation/': 'presentation/',
  '@boards/': 'presentation/boards/',
  '@platform/': 'platform/',
  '@mappers/': 'mappers/',
  '@services/': 'services/',
  '@types/': 'types/',
  '@mapEditor/': 'mapEditor/',
};

/**
 * Finds every import specifier in a source file: static, re-exported, side-effect and dynamic.
 */
const IMPORT_PATTERN = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gu;

/**
 * Lists every source file under a folder.
 * @param {string} folder The folder.
 * @returns {string[]} Absolute paths.
 */
const sourceFiles = (folder: string): string[] =>
{
  return readdirSync(folder).flatMap(name =>
  {
    const full = join(folder, name);
    if (statSync(full).isDirectory())
    {
      return sourceFiles(full);
    }

    return /\.(ts|tsx)$/u.test(name) ? [ full ] : [];
  });
};

/**
 * Resolves an import specifier to a file under src, or null for a package.
 * @param {string} specifier The specifier.
 * @param {string} from The importing file.
 * @returns {string | null} The file.
 */
const resolveImport = (specifier: string, from: string): string | null =>
{
  const alias = Object.keys(ALIASES).find(prefix => specifier.startsWith(prefix));
  let base: string;
  if (alias !== undefined)
  {
    base = join(SRC, ALIASES[alias], specifier.slice(alias.length));
  }
  else if (specifier.startsWith('.'))
  {
    base = resolve(dirname(from), specifier);
  }
  else
  {
    return null;
  }

  const candidates = [ base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx') ];
  return candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
};

/**
 * Walks every import reachable from some files.
 * @param {readonly string[]} roots Where to start.
 * @returns {Set<string>} Every file reached, the roots included.
 */
const reachable = (roots: readonly string[]): Set<string> =>
{
  const seen = new Set<string>();
  const queue = [ ...roots ];
  while (queue.length > 0)
  {
    const file = queue.pop() as string;
    if (seen.has(file))
    {
      continue;
    }

    seen.add(file);
    const text = readFileSync(file, 'utf8');
    [ ...text.matchAll(IMPORT_PATTERN) ].forEach(match =>
    {
      const specifier = match[1] ?? match[2] ?? match[3];
      const target = resolveImport(specifier, file);
      if (target !== null)
      {
        queue.push(target);
      }
    });
  }

  return seen;
};

describe('map editor boundaries', () =>
{
  it('reaches nothing under presentation/boards from any map editor file', () =>
  {
    // Arrange.
    const roots = sourceFiles(join(SRC, 'mapEditor'));

    // Act.
    const reached = [ ...reachable(roots) ];
    const intoBoards = reached.filter(file => file.startsWith(BOARDS)).map(file => relative(SRC, file));

    // Assert: nothing in the boards, and the walk did leave the map editor's own folder.
    expect(intoBoards)
      .toStrictEqual([]);
    expect(reached.some(file => file.endsWith(join('messaging', 'MessageChannelLike.ts'))))
      .toBe(true);
  });

  it('would notice: the same walk from the routing config reaches the boards', () =>
  {
    // Arrange: the data editor's routing, which imports every board.
    const routing = join(SRC, 'platform', 'compositionRoot', 'routing.config.tsx');

    // Act.
    const reached = [ ...reachable([ routing ]) ];

    // Assert.
    expect(reached.some(file => file.startsWith(BOARDS)))
      .toBe(true);
  });
});
