import { getJmzHttpApiBase } from '../constants/jmzHttpApiBase.ts';

/**
 * Splits a filesystem path into non-empty segments (forward or backslash).
 * @param pathStr Absolute or relative path string.
 */
function pathSegments(pathStr: string): string[]
{
  return pathStr.split(/[/\\]/u)
    .filter((s) => s.length > 0);
}

/**
 * Normalizes a project-related path for native filesystem calls (RMMZ project root or {@code data/}; see {@link resolveGameProjectRootFromDataPath}).
 * @param projectDataPath Raw path from config, localStorage, or a folder dialog.
 */
function normalizeProjectDataPathForFilesystem(projectDataPath: string): string
{
  const s = projectDataPath.trim();
  const lower = s.toLowerCase();
  if (lower.startsWith('file://'))
  {
    try
    {
      const { pathname } = new URL(s);
      if (/^\/[a-z]:\//iu.test(pathname))
      {
        return pathname.slice(1)
          .replace(/\//gu, '\\');
      }
      return pathname;
    }
    catch
    {
      return s.replace(/^file:\/\//iu, '');
    }
  }
  return s;
}

/**
 * Resolves the game project root for asset paths. If the last path segment is {@code data} (any casing), returns its parent; otherwise returns the path as given (project root).
 * @param projectDataPath RMMZ project root or {@code data/} directory.
 * @returns Path to the game project root for resolving {@code img/} etc.
 */
function resolveGameProjectRootFromDataPath(projectDataPath: string): string
{
  const trimmed = normalizeProjectDataPathForFilesystem(projectDataPath)
    .replace(/[/\\]+$/u, '');
  const posixAbsolute = trimmed.startsWith('/');
  const parts = pathSegments(trimmed);
  if (parts.length === 0)
  {
    if (posixAbsolute)
    {
      return '/';
    }
    return trimmed;
  }
  const last = parts[ parts.length - 1 ];
  if (last.toLowerCase() === 'data')
  {
    parts.pop();
  }
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
 * Absolute path to {@code img/system/IconSet.png} for the project that owns {@code projectDataPath}.
 * @param projectDataPath RMMZ project root or {@code data/} directory (same convention as {@link useProjectPath} {@code projectRoot}).
 */
function resolveIconSetPngPath(projectDataPath: string): string
{
  const normalized = normalizeProjectDataPathForFilesystem(projectDataPath);
  const root = resolveGameProjectRootFromDataPath(normalized);
  const useBackslash = normalized.includes('\\') || root.includes('\\');
  const sep = useBackslash
    ? '\\'
    : '/';
  const rootTrim = root.replace(/[/\\]+$/u, '');
  return `${rootTrim}${sep}img${sep}system${sep}IconSet.png`;
}

/**
 * Loads {@code IconSet.png} bytes via Go HTTP {@code GET /api/iconset}.
 * @param _projectDataPath RMMZ project root or {@code data/} directory (unused — server uses {@code JMZ_PROJECT_ROOT}).
 * @returns Raw PNG bytes.
 */
async function loadIconSetPng(_projectDataPath: string): Promise<ArrayBuffer>
{
  const apiBase = getJmzHttpApiBase();
  if (apiBase === null)
  {
    throw new Error('IconSet load failed: JMZ HTTP API base is not configured.');
  }

  const url = `${apiBase}/api/iconset`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok)
  {
    throw new Error(
      `IconSet GET failed (${String(response.status)} ${response.statusText}) — ${url}`,
    );
  }
  return await response.arrayBuffer();
}

export {
  normalizeProjectDataPathForFilesystem,
  resolveGameProjectRootFromDataPath,
  resolveIconSetPngPath,
  loadIconSetPng,
};
