// The NW.js shell's decisions, kept apart from main.js so they can be tested without NW.js: reading the app's
// flags, deciding which page boots, naming and vetting the windows pages ask for, what a page may read off the
// clipboard, and how a project's playtest is started and judged.
const crypto = require('node:crypto');
const path = require('node:path');

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
 * Names the page the shell opens first: the map editor under --maps, the data editor otherwise.
 * @param {string[]} argv The app's arguments.
 * @returns {string} The page's path.
 */
function bootPath(argv)
{
  return hasFlag(argv, '--maps') ? '/map.html' : '/';
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
 * Finds the folder caches belong in on Linux, as the XDG base directory spec has it: XDG_CACHE_HOME when it names an
 * absolute folder, and ~/.cache otherwise. The spec says to ignore an empty or relative value, so both fall back too.
 * @param {Record<string, string | undefined>} environment The process's environment.
 * @param {string} homeDirectory The person's home folder.
 * @returns {string} The cache folder.
 */
function cacheDirectory(environment, homeDirectory)
{
  const configured = environment.XDG_CACHE_HOME || '';
  return path.isAbsolute(configured) ? configured : path.join(homeDirectory, '.cache');
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
  return path.join(cacheRoot, 'jmz-editor', 'playtest', digest);
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

module.exports = {
  bootPath,
  cacheDirectory,
  clipboardAnswer,
  CLIPBOARD_KINDS,
  devStackArgs,
  hasFlag,
  isGameFolder,
  playArguments,
  playOutcome,
  playReplyChannel,
  playtestProfileDirectory,
  readFlag,
  resolveWindowUrl,
  serverEnvironment,
  trimOrigin,
  uiPort,
  windowKey,
  windowSize,
};
