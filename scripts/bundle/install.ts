/**
 * Installs the editor bundle the desktop published, so this machine runs the same build with no Bun project, Go or
 * dev server of its own. Run it by hand, from the builds folder, through Bun:
 *
 *   bun /mnt/j-desktop/dev/jmz-builds/install.ts
 *
 * It runs from the builds folder rather than from a checkout because publishing copies it there beside the tarball and
 * the versions.json it reads, so the three always match, and it finds them beside itself. The share mounts with every
 * execute bit off, so nothing runs from it: the tarball is copied to a local temporary folder and checked against its
 * SHA-256 there, and every mode comes from the archive.
 *
 * A new build is tried before anything switches to it. Its API has to report the version versions.json names, and
 * NW.js and every library beside it have to find what they load on this machine. A build that fails either is refused
 * by name and changes nothing. One that passes becomes ~/.local/jmz-editor/current, the build it replaced is kept as
 * previous, older ones are removed, and the app menu gets an entry that starts it with no terminal. A build something
 * is still running from, such as an editor opened before the install or a rollback started through previous, is never
 * removed or replaced: it stays until an install finds it closed. Running it again with nothing new to install says so,
 * puts back the menu entry and the command line link if either one has gone, and stops.
 *
 * Only Bun and Node built-ins are used, nothing from the repo or node_modules, since this file runs far from both.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The machine this installer installs for, as versions.json names it.
 */
const PLATFORM = 'linux-x64';

/**
 * The file beside this one that names the build to install.
 */
const VERSIONS_FILE = 'versions.json';

/**
 * Where builds live, under the home folder: one folder per version, beside the links naming the current and previous
 * ones.
 */
const INSTALL_FOLDER = '.local/jmz-editor';

/**
 * The link naming the build in use.
 */
const CURRENT_LINK = 'current';

/**
 * The link naming the build the current one replaced, kept for going back.
 */
const PREVIOUS_LINK = 'previous';

/**
 * The start of the name of the folder a build is unpacked into to be tried. It sits inside the install folder, so
 * moving a build into place is a rename and never a copy.
 */
const INCOMING_PREFIX = '.incoming-';

/**
 * The start of the name of the one folder a bundle's tarball holds, which ends in the build's version.
 */
const BUNDLE_FOLDER_PREFIX = 'jmz-editor-';

/**
 * The bundle's launcher inside each build, and the name of the command line link to it.
 */
const LAUNCHER = 'jmz-editor';

/**
 * The bundle's API inside each build.
 */
const API = 'server/jmz-api';

/**
 * NW.js inside each build.
 */
const NWJS = 'nwjs/nw';

/**
 * The folder of libraries NW.js loads, inside each build.
 */
const NWJS_LIBRARIES = 'nwjs/lib';

/**
 * The icon the app menu shows, inside each build: the UI's favicon, the only icon the editor has.
 */
const ICON = 'ui/favicon.ico';

/**
 * Where the command line link goes, under the home folder.
 */
const BIN_FOLDER = '.local/bin';

/**
 * Where the app menu entry goes, under the home folder.
 */
const DESKTOP_FILE = '.local/share/applications/jmz-editor.desktop';

/**
 * How long the API gets to answer -version before its build is refused, so a build that hangs cannot hang the install.
 */
const VERSION_TIMEOUT_MS = 10_000;

/**
 * The folder Linux describes every running process in, one folder per process id.
 */
const PROC = '/proc';

/**
 * What a process's folder in /proc is named: its id, and nothing else.
 */
const PROCESS_ID = /^\d+$/u;

/**
 * What a version and a tarball's name may look like: a plain file name, never a hidden one or a path, since a version
 * names a build's folder and the tarball is looked for beside this file.
 */
const PLAIN_NAME = /^[0-9A-Za-z][0-9A-Za-z._-]*$/u;

/**
 * What a SHA-256 looks like in versions.json: lowercase hex, as the bundle build writes it.
 */
const SHA256_HEX = /^[0-9a-f]{64}$/u;

/**
 * Characters a path can hold and still go into a menu entry's Exec line as it is.
 */
