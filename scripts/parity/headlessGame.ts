/// <reference types="bun-types" />
/**
 * Runs the real game headlessly with the parity probe injected, the way rmmz-plugins' headless-playtesting guide
 * describes, with one change: the guide writes the probe and its manifest key into the game folder, so this runs a
 * copy of the game in the run's own folder instead and never touches the game's own files. The copy links the big
 * read-only folders (img, audio, movies), copies the rest, and starts with an empty save folder of its own. The copy
 * and the game's profile are removed once the game has stopped; the pictures, the report and the log stay.
 *
 * The game runs on a virtual X display with WAYLAND_DISPLAY removed and ozone forced to X11, so no window can reach
 * the desktop, with its own profile, on SwiftShader: parity screenshots may use software rendering; timings may not.
 * A virtual display hides the window but not the sound, so the game is muted at every level (see MUTE_AUDIO).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { parityProbe } from './gameProbe.ts';
import type { ProbeConfig, ProbeReport } from './probeTypes.ts';

/**
 * How to run the game.
 */
type HeadlessGameOptions = {
  /** The real game, read from and never written. */
  projectRoot: string;

  /** A folder of this run's own for the copy, the profile and the pictures. */
  scratch: string;

  /** The virtual display, such as :90. */
  display: string;

  /** The NW.js binary. */
  nwBinary: string;

  /** How long to wait for the probe, in milliseconds. */
  timeoutMs: number;

  /**
   * Changes the copy's own files before the game starts, such as holding its lights steady; the real game is never
   * touched. Left out, the copy runs as copied.
   */
  prepare?: (copy: string) => void;
};

/**
 * The switches that silence a Chromium-based process: mute its output, and never open an audio device at all. A
 * virtual display hides the game's window but not its sound, so every launch carries both, on the command line and in
 * the copy's manifest, and the probe mutes the page from inside as well.
 */
const MUTE_AUDIO = '--mute-audio --disable-audio-output';

/**
 * The game folders the copy links rather than copies: nothing the game does writes to them.
 */
const LINKED = new Set([ 'img', 'audio', 'movies' ]);

/**
 * The game folders the copy leaves out: notes and scripts the game never loads, and the saves, which start empty.
 */
const LEFT_OUT = new Set([ 'docs', 'save', 'play.sh' ]);

/**
 * Builds the copy of the game the probe runs in, with the probe injected through its manifest.
 * @param {string} projectRoot The real game.
 * @param {string} copy Where the copy goes.
 * @param {ProbeConfig} config What the probe draws.
 */
const prepareGameCopy = (projectRoot: string, copy: string, config: ProbeConfig): void =>
{
  rmSync(copy, { recursive: true, force: true });
  mkdirSync(copy, { recursive: true });
  readdirSync(projectRoot).forEach(entry =>
  {
    if (LEFT_OUT.has(entry))
    {
      return;
    }

    if (LINKED.has(entry))
    {
      symlinkSync(`${projectRoot}/${entry}`, `${copy}/${entry}`);
      return;
    }

    cpSync(`${projectRoot}/${entry}`, `${copy}/${entry}`, { recursive: true });
  });
  mkdirSync(`${copy}/save`);

  // the probe runs ahead of the game's own scripts; inject_js_start is a manifest key, never a flag. The copy is muted
  // in its own manifest too, so the game stays silent however it is started.
  writeFileSync(`${copy}/_parity_probe.js`, `(${parityProbe.toString()})(${JSON.stringify(config)});\n`);
  const manifest = JSON.parse(readFileSync(`${copy}/package.json`, 'utf8')) as Record<string, unknown>;
  manifest['inject_js_start'] = '_parity_probe.js';
  manifest['chromium-args'] = `${String(manifest['chromium-args'] ?? '')} ${MUTE_AUDIO}`.trim();
  writeFileSync(`${copy}/package.json`, JSON.stringify(manifest, null, 2));
};

/**
 * Copies the environment without anything that leads to the real desktop, pointed at the virtual display.
 * @param {string} display The virtual display.
 * @returns {Record<string, string>} The environment.
 */
const virtualDisplayEnvironment = (display: string): Record<string, string> =>
{
  const environment: Record<string, string> = {};
  Object.entries(process.env).forEach(([ key, value ]) =>
  {
    if (value !== undefined && key !== 'WAYLAND_DISPLAY' && key !== 'DISPLAY')
    {
      environment[key] = value;
    }
  });
  environment['DISPLAY'] = display;
  return environment;
};

/**
 * Starts a virtual X display unless one already answers on that number.
 * @param {string} display The display, such as :90.
 * @returns {Promise<(() => void) | null>} Stops the display this started, or null when it was already running.
 */
const ensureVirtualDisplay = async (display: string): Promise<(() => void) | null> =>
{
  const socket = `/tmp/.X11-unix/X${display.slice(1)}`;
  if (existsSync(socket))
  {
    return null;
  }

  const xvfb = Bun.spawn([ 'Xvfb', display, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp' ], { stdout: 'ignore', stderr: 'ignore' });
  for (let attempt = 0; attempt < 50 && existsSync(socket) === false; attempt++)
  {
    await Bun.sleep(100);
  }

  return () => xvfb.kill();
};

/**
 * Runs the game with the probe and waits for its report.
 * @param {HeadlessGameOptions} options How and where.
 * @param {ProbeConfig} config What the probe draws; its outDir receives the pictures.
 * @returns {Promise<ProbeReport>} The probe's report.
 */
const runHeadlessGame = async (options: HeadlessGameOptions, config: ProbeConfig): Promise<ProbeReport> =>
{
  const copy = `${options.scratch}/game`;
  const profile = `${options.scratch}/nw-profile`;
  mkdirSync(config.outDir, { recursive: true });
  rmSync(`${config.outDir}/PROBE_READY`, { force: true });
  rmSync(`${config.outDir}/PROBE_REPORT.json`, { force: true });
  prepareGameCopy(options.projectRoot, copy, config);
  options.prepare?.(copy);

  const stopDisplay = await ensureVirtualDisplay(options.display);
  const log = Bun.file(`${options.scratch}/nw.log`);
  const game = Bun.spawn([ options.nwBinary, copy, 'test', `--user-data-dir=${profile}`, '--ozone-platform=x11', '--enable-unsafe-swiftshader', ...MUTE_AUDIO.split(' ') ], {
    env: virtualDisplayEnvironment(options.display),
    stdout: log,
    stderr: log,
    detached: true,
  });

  try
  {
    const deadline = Date.now() + options.timeoutMs;
    while (existsSync(`${config.outDir}/PROBE_READY`) === false)
    {
      if (Date.now() > deadline)
      {
        throw new Error(`the game never finished its probe within ${options.timeoutMs} ms`);
      }

      await Bun.sleep(250);
    }

    return JSON.parse(readFileSync(`${config.outDir}/PROBE_REPORT.json`, 'utf8')) as ProbeReport;
  }
  finally
  {
    // NW.js runs several processes; the whole group goes.
    try
    {
      process.kill(-game.pid, 'SIGKILL');
    }
    catch
    {
      game.kill('SIGKILL');
    }

    await game.exited;
    stopDisplay?.();

    // the copy holds the game's data and scripts; removing it takes only the links to img, audio and movies, never
    // what they point at.
    rmSync(copy, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  }
};

export { runHeadlessGame };
export type { HeadlessGameOptions };
