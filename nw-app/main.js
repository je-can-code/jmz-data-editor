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
// In a bundle, which its build marks by writing bundle.json beside the shell's folder, the shell starts the bundle's
// own API instead of the dev stack, on one fixed loopback origin that serves the pages as well. The project comes from
// --project-root, JMZ_PROJECT_ROOT or the person's config, which the shell reads and never writes. The shell checks the
// project and the port before the API starts, and waits for the API's health check before it opens a window; whatever
// stops it on the way goes in a small error window naming the log that says more, since a desktop launch has no
// terminal. The API's output is appended to a log of its own, and the API ends with the shell however the shell ends:
// it reads its stdin, a pipe the shell holds open for the life of the app. A second launch hands itself over to the
// first, which brings its window forward, or, when a problem the person can put right stopped it, runs its start again:
// they have likely just put right what its error window named.
//
// Flags, read from nw.App.argv (under NW.js, process.argv holds only the binary's path):
//   --project-root <path>   the RMMZ project, handed to the Go API
//   --api-base <origin>     where the Go API listens (the dev stack only)
//   --ui-url <origin>       where the UI is served; every window opens on this one origin (the dev stack only)
//   --maps                  boot straight into the map editor
//   --attach                use a UI and API that are already running instead of starting them (the dev stack only)
//   --log <path>            append one JSON line per shell event, since nothing here reaches a console; a bundle logs
//                           to shell.log in the person's state folder unless told otherwise
// Each flag also takes the --flag=value form.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
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

// how long a bundle waits for its API's health check to answer ok, in milliseconds; it answers within a moment of
// starting, so running out means something is wrong with it.
const API_READY_TIMEOUT_MS = 10_000;

const { argv } = nw.App;

// a bundle's build writes bundle.json beside the shell's folder; a checkout has none, and runs the dev stack.
const bundled = rules.isBundled(__dirname, fs.existsSync);

// a bundle's config and logs, kept for the person outside the bundle, so an update leaves them alone.
const userFiles = rules.bundleUserFiles(process.env, os.homedir());

const logPath = rules.readFlag(argv, '--log') || (bundled ? userFiles.shellLog : '');

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

/**
 * Reads the text of a bundle's config, which the person writes by hand. No file yet is a config with nothing set; a
 * file that is there but cannot be read gives empty text, which is no config at all, so the person learns it is wrong.
 * @param {string} filePath The config file.
 * @returns {string | null} The text, or null when there is no file.
 */
function readConfigText(filePath)
{
  try
  {
    return fs.readFileSync(filePath, 'utf-8');
  }
  catch (error)
  {
    return error.code === 'ENOENT' ? null : '';
  }
}

/**
 * Waits a while.
 * @param {number} ms How long, in milliseconds.
 * @returns {Promise<void>} Settles once the time is up.
 */
