const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const DEFAULT_API_BASE = 'http://127.0.0.1:8080';
const DEFAULT_UI_URL = 'http://127.0.0.1:3000';

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

function parseArgValue(argv, flag)
{
  const idx = argv.indexOf(flag);
  if (idx === -1)
  {
    return null;
  }
  const v = argv[idx + 1];
  if (typeof v !== 'string' || v.trim() === '')
  {
    return null;
  }
  return v.trim();
}

function normalizeApiBase(s)
{
  return String(s).trim().replace(/\/$/, '');
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
    await new Promise(r => setTimeout(r, 250));
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

async function main()
{
  const argv = process.argv.slice(2);

  const cfg = readJsonFileSafe(CONFIG_PATH) || {};

  const apiBase = normalizeApiBase(
    parseArgValue(argv, '--api-base')
    || process.env.VITE_JMZ_API_BASE
    || cfg.apiBase
    || DEFAULT_API_BASE
  );

  const projectRoot =
    parseArgValue(argv, '--project-root')
    || process.env.JMZ_PROJECT_ROOT
    || cfg.projectRoot
    || '';

  if (!projectRoot)
  {
    // Open a small window with a message if no project root.
    nw.Window.open('about:blank', { width: 720, height: 320 }, (win) =>
    {
      win.on('loaded', () =>
      {
        win.window.document.body.style.background = '#121212';
        win.window.document.body.style.color = '#fff';
        win.window.document.body.style.fontFamily = 'monospace';
        win.window.document.body.style.padding = '16px';
        win.window.document.body.innerText =
          'JMZ_PROJECT_ROOT is not set.\\n\\n'
          + 'Set it as an env var, pass --project-root, or set projectRoot in:\\n'
          + CONFIG_PATH;
      });
    });
    return;
  }

  writeJsonFileSafe(CONFIG_PATH, {
    ...cfg,
    apiBase,
    projectRoot,
  });

  const child = spawn(
    'bun',
    [ 'run', 'dev', '--project-root', projectRoot, '--api-base', apiBase ],
    {
      cwd: repoRoot(),
      env: {
        ...process.env,
        JMZ_PROJECT_ROOT: projectRoot,
        VITE_JMZ_API_BASE: apiBase,
      },
      stdio: 'inherit',
      detached: true,
    },
  );

  const shutdown = () =>
  {
    killTree(child);
  };

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

  const uiUrl = cfg.uiUrl || DEFAULT_UI_URL;
  const ok = await waitForUrlOk(uiUrl, 10_000);

  const nwManifest = readJsonFileSafe(path.join(__dirname, 'package.json')) || {};
  const { width = 1400, height = 900 } = nwManifest.window || {};

  nw.Window.open(uiUrl, { width, height }, (win) =>
  {
    win.on('close', () =>
    {
      shutdown();
      win.close(true);
      nw.App.quit();
    });

    if (!ok)
    {
      win.on('loaded', () =>
      {
        // no-op: window will still attempt to load; user will see the gate screen if backend isn't ready.
      });
    }
  });
}

main().catch(() =>
{
  nw.App.quit();
});

