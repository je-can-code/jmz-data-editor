/**
 * Default RMMZ **project root** (folder that contains {@code data/}, {@code img/}, {@code js/}, …).
 */
const defaultProjectRoot = '/run/media/je/exdrive/dev/gaming/ca/chef-adventure/';

function pathSegments(pathStr: string): string[]
{
  return pathStr.split(/[/\\]/u)
    .filter((s) => s.length > 0);
}

/**
 * If {@code pathStr} points at a {@code data} directory, returns its parent (project root); otherwise returns the trimmed path.
 * Use when migrating stored values that used to be the {@code data} folder only.
 */
function toRmmzProjectRootFromPossibleDataPath(pathStr: string): string
{
  const trimmed = pathStr.trim()
    .replace(/[/\\]+$/u, '');
  if (trimmed.length === 0)
  {
    return trimmed;
  }

  const parts = pathSegments(trimmed);
  if (parts.length === 0)
  {
    return trimmed;
  }

  const last = parts[ parts.length - 1 ];
  if (last.toLowerCase() !== 'data')
  {
    return trimmed;
  }

  parts.pop();
  const posixAbsolute = trimmed.startsWith('/');
  const useBackslash = trimmed.includes('\\');
  const sep = useBackslash
    ? '\\'
    : '/';
  if (parts.length === 0)
  {
    if (posixAbsolute && useBackslash === false)
    {
      return '/';
    }
    return '';
  }

  let out = parts.join(sep);
  if (posixAbsolute && useBackslash === false)
  {
    out = `/${out}`;
  }

  return out;
}

/**
 * @param projectRoot Absolute path to the RMMZ project root (parent of {@code data}).
 * @returns Absolute path to the {@code data} directory for JSON database files.
 */
function resolveRmmzDataDirectory(projectRoot: string): string
{
  const root = projectRoot.trim()
    .replace(/[/\\]+$/u, '');
  if (root.length === 0)
  {
    return '';
  }

  const sep = root.includes('\\')
    ? '\\'
    : '/';
  return `${root}${sep}data`;
}

export {
  defaultProjectRoot,
  resolveRmmzDataDirectory,
  toRmmzProjectRootFromPossibleDataPath,
};
