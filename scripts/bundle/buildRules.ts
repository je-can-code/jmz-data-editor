/**
 * The bundle build's decisions, kept apart from build.ts so they can be read and tested without building anything:
 * which arguments it takes, which NW.js it will ship, what a build is called, and what it writes beside the code.
 */

/**
 * The NW.js every bundle ships: the runtime Chef Adventure is tested on, in the SDK flavor, which keeps DevTools for
 * playtests. Moving to another one is a decision of its own, so the build refuses any other.
 */
const PINNED_NWJS = { version: '0.118.0', flavor: 'sdk' } as const;

/**
 * The port a bundle serves its pages and its API on unless the person's config names another. It is fixed, since
 * everything the pages save belongs to their origin, and it is neither the dev stack's 3000 nor its 8080, so a bundle
 * runs beside a dev stack.
 */
const BUNDLE_PORT = 47380;

/**
 * The name the bundled editor runs under. NW.js keys an app's profile on it, so a bundle never hands its launch over to
 * a dev shell running at the same time under the dev shell's own name.
 */
const BUNDLE_NAME = 'jmz-editor';

/**
 * Where publish puts a build unless told otherwise: the builds folder beside the editor's checkout, which the laptop
 * sees over the share.
 */
const DEFAULT_PUBLISH_DIR = '/mnt/exdrive/dev/jmz-builds';

/**
 * What one target needs: the system and processor Go builds the API for, and the Chromium switches the editor starts
 * with. The shell opens its windows itself, so popups stay unblocked everywhere; the ANGLE backend is the desktop's,
 * which the laptop's dry run either keeps or changes here.
 */
type Target = {
  readonly goos: string;
  readonly goarch: string;
  readonly chromiumArgs: string;
};

/**
 * The targets a bundle can be built for, by the name their tarballs carry.
 */
const TARGETS: Readonly<Record<string, Target>> = {
  'linux-x64': {
    goos: 'linux',
    goarch: 'amd64',
    chromiumArgs: '--disable-popup-blocking --use-angle=vulkan',
  },
};

/**
 * What the build was asked to do: which NW.js to ship, or null for the one behind nw on the PATH, and whether, and
 * where, to publish the result.
 */
type BuildOptions = {
  readonly nwjs: string | null;
  readonly publish: boolean;
  readonly publishDir: string;
};

/**
 * The line a build of NW.js sets its version with, inside lib/libnw.so; the version follows it, up to the next quote.
 */
const NWJS_VERSION_MARKER = 'process.versions[\'nw\'] = \'';

/**
 * Reads the value of a flag that takes one, in either form the build accepts: --name value or --name=value.
 * @param {string[]} argv The arguments.
 * @param {number} index Where the flag is.
 * @param {string} name The flag, dashes included.
 * @returns {{ value: string, next: number }} The value, and where the next argument starts.
 */
const flagValue = (argv: string[], index: number, name: string): { value: string; next: number } =>
{
  const argument = argv[index];
  const joined = argument.startsWith(`${name}=`);
  const value = joined ? argument.slice(name.length + 1) : argv[index + 1] ?? '';

  // a missing value, or another flag where the value should be, is a mistake rather than an empty folder.
  if (value.trim() === '' || (joined === false && value.startsWith('--')))
  {
    throw new Error(`${name} needs a folder after it.`);
  }

  return { value: value.trim(), next: joined ? index + 1 : index + 2 };
};

/**
 * Reads the build's arguments: --nwjs <folder>, --publish and --publish-dir <folder>. Anything else is refused, so a
 * mistyped flag never quietly builds something other than what was asked for, and so is a publish folder given without
 * --publish, which would otherwise look published and not be.
 * @param {string[]} argv The arguments after the script's name.
 * @returns {BuildOptions} What the build was asked to do.
 */
