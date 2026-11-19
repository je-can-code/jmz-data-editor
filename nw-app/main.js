// The NW.js shell. It starts the Go API and the UI (unless told to attach to ones already running), then opens
// windows for the pages, which are served over HTTP and cannot reach nw themselves.
//
// Pages ask for windows on the 'jmz-shell' BroadcastChannel. The shell hears that channel through a hidden window
// of the UI's own origin, opened without new_instance so its DOM is reachable from here, and opens each requested
// page with new_instance, so every window runs in its own renderer process and a busy one never stalls another.
// A second request for a page already open focuses its window instead.
//
// Pages ask the same channel for the clipboard's text, which a page under NW.js cannot read itself: Chromium asks the
// person before a page reads the clipboard, and NW.js has nowhere to ask, so the read would wait forever. The shell
// reads it with nw.Clipboard, but hands it over only when it is the kind of clipboard the page asked for (stamps,
// commands or rows the editors copied), and only on a reply channel the asking page opened under a random name, since
// every window hears the shell channel. Anything else on the clipboard never reaches a page.
//
// Pages ask the same channel to play the open project. The shell asks the API which project that is, since the API
// knows whether this shell started it or attached to it, and starts the project's game on the very NW.js the shell runs
// on, in test mode and on a profile of the project's own, so the launch never hands itself over to a copy of the game
// started some other way. The game is detached and let go of, so closing the editor never ends a playtest. While the
// project's game is still running nothing new starts, and the page is told so. The answer goes back on a reply channel
// the page opened for it, as a clipboard read's does.
//
// The app stays open while any window is. Visible windows are never given a 'close' listener: that would take
// their closing away from the page, and a page holding unsaved edits asks before it closes through its own
// beforeunload.
//
// Flags, read from nw.App.argv (under NW.js, process.argv holds only the binary's path):
//   --project-root <path>   the RMMZ project, handed to the Go API
//   --api-base <origin>     where the Go API listens
//   --ui-url <origin>       where the UI is served; every window opens on this one origin
//   --maps                  boot straight into the map editor
//   --attach                use a UI and API that are already running instead of starting them
//   --log <path>            append one JSON line per shell event, since nothing here reaches a console
// Each flag also takes the --flag=value form.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const rules = require('./shellRules.js');

const DEFAULT_API_BASE = 'http://127.0.0.1:8080';
const DEFAULT_UI_URL = 'http://127.0.0.1:3000';
const SHELL_CHANNEL = 'jmz-shell';

// how long a reply channel stays open after its answer, in milliseconds.
const REPLY_LINGER_MS = 5000;

// how long the shell waits on the API to name the open project, in milliseconds; the page waits five seconds in all.
const PLAY_HEALTH_TIMEOUT_MS = 2000;

// how long a new playtest is watched for an early exit, in milliseconds: a launch onto a profile already in use hands
// itself over to the game running there and exits within a few dozen.
const PLAY_WATCH_MS = 1000;

const { argv } = nw.App;
const logPath = rules.readFlag(argv, '--log') || '';

function log(event, data)
{
  if (logPath === '')
  {
    return;
  }

  try
  {
    fs.appendFileSync(logPath, `${JSON.stringify({ t: Date.now(), event, ...data })}\n`);
  }
  catch
  {
    // the log is a diagnostic; failing to write it must never stop the app.
  }
}

