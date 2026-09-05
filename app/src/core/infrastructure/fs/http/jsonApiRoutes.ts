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
 * Returns the API pathname (with leading slash, no query) for read/write, or null if unknown.
 */
function apiPathnameForBasename(baseName: string): string | null
{
  switch (baseName)
  {
    case 'Actors.json':
      return '/api/actors';
    case 'Animations.json':
      return '/api/animations';
    case 'Armors.json':
      return '/api/armors';
    case 'Classes.json':
      return '/api/classes';
    case 'CommonEvents.json':
      return '/api/common-events';
    case 'Enemies.json':
      return '/api/enemies';
    case 'Items.json':
      return '/api/items';
    case 'Skills.json':
      return '/api/skills';
    case 'States.json':
      return '/api/states';
    case 'Weapons.json':
      return '/api/weapons';
    case 'System.json':
      return '/api/system';
    case 'config.crafting.json':
      return '/api/config/crafting';
    case 'config.proficiency.json':
      return '/api/config/proficiency';
    case 'config.quest.json':
      return '/api/config/quest';
    case 'config.sdp.json':
      return '/api/config/sdp';
    case 'config.jabs.json':
      return '/api/config/jabs';
    case 'config.level.json':
      return '/api/config/level';
    case 'config.difficulty.json':
      return '/api/config/difficulty';
    case 'config.motion.json':
      return '/api/config/motion';
    default:
      break;
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
