import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Chef Adventure, when it sits beside this repository in the workspace; the Go round-trip tests look in the
 * same place. Resolved from this file rather than the working directory, so it holds wherever vitest runs.
 */
const SIBLING_PROJECT = fileURLToPath(new URL('../../../../../ca/chef-adventure', import.meta.url));

/**
 * Finds a real RMMZ project for the tests that read shipped files: {@code JMZ_PROJECT_ROOT} first (the variable
 * the server reads, which also lets a worktree point at the checkout), then the sibling checkout. Those tests
 * skip when neither exists, since the project is not part of this repository.
 * @returns {string | null} The project root, or null when no project is present.
 */
const locateGameProject = (): string | null =>
{
  const candidates = [ process.env['JMZ_PROJECT_ROOT'] ?? '', SIBLING_PROJECT ];
  const found = candidates.find(candidate => candidate !== '' && existsSync(`${candidate}/data/MapInfos.json`));
  return found ?? null;
};

/**
 * Lists every map file in a project's data folder, in id order.
 * @param {string} projectRoot The project root.
 * @returns {string[]} File names like {@code Map001.json}.
 */
const listMapFiles = (projectRoot: string): string[] =>
{
  return readdirSync(`${projectRoot}/data`)
    .filter(name => /^Map\d{3,}\.json$/u.test(name))
    .sort();
};

/**
 * Reads and parses one file from a project's data folder.
 * @param {string} projectRoot The project root.
 * @param {string} name The file name inside {@code data/}.
 * @returns {unknown} The parsed JSON.
 */
const readDataFile = (projectRoot: string, name: string): unknown =>
{
  return JSON.parse(readFileSync(`${projectRoot}/data/${name}`, 'utf8'));
};

export { listMapFiles, locateGameProject, readDataFile };