const PLAIN_EXEC_PATH = /^[0-9A-Za-z/._+-]+$/u;

/**
 * The build versions.json names for this machine.
 */
type PublishedBuild = {
  /**
   * The build's version, which also names its folder once it is installed.
   */
  readonly version: string;

  /**
   * The tarball's file name, in the builds folder beside versions.json.
   */
  readonly file: string;

  /**
   * The tarball's SHA-256, in lowercase hex.
   */
  readonly sha256: string;
};

/**
 * Where an install puts things, all under one home folder.
 */
type InstallPlaces = {
  /**
   * The folder holding every build and the links naming the current and previous ones.
   */
  readonly root: string;

  /**
   * The command line link to the current build's launcher.
   */
  readonly binLink: string;

  /**
   * The app menu entry.
   */
  readonly desktopFile: string;
};

/**
 * A build that has been unpacked and tried, waiting to be switched to.
 */
type StagedBuild = {
  /**
   * The build's own folder.
   */
  readonly folder: string;

  /**
   * The folder it was unpacked into, inside the install folder.
   */
  readonly incoming: string;
};

/**
 * One thing in the install folder, as pruning sees it.
 */
type InstallEntry = {
  /**
   * Its name inside the install folder.
   */
  readonly name: string;

  /**
   * True for a real folder; false for a link or a file, which pruning never touches.
   */
  readonly isFolder: boolean;
};

/**
 * What is running on this machine, as /proc tells it.
 */
type RunningPrograms = {
  /**
   * False when /proc could not be read at all, so nothing can be shown not to be running.
   */
  readonly readable: boolean;

  /**
   * The executable of every running program /proc would name, each by the real path the system keeps for it.
   */
  readonly executables: string[];
};

/**
 * A build this machine will not switch to. Its message says why in plain words, and nothing has changed by the time
 * one is thrown.
 */
class Refusal extends Error
{
}

/**
 * Reports whether a value is a plain object, so its fields can be read.
 * @param {unknown} value Anything parsed from JSON.
 * @returns {boolean} True for an object that is not an array.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
{
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
};

/**
 * Reports whether a version can name a build's folder: a plain name that is neither hidden nor either link's.
 * @param {unknown} version The version, as versions.json gives it.
 * @returns {boolean} True when it can.
 */
const isFolderName = (version: unknown): version is string =>
{
  return typeof version === 'string'
    && PLAIN_NAME.test(version)
    && [ CURRENT_LINK, PREVIOUS_LINK ].includes(version) === false;
};

/**
 * Reads the build versions.json names for this machine, refusing anything it could not install exactly: a version
 * that could not name a folder of its own, a tarball named by anything but a plain file name, or a digest that is not
 * a SHA-256.
 * @param {string} text The content of versions.json.
 * @returns {PublishedBuild} The build to install.
 */
const readPublishedBuild = (text: string): PublishedBuild =>
{
  let parsed: unknown;
  try
  {
    parsed = JSON.parse(text);
  }
  catch
  {
    throw new Refusal(`${VERSIONS_FILE} is not JSON.`);
  }

  const build = isRecord(parsed)
    ? parsed[PLATFORM]
    : undefined;
  if (isRecord(build) === false)
  {
    throw new Refusal(`${VERSIONS_FILE} names no build for ${PLATFORM}.`);
  }

  const { version, file, sha256 } = build;
  if (isFolderName(version) === false)
  {
    throw new Refusal(`${VERSIONS_FILE} names a version no folder can be named after: ${JSON.stringify(version)}.`);
  }
  if (typeof file !== 'string' || PLAIN_NAME.test(file) === false)
  {
    throw new Refusal(`${VERSIONS_FILE} names a tarball that is not a file beside it: ${JSON.stringify(file)}.`);
  }
  if (typeof sha256 !== 'string' || SHA256_HEX.test(sha256) === false)
  {
    throw new Refusal(`${VERSIONS_FILE} gives a SHA-256 that is not one: ${JSON.stringify(sha256)}.`);
  }

  return { version, file, sha256 };
};

