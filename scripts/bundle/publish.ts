/**
 * Publishing a build: copying its files into the builds folder the laptop's installer reads over the share. The laptop
 * may be reading that folder at any moment, so nothing there is ever left half written.
 */
import { cpSync, mkdirSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Copies files into a builds folder in the order given, each under a temporary name first and then renamed into place,
 * so nothing reading the folder finds one half copied, and a file replacing an older one replaces it whole. Files
 * already there under other names are left alone.
 * @param {string[]} files The files, in the order they land.
 * @param {string} folder The builds folder, made when missing.
 * @returns {string[]} Where each file landed, in the same order.
 */
const publishFiles = (files: string[], folder: string): string[] =>
{
  mkdirSync(folder, { recursive: true });
  return files.map(file =>
  {
    const destination = join(folder, basename(file));
    const landing = `${destination}.next`;
    cpSync(file, landing);
    renameSync(landing, destination);
    return destination;
  });
};

export { publishFiles };
