/**
 * Maps a basename inside {@code data/} (as produced by {@link DataService}) to the Go API path.
 * Align with {@code server/cmd/api/main.go}.
 */
function basename(filesystemPath: string): string
{
  const normalized = filesystemPath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  if (slash >= 0)
  {
    return normalized.slice(slash + 1);
  }
  return normalized;
}

/**
 * The API pathname for every data file the server reads and writes whole, keyed by its basename inside
 * {@code data/}. A table rather than a switch, so each new board adds one line here instead of one more branch.
 * Align with {@code server/cmd/api/main.go}.
 */
const API_PATHNAMES_BY_BASENAME: ReadonlyMap<string, string> = new Map([
  [ 'Actors.json', '/api/actors' ],
  [ 'Animations.json', '/api/animations' ],
  [ 'Armors.json', '/api/armors' ],
  [ 'Classes.json', '/api/classes' ],
  [ 'CommonEvents.json', '/api/common-events' ],
  [ 'Enemies.json', '/api/enemies' ],
  [ 'Items.json', '/api/items' ],
  [ 'Skills.json', '/api/skills' ],
  [ 'States.json', '/api/states' ],
  [ 'Weapons.json', '/api/weapons' ],
  [ 'System.json', '/api/system' ],
  [ 'config.crafting.json', '/api/config/crafting' ],
  [ 'config.proficiency.json', '/api/config/proficiency' ],
  [ 'config.quest.json', '/api/config/quest' ],
  [ 'config.sdp.json', '/api/config/sdp' ],
  [ 'config.jabs.json', '/api/config/jabs' ],
  [ 'config.level.json', '/api/config/level' ],
  [ 'config.difficulty.json', '/api/config/difficulty' ],
  [ 'config.motion.json', '/api/config/motion' ],
  [ 'config.weather.json', '/api/config/weather' ],
  [ 'config.notetag-lines.json', '/api/config/notetag-lines' ],
]);

/**
 * Returns the API pathname (with leading slash, no query) for read/write, or null if unknown.
 * @param {string} baseName The file's basename inside {@code data/}.
 * @returns {string | null} The API pathname, or null for a file the server does not serve.
 */
function apiPathnameForBasename(baseName: string): string | null
{
  // every file the server knows by name.
  const pathname = API_PATHNAMES_BY_BASENAME.get(baseName);
  if (pathname !== undefined)
  {
    return pathname;
  }

  const mapMatch = /^Map(\d+)\.json$/u.exec(baseName);
  if (mapMatch)
  {
    const id = Number.parseInt(mapMatch[1], 10);
    return `/api/maps/${String(id)}`;
  }

  return null;
}

/**
 * Resolves a filesystem-style {@code .../data/File.json} key from {@link DataService} to a full URL under {@link apiBase}.
 */
function resolveJsonApiUrl(apiBase: string, filesystemPath: string): string
{
  const trimmedBase = apiBase.replace(/\/$/u, '');
  const name = basename(filesystemPath);
  const pathname = apiPathnameForBasename(name);
  if (pathname === null)
  {
    throw new Error(
      `HttpJsonStore: no API route for "${name}". Extend jsonApiRoutes.ts if this file should load via Go.`,
    );
  }
  return `${trimmedBase}${pathname}`;
}

export { apiPathnameForBasename, basename, resolveJsonApiUrl };