const parseBuildArguments = (argv: string[]): BuildOptions =>
{
  let nwjs: string | null = null;
  let publish = false;
  let publishDir: string | null = null;

  let index = 0;
  while (index < argv.length)
  {
    const argument = argv[index];
    if (argument === '--publish')
    {
      publish = true;
      index += 1;
      continue;
    }

    if (argument === '--nwjs' || argument.startsWith('--nwjs='))
    {
      const { value, next } = flagValue(argv, index, '--nwjs');
      nwjs = value;
      index = next;
      continue;
    }

    if (argument === '--publish-dir' || argument.startsWith('--publish-dir='))
    {
      const { value, next } = flagValue(argv, index, '--publish-dir');
      publishDir = value;
      index = next;
      continue;
    }

    const usage = 'The build takes --nwjs <folder>, --publish and --publish-dir <folder>.';
    throw new Error(`Unknown argument: ${argument}. ${usage}`);
  }

  if (publishDir !== null && publish === false)
  {
    throw new Error('--publish-dir only means something with --publish.');
  }

  return { nwjs, publish, publishDir: publishDir ?? DEFAULT_PUBLISH_DIR };
};

/**
 * Reads the NW.js version a build of it carries, from the line its libnw.so sets process.versions.nw with.
 * @param {Buffer} library The contents of lib/libnw.so.
 * @returns {string} The version, such as 0.118.0, or an empty string when the file carries none.
 */
const nwjsVersionIn = (library: Buffer): string =>
{
  const start = library.indexOf(NWJS_VERSION_MARKER);
  if (start < 0)
  {
    return '';
  }

  // the version runs to the next quote, and is only ever a few numbers and dots.
  const from = start + NWJS_VERSION_MARKER.length;
  const end = library.indexOf('\'', from);
  const version = end < 0 ? '' : library.toString('latin1', from, end);
  return /^\d+\.\d+\.\d+$/.test(version) ? version : '';
};

/**
 * Says why an NW.js folder is not the one the bundle ships, or nothing when it is. The version comes from its libnw.so,
 * and the flavor from what sits beside the binary: the SDK flavor alone ships nwjc and chromedriver.
 * @param {string} version The version its libnw.so carries, or an empty string for none.
 * @param {string[]} names The names in the folder.
 * @returns {string | null} Why it is refused, or null when it is the pinned NW.js.
 */
const nwjsProblem = (version: string, names: string[]): string | null =>
{
  const pinned = `NW.js ${PINNED_NWJS.version} (${PINNED_NWJS.flavor.toUpperCase()})`;
  if (names.includes('nw') === false || version === '')
  {
    const needs = 'it needs an nw binary and a version in lib/libnw.so';
    return `it is not a build of NW.js: ${needs}. The bundle ships ${pinned}.`;
  }

  if (version !== PINNED_NWJS.version)
  {
    return `it is NW.js ${version}, and the bundle ships ${pinned}.`;
  }

  if (names.includes('nwjc') === false || names.includes('chromedriver') === false)
  {
    return `it is the normal flavor of NW.js ${version}, and the bundle ships the SDK flavor, which keeps DevTools.`;
  }

  return null;
};

/**
 * Names a build: its UTC date and time to the minute, then the commit it was built from, then -dirty when the tree held
 * changes not committed, since such a build is not exactly that commit.
 * @param {Date} builtAt When the build started.
 * @param {string} shortCommit The commit's short hash.
 * @param {boolean} dirty Whether the tree held changes not committed.
 * @returns {string} The version, such as 20261118.2015-925c73f.
 */
const bundleVersion = (builtAt: Date, shortCommit: string, dirty: boolean): string =>
{
  const pad = (value: number) => String(value)
    .padStart(2, '0');
  const day = `${builtAt.getUTCFullYear()}${pad(builtAt.getUTCMonth() + 1)}${pad(builtAt.getUTCDate())}`;
  const time = `${pad(builtAt.getUTCHours())}${pad(builtAt.getUTCMinutes())}`;
  return `${day}.${time}-${shortCommit}${dirty ? '-dirty' : ''}`;
};

