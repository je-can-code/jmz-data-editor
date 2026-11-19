/// <reference types="bun-types" />
/**
 * Builds the editor as one self-contained desktop app for Linux: NW.js, the shell, the API and the UI's built pages in
 * one folder, which runs on a machine with no Bun, no Go and no dev server, then packs it for the laptop's installer.
 *
 *   bun run bundle [--nwjs <folder>] [--publish] [--publish-dir <folder>]
 *
 * It ships only the pinned NW.js (buildRules.ts), from the folder --nwjs names or else the one behind nw on the PATH,
 * and checks that first, so a refusal costs nothing. Every build empties release/ and leaves there:
 *
 *   jmz-editor-<version>/                   the bundle, laid out as it installs
 *   jmz-editor-linux-x64-<version>.tar.gz   that folder, packed with its modes
 *   versions.json                           the tarball's version, name and SHA-256
 *
 * The version is the build's UTC date and time, the commit, and -dirty when the tree held changes not committed.
 *
 * --publish copies the tarball, the installer (scripts/bundle/install.ts) and versions.json into the builds folder,
 * /mnt/exdrive/dev/jmz-builds unless --publish-dir names another, and refuses before building anything while the
 * installer is missing, since the laptop installs through it. Each file lands under a temporary name and is renamed
 * into place, versions.json last, so a laptop installing at the wrong moment never finds a tarball cut short, or a
 * versions.json naming one that has not arrived.
 */
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  bundleFolderName,
  bundleManifest,
  bundleVersion,
  editorManifest,
  LAUNCHER,
  nwjsProblem,
  nwjsVersionIn,
  parseBuildArguments,
  tarballName,
  TARGETS,
  uiBuildEnvironment,
  versionsFile,
} from './buildRules.ts';
import type { Target } from './buildRules.ts';
import { publishFiles } from './publish.ts';

/**
 * The one target this build makes; others, Windows first, come later.
 */
const TARGET = 'linux-x64';

/**
 * The repo's root, two folders above this script.
 */
const REPO = resolve(import.meta.dir, '..', '..');

/**
 * Where every build lands. Git ignores it, and it is never dist/ or bin/, which hold untracked leftovers of their own.
 */
const RELEASE = join(REPO, 'release');

/**
 * The laptop's installer, which publish hands over beside the build.
 */
const INSTALLER = join(REPO, 'scripts', 'bundle', 'install.ts');

/**
 * The files of the NW.js shell a bundle runs: the shell, and the rules it reads.
 */
const SHELL_FILES = [ 'main.js', 'shellRules.js' ];

/**
 * Says what the build is doing.
 * @param {string} message What it is doing.
 */
const say = (message: string): void =>
{
  console.log(`[bundle] ${message}`);
};

/**
 * Runs a command to its end with its output shown, and stops the build when it fails.
 * @param {string[]} command The command and its arguments.
 * @param {string} cwd The folder to run it in.
 * @param {Record<string, string | undefined>} environment The environment to run it with.
 */
