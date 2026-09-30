// The NW.js shell's decisions, kept apart from main.js so they can be tested without NW.js: reading the app's
// flags, deciding which page boots, and naming and vetting the windows pages ask for.

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

module.exports = { bootPath, hasFlag, readFlag, resolveWindowUrl, trimOrigin, windowKey, windowSize };
