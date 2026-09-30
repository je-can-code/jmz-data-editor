// The NW.js shell. It starts the Go API and the UI (unless told to attach to ones already running), then opens
// windows for the pages, which are served over HTTP and cannot reach nw themselves.
//
// Pages ask for windows on the 'jmz-shell' BroadcastChannel. The shell hears that channel through a hidden window
// of the UI's own origin, opened without new_instance so its DOM is reachable from here, and opens each requested
// page with new_instance, so every window runs in its own renderer process and a busy one never stalls another.
// A second request for a page already open focuses its window instead.
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
const path = require('node:path');
const http = require('node:http');
const rules = require('./shellRules.js');

const DEFAULT_API_BASE = 'http://127.0.0.1:8080';
const DEFAULT_UI_URL = 'http://127.0.0.1:3000';
const SHELL_CHANNEL = 'jmz-shell';

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
 * Opens the hidden window on the UI's origin and listens on the shell channel through it.
 * @param {string} uiUrl The UI's origin.
 * @param {{ width: number, height: number }} fallbackSize The size for windows that ask for none.
 * @param {() => void} ready Called once the shell is listening.
 */
function startRelay(uiUrl, fallbackSize, ready)
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

  log('boot', { argv, attach, apiBase, uiUrl, projectRoot, maps: rules.hasFlag(argv, '--maps') });

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

  startRelay(uiUrl, { width, height }, () =>
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