const run = (command: string[], cwd: string, environment: Record<string, string | undefined>): void =>
{
  say(command.join(' '));
  const stdio = { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' } as const;
  const result = Bun.spawnSync(command, { cwd, env: environment, ...stdio });
  if (result.exitCode !== 0)
  {
    throw new Error(`${command.join(' ')} failed with exit code ${result.exitCode}.`);
  }
};

/**
 * Runs a command in the repo and answers what it printed, trimmed, stopping the build when it fails.
 * @param {string[]} command The command and its arguments.
 * @returns {string} What it printed.
 */
const read = (command: string[]): string =>
{
  const result = Bun.spawnSync(command, { cwd: REPO, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0)
  {
    throw new Error(`${command.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }

  return result.stdout.toString().trim();
};

/**
 * Writes a JSON file the way people read them: indented, and ending in a newline.
 * @param {string} file The file.
 * @param {unknown} value What to write.
 */
const writeJson = (file: string, value: unknown): void =>
{
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * Finds the NW.js folder to ship: the one --nwjs named, or else the folder of the real binary behind nw on the PATH,
 * its links followed.
 * @param {string | null} named The folder --nwjs named, or null.
 * @returns {string} The folder.
 */
const findNwjs = (named: string | null): string =>
{
  if (named !== null)
  {
    return resolve(named);
  }

  const onPath = Bun.which('nw');
  if (onPath === null)
  {
    throw new Error('There is no nw on the PATH. Name the NW.js folder to ship with --nwjs <folder>.');
  }

  return dirname(realpathSync(onPath));
};

/**
 * Refuses any NW.js folder but the pinned NW.js, before anything is built.
 * @param {string} folder The NW.js folder.
 */
const checkNwjs = (folder: string): void =>
{
  // a folder that is not there holds nothing, which the rules refuse like any other folder that is not NW.js.
  const names = existsSync(folder) ? readdirSync(folder) : [];
  const library = join(folder, 'lib', 'libnw.so');
  const version = existsSync(library) ? nwjsVersionIn(readFileSync(library)) : '';

  const problem = nwjsProblem(version, names);
  if (problem !== null)
  {
    throw new Error(`Refusing ${folder}: ${problem}`);
  }
};

/**
 * Builds the UI's pages for production, with no API base, in the environment uiBuildEnvironment (buildRules.ts) makes
 * out of the build's own.
 * @returns {string} The folder of the built pages.
 */
const buildUi = (): string =>
{
  run([ 'bun', 'run', 'build' ], join(REPO, 'app'), uiBuildEnvironment(process.env));
  return join(REPO, 'app', 'build');
};

/**
 * Builds the API as one static binary for the target, stamped with the build's version, which -version prints and the
 * installer checks.
 * @param {string} out The bundle's folder.
 * @param {string} version The build's version.
 * @param {Target} target The target.
 */
const buildApi = (out: string, version: string, target: Target): void =>
{
  const binary = join(out, 'server', 'jmz-api');
  const ldflags = `-s -w -X main.version=${version}`;
  const environment = { ...process.env, CGO_ENABLED: '0', GOOS: target.goos, GOARCH: target.goarch };
  const command = [ 'go', 'build', '-trimpath', '-ldflags', ldflags, '-o', binary, './cmd/api' ];
  run(command, join(REPO, 'server'), environment);
};

/**
 * Copies the shell into the bundle's editor folder, with a manifest of its own that gives the bundle its name and the
 * target's Chromium switches.
 * @param {string} out The bundle's folder.
 * @param {Target} target The target.
 */
const copyShell = (out: string, target: Target): void =>
{
  const editor = join(out, 'editor');
  mkdirSync(editor, { recursive: true });
  SHELL_FILES.forEach(name => cpSync(join(REPO, 'nw-app', name), join(editor, name)));

  const source = JSON.parse(readFileSync(join(REPO, 'nw-app', 'package.json'), 'utf-8'));
  writeJson(join(editor, 'package.json'), editorManifest(source, target));
};

/**
 * Writes the launcher, which starts the bundle's own NW.js on its editor folder, and makes it runnable whatever the
 * umask says.
 * @param {string} out The bundle's folder.
 */
const writeLauncher = (out: string): void =>
{
  const launcher = join(out, 'jmz-editor');
  writeFileSync(launcher, LAUNCHER);
  chmodSync(launcher, 0o755);
};

/**
 * Packs the bundle's folder into its tarball with every file's mode, so the launcher, NW.js and the API stay runnable
 * once unpacked, whatever the tarball travelled through on the way.
 * @param {string} version The build's version.
 * @returns {string} The tarball.
 */
const pack = (version: string): string =>
{
  const tarball = join(RELEASE, tarballName(TARGET, version));
  run([ 'tar', '-czf', tarball, '-C', RELEASE, bundleFolderName(version) ], REPO, process.env);
  return tarball;
};

/**
 * Works out a file's SHA-256, reading it a piece at a time.
 * @param {string} file The file.
 * @returns {Promise<string>} The hash, in hex.
 */
const sha256Of = async (file: string): Promise<string> =>
{
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file))
  {
    hash.update(chunk);
  }

  return hash.digest('hex');
};

/**
 * Builds the bundle, packs it and, when asked, publishes it.
 */
const main = async (): Promise<void> =>
{
  const options = parseBuildArguments(Bun.argv.slice(2));

  // publish hands the laptop its installer beside the build, so without one there is nothing worth publishing.
  if (options.publish && existsSync(INSTALLER) === false)
  {
    const installer = relative(REPO, INSTALLER);
    throw new Error(`Refusing to publish: the laptop installs through ${installer}, and it isn't there yet.`);
  }

  const target = TARGETS[TARGET];
  const nwjs = findNwjs(options.nwjs);
  checkNwjs(nwjs);

  const builtAt = new Date();
  const commit = read([ 'git', 'rev-parse', 'HEAD' ]);
  const shortCommit = read([ 'git', 'rev-parse', '--short', 'HEAD' ]);
  const dirty = read([ 'git', 'status', '--porcelain' ]) !== '';
  const version = bundleVersion(builtAt, shortCommit, dirty);
  say(`building ${version} with the NW.js in ${nwjs}`);

  // every build starts from an empty release folder, so it never carries a bundle an older build left there.
  rmSync(RELEASE, { recursive: true, force: true });
  const out = join(RELEASE, bundleFolderName(version));
  mkdirSync(out, { recursive: true });

  const ui = buildUi();
  buildApi(out, version, target);
  say('copying NW.js, the shell and the pages');
  cpSync(nwjs, join(out, 'nwjs'), { recursive: true });
  copyShell(out, target);
  cpSync(ui, join(out, 'ui'), { recursive: true });
  writeJson(join(out, 'bundle.json'), bundleManifest(version, commit, dirty, builtAt));
  writeLauncher(out);

  say('packing');
  const tarball = pack(version);
  const sha256 = await sha256Of(tarball);
  const versions = join(RELEASE, 'versions.json');
  writeJson(versions, versionsFile(TARGET, version, basename(tarball), sha256));
  say(`built ${tarball}, ${Math.round(statSync(tarball).size / 1024 / 1024)} MB, sha256 ${sha256}`);

  // versions.json lands last, so the builds folder never names a tarball that is not there whole.
  if (options.publish)
  {
    publishFiles([ tarball, INSTALLER, versions ], options.publishDir)
      .forEach(destination => say(`published ${destination}`));
  }
};

main().catch((error: unknown) =>
{
  console.error(`[bundle] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
