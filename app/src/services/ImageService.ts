import { filesystem } from "@neutralinojs/lib";

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
 * Normalizes the path the app stores as {@code projectPath} (the RMMZ {@code data} directory) for native filesystem calls.
 * @param projectDataPath Raw value from {@link useProjectPath} or the folder dialog.
 */
function normalizeProjectDataPathForFilesystem(projectDataPath: string): string
{
  let s = projectDataPath.trim();
  const lower = s.toLowerCase();
  if (lower.startsWith("file://"))
  {
    try
    {
      const pathname = new URL(s).pathname;
      if (/^\/[a-z]:\//iu.test(pathname))
      {
        return pathname.slice(1)
          .replace(/\//gu, "\\");
      }
      return pathname;
    }
    catch
    {
      return s.replace(/^file:\/\//iu, "");
    }
  }
  return s;
}

/**
 * The GUI stores {@code projectPath} as the RMMZ {@code data} directory (same base path as {@code Skills.json}). Asset paths
 * use the game project root: parent of that folder when its name is {@code data} (any casing), otherwise the path as given.
 * @param projectDataPath Path to the project's {@code data} folder (or project root if JSON paths were configured that way).
 * @returns Path to the game project root for resolving {@code img/} etc.
 */
function resolveGameProjectRootFromDataPath(projectDataPath: string): string
{
  const trimmed = normalizeProjectDataPathForFilesystem(projectDataPath)
    .replace(/[/\\]+$/u, "");
  const posixAbsolute = trimmed.startsWith("/");
  const parts = pathSegments(trimmed);
  if (parts.length === 0)
  {
    if (posixAbsolute)
    {
      return "/";
    }
    return trimmed;
  }
  const last = parts[parts.length - 1];
  if (last.toLowerCase() === "data")
  {
    parts.pop();
  }
  const useBackslash = trimmed.includes("\\");
  const sep = useBackslash
    ? "\\"
    : "/";
  if (parts.length === 0)
  {
    if (posixAbsolute && useBackslash === false)
    {
      return "/";
    }
    return "";
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
 * @param projectDataPath Path to the project's {@code data} directory (same as {@link useProjectPath}).
 */
function resolveIconSetPngPath(projectDataPath: string): string
{
  const normalized = normalizeProjectDataPathForFilesystem(projectDataPath);
  const root = resolveGameProjectRootFromDataPath(normalized);
  const useBackslash = normalized.includes("\\") || root.includes("\\");
  const sep = useBackslash
    ? "\\"
    : "/";
  const rootTrim = root.replace(/[/\\]+$/u, "");
  return `${rootTrim}${sep}img${sep}system${sep}IconSet.png`;
}

/**
 * Loads {@code IconSet.png} bytes via Neutralino (same filesystem access as JSON database files).
 * @param projectDataPath Path to the project's {@code data} directory.
 * @returns Raw PNG bytes.
 */
async function loadIconSetPng(projectDataPath: string): Promise<ArrayBuffer>
{
  const target = resolveIconSetPngPath(projectDataPath);
  try
  {
    return await filesystem.readBinaryFile(target);
  }
  catch (err)
  {
    const detail = err instanceof Error
      ? err.message
      : String(err);
    throw new Error(`${detail} — tried: ${target}`);
  }
}

export {
  normalizeProjectDataPathForFilesystem,
  resolveGameProjectRootFromDataPath,
  resolveIconSetPngPath,
  loadIconSetPng,
};
