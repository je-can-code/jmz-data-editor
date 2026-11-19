// The NW.js shell's decisions, kept apart from main.js so they can be tested without NW.js: reading the app's
// flags, deciding which page boots, naming and vetting the windows pages ask for, what a page may read off the
// clipboard, how a project's playtest is started and judged, and how the bundled editor finds its files, its
// project and its address, and when its API is ready.
const crypto = require('node:crypto');
const path = require('node:path');

/**
 * The folder the editor keeps its own files in, inside each of the person's XDG folders: the bundle's config, its
 * logs, and the profiles playtests run on. It matches the bundle's NW.js name, so everything the editor leaves on a
 * machine sits under one name.
 */
const APP_FOLDER = 'jmz-editor';

/**
 * The page the bundled editor opens on. Which editor is the main one is not settled yet, and until it is the bundle
 * opens on the map editor, with the data editor a click away on its bar; settling it the other way is this one line.
 */
const BUNDLE_HOME_PAGE = '/map.html';

/**
 * Reads a flag's value from the app's arguments, in either form the shell accepts: `--name=value` or
 * `--name value`. The arguments come from nw.App.argv, which also carries some of Chromium's own switches, so
 * flags are found by name and a following argument that is itself a flag is never taken as a value.
 * @param {string[]} argv The app's arguments.
 * @param {string} name The flag, dashes included.
 * @returns {string | null} The value, trimmed, or null when the flag is absent or empty.
 */
function readFlag(argv, name)
{
  for (let index = 0; index < argv.length; index++)
  {
    const arg = argv[index];
    if (arg.startsWith(`${name}=`))
    {
      const value = arg.slice(name.length + 1).trim();
      return value === '' ? null : value;
    }

    if (arg === name)
    {
      const next = argv[index + 1];
      if (typeof next !== 'string' || next.startsWith('--') || next.trim() === '')
      {
        return null;
      }

      return next.trim();
    }
  }

  return null;
}

/**
 * Reports whether a bare flag is present.
 * @param {string[]} argv The app's arguments.
 * @param {string} name The flag, dashes included.
 * @returns {boolean} True when present.
 */
function hasFlag(argv, name)
{
  return argv.includes(name);
}

/**
 * Trims the trailing slash from an origin, so it joins cleanly with a path.
 * @param {string} origin The origin.
 * @returns {string} The origin without trailing slashes.
 */
function trimOrigin(origin)
{
  return String(origin).trim().replace(/\/+$/, '');
}

/**
 * Names the page the shell opens first: the map editor under --maps, and otherwise the bundle's home page in a bundle
 * and the data editor in the dev stack.
 * @param {string[]} argv The app's arguments.
 * @param {boolean} bundled Whether the shell runs from a bundle.
 * @returns {string} The page's path.
 */
function bootPath(argv, bundled)
{
  if (hasFlag(argv, '--maps'))
  {
    return '/map.html';
  }

  return bundled ? BUNDLE_HOME_PAGE : '/';
}

/**
 * Resolves a page's window request against the UI's origin, refusing anything on another origin: a window there
 * would share none of the channels the editors talk over. localhost and 127.0.0.1 are different origins, so the
 * shell only ever opens the one it was given.
 * @param {unknown} requested The URL the page asked for.
 * @param {string} uiUrl The UI's origin.
 * @returns {string | null} The absolute URL, or null when refused.
 */
function resolveWindowUrl(requested, uiUrl)
{
  if (typeof requested !== 'string' || requested === '')
  {
    return null;
  }

  try
  {
    const url = new URL(requested, `${trimOrigin(uiUrl)}/`);
    return url.origin === new URL(trimOrigin(uiUrl)).origin ? url.href : null;
  }
  catch
  {
    return null;
  }
}

/**
 * Names the window a URL shows, so a second request for it focuses the open window. Two URLs name the same
 * window when they differ only in their hash (the data editor's board routes), in the order of their query, or in
 * spelling out index.html.
 * @param {string} url An absolute URL.
 * @returns {string} The window's key.
 */