function readJsonFileSafe(filePath)
{
  try
  {
    if (fs.existsSync(filePath) === false)
    {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  }
  catch
  {
    return null;
  }
}

function writeJsonFileSafe(filePath, data)
{
  try
  {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
  catch
  {
    // ignore
  }
}

function httpGet(url, timeoutMs)
{
  return new Promise((resolve, reject) =>
  {
    const req = http.get(url, { timeout: timeoutMs }, (res) =>
    {
      res.resume();
      res.on('end', () => resolve(res.statusCode || 0));
    });
    req.on('error', reject);
    req.on('timeout', () =>
    {
      req.destroy(new Error('timeout'));
    });
  });
}

/**
 * Parses JSON text, or answers null for text that is not JSON.
 * @param {string} text The text.
 * @returns {unknown} The value, or null.
 */
function parseJsonSafe(text)
{
  try
  {
    return JSON.parse(text);
  }
  catch
  {
    return null;
  }
}

/**
 * Reads an answer whose body is JSON, as the API's health check gives: the status, and the body, parsed.
 * @param {string} url The URL.
 * @param {number} timeoutMs How long the connection may sit idle before the read gives up.
 * @returns {Promise<{ status: number, body: unknown }>} The status, and the body, or null for a body that is not JSON.
 */
function httpGetJson(url, timeoutMs)
{
  return new Promise((resolve, reject) =>
  {
    const req = http.get(url, { timeout: timeoutMs }, (res) =>
    {
      const chunks = [];
      res.on('data', (chunk) =>
      {
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () =>
      {
        resolve({ status: res.statusCode || 0, body: parseJsonSafe(Buffer.concat(chunks).toString('utf-8')) });
      });
    });
    req.on('error', reject);
    req.on('timeout', () =>
    {
      req.destroy(new Error('timeout'));
    });
  });
}

async function waitForUrlOk(url, timeoutMs)
{
  const start = Date.now();
  while (Date.now() - start < timeoutMs)
  {
    try
    {
      const statusCode = await httpGet(url, 400);
      if (statusCode >= 200 && statusCode < 500)
      {
        return true;
      }
    }
    catch
    {
      // ignore
    }
    await new Promise(r =>
    {
      setTimeout(r, 250);
    });
  }
  return false;
}

function killTree(child)
{
  if (!child || typeof child.pid !== 'number')
  {
    return;
  }

  try
  {
    process.kill(-child.pid, 'SIGTERM');
  }
  catch
  {
    try
    {
      child.kill('SIGTERM');
    }
    catch
    {
      // ignore
    }
  }
}

function repoRoot()
{
  return path.resolve(__dirname, '..');
}

const CONFIG_PATH = path.join(repoRoot(), '.config', 'jmz-data-editor.json');

// the dev stack this shell started, if any; everything the app started stops with it.
let child = null;

function shutdown()
{
  killTree(child);
  child = null;
}

// every visible window, by the page it shows, and the pages whose windows are still opening.
const openWindows = new Map();
const opening = new Set();

// held for the life of the app, so the channel is never collected.
let shellChannel = null;

// the playtests this shell started that are still running, by their profile folder, which is one per project.
const playtests = new Map();

/**
 * Quits once the last visible window has closed; the hidden relay window does not count.
 */
function quitWhenLastWindowCloses()
{
  if (openWindows.size > 0 || opening.size > 0)
  {
    return;
  }

  log('quit', {});
  shutdown();
  nw.App.quit();
}

/**
 * Opens a page as a real window in its own renderer process, or focuses the window already showing it.
 * @param {string} url The page, on the UI's origin.
 * @param {number} width The width for a new window.
 * @param {number} height The height for a new window.
 */
function openWindow(url, width, height)
{
  const key = rules.windowKey(url);
  const existing = openWindows.get(key);
  if (existing)
  {
    existing.focus();
    log('focus', { url });
    return;
  }

  // a second request while the first is still opening would otherwise open a twin.
  if (opening.has(key))
  {
    return;
  }

  opening.add(key);
  log('open', { url, width, height });
  nw.Window.open(url, { width, height, new_instance: true, focus: true }, (win) =>
  {
    opening.delete(key);
    if (!win)
    {
      log('open-failed', { url });
      quitWhenLastWindowCloses();
      return;
    }

    openWindows.set(key, win);
    win.on('closed', () =>
    {
      openWindows.delete(key);
      log('closed', { url });
      quitWhenLastWindowCloses();
    });
  });
}

/**
 * Says an answer on the reply channel a page opened for it, built in the hidden window's realm so it belongs to the
 * UI's origin. The channel stays open a moment after the answer, so closing it can never overtake the message.
 * @param {object} win The hidden relay window.
 * @param {string} channel The reply channel's name.
 * @param {object} message The answer.
 */
function answerOn(win, channel, message)
{
  const reply = new win.window.BroadcastChannel(channel);
  reply.postMessage(message);
  setTimeout(() => reply.close(), REPLY_LINGER_MS);
}

/**
 * Answers a page's clipboard read on the reply channel the page opened for it.
 * @param {object} win The hidden relay window.
 * @param {object} request The page's request.
 */
function answerClipboardRead(win, request)
{
  const answer = rules.clipboardAnswer(request, () => nw.Clipboard.get().get('text'));
  if (answer === null)
  {
    log('refused-clipboard-read', {});
    return;
  }

  answerOn(win, answer.channel, answer.message);
}

/**
 * Asks the API which project is open. The API is the one place that knows, whether this shell started it or attached
 * to one already running, which may have been started on another project than this shell's own flags name.
 * @param {string} apiBase The API's origin.
 * @returns {Promise<string>} The project's folder, or an empty string when the API could not say.
 */
async function openProjectRoot(apiBase)
{
  try
  {
    const { status, body } = await httpGetJson(`${apiBase}/api/health`, PLAY_HEALTH_TIMEOUT_MS);
    const data = status === 200 && body !== null && typeof body === 'object' ? body.data : null;
    const root = data !== null && typeof data === 'object' ? data.projectRoot : '';
    return typeof root === 'string' ? root : '';
  }
  catch
  {
    return '';
  }
}

/**
 * Lists the names in a folder, or none for a folder that cannot be read, which holds no game either.
 * @param {string} folder The folder.
 * @returns {string[]} The names.
 */
function listFolder(folder)
{
  try
  {
    return fs.readdirSync(folder);
  }
  catch
  {
    return [];
  }
}

/**
 * Starts a project's playtest on the NW.js this shell runs on, in test mode and on the project's own profile, and
 * watches it for a moment to learn what became of it. The game is detached and let go of, so it outlives the editor as
 * a game started from a terminal does, and closing the editor never ends a playtest; the watch only listens for its
 * exit, and never holds it.
 * @param {string} projectRoot The project's folder.
 * @returns {Promise<{ outcome: string, projectRoot: string, args: string[] }>} What became of it, and the arguments
 * it was started with, none when nothing was.
 */
function launchPlaytest(projectRoot)
{
  const profile = rules.playtestProfileDirectory(rules.cacheDirectory(process.env, os.homedir()), projectRoot);

  // one playtest per project: a game this shell started on the project's profile that is still running is its playtest.
  if (playtests.has(profile))
  {
    return Promise.resolve({ outcome: 'already-running', projectRoot, args: [] });
  }

  const args = rules.playArguments(projectRoot, profile);
  const game = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
  game.unref();

  // the game counts as running from its launch, so a second Play during the watch never launches another; it is
  // forgotten once it exits, however that happens.
  playtests.set(profile, game);
  const forget = () =>
  {
    if (playtests.get(profile) === game)
    {
      playtests.delete(profile);
    }
  };

  return new Promise((resolve) =>
  {
    // a launch still running once the watch is up is the game, started.
    const watch = setTimeout(() => resolve({ outcome: rules.playOutcome(null), projectRoot, args }), PLAY_WATCH_MS);

    // a launch that ends sooner says how, which tells a hand-off to the game already running from a failure.
    game.on('exit', (code, signal) =>
    {
      forget();
      clearTimeout(watch);
      resolve({ outcome: rules.playOutcome({ code, signal }), projectRoot, args });
    });

    // a launch that could not start at all never exits; it failed.
    game.on('error', (error) =>
    {
      forget();
      clearTimeout(watch);
      resolve({ outcome: 'failed', projectRoot, args, error: String(error) });
    });
  });
}

/**
 * Plays the open project: asks the API which project that is, refuses a folder with no game in it, and otherwise
 * launches its playtest, or finds it already running.
 * @param {string} apiBase The API's origin.
 * @returns {Promise<{ outcome: string, projectRoot: string, args: string[] }>} What became of it, and the arguments
 * the game was started with, none when nothing was.
 */
async function playOpenProject(apiBase)
{
  const projectRoot = await openProjectRoot(apiBase);
  if (projectRoot === '')
  {
    return { outcome: 'failed', projectRoot, args: [] };
  }

  if (rules.isGameFolder(listFolder(projectRoot)) === false)
  {
    return { outcome: 'not-a-game', projectRoot, args: [] };
  }

  return launchPlaytest(projectRoot);
}

/**
 * Answers a page's Play on the reply channel the page opened for it: what became of the open project's playtest. A
 * request naming no proper reply channel is refused before anything is asked or launched.
 * @param {object} win The hidden relay window.
 * @param {object} request The page's request.
 * @param {string} apiBase The API's origin.
 * @returns {Promise<void>} Settles once answered.
 */
async function answerPlay(win, request, apiBase)
{
  const replyTo = rules.playReplyChannel(request.replyTo);
  if (replyTo === null)
  {
    log('refused-play', {});
    return;
  }

  const played = await playOpenProject(apiBase);
  log('play', played);
  answerOn(win, replyTo, { type: 'play-result', result: played.outcome });
}

/**
 * Opens the hidden window on the UI's origin and listens on the shell channel through it.
 * @param {string} uiUrl The UI's origin.
 * @param {string} apiBase The API's origin, which a Play asks for the open project.
 * @param {{ width: number, height: number }} fallbackSize The size for windows that ask for none.
 * @param {() => void} ready Called once the shell is listening.
 */
function startRelay(uiUrl, apiBase, fallbackSize, ready)
{
  nw.Window.open(`${uiUrl}/shell.html`, { show: false, width: 200, height: 100 }, (win) =>
  {
    win.on('loaded', () =>
    {
      if (shellChannel !== null)
      {
        return;
      }

      // the channel is built in the hidden window's realm, so it belongs to the UI's origin.
      shellChannel = new win.window.BroadcastChannel(SHELL_CHANNEL);
      shellChannel.onmessage = (event) =>
      {
        const request = event.data || {};
        if (request.type === 'hello')
        {
          shellChannel.postMessage({ type: 'shell-ready' });
          return;
        }

        // the clipboard's text, for a page's paste that has no clipboard event to carry it: only the kind of clipboard
        // the page asked for, and only on the channel the page opened for the answer, never on this one.
        if (request.type === 'clipboard-read')
        {
          answerClipboardRead(win, request);
          return;
        }

        // a playtest of the open project, answered the same way: only the asking window learns what became of it.
        if (request.type === 'play')
        {
          answerPlay(win, request, apiBase).catch((error) =>
          {
            log('play-crash', { error: String(error) });
          });
          return;
        }

        if (request.type !== 'open')
        {
          return;
        }

        const url = rules.resolveWindowUrl(request.url, uiUrl);
        if (url === null)
        {
          log('refused', { url: String(request.url) });
          return;
        }

        openWindow(url, rules.windowSize(request.width, fallbackSize.width), rules.windowSize(request.height, fallbackSize.height));
      };

      shellChannel.postMessage({ type: 'shell-ready' });
      log('relay-ready', {});
      ready();
    });
  });
}

/**
 * Opens a small window explaining that no project is configured, and quits when it closes.
 */
function showMissingProjectRoot()
{
  nw.Window.open('about:blank', { width: 720, height: 320 }, (win) =>
  {
    win.on('loaded', () =>
    {
      win.window.document.body.style.background = '#121212';
      win.window.document.body.style.color = '#fff';
      win.window.document.body.style.fontFamily = 'monospace';
      win.window.document.body.style.padding = '16px';
      win.window.document.body.innerText =
        'JMZ_PROJECT_ROOT is not set.\n\n'
        + 'Set it as an env var, pass --project-root, or set projectRoot in:\n'
        + CONFIG_PATH;
    });
    win.on('closed', () => nw.App.quit());
  });
}

async function main()
{
  const cfg = readJsonFileSafe(CONFIG_PATH) || {};
  const attach = rules.hasFlag(argv, '--attach');

  const apiBase = rules.trimOrigin(
    rules.readFlag(argv, '--api-base')
    || process.env.VITE_JMZ_API_BASE
    || cfg.apiBase
    || DEFAULT_API_BASE
  );

  const uiUrl = rules.trimOrigin(
    rules.readFlag(argv, '--ui-url')
    || cfg.uiUrl
    || DEFAULT_UI_URL
  );

  const projectRoot =
    rules.readFlag(argv, '--project-root')
    || process.env.JMZ_PROJECT_ROOT
    || cfg.projectRoot
    || '';

  // the NW.js binary is logged too, since a playtest runs on this same one.
  log('boot', { argv, execPath: process.execPath, attach, apiBase, uiUrl, projectRoot, maps: rules.hasFlag(argv, '--maps') });

  // attached, the running UI and API already know their project.
  if (attach === false)
  {
    if (!projectRoot)
    {
      showMissingProjectRoot();
      return;
    }

    writeJsonFileSafe(CONFIG_PATH, {
      ...cfg,
      apiBase,
      projectRoot,
    });

    // the dev stack starts the API on the configured address, allowing exactly the configured UI's page,
    // and the UI on the configured port.
    child = spawn(
      'bun',
      rules.devStackArgs(projectRoot, apiBase, uiUrl),
      {
        cwd: repoRoot(),
        env: {
          ...process.env,
          ...rules.serverEnvironment(apiBase, uiUrl),
          JMZ_PROJECT_ROOT: projectRoot,
          VITE_JMZ_API_BASE: apiBase,
        },
        stdio: 'inherit',
        detached: true,
      },
    );
  }

  process.on('SIGINT', () =>
  {
    shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', () =>
  {
    shutdown();
    process.exit(0);
  });

  const ok = await waitForUrlOk(uiUrl, 10_000);
  log('ui', { ok });

  const nwManifest = readJsonFileSafe(path.join(__dirname, 'package.json')) || {};
  const { width = 1400, height = 900 } = nwManifest.window || {};

  startRelay(uiUrl, apiBase, { width, height }, () =>
  {
    openWindow(`${uiUrl}${rules.bootPath(argv)}`, width, height);
  });
}

main().catch((error) =>
{
  log('crash', { error: String(error) });
  shutdown();
  nw.App.quit();
});
