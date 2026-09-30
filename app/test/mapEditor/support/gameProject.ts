import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Chef Adventure, when it sits beside this repository in the workspace; the Go round-trip tests look in the
 * same place. Resolved from this file rather than the working directory, so it holds wherever vitest runs.
 */
const SIBLING_PROJECT = fileURLToPath(new URL('../../../../../ca/chef-adventure', import.meta.url));

/**
 * Reports whether a folder holds an RMMZ project.
 * @param {string} root The candidate root.
 * @returns {boolean} True when it has a map tree.
 */
const isProject = (root: string): boolean =>
{
  return existsSync(`${root}/data/MapInfos.json`);
};

/**
 * Finds a real RMMZ project for the tests that read shipped files.
 *
 * {@code JMZ_PROJECT_ROOT} comes first: it is the variable the server reads, and the only way a worktree, where
 * the sibling path resolves to nothing, can reach the game. When it is set it must be right; a mistyped path
 * throws rather than quietly skipping the very tests it was set to run. Unset, the sibling checkout is used,
 * and the tests skip when that is absent too, since the game is not part of this repository.
 * @returns {string | null} The project root, or null when none is configured or beside the repository.
 */
const locateGameProject = (): string | null =>
{
  const configured = process.env['JMZ_PROJECT_ROOT'] ?? '';
  if (configured !== '')
  {
    if (isProject(configured) === false)
    {
      throw new Error(`JMZ_PROJECT_ROOT is set to ${configured}, which holds no RMMZ project`);
    }

    return configured;
  }

  return isProject(SIBLING_PROJECT)
    ? SIBLING_PROJECT
    : null;
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