/**
 * Builds the bundle's own NW.js manifest out of the dev shell's: the same window and entry point, under the bundle's
 * name, so it gets a profile of its own, and with the target's Chromium switches.
 * @param {Record<string, unknown>} source The dev shell's manifest.
 * @param {Target} target The target.
 * @returns {Record<string, unknown>} The bundle's manifest.
 */
const editorManifest = (source: Record<string, unknown>, target: Target): Record<string, unknown> =>
{
  return { ...source, name: BUNDLE_NAME, 'chromium-args': target.chromiumArgs };
};

/**
 * Builds bundle.json, which tells the shell it runs from a bundle and names what the bundle is: its version, the commit
 * it came from and whether the tree was clean, when it was built, the NW.js inside it, and its default port.
 * @param {string} version The build's version.
 * @param {string} commit The commit's full hash.
 * @param {boolean} dirty Whether the tree held changes not committed.
 * @param {Date} builtAt When the build started.
 * @returns {Record<string, unknown>} The manifest.
 */
const bundleManifest = (version: string, commit: string, dirty: boolean, builtAt: Date): Record<string, unknown> =>
{
  return {
    version,
    commit,
    dirty,
    builtAt: builtAt.toISOString(),
    nwjs: `${PINNED_NWJS.version}-${PINNED_NWJS.flavor}`,
    port: BUNDLE_PORT,
  };
};

/**
 * The script that starts a bundle: the bundle's own NW.js, on the bundle's editor folder, passing its arguments on.
 * It finds the bundle through any link to it, and names the editor folder outright rather than leaning on NW.js to find
 * one beside its binary.
 */
const LAUNCHER = [
  '#!/bin/sh',
  '# Starts the editor on the NW.js inside this bundle, wherever this script is linked from.',
  'HERE="$(dirname "$(readlink -f "$0")")"',
  'exec "$HERE/nwjs/nw" "$HERE/editor" "$@"',
  '',
].join('\n');

/**
 * Names the folder a build is laid out in, which is also the one folder inside its tarball.
 * @param {string} version The build's version.
 * @returns {string} The folder's name.
 */
const bundleFolderName = (version: string): string =>
{
  return `${BUNDLE_NAME}-${version}`;
};

/**
 * Names a build's tarball by the target it runs on and its version.
 * @param {string} target The target, such as linux-x64.
 * @param {string} version The build's version.
 * @returns {string} The tarball's file name.
 */
const tarballName = (target: string, version: string): string =>
{
  return `${BUNDLE_NAME}-${target}-${version}.tar.gz`;
};

/**
 * One target's entry in versions.json: the newest build's version, its tarball, and the tarball's SHA-256.
 */
type VersionEntry = {
  readonly version: string;
  readonly file: string;
  readonly sha256: string;
};

/**
 * Builds versions.json, which the installer reads to learn which tarball is the newest build for its machine and how
 * to check it arrived whole.
 * @param {string} target The target, such as linux-x64.
 * @param {string} version The build's version.
 * @param {string} file The tarball's file name.
 * @param {string} sha256 The tarball's SHA-256, in hex.
 * @returns {Record<string, VersionEntry>} The file's contents.
 */
const versionsFile = (target: string, version: string, file: string, sha256: string): Record<string, VersionEntry> =>
{
  return { [target]: { version, file, sha256 } };
};

export {
  BUNDLE_NAME,
  BUNDLE_PORT,
  bundleFolderName,
  bundleManifest,
  bundleVersion,
  DEFAULT_PUBLISH_DIR,
  editorManifest,
  LAUNCHER,
  nwjsProblem,
  nwjsVersionIn,
  parseBuildArguments,
  PINNED_NWJS,
  tarballName,
  TARGETS,
  versionsFile,
};
export type { BuildOptions, Target, VersionEntry };