/**
 * Picks out what ldd could not find. A library that is missing reads "=> not found", and one that is too old reads
 * "version `GLIBC_2.45' not found"; either way the line ends the same, and either way the build cannot start.
 * @param {string} report What ldd printed for one file.
 * @returns {string[]} One line per missing library, empty when everything was found.
 */
const missingLibraries = (report: string): string[] =>
{
  return report.split('\n')
    .filter(line => line.includes('not found'))
    .map(line => line.trim());
};

/**
 * Reports whether a file beside NW.js is a shared library, versioned names such as libvulkan.so.1 included, and so
 * whether ldd should look it over.
 * @param {string} name The file's name.
 * @returns {boolean} True for a shared library.
 */
const isSharedLibrary = (name: string): boolean =>
{
  return /\.so(\.\d+)*$/u.test(name);
};

/**
 * Writes a path the way a menu entry's Exec line needs it: as it is when it holds nothing the menu would read as
 * anything else, otherwise quoted and escaped as the desktop entry spec asks, so a space cannot split it in two.
 * @param {string} path An absolute path.
 * @returns {string} The path as the Exec line holds it.
 */
const desktopExecPath = (path: string): string =>
{
  if (PLAIN_EXEC_PATH.test(path))
  {
    return path;
  }

  // a backslash is escaped once for the quoting and once more for the file; a percent sign would start a field code.
  const escaped = path.replace(/\\/gu, '\\\\\\\\')
    .replace(/["`$]/gu, character => `\\\\${character}`)
    .replace(/%/gu, '%%');
  return `"${escaped}"`;
};

/**
 * Builds the app menu entry. The editor starts by an absolute path, because the laptop's PATH lacks ~/.local/bin, and
 * with no terminal, since a desktop launch has nowhere to show one.
 * @param {string} launcher The absolute path of the command line link to the current build's launcher.
 * @param {string} icon The absolute path of the icon, through the current link so every later build brings its own.
 * @returns {string} The entry, as the .desktop file holds it.
 */
const desktopEntry = (launcher: string, icon: string): string =>
{
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=JMZ Editor',
    'Comment=Edit and playtest an RPG Maker MZ project',
    `Exec=${desktopExecPath(launcher)}`,
    `Icon=${icon}`,
    'Terminal=false',
    'Categories=Development;',
    '',
  ].join('\n');
};

/**
 * Names the folders in the install folder that something is running from. The editor's NW.js, its API and a playtest
 * each run from inside the build that holds them, so a build with any of them running is in use, whichever link it was
 * started through. A folder is matched by its whole name, never by how a path starts, since one version's name can
 * begin another's, as 20261119.0100-abc1234 begins 20261119.0100-abc1234-dirty. When /proc could not be read, every
 * folder counts as in use, since none can be shown free.
 * @param {string} root The install folder's real path, since /proc names every executable by its real path.
 * @param {InstallEntry[]} entries Everything in the install folder.
 * @param {RunningPrograms} running What is running.
 * @returns {string[]} The names of the folders in use.
 */
const foldersInUse = (root: string, entries: InstallEntry[], running: RunningPrograms): string[] =>
{
  // an executable's path inside the install folder starts with the folder it runs from, while the path of one outside
  // it starts by climbing out, which no folder in it is named.
  const runFrom = running.executables.map(executable => relative(root, executable))
    .map(path => path.split(sep)[0]);

  return entries.filter(entry => entry.isFolder && (running.readable === false || runFrom.includes(entry.name)))
    .map(entry => entry.name);
};

/**
 * Names what to remove from the install folder once a build has been switched to: every build folder but the current
 * and previous ones, and every folder a run that stopped part-way left behind, unless something is running from it.
 * Links are never removed, so neither current nor previous can ever be.
 * @param {InstallEntry[]} entries Everything in the install folder.
 * @param {string[]} kept The builds to keep: the current one, and the previous one when there is one.
 * @param {string[]} inUse The folders something is running from, as foldersInUse names them.
 * @returns {string[]} The names to remove.
 */
const prunable = (entries: InstallEntry[], kept: string[], inUse: string[]): string[] =>
{
  return entries.filter(entry => entry.isFolder
    && kept.includes(entry.name) === false
    && inUse.includes(entry.name) === false)
    .map(entry => entry.name);
};

/**
 * Works out where an install goes for one home folder.
 * @param {string} home The home folder, absolute.
 * @returns {InstallPlaces} The places.
 */
const placesIn = (home: string): InstallPlaces =>
{
  return {
    root: join(home, INSTALL_FOLDER),
    binLink: join(home, BIN_FOLDER, LAUNCHER),
    desktopFile: join(home, DESKTOP_FILE),
  };
};

/**
 * Reads which build a link names.
 * @param {string} root The install folder.
 * @param {string} link The link's name: current or previous.
 * @returns {string} The build's version, or empty when the link is missing or names a build that is gone.
 */
const linkedVersion = (root: string, link: string): string =>
{
  // existsSync follows the link, so a link to a folder that is gone counts as no link.
  const path = join(root, link);
  return existsSync(path)
    ? basename(readlinkSync(path))
    : '';
};

/**
 * Lists everything in the install folder, as pruning and the in-use rule see it.
 * @param {string} root The install folder.
 * @returns {InstallEntry[]} Each thing in it.
 */
const entriesIn = (root: string): InstallEntry[] =>
{
  return readdirSync(root, { withFileTypes: true })
    .map(entry => ({ name: entry.name, isFolder: entry.isDirectory() }));
};

/**
 * Reads one process's executable from /proc.
 * @param {string} id The process's id.
 * @returns {string[]} The executable's real path, or nothing for a process that has ended since it was listed, that
 * is part of the kernel, or that belongs to another user. The editor and everything it starts run as the same user as
 * the installer, so none of those can be one of them.
 */
const executableOf = (id: string): string[] =>
{
  try
  {
    return [ readlinkSync(join(PROC, id, 'exe')) ];
  }
  catch
  {
    return [];
  }
};

/**
 * Reads what is running from /proc: the executable of every process, which is how a build folder is known to be in
 * use.
 * @returns {RunningPrograms} What is running.
 */
const runningPrograms = (): RunningPrograms =>
{
  // the installer is running too, so a /proc that cannot name the installer's own executable cannot be read at all.
  try
  {
    readlinkSync(join(PROC, 'self', 'exe'));
  }
  catch
  {
    return { readable: false, executables: [] };
  }

  const executables = readdirSync(PROC)
    .filter(name => PROCESS_ID.test(name))
    .flatMap(executableOf);
  return { readable: true, executables };
};

/**
 * Points a link at a target in one step: the new link is made beside the old one and renamed over it, so there is no
 * moment when the link is missing.
 * @param {string} path The link.
 * @param {string} target What it should name.
 */
const pointLink = (path: string, target: string): void =>
{
  const next = `${path}.next`;
  rmSync(next, { force: true });
  symlinkSync(target, next);
  renameSync(next, path);
};

/**
 * Finds the outermost folder that making a folder would create, so a refused install can take away exactly what it
 * made and nothing that was there before.
 * @param {string} folder The folder about to be made.
 * @returns {string} The outermost folder that does not exist yet, or empty when the folder already does.
 */
const outermostMissingFolder = (folder: string): string =>
{
  let missing = '';
  let candidate = folder;
  while (existsSync(candidate) === false)
  {
    missing = candidate;
    candidate = dirname(candidate);
  }

  return missing;
};

/**
 * Hashes a file.
 * @param {string} path The file.
 * @returns {string} Its SHA-256, in lowercase hex.
 */
const sha256Of = (path: string): string =>
{
  return createHash('sha256')
    .update(readFileSync(path))
    .digest('hex');
};

/**
 * Describes how a program that was run ended badly, in its own words when it printed any.
 * @param {SpawnSyncReturns<string>} run What running it came to.
 * @returns {string} The reason.
 */
const failureOf = (run: SpawnSyncReturns<string>): string =>
{
  if (run.error !== undefined)
  {
    return run.error.message;
  }

  const said = `${run.stdout}${run.stderr}`.trim();
  return said === ''
    ? `it exited with ${run.status ?? run.signal}`
    : said;
};

/**
 * Unpacks a tarball into an empty folder and finds the build in it.
 * @param {string} tarball The tarball, on a local disk.
 * @param {string} into The empty folder to unpack it into.
 * @param {string} version The version versions.json names.
 * @returns {string} The build's folder.
 */
const unpack = (tarball: string, into: string, version: string): string =>
{
  const unpacking = spawnSync('tar', [ '-xzf', tarball, '-C', into ], { encoding: 'utf8' });
  if (unpacking.error !== undefined || unpacking.status !== 0)
  {
    throw new Refusal(`The tarball would not unpack: ${failureOf(unpacking)}`);
  }

  // a bundle holds exactly one folder, named for its version, so a tarball of anything else is not the build named.
  const expected = `${BUNDLE_FOLDER_PREFIX}${version}`;
  const names = readdirSync(into);
  if (names.length !== 1 || names[0] !== expected)
  {
    throw new Refusal(`The tarball holds ${names.join(', ')} rather than ${expected}.`);
  }

  return join(into, expected);
};

/**
 * Lists what NW.js and the libraries beside it need that this machine does not have.
 *
 * NW.js finds its own libraries through an rpath of $ORIGIN/lib, which covers everything it loads, so those libraries
 * name each other without a path. Looked at alone, one of them has no such path, and ldd calls every sibling it needs
 * missing, as it does for libnode.so and libnw.so in a working NW.js. So ldd looks with that folder on the library
 * path, and whatever is still missing is missing from the machine.
 * @param {string} build The build's folder.
 * @returns {string[]} One line per missing library, naming the file that needs it.
 */
const missingFromMachine = (build: string): string[] =>
{
  const libraries = join(build, NWJS_LIBRARIES);
  if (existsSync(libraries) === false)
  {
    throw new Refusal(`The build has no ${NWJS_LIBRARIES} folder.`);
  }

  const files = [
    NWJS,
    ...readdirSync(libraries)
      .filter(isSharedLibrary)
      .sort()
      .map(name => `${NWJS_LIBRARIES}/${name}`),
  ];
  return files.flatMap(file =>
  {
    const report = spawnSync('ldd', [ join(build, file) ], {
      encoding: 'utf8',
      env: { ...process.env, LD_LIBRARY_PATH: libraries },
    });
    if (report.error !== undefined || report.status !== 0)
    {
      return [ `${file}: ${failureOf(report)}` ];
    }

    return missingLibraries(report.stdout)
      .map(line => `${file}: ${line}`);
  });
};

/**
 * Says why a file in a build cannot be run, or nothing when it can.
 * @param {string} path The file.
 * @param {string} name What a refusal calls it.
 * @returns {string} Why it cannot be run, or empty when it can.
 */
const whyNotRunnable = (path: string, name: string): string =>
{
  try
  {
    accessSync(path, constants.X_OK);
    return '';
  }
  catch (error)
  {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? `The build has no ${name}.`
      : `The build's ${name} is not executable.`;
  }
};

/**
 * Tries a build before anything switches to it: its launcher and NW.js can be run, its API reports the version
 * versions.json names, and NW.js and every library beside it find what they load on this machine.
 * @param {string} build The build's folder.
 * @param {string} version The version versions.json names.
 */
const tryBuild = (build: string, version: string): void =>
{
  // the menu entry and the command line link both start the launcher, which starts NW.js, so a build cannot be started
  // without both. Each has to be runnable too: one that lost its execute bit passes every check after this one, ldd's
  // included, then fails from the menu, where there is no terminal to say why.
  const unrunnable = [
    whyNotRunnable(join(build, LAUNCHER), `${LAUNCHER} launcher`),
    whyNotRunnable(join(build, NWJS), NWJS),
  ].filter(problem => problem !== '');
  if (unrunnable.length > 0)
  {
    throw new Refusal(unrunnable.join('\n'));
  }

  // the API answers -version before it reads any configuration, so it can be asked on a machine with no project open.
  const asked = spawnSync(join(build, API), [ '-version' ], { encoding: 'utf8', timeout: VERSION_TIMEOUT_MS });
  if (asked.error !== undefined || asked.status !== 0)
  {
    throw new Refusal(`${API} would not start: ${failureOf(asked)}`);
  }
  const reported = asked.stdout.trim();
  if (reported !== version)
  {
    throw new Refusal(`${API} reports version ${reported}, but ${VERSIONS_FILE} names ${version}.`);
  }

  const missing = missingFromMachine(build);
  if (missing.length > 0)
  {
    throw new Refusal([
      'This machine is missing what the build needs:',
      ...missing.map(line => `  ${line}`),
      'Update this machine\'s packages, then run this again.',
    ].join('\n'));
  }
};

/**
 * Copies the tarball off the share, checks it, unpacks it into the install folder off to one side, and tries the
 * build there. A refusal at any point takes away everything this made, the install folder too when this made it.
 * @param {string} buildsFolder The folder holding versions.json and the tarball.
 * @param {PublishedBuild} build The build versions.json names.
 * @param {string} root The install folder.
 * @returns {StagedBuild} The tried build, ready to switch to.
 */
const stage = (buildsFolder: string, build: PublishedBuild, root: string): StagedBuild =>
{
  const tarball = join(buildsFolder, build.file);
  if (existsSync(tarball) === false)
  {
    throw new Refusal(`The builds folder has no ${build.file}.`);
  }

  // the share is read once, and what gets checked is exactly what gets unpacked.
  const temporary = mkdtempSync(join(tmpdir(), 'jmz-editor-install-'));
  try
  {
    const local = join(temporary, build.file);
    copyFileSync(tarball, local);
    const digest = sha256Of(local);
    if (digest !== build.sha256)
    {
      throw new Refusal([
        `The tarball's SHA-256 is ${digest}, but ${VERSIONS_FILE} expects ${build.sha256}.`,
        'It may still be being published, or it was damaged on the way.',
      ].join('\n'));
    }

    const made = outermostMissingFolder(root);
    mkdirSync(root, { recursive: true });
    const incoming = mkdtempSync(join(root, INCOMING_PREFIX));
    try
    {
      const folder = unpack(local, incoming, build.version);
      tryBuild(folder, build.version);
      return { folder, incoming };
    }
    catch (error)
    {
      // a refused build leaves nothing behind: its folder goes, and so does every folder made to hold it.
      const ownFolder = made === ''
        ? incoming
        : made;
      rmSync(ownFolder, { recursive: true, force: true });
      throw error;
    }
  }
  finally
  {
    rmSync(temporary, { recursive: true, force: true });
  }
};

/**
 * Moves a tried build into place and switches to it, keeps the build it replaced as previous, and removes the rest,
 * except any build something is still running from. A build of the same version that something is running from is
 * refused rather than replaced, with the tried build taken away again, so nothing has changed.
 * @param {InstallPlaces} places Where the install goes.
 * @param {string} version The build's version.
 * @param {StagedBuild} staged The tried build.
 * @param {string} replaced The version current named before, or empty for a first install.
 * @returns {string[]} What was removed from the install folder.
 */
const switchTo = (places: InstallPlaces, version: string, staged: StagedBuild, replaced: string): string[] =>
{
  // what is running is read once, just before anything moves, and decides both what may be replaced and what may go.
  const inUse = foldersInUse(realpathSync(places.root), entriesIn(places.root), runningPrograms());

  // a folder of the same version can only be a previous build or one an earlier run left, never the current one. A
  // previous build can be running, started through previous to go back, and its files are never pulled out from under
  // it.
  const destination = join(places.root, version);
  if (inUse.includes(version))
  {
    rmSync(staged.incoming, { recursive: true, force: true });
    throw new Refusal(`jmz-editor ${version} is running from ${destination}. Close it, then run this again.`);
  }
  rmSync(destination, { recursive: true, force: true });
  renameSync(staged.folder, destination);
  rmSync(staged.incoming, { recursive: true, force: true });

  // previous moves first: stopped between the two, both links name the old build, which is still whole.
  if (replaced !== '')
  {
    pointLink(join(places.root, PREVIOUS_LINK), replaced);
  }
  pointLink(join(places.root, CURRENT_LINK), version);

  // a build still running stays past the two it keeps: an editor opened before this install, or a rollback started
  // through previous. The next install to find it closed removes it.
  const kept = [ version, linkedVersion(places.root, PREVIOUS_LINK) ].filter(name => name !== '');
  const removed = prunable(entriesIn(places.root), kept, inUse);
  removed.forEach(name => rmSync(join(places.root, name), { recursive: true, force: true }));
  return removed;
};

/**
 * Writes the command line link and the app menu entry. Both go through the current link, so they follow every later
 * switch without being written again; writing them on every run, one with nothing new to install included, puts back
 * either one if it was deleted, or never written because a run was cut short after switching.
 * @param {InstallPlaces} places Where the install goes.
 */
const writeMenuEntry = (places: InstallPlaces): void =>
{
  mkdirSync(dirname(places.binLink), { recursive: true });
  pointLink(places.binLink, join(places.root, CURRENT_LINK, LAUNCHER));

  // written beside the entry and renamed over it, so the menu never reads half an entry.
  mkdirSync(dirname(places.desktopFile), { recursive: true });
  const next = `${places.desktopFile}.next`;
  writeFileSync(next, desktopEntry(places.binLink, join(places.root, CURRENT_LINK, ICON)));
  renameSync(next, places.desktopFile);
};

/**
 * Installs the build versions.json names. When it is already the current one, only the menu entry and the command line
 * link are written again, which changes nothing when both are already there.
 * @param {string} buildsFolder The folder holding versions.json and the tarball.
 * @param {string} home The home folder to install into, absolute.
 */
const install = (buildsFolder: string, home: string): void =>
{
  const versionsPath = join(buildsFolder, VERSIONS_FILE);
  if (existsSync(versionsPath) === false)
  {
    throw new Refusal(`There is no ${VERSIONS_FILE} beside this installer.`);
  }

  const places = placesIn(home);
  const build = readPublishedBuild(readFileSync(versionsPath, 'utf8'));
  const replaced = linkedVersion(places.root, CURRENT_LINK);
  if (replaced === build.version)
  {
    // a run cut short after switching never wrote these, and every later run lands here, so this is where they return.
    writeMenuEntry(places);
    console.log(`jmz-editor ${build.version} is already installed.`);
    return;
  }

  const staged = stage(buildsFolder, build, places.root);
  const removed = switchTo(places, build.version, staged, replaced);
  writeMenuEntry(places);

  console.log(`Installed jmz-editor ${build.version}.`);
  if (replaced !== '')
  {
    console.log(`Kept ${replaced} as the previous build.`);
  }
  if (removed.length > 0)
  {
    console.log(`Removed ${removed.join(', ')}.`);
  }
  console.log(`Start it from the app menu, or with ${places.binLink}.`);
};

/**
 * Installs from the folder this file sits in, into the home folder of whoever runs it, and turns a refusal into its
 * message and a failing exit code.
 */
const main = (): void =>
{
  try
  {
    install(dirname(fileURLToPath(import.meta.url)), resolve(homedir()));
  }
  catch (error)
  {
    if (error instanceof Refusal)
    {
      console.error(error.message);
      console.error('Nothing was changed.');
      process.exitCode = 1;
      return;
    }

    throw error;
  }
};

// install only when started as a script, so a test can import the rules above without installing anything.
const [ , script ] = process.argv;
if (script !== undefined && pathToFileURL(script).href === import.meta.url)
{
  main();
}

export {
  desktopEntry,
  foldersInUse,
  install,
  isSharedLibrary,
  missingLibraries,
  prunable,
  readPublishedBuild,
  Refusal,
};
export type { InstallEntry, PublishedBuild, RunningPrograms };