function windowKey(url)
{
  const parsed = new URL(url);
  const pathname = parsed.pathname.endsWith('/index.html')
    ? parsed.pathname.slice(0, -'index.html'.length)
    : parsed.pathname;
  const query = [ ...parsed.searchParams.entries() ]
    .sort(([ left ], [ right ]) => left.localeCompare(right))
    .map(([ key, value ]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return `${parsed.origin}${pathname}${query === '' ? '' : `?${query}`}`;
}

/**
 * Keeps a requested window size sensible, falling back when the page asked for none.
 * @param {unknown} requested The size the page asked for.
 * @param {number} fallback The size to use otherwise.
 * @returns {number} The size, in pixels.
 */
function windowSize(requested, fallback)
{
  if (typeof requested !== 'number' || Number.isFinite(requested) === false)
  {
    return fallback;
  }

  return Math.round(Math.min(7680, Math.max(320, requested)));
}

/**
 * The clipboards the shell reads for a page, by the marker each carries and the field it carries it in: stamps copied
 * off a map, pages copied out of an event window, commands copied out of a command list, and rows copied out of a data
 * editor board. A page asks for one of these, and gets the system clipboard's text only when it is that clipboard:
 * anything else on it (a password, a message, another program's data) never reaches a page through the shell.
 */
const CLIPBOARD_KINDS = {
  'jmz-map-editor/stamp': 'marker',
  'jmz-map-editor/pages': 'marker',
  'jmz-map-editor/commands': 'format',
  'jmz-data-editor/rows': 'format',
};

/**
 * The name a page's reply channel must have: a fixed prefix and a random UUID, which no other window knows, so the
 * answer reaches the asking window alone and never the shell channel every window hears.
 */
const CLIPBOARD_REPLY_PATTERN = /^jmz-clipboard-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Reports whether clipboard text is one of the app's own clipboards, of the kind a page asked for.
 * @param {unknown} text The clipboard's text.
 * @param {unknown} marker The marker the page asked for.
 * @returns {boolean} True when the text is JSON carrying that marker, in the field that kind carries it in.
 */
function carriesMarker(text, marker)
{
  if (typeof marker !== 'string' || Object.hasOwn(CLIPBOARD_KINDS, marker) === false || typeof text !== 'string')
  {
    return false;
  }

  let parsed;
  try
  {
    parsed = JSON.parse(text);
  }
  catch
  {
    return false;
  }

  return parsed !== null && typeof parsed === 'object' && Array.isArray(parsed) === false && parsed[CLIPBOARD_KINDS[marker]] === marker;
}

/**
 * Works out the shell's answer to a page's clipboard read: the channel to send it on, which is the reply channel the
 * page opened for it, and the text, which is the clipboard's only when it carries the marker the page asked for, and
 * empty otherwise. A read naming no proper reply channel gets no answer at all, and the clipboard is not even read.
 * @param {unknown} request The page's request, as the shell channel delivered it.
 * @param {() => unknown} readText Reads the system clipboard's text.
 * @returns {{ channel: string, message: { type: 'clipboard-text', text: string } } | null} The answer, or null for none.
 */
function clipboardAnswer(request, readText)
{
  const { replyTo, marker } = request;
  if (typeof replyTo !== 'string' || CLIPBOARD_REPLY_PATTERN.test(replyTo) === false)
  {
    return null;
  }

  const text = readText();
  return {
    channel: replyTo,
    message: { type: 'clipboard-text', text: carriesMarker(text, marker) ? text : '' },
  };
}

/**
 * The name a page's reply channel for a playtest must have: a prefix of its own and a random UUID, as a clipboard
 * read's has, so the answer reaches the asking window alone and never the shell channel every window hears.
 */
const PLAY_REPLY_PATTERN = /^jmz-play-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Vets the reply channel a page named for its play request. A request naming any other channel gets no answer, and
 * starts no game.
 * @param {unknown} name The name the page sent.
 * @returns {string | null} The name, when it is a play reply channel's, or null when it is not.
 */
function playReplyChannel(name)
{
  return typeof name === 'string' && PLAY_REPLY_PATTERN.test(name) ? name : null;
}

/**
 * Reports whether a folder holds a game NW.js can start: the manifest NW.js reads first, and the page every RPG Maker
 * MZ game opens on. A folder missing either has no game in it to play.
 * @param {string[]} listing The names in the folder.
 * @returns {boolean} True only when both are there.
 */
function isGameFolder(listing)
{
  return listing.includes('package.json') && listing.includes('index.html');
}

/**
 * Finds one of the person's XDG base folders on Linux, as the spec has it: the variable's value when it names an
 * absolute folder, and the spec's default under the home folder otherwise. The spec says to ignore an empty or relative
 * value, so both fall back too.
 * @param {Record<string, string | undefined>} environment The process's environment.
 * @param {string} variable The variable naming the folder, such as XDG_CACHE_HOME.
 * @param {string} homeDirectory The person's home folder.
 * @param {string} fallback The spec's default, relative to the home folder, such as .cache.
 * @returns {string} The folder.
 */
function xdgDirectory(environment, variable, homeDirectory, fallback)
{
  const configured = environment[variable] || '';
  return path.isAbsolute(configured) ? configured : path.join(homeDirectory, fallback);
}

/**
 * Finds the folder caches belong in on Linux: XDG_CACHE_HOME when it names an absolute folder, and ~/.cache otherwise.
 * @param {Record<string, string | undefined>} environment The process's environment.
 * @param {string} homeDirectory The person's home folder.
 * @returns {string} The cache folder.
 */
function cacheDirectory(environment, homeDirectory)
{
  return xdgDirectory(environment, 'XDG_CACHE_HOME', homeDirectory, '.cache');
}

/**
 * Finds the folder settings belong in on Linux: XDG_CONFIG_HOME when it names an absolute folder, and ~/.config
 * otherwise.
 * @param {Record<string, string | undefined>} environment The process's environment.
 * @param {string} homeDirectory The person's home folder.
 * @returns {string} The config folder.
 */
function configDirectory(environment, homeDirectory)
{
  return xdgDirectory(environment, 'XDG_CONFIG_HOME', homeDirectory, '.config');
}

/**
 * Finds the folder logs and other state belong in on Linux: XDG_STATE_HOME when it names an absolute folder, and
 * ~/.local/state otherwise.
 * @param {Record<string, string | undefined>} environment The process's environment.
 * @param {string} homeDirectory The person's home folder.
 * @returns {string} The state folder.
 */
function stateDirectory(environment, homeDirectory)
{
  return xdgDirectory(environment, 'XDG_STATE_HOME', homeDirectory, path.join('.local', 'state'));
}

/**
 * Names the profile a project's playtests run on: a folder of their own under the cache, named by the SHA-1 of the
 * project's absolute folder, so every Play of one project lands on the same profile and two projects never share one.
 * RPG Maker gives every game the same name, and so the same default profile, and a launch onto a profile already in use
 * hands itself over to whatever runs there: without a profile of its own, Play would hand off to a copy of the game
 * started some other way, or to another project's. Two spellings of one folder, such as one with a trailing slash, are
 * one project.
 * @param {string} cacheRoot The cache folder.
 * @param {string} projectRoot The project's folder.
 * @returns {string} The profile's folder.
 */
function playtestProfileDirectory(cacheRoot, projectRoot)
{
  const digest = crypto.createHash('sha1')
    .update(path.resolve(projectRoot))
    .digest('hex');
  return path.join(cacheRoot, APP_FOLDER, 'playtest', digest);
}

/**
 * Builds the arguments that start a project's playtest on the editor's own NW.js: the game's folder, 'test', then the
 * playtest's profile. RPG Maker reads test mode from the first argument after the folder and no other, and NW.js leaves
 * Chromium's switches among those arguments, so 'test' comes straight after the folder: a switch placed before it would
 * take its place, and the game would start without its debug screen and DevTools.
 * @param {string} projectRoot The project's folder.
 * @param {string} profileDirectory The playtest's profile folder.
 * @returns {string[]} The arguments for the NW.js binary.
 */
function playArguments(projectRoot, profileDirectory)
{
  return [ projectRoot, 'test', `--user-data-dir=${profileDirectory}` ];
}

/**
 * Works out what became of a launch from how its process ended within the moment the shell watches it, or from its not
 * having ended. A launch onto a profile already in use hands itself over to the game running there and exits at once
 * with code 0, so that game is already running; any other ending, a code or a signal, is a game that failed to start;
 * and a process still running when the moment is up is the game, started.
 * @param {{ code: number | null, signal: string | null } | null} exit How the process ended, or null while it runs.
 * @returns {'started' | 'already-running' | 'failed'} What became of the launch.
 */
function playOutcome(exit)
{
  if (exit === null)
  {
    return 'started';
  }

  return exit.code === 0 ? 'already-running' : 'failed';
}

/**
 * Builds the environment the Go API reads its configuration from, out of the same origins that tell the UI
 * where everything is: the address to listen on, from the API base, and the one page origin allowed to call it,
 * from the UI's URL. A UI moved off port 3000 is then allowed, and the default origins are not.
 * @param {string} apiBase The API's origin, such as http://127.0.0.1:8080.
 * @param {string} uiUrl The UI's origin, such as http://127.0.0.1:3000.
 * @returns {{ JMZ_API_ADDRESS: string, JMZ_UI_ORIGINS: string }} The variables.
 */
function serverEnvironment(apiBase, uiUrl)
{
  const api = new URL(trimOrigin(apiBase));
  return {
    JMZ_API_ADDRESS: `${api.hostname}:${portOf(api)}`,
    JMZ_UI_ORIGINS: new URL(trimOrigin(uiUrl)).origin,
  };
}

/**
 * Reads a URL's port, filling in the scheme's default when the URL leaves it out.
 * @param {URL} url The parsed URL.
 * @returns {number} The port.
 */
function portOf(url)
{
  if (url.port !== '')
  {
    return Number(url.port);
  }

  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Reads the port the UI's dev server must listen on from its URL.
 * @param {string} uiUrl The UI's origin.
 * @returns {number} The port.
 */
function uiPort(uiUrl)
{
  return portOf(new URL(trimOrigin(uiUrl)));
}

/**
 * Builds the arguments that start the dev stack (the Go API and the UI) for a project.
 * @param {string} projectRoot The RMMZ project.
 * @param {string} apiBase The API's origin.
 * @param {string} uiUrl The UI's origin.
 * @returns {string[]} The arguments for bun.
 */
function devStackArgs(projectRoot, apiBase, uiUrl)
{
  return [ 'run', 'dev', '--project-root', projectRoot, '--api-base', apiBase, '--ui-url', uiUrl ];
}

/**
 * Lays out a bundle around the shell's own folder. The build puts the shell in the bundle's editor folder, so the
 * bundle's root is the folder above it, and the manifest the build wrote, the API's binary and the UI's built pages all
 * sit there.
 * @param {string} shellDirectory The folder the shell runs from.
 * @returns {{ root: string, manifest: string, api: string, ui: string }} The bundle's root, its manifest, the API's
 * binary and the folder of the UI's pages.
 */
function bundleLayout(shellDirectory)
{
  const root = path.resolve(shellDirectory, '..');
  return {
    root,
    manifest: path.join(root, 'bundle.json'),
    api: path.join(root, 'server', 'jmz-api'),
    ui: path.join(root, 'ui'),
  };
}

/**
 * Reports whether the shell runs from a bundle. The build writes bundle.json beside the shell's folder, and a checkout
 * of the repo never has one there, so a checkout runs the dev stack exactly as it always has.
 * @param {string} shellDirectory The folder the shell runs from.
 * @param {(filePath: string) => boolean} exists Reports whether a file is there.
 * @returns {boolean} True in a bundle.
 */
function isBundled(shellDirectory, exists)
{
  return exists(bundleLayout(shellDirectory).manifest);
}

/**
 * Names the files the bundled editor keeps for the person, outside the bundle so an update leaves them alone: the
 * config, in the XDG config folder, and the logs of the API and of the shell, in the XDG state folder. A desktop launch
 * has no terminal, so the logs are the one place anything the API or the shell says can be read.
 * @param {Record<string, string | undefined>} environment The process's environment.
 * @param {string} homeDirectory The person's home folder.
 * @returns {{ config: string, apiLog: string, shellLog: string }} The files.
 */
function bundleUserFiles(environment, homeDirectory)
{
  const state = path.join(stateDirectory(environment, homeDirectory), APP_FOLDER);
  return {
    config: path.join(configDirectory(environment, homeDirectory), APP_FOLDER, 'config.json'),
    apiLog: path.join(state, 'api.log'),
    shellLog: path.join(state, 'shell.log'),
  };
}

/**
 * Reports whether a value is a port the bundle can be told to use: a whole number from 1 to 65535. Port 0 would ask
 * the system for any free port, a new one every launch, and a port that moves leaves behind everything the pages saved.
 * @param {unknown} value The value.
 * @returns {boolean} True for a usable port.
 */
function isPort(value)
{
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * Reads the bundled editor's config, which the person writes by hand: an object naming the project's folder as
 * projectRoot and, when the bundle's own port will not do, a port. No file at all is a config with nothing set, and a
 * key left out or set to null is unset. Keys it does not know are left alone. Text it cannot make sense of is refused
 * rather than half read, so the person learns the file is wrong instead of being told nothing is set.
 * @param {string | null} text The file's text, or null when there is no file.
 * @returns {{ projectRoot: string, port: number | null } | null} The settings, with an empty folder and a null port
 * for whichever is unset, or null when the text is not a config.
 */
function parseBundleConfig(text)
{
  if (text === null)
  {
    return { projectRoot: '', port: null };
  }

  let parsed;
  try
  {
    parsed = JSON.parse(text);
  }
  catch
  {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
  {
    return null;
  }

  const projectRoot = parsed.projectRoot ?? '';
  const port = parsed.port ?? null;
  if (typeof projectRoot !== 'string' || (port !== null && isPort(port) === false))
  {
    return null;
  }

  return { projectRoot: projectRoot.trim(), port };
}

/**
 * Picks the bundled editor's project by the dev stack's precedence: --project-root, then JMZ_PROJECT_ROOT, then the
 * config. A relative folder counts from where the editor was started, and is made absolute here, so the root check,
 * the API and Play all name the one folder.
 * @param {string[]} argv The app's arguments.
 * @param {Record<string, string | undefined>} environment The process's environment.
 * @param {{ projectRoot: string }} config The config's settings.
 * @param {string} workingDirectory The folder the editor was started from.
 * @returns {string} The project's absolute folder, or an empty string when none is set.
 */
function bundleProjectRoot(argv, environment, config, workingDirectory)
{
  const fromEnvironment = (environment.JMZ_PROJECT_ROOT || '').trim();
  const chosen = readFlag(argv, '--project-root') || fromEnvironment || config.projectRoot;
  return chosen === '' ? '' : path.resolve(workingDirectory, chosen);
}

/**
 * Picks the bundled editor's port: the config's when it sets one, and the one the bundle's manifest names otherwise.
 * @param {{ port: number | null }} config The config's settings.
 * @param {number} defaultPort The bundle's own port.
 * @returns {number} The port.
 */
function bundlePort(config, defaultPort)
{
  return config.port === null ? defaultPort : config.port;
}

/**
 * Builds the bundled editor's one origin, which serves its pages and its API alike. It stays the same from launch to
 * launch: the pages' saved settings and the channels the windows talk over belong to an origin, so a new one each time
 * would start the editor afresh each time. It is always the loopback address, the only one the API listens on.
 * @param {number} port The port.
 * @returns {string} The origin.
 */
function bundleOrigin(port)
{
  return `http://127.0.0.1:${port}`;
}

/**
 * Builds the environment the bundled editor starts its API with: the one origin, as both the address to listen on and
 * the one page origin allowed to call it; the project; the folder of the UI's pages, served beside the API; and the
 * instruction to end once stdin closes, so the API never outlives the shell that started it, however the shell ends.
 * @param {string} origin The bundle's origin.
 * @param {string} projectRoot The project's folder.
 * @param {string} uiDirectory The folder of the UI's built pages.
 * @returns {Record<string, string>} The variables.
 */
function bundleServerEnvironment(origin, projectRoot, uiDirectory)
{
  return {
    ...serverEnvironment(origin, origin),
    JMZ_PROJECT_ROOT: projectRoot,
    JMZ_UI_DIR: uiDirectory,
    JMZ_EXIT_WITH_PARENT: '1',
  };
}

/**
 * Checks the project before the API starts on it, since the API's health check only says a project is set, never that
 * one is there: a project must be chosen, its folder must be there, and it must be an RPG Maker MZ project, which always
 * has data/System.json.
 * @param {string} projectRoot The project's folder, or an empty string when none is set.
 * @param {(filePath: string) => boolean} exists Reports whether a file or folder is there.
 * @returns {'no-project' | 'missing-project' | 'not-a-project' | null} What is wrong, or null when nothing is.
 */
function projectRootProblem(projectRoot, exists)
{
  if (projectRoot === '')
  {
    return 'no-project';
  }

  if (exists(projectRoot) === false)
  {
    return 'missing-project';
  }

  return exists(path.join(projectRoot, 'data', 'System.json')) ? null : 'not-a-project';
}

/**
 * Reports whether the API's answer to its health check says it is ready: a 200 whose data says ok. Any other answer is
 * an API not ready yet, or not the editor's at all.
 * @param {{ status: number, body: unknown }} answer The status, and the body, parsed.
 * @returns {boolean} True when ready.
 */
function isApiReady(answer)
{
  const { status, body } = answer;
  if (status !== 200 || body === null || typeof body !== 'object')
  {
    return false;
  }

  const { data } = body;
  return data !== null && typeof data === 'object' && data.ok === true;
}

/**
 * What the bundled editor's error window says about each thing that can stop it, in plain words, line by line, and the
 * log that says more: the shell's, for what the shell found before starting the API, and the API's, for what became of
 * the API. A desktop launch has no terminal, so this window is the one place the person learns what went wrong.
 *
 * Whatever the person can put right themselves ends by asking them to close this window before opening the editor
 * again. The checks run only as the editor starts, and while this window is up the editor is still running: opening it
 * again hands the launch over to this copy, which brings this window forward and checks nothing, so the fix would look
 * as though it had failed.
 */
const PROBLEMS = {
  'no-project': {
    log: 'shellLog',
    lines: facts => [
      'No project is chosen yet.',
      '',
      `Set "projectRoot" in ${facts.config} to your game's folder.`,
      'Then close this window and open the editor again.',
    ],
  },
  'missing-project': {
    log: 'shellLog',
    lines: facts => [
      'The project folder isn\'t there:',
      facts.projectRoot,
      '',
      `Set "projectRoot" in ${facts.config} to your game's folder.`,
      'Then close this window and open the editor again.',
    ],
  },
  'not-a-project': {
    log: 'shellLog',
    lines: facts => [
      'This folder isn\'t an RPG Maker MZ project, since it has no data/System.json:',
      facts.projectRoot,
      '',
      `Set "projectRoot" in ${facts.config} to your game's folder.`,
      'Then close this window and open the editor again.',
    ],
  },
  'bad-config': {
    log: 'shellLog',
    lines: facts => [
      `The settings in ${facts.config} can't be read.`,
      '',
      'The file should hold { "projectRoot": "/path/to/your/game" }, and "port" too when the editor needs another',
      'port: a whole number from 1 to 65535.',
      'Once it does, close this window and open the editor again.',
    ],
  },
  'port-in-use': {
    log: 'shellLog',
    lines: facts => [
      `Port ${facts.port} is already in use by another program.`,
      '',
      `Close that program, or set "port" in ${facts.config} to a free port.`,
      'Then close this window and open the editor again.',
    ],
  },
  'api-stopped': {
    log: 'apiLog',
    lines: () => [ 'The editor\'s server stopped.' ],
  },
  'api-silent': {
    log: 'apiLog',
    lines: () => [ 'The editor\'s server didn\'t answer in time.' ],
  },
  'crashed': {
    log: 'shellLog',
    lines: () => [ 'The editor couldn\'t start.' ],
  },
};

/**
 * Words what went wrong for the error window, and names the log that says more.
 * @param {string} problem What went wrong, one of the problems above.
 * @param {{ projectRoot: string, port: number, config: string, apiLog: string, shellLog: string }} facts The project,
 * the port, and the config and log files, as the bundle has them.
 * @returns {string} The window's text.
 */
function problemText(problem, facts)
{
  const { log, lines } = PROBLEMS[problem];
  return [ ...lines(facts), '', `The log is at ${facts[log]}` ].join('\n');
}

module.exports = {
  bootPath,
  bundleLayout,
  bundleOrigin,
  bundlePort,
  bundleProjectRoot,
  bundleServerEnvironment,
  bundleUserFiles,
  cacheDirectory,
  clipboardAnswer,
  CLIPBOARD_KINDS,
  devStackArgs,
  hasFlag,
  isApiReady,
  isBundled,
  isGameFolder,
  parseBundleConfig,
  playArguments,
  playOutcome,
  playReplyChannel,
  playtestProfileDirectory,
  problemText,
  projectRootProblem,
  readFlag,
  resolveWindowUrl,
  serverEnvironment,
  trimOrigin,
  uiPort,
  windowKey,
  windowSize,
};
