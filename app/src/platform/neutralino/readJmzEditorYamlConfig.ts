import { parse } from "yaml";
import { filesystem } from "@neutralinojs/lib";
import { toRmmzProjectRootFromPossibleDataPath } from "../../constants/PathConstants";

/**
 * Parsed subset of {@code .config/config.yaml} at the repository root (see {@link candidateJmzEditorConfigYamlAbsolutePaths}).
 */
export type JmzEditorYamlConfig = {
  projectRoot: string;
};

const CONFIG_DIR = ".config";
const CONFIG_FILENAME = "config.yaml";

function neutralinoBridgeLooksReady(): boolean
{
  if (typeof window === "undefined")
  {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.NL_PORT !== undefined && w.NL_PORT !== null;
}

function nlPathFromWindow(): string | null
{
  if (typeof window === "undefined")
  {
    return null;
  }

  const w = window as Window & { NL_PATH?: string };
  const p = w.NL_PATH;
  if (typeof p !== "string" || p.trim().length === 0)
  {
    return null;
  }

  return p.trim()
    .replace(/[/\\]+$/u, "");
}

function pathSegments(pathStr: string): string[]
{
  return pathStr.split(/[/\\]/u)
    .filter((s) => s.length > 0);
}

function dirnameOfAbsolutePath(pathStr: string): string
{
  const trimmed = pathStr.replace(/[/\\]+$/u, "");
  const useBackslash = trimmed.includes("\\");
  const sep = useBackslash
    ? "\\"
    : "/";
  const parts = pathSegments(trimmed);
  if (parts.length === 0)
  {
    return trimmed;
  }
  if (parts.length === 1)
  {
    if (trimmed.startsWith("/") && useBackslash === false)
    {
      return "/";
    }
    return "";
  }
  parts.pop();
  let out = parts.join(sep);
  if (trimmed.startsWith("/") && useBackslash === false)
  {
    out = `/${out}`;
  }
  return out;
}

function joinPathSegments(base: string, ...segments: string[]): string
{
  let result = base.replace(/[/\\]+$/u, "");
  const useBackslash = result.includes("\\");
  const sep = useBackslash
    ? "\\"
    : "/";
  for (const seg of segments)
  {
    const clean = seg.replace(/^[/\\]+/u, "")
      .replace(/[/\\]+$/u, "");
    if (clean.length === 0)
    {
      continue;
    }
    result = `${result}${sep}${clean}`;
  }
  return result;
}

/**
 * Absolute paths to try for {@code config.yaml}, in order. Uses {@code NL_PATH}; if that folder is named {@code app}, {@code build}, or {@code dist}, also tries the parent directory (repo root).
 */
export function candidateJmzEditorConfigYamlAbsolutePaths(): string[]
{
  const root = nlPathFromWindow();
  if (root === null)
  {
    return [];
  }

  const primary = joinPathSegments(root, CONFIG_DIR, CONFIG_FILENAME);
  const paths: string[] = [ primary ];
  const parts = pathSegments(root);
  const last = parts.length > 0
    ? parts[parts.length - 1].toLowerCase()
    : "";
  if (last === "app" || last === "build" || last === "dist")
  {
    const parent = dirnameOfAbsolutePath(root);
    if (parent.length > 0 && parent !== root)
    {
      paths.push(joinPathSegments(parent, CONFIG_DIR, CONFIG_FILENAME));
    }
  }
  return paths;
}

/**
 * Short hint for UI copy (when {@code NL_PATH} is unknown, e.g. dev in the browser).
 */
export const JMZ_EDITOR_CONFIG_YAML_RELATIVE_HINT = `${CONFIG_DIR}/${CONFIG_FILENAME}`;

/**
 * Reads {@code projectRoot} (preferred) or legacy {@code projectPath} (often used when it still pointed at {@code data/}).
 */
function pickProjectRootFromParsedYaml(root: unknown): string | null
{
  if (root === null || typeof root !== "object")
  {
    return null;
  }

  const record = root as Record<string, unknown>;
  const preferred = record["projectRoot"];
  const legacy = record["projectPath"];

  let candidate: string | null = null;
  if (typeof preferred === "string" && preferred.trim().length > 0)
  {
    candidate = preferred.trim();
  }
  else if (typeof legacy === "string" && legacy.trim().length > 0)
  {
    candidate = legacy.trim();
  }

  if (candidate === null)
  {
    return null;
  }

  const normalized = toRmmzProjectRootFromPossibleDataPath(candidate);
  if (normalized.length === 0)
  {
    return null;
  }

  return normalized;
}

/**
 * Loads the first readable {@code .config/config.yaml} under {@link candidateJmzEditorConfigYamlAbsolutePaths} when running under Neutralino.
 *
 * Expected shape:
 * {@code
 * projectRoot: /absolute/path/to/rmmz/project
 * }
 *
 * @returns Parsed config, or {@code null} if missing, invalid YAML, or not in Neutralino.
 */
export async function readJmzEditorYamlConfigFromDisk(): Promise<JmzEditorYamlConfig | null>
{
  if (neutralinoBridgeLooksReady() === false)
  {
    return null;
  }

  const candidates = candidateJmzEditorConfigYamlAbsolutePaths();
  if (candidates.length === 0)
  {
    return null;
  }

  for (const absolutePath of candidates)
  {
    try
    {
      const text = await filesystem.readFile(absolutePath);
      const parsed = parse(text) as unknown;
      const projectRoot = pickProjectRootFromParsedYaml(parsed);
      if (projectRoot === null)
      {
        continue;
      }

      return { projectRoot };
    }
    catch
    {
      continue;
    }
  }

  return null;
}
