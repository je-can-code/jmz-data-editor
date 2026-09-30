/// <reference types="bun-types" />
/**
 * Stands the map editor up for measuring, the way it ships: the Go API built from source, and the UI as a
 * production build served over HTTP, each on its own port, with the API allowing exactly the UI's origin.
 *
 * The API never sees the real game. It is pointed at a mirror in the scratch folder: a fresh copy of `data/`, the
 * only folder the API writes, with `img/`, `audio/` and `js/` linked in read-only. Nothing a measurement does,
 * whatever goes wrong, can reach the game's own files.
 */
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Where everything is and which ports to use.
 */
type EditorStackOptions = {
  /** The real game, read from and never written. */
  projectRoot: string;

  /** A folder of this run's own for builds and the mirror. */
  scratch: string;

  /** The port the UI is served on. */
  uiPort: number;

  /** The port the API listens on. */
  apiPort: number;

  /** Builds again even when a build from this run is already there. */
  rebuild?: boolean;
};

/**
 * A running editor.
 */
type EditorStack = {
  /** The UI's origin, such as http://127.0.0.1:18200. */
  uiBase: string;

  /** The API's origin. */
  apiBase: string;

  /** Stops the API and the UI server. */
  stop: () => Promise<void>;
};

/**
 * The repository root, from this file.
 */
const REPO_ROOT = resolve(import.meta.dir, '../..');

/**
 * The folders the mirror links rather than copies: the API only ever reads them.
 */
const LINKED_FOLDERS = [ 'img', 'audio', 'js' ];

/**
 * Runs a command to completion, failing loudly with its output when it fails.
 * @param {string[]} command The command and its arguments.
 * @param {string} cwd Where to run it.
 * @param {Record<string, string>} env Extra environment.
 */
const run = async (command: string[], cwd: string, env: Record<string, string> = {}): Promise<void> =>
{
  const child = Bun.spawn(command, { cwd, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' });
  const [ code, out, err ] = await Promise.all([ child.exited, new Response(child.stdout).text(), new Response(child.stderr).text() ]);
  if (code !== 0)
  {
    throw new Error(`${command.join(' ')} failed (${code}):\n${out}\n${err}`);
  }
};

/**
 * Builds the project mirror the API is pointed at.
 * @param {string} projectRoot The real game.
 * @param {string} mirror Where the mirror goes.
 */
const buildMirror = (projectRoot: string, mirror: string): void =>
{
  rmSync(mirror, { recursive: true, force: true });
  mkdirSync(mirror, { recursive: true });
  cpSync(`${projectRoot}/data`, `${mirror}/data`, { recursive: true });
  LINKED_FOLDERS.forEach(folder =>
  {
    if (existsSync(`${projectRoot}/${folder}`))
    {
      symlinkSync(`${projectRoot}/${folder}`, `${mirror}/${folder}`);
    }
  });
};

/**
 * Waits for the API to report itself healthy, with the project found.
 * @param {string} apiBase The API's origin.
 * @param {number} timeoutMs How long to wait.
 */
const waitForHealth = async (apiBase: string, timeoutMs: number): Promise<void> =>
{
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline)
  {
    try
    {
      const response = await fetch(`${apiBase}/api/health`);
      const body = await response.json() as { data?: { ok?: boolean; projectRootOk?: boolean } };
      if (body.data?.ok === true && body.data.projectRootOk === true)
      {
        return;
      }
    }
    catch
    {
      // not listening yet.
    }

    await Bun.sleep(100);
  }

  throw new Error(`the API at ${apiBase} never became healthy`);
};

/**
 * Serves a built UI folder over HTTP.
 * @param {string} folder The build.
 * @param {number} port The port.
 * @returns {ReturnType<typeof Bun.serve>} The server.
 */
const serveFolder = (folder: string, port: number): ReturnType<typeof Bun.serve> =>
{
  return Bun.serve({
    port,
    hostname: '127.0.0.1',
    async fetch(request)
    {
      const { pathname } = new URL(request.url);
      const file = Bun.file(resolve(folder, `.${decodeURIComponent(pathname)}`));
      if (pathname.includes('..') || await file.exists() === false)
      {
        return new Response('not found', { status: 404 });
      }

      return new Response(file);
    },
  });
};

/**
 * Builds and starts the API and the UI.
 * @param {EditorStackOptions} options Where and on which ports.
 * @returns {Promise<EditorStack>} The running editor.
 */
const startEditorStack = async (options: EditorStackOptions): Promise<EditorStack> =>
{
  const { projectRoot, scratch, uiPort, apiPort } = options;
  const uiBase = `http://127.0.0.1:${uiPort}`;
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const binary = `${scratch}/bin/jmz-api`;
  const ui = `${scratch}/ui`;
  const mirror = `${scratch}/project`;
  mkdirSync(`${scratch}/bin`, { recursive: true });

  if (options.rebuild === true || existsSync(binary) === false)
  {
    await run([ 'go', 'build', '-o', binary, './cmd/api' ], `${REPO_ROOT}/server`);
  }

  if (options.rebuild === true || existsSync(`${ui}/map.html`) === false)
  {
    await run([ 'bunx', '--bun', 'vite', 'build', '--outDir', ui, '--emptyOutDir' ], `${REPO_ROOT}/app`, { VITE_JMZ_API_BASE: apiBase });
  }

  buildMirror(projectRoot, mirror);
  const api = Bun.spawn([ binary ], {
    env: {
      ...process.env,
      JMZ_PROJECT_ROOT: mirror,
      JMZ_API_ADDRESS: `127.0.0.1:${apiPort}`,
      JMZ_UI_ORIGINS: uiBase,
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  const server = serveFolder(ui, uiPort);
  const stop = async () =>
  {
    await server.stop(true);
    api.kill();
    await api.exited;
  };

  try
  {
    await waitForHealth(apiBase, 10_000);
  }
  catch (error)
  {
    await stop();
    throw error;
  }

  return { uiBase, apiBase, stop };
};

export { startEditorStack };
export type { EditorStack, EditorStackOptions };
