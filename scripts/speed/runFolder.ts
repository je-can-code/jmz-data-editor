/**
 * A folder of one run's own for the speed script and the parity check: the builds, the project mirror, the game copy
 * and the pictures of one run live in it and nowhere else. Two runs started at once therefore never share a build or
 * a mirror, and neither can clear away what the other is still using.
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Makes a fresh, empty folder for one run inside a base folder, named by a prefix and a random suffix.
 * @param {string} base The folder to make it in, created when missing.
 * @param {string} prefix The start of its name, such as jmz-speed-.
 * @returns {string} The new folder.
 */
const createRunFolder = (base: string, prefix: string): string =>
{
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
};

export { createRunFolder };