function sleep(ms)
{
  return new Promise((resolve) =>
  {
    setTimeout(resolve, ms);
  });
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

// the dev stack or the bundle's API this shell started, if any; everything the app started stops with it.
let child = null;

// set once the app is ending, so the API's exit is taken for the shutdown it is and not a failure.
let stopping = false;

function shutdown()
{
  stopping = true;

  // a bundle's one child is the API itself, which child.kill reaches on every system; the dev stack is a tree of
  // processes under bun, ended as a process group.
  if (bundled)
  {
    if (child !== null)
    {
      child.kill();
    }
  }
  else
  {
    killTree(child);
  }

  child = null;
}

// every visible window, by the page it shows, and the pages whose windows are still opening.
const openWindows = new Map();
const opening = new Set();

// the error windows on screen, and how many are still opening; each keeps the app open as an editor window does.
const problemWindows = new Set();
let problemsOpening = 0;

// the first page's window, once the windows can open: a second launch of a bundle brings it forward.
let bootWindow = null;

// what stopped a bundle's start, or the editor once it ran: one of the problems the rules word, or an empty string while
// nothing has. A second launch asks the rules what to do with it, which may be to run the start again.
let stoppedBy = '';

// the error windows a stopped start left on screen, which the next start replaces: each closes once the window taking
// its place holds the app open, since closing the last window quits the app. One the person closes first is forgotten.
const replacedProblems = new Set();

// set while a relaunch runs the start again, until the window taking the old error windows' place is on its way. The
// person may well close the old ones meanwhile, as their words ask, and the shell must not take that for the last window
// closing: quitting halfway through a start would end the API it has just started.
let rerunning = false;

// a hidden window held open while a relaunch runs the start again, or null while none does. NW.js ends the app by itself
// the moment its last window closes, whatever the shell decides, and until the new start's relay window opens, which
// waits on its API, the old error windows are the app's only ones, which the person may well close.
let rerunKeeper = null;

// held for the life of the app, so the channel is never collected.
let shellChannel = null;

// the playtests this shell started that are still running, by their profile folder, which is one per project.
const playtests = new Map();

/**
 * Quits once the last visible window has closed, an error window included, unless a relaunch is running the start
 * again, whose own window is still to come; the hidden relay window does not count.
 */
function quitWhenLastWindowCloses()
{
  if (rerunning || openWindows.size > 0 || opening.size > 0 || problemWindows.size > 0 || problemsOpening > 0)
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
    const answer = await httpGetJson(`${apiBase}/api/health`, PLAY_HEALTH_TIMEOUT_MS);
    return rules.healthProjectRoot(answer);
  }
  catch
  {
    // no answer at all names no project either.
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
  const game = spawn(process.execPath, args, rules.playtestSpawnOptions());

  // the shell lets go of the game too, so the shell's own exit never waits on it.
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
 * Opens a small window saying what went wrong, since a desktop launch has no terminal to say it in, and brings it to
 * the front once its words are in. It keeps the app open as an editor window does, so the app quits once it closes,
 * unless editor windows are still open.
 * @param {string} text What went wrong, in plain words.
 */
function showProblem(text)
{
  problemsOpening += 1;
  nw.Window.open('about:blank', { width: 720, height: 320 }, (win) =>
  {
    problemsOpening -= 1;
    problemWindows.add(win);

    // the window taking the place of a stopped start's ones is open now, so they can go without the app ever being
    // left with no window at all.
    closeReplacedProblems();
    win.on('loaded', () =>
    {
      const { document } = win.window;

      // a bundle's window carries the app's name, where the dev stack's has always shown the blank page's.
      if (bundled)
      {
        document.title = 'JMZ Editor';
      }

      document.body.style.background = '#121212';
      document.body.style.color = '#fff';
      document.body.style.fontFamily = 'monospace';
      document.body.style.padding = '16px';
      document.body.style.overflowWrap = 'anywhere';
      document.body.innerText = text;

      // a window replacing one after a relaunch would otherwise open behind whatever the person just fixed the config
      // in, and look as though nothing had happened.
      win.focus();
    });
    win.on('closed', () =>
    {
      problemWindows.delete(win);
      replacedProblems.delete(win);
      quitWhenLastWindowCloses();
    });
  });
}

/**
 * Closes the error windows a new start replaces, and the keeper that held the app open while it ran, once the window
 * taking their place keeps the app open in their stead: a fresh error window once it is open, or the editor's on its
 * way beside the relay window. From then on, closing the last window quits the app again.
 */
function closeReplacedProblems()
{
  const replaced = [ ...replacedProblems ];
  replacedProblems.clear();
  rerunning = false;
  replaced.forEach(win => win.close(true));

  // a rerun's keeper goes last, its work done.
  if (rerunKeeper !== null)
  {
    rerunKeeper.close(true);
    rerunKeeper = null;
  }
}

/**
 * Opens the error window explaining that no project is configured for the dev stack.
 */
function showMissingProjectRoot()
{
  showProblem(
    'JMZ_PROJECT_ROOT is not set.\n\n'
    + 'Set it as an env var, pass --project-root, or set projectRoot in:\n'
    + CONFIG_PATH
  );
}

/**
 * Ends the app on SIGINT and SIGTERM the way closing its last window does, taking everything it started with it.
 */
function stopOnSignals()
{
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
}

/**
 * Reads the size new windows open at from the shell's own manifest.
 * @returns {{ width: number, height: number }} The size.
 */
function windowDefaults()
{
  const nwManifest = readJsonFileSafe(path.join(__dirname, 'package.json')) || {};
  const { width = 1400, height = 900 } = nwManifest.window || {};
  return { width, height };
}

/**
 * Opens the hidden relay, then the first page's window.
 * @param {string} uiUrl The UI's origin.
 * @param {string} apiBase The API's origin.
 */
function openFirstWindow(uiUrl, apiBase)
{
  const size = windowDefaults();
  startRelay(uiUrl, apiBase, size, () =>
  {
    bootWindow = { url: `${uiUrl}${rules.bootPath(argv, bundled)}`, ...size };
    openWindow(bootWindow.url, size.width, size.height);

    // the first page's window is on its way, so the error windows of a start that stopped before it can go.
    closeReplacedProblems();
  });
}

/**
 * Asks whether another program already listens on the bundle's port, by listening there as the API would and letting
 * go at once. Anything else in the way, such as a port this user may not take, is left for the API's own attempt to
 * report.
 * @param {number} port The port.
 * @returns {Promise<boolean>} True when another program holds it.
 */
function isPortTaken(port)
{
  return new Promise((resolve) =>
  {
    const probe = net.createServer();
    probe.once('error', (error) =>
    {
      resolve(error.code === 'EADDRINUSE');
    });
    probe.once('listening', () =>
    {
      probe.close(() => resolve(false));
    });
    probe.listen(port, '127.0.0.1');
  });
}

/**
 * Starts the bundle's API on the project, its output appended to its log behind a line naming the launch. Its stdin is
 * a pipe this shell holds for the life of the app, and the API ends once that pipe closes, which happens however the
 * shell ends, a crash or a kill included, so no API is ever left holding the port against the next launch.
 * @param {{ api: string, ui: string }} layout The bundle's paths.
 * @param {string} version The bundle's version.
 * @param {string} origin The bundle's origin.
 * @param {string} projectRoot The project's folder.
 * @returns {Promise<'exited' | 'unstartable'>} Settles once the API has stopped, as 'exited', or as 'unstartable' when
 * it could not start at all.
 */
function startApi(layout, version, origin, projectRoot)
{
  const output = fs.openSync(userFiles.apiLog, 'a');
  fs.writeSync(output, `\n--- ${new Date().toISOString()} jmz-api ${version} on ${origin} for ${projectRoot}\n`);

  const variables = rules.bundleServerEnvironment(origin, projectRoot, layout.ui);
  const api = spawn(layout.api, [], rules.apiSpawnOptions(process.env, variables, output));

  // the API writes the log through its own copy of it, so the shell lets go of this one.
  fs.closeSync(output);
  child = api;
  log('api-start', { pid: api.pid, api: layout.api, origin, projectRoot });

  return new Promise((resolve) =>
  {
    api.once('exit', (code, signal) =>
    {
      log('api-exit', { code, signal });
      resolve('exited');
    });

    // a binary that cannot run at all, being missing or not executable, never exits; it failed to start, and the
    // reason is in this log line alone, since the API never ran to write its own.
    api.once('error', (error) =>
    {
      log('api-error', { error: String(error) });
      resolve('unstartable');
    });
  });
}

/**
 * Asks the API's health check every quarter second until it answers ready, or the asking is called off.
 * @param {string} origin The bundle's origin.
 * @param {() => boolean} asking Whether to keep asking.
 * @returns {Promise<'ready' | 'api-silent'>} 'ready' once the API answered so, and 'api-silent' when the asking was
 * called off.
 */
async function pollHealth(origin, asking)
{
  while (asking())
  {
    try
    {
      const answer = await httpGetJson(`${origin}/api/health`, 400);
      if (rules.isApiReady(answer))
      {
        return 'ready';
      }
    }
    catch
    {
      // nothing is listening yet; it is asked again in a moment.
    }

    await sleep(250);
  }

  return 'api-silent';
}

/**
 * Waits for the bundle's API to say it is ready, for it to stop or fail to start, or for the wait to run out, whichever
 * comes first.
 * @param {string} origin The bundle's origin.
 * @param {Promise<'exited' | 'unstartable'>} ended Settles once the API has stopped, or could not start at all.
 * @returns {Promise<'ready' | 'api-start-failed' | 'api-stopped' | 'api-silent'>} 'ready' when that came first, and
 * otherwise the problem that did.
 */
async function waitForApi(origin, ended)
{
  let asking = true;
  const outcome = await Promise.race([
    pollHealth(origin, () => asking),
    ended.then(ending => (ending === 'unstartable' ? 'api-start-failed' : 'api-stopped')),
    sleep(API_READY_TIMEOUT_MS).then(() => 'api-silent'),
  ]);

  asking = false;
  return outcome;
}

/**
 * Logs what stopped the bundled editor, keeps it for a second launch to answer, and shows it in the error window.
 * @param {string} problem What stopped it, one of the problems the rules word.
 * @param {{ projectRoot: string, rootSource: string, port: number }} found The project and where it came from, and the
 * port, as far as the shell got.
 */
function reportProblem(problem, found)
{
  log('problem', { problem });
  stoppedBy = problem;
  const files = { config: userFiles.config, apiLog: userFiles.apiLog, shellLog: logPath };
  showProblem(rules.problemText(problem, { ...found, ...files }));
}

/**
 * Runs the bundled editor's start again, for a relaunch after a problem the person can put right stopped it, on this
 * copy's own flags and environment, and the config as it reads now. The error windows on screen stay up until the
 * window taking their place holds the app open, the editor's or a fresh error window, and closing them meanwhile never
 * quits the app: a hidden keeper holds it open until then.
 */
function runAgain()
{
  stoppedBy = '';
  rerunning = true;
  problemWindows.forEach(win => replacedProblems.add(win));

  // the keeper is open before the start runs again, so no moment of the rerun leaves the old windows as the only ones.
  nw.Window.open('about:blank', { show: false, width: 200, height: 100 }, (win) =>
  {
    rerunKeeper = win;
    runBundle().catch(crashed);
  });
}

/**
 * Answers the bundled editor being launched again. The second launch finds this one holding the profile, hands over
 * its command line and exits, and the person expects the editor already open to come to the front, or, after a problem
 * they can put right stopped it, to start again now that they have. The rules decide which (relaunchAction): run the
 * start again, bring the error window forward, or open the first page's window again, or bring it forward. What the
 * second launch asked for is only logged: this copy stays on its own flags.
 * @param {string | string[]} commandLine The second launch's command line, as NW.js hands it over (0.118 wraps it in
 * an array).
 */
function bringForward(commandLine)
{
  const action = rules.relaunchAction({
    problem: stoppedBy,
    problemsOpening,
    problemsShown: problemWindows.size,
    editorReady: bootWindow !== null,
  });
  log('relaunch', { commandLine, action });

  if (action === 'run-again')
  {
    runAgain();
    return;
  }

  if (action === 'focus-problem')
  {
    const [ problem ] = problemWindows;
    problem.focus();
    return;
  }

  // before the windows can open there is nothing to do: the first one is on its way already.
  if (action === 'open-editor')
  {
    openWindow(bootWindow.url, bootWindow.width, bootWindow.height);
  }
}

/**
 * Starts the bundled editor: listens for a second launch, makes the folders its logs live in, and runs its start.
 * @returns {Promise<void>} Settles once the first window is on its way, or an error window is.
 */
async function startBundle()
{
  // a second launch hands its command line over to this one instead of starting.
  nw.App.on('open', bringForward);

  // the logs live in the person's state folder, which a first launch has yet to make.
  fs.mkdirSync(path.dirname(userFiles.apiLog), { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  await runBundle();
}

/**
 * Runs the bundled editor's start: reads the person's config, checks the project and the port, starts the bundle's
 * API, waits for it to be ready, and opens the first window. Whatever stops it on the way is shown in the error window,
 * and a relaunch runs it again when the problem is one the person can put right.
 * @returns {Promise<void>} Settles once the first window is on its way, or an error window is.
 */
async function runBundle()
{
  const layout = rules.bundleLayout(__dirname);
  const manifest = JSON.parse(fs.readFileSync(layout.manifest, 'utf-8'));
  const config = rules.parseBundleConfig(readConfigText(userFiles.config), os.homedir());

  // a config that cannot be read sets nothing, and the window below says the file is wrong.
  const settings = config === null ? { projectRoot: '', port: null } : config;
  const { projectRoot, source } = rules.bundleProjectRoot(argv, process.env, settings, process.cwd());
  const port = rules.bundlePort(settings, manifest.port);
  const origin = rules.bundleOrigin(port);

  // where the folder came from goes with it, so a problem with the folder points the fix at the place that named it.
  const found = { projectRoot, rootSource: source, port };
  const { version } = manifest;
  log('boot', { argv, execPath: process.execPath, version, config: userFiles.config, origin, projectRoot, rootSource: source });

  if (config === null)
  {
    reportProblem('bad-config', found);
    return;
  }

  // the API's health check says only that a project is set, so the project is checked here, before the API starts.
  const rootProblem = rules.projectRootProblem(projectRoot, fs.existsSync);
  if (rootProblem !== null)
  {
    reportProblem(rootProblem, found);
    return;
  }

  // a port another program holds would stop the API at once; saying so names the actual problem.
  if (await isPortTaken(port))
  {
    reportProblem('port-in-use', found);
    return;
  }

  stopOnSignals();
  const ended = startApi(layout, version, origin, projectRoot);
  const outcome = await waitForApi(origin, ended);
  log('api-ready', { outcome });
  if (outcome !== 'ready')
  {
    // an API that never answered is ended, so it holds nothing against the next launch.
    shutdown();
    reportProblem(outcome, found);
    return;
  }

  // from here on every load and save goes through the API, so its stopping is something the person must hear about.
  ended.then(() =>
  {
    if (stopping === false)
    {
      child = null;
      reportProblem('api-stopped', found);
    }
  });

  openFirstWindow(origin, origin);
}

/**
 * Starts the dev stack, or attaches to one already running, and opens the first window once the UI answers or ten
 * seconds pass.
 * @returns {Promise<void>} Settles once the first window is on its way, or the error window is.
 */
async function startDev()
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

  stopOnSignals();

  const ok = await waitForUrlOk(uiUrl, 10_000);
  log('ui', { ok });

  openFirstWindow(uiUrl, apiBase);
}

async function main()
{
  if (bundled)
  {
    await startBundle();
    return;
  }

  await startDev();
}

/**
 * Ends what a start that crashed had started. A bundle has no terminal, so its crash is shown in the error window
 * rather than the app quitting without a word; the dev stack quits.
 * @param {unknown} error What the start threw.
 */
function crashed(error)
{
  log('crash', { error: String(error) });
  shutdown();

  if (bundled)
  {
    reportProblem('crashed', { projectRoot: '', rootSource: 'config', port: 0 });
    return;
  }

  nw.App.quit();
}

main().catch(crashed);
