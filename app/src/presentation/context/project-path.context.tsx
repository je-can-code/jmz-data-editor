import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  defaultProjectRoot,
  resolveRmmzDataDirectory,
  toRmmzProjectRootFromPossibleDataPath
} from '../../constants/PathConstants';
import { JmzEditorYamlConfigReader } from '@platform/neutralino/readJmzEditorYamlConfig.ts';
import { SystemService } from '@services/SystemService';

const LS_KEY_PROJECT_ROOT = 'rmmzProjectRoot';
const LS_KEY_LEGACY_DATA_PATH = 'projectPath';

function readInitialProjectRootFromLocalStorage(): string
{
  const modern = localStorage.getItem(LS_KEY_PROJECT_ROOT);
  if (typeof modern === 'string' && modern.trim().length > 0)
  {
    return toRmmzProjectRootFromPossibleDataPath(modern.trim());
  }

  const legacy = localStorage.getItem(LS_KEY_LEGACY_DATA_PATH);
  if (typeof legacy === 'string' && legacy.trim().length > 0)
  {
    return toRmmzProjectRootFromPossibleDataPath(legacy.trim());
  }

  return defaultProjectRoot;
}

type ProjectPathValue = {
  /**
   * Absolute path to the RMMZ project root (folder containing {@code data/} and {@code img/}).
   */
  projectRoot: string;
  /**
   * Absolute path to {@code data/} (Actors.json, Skills.json, …).
   */
  rmmzDataPath: string;
  setProjectRoot: (value: string) => void;
  /** Increments after {@link SystemService.loadSystemData} finishes (skills UI can depend on this). */
  systemDataGeneration: number;
  /**
   * Bumps when the user reloads from disk so resource contexts re-fetch even if {@link projectRoot} is unchanged.
   */
  projectReloadGeneration: number;
  /**
   * Re-reads {@code .config/config.yaml} (when present), updates {@link projectRoot}, then refreshes system data and all resource providers.
   */
  reloadProjectFromDisk: () => Promise<void>;
};

const Ctx = createContext<ProjectPathValue | null>(null);

export function ProjectPathProvider({ children }: { children: React.ReactNode })
{
  const [ projectRoot, setProjectRoot ] = useState<string>(() =>
    readInitialProjectRootFromLocalStorage()
  );
  const [ systemDataGeneration, setSystemDataGeneration ] = useState(0);
  const [ projectReloadGeneration, setProjectReloadGeneration ] = useState(0);

  const rmmzDataPath = useMemo(
    () => resolveRmmzDataDirectory(projectRoot),
    [ projectRoot ]
  );

  useEffect(() =>
  {
    let cancelled = false;

    void (async () =>
    {
      const fromYaml = await JmzEditorYamlConfigReader.readFromDisk();
      if (cancelled || fromYaml === null)
      {
        return;
      }

      setProjectRoot(fromYaml.projectRoot);
    })();

    return () =>
    {
      cancelled = true;
    };
  }, []);

  const reloadProjectFromDisk = useCallback(async () =>
  {
    const fromYaml = await JmzEditorYamlConfigReader.readFromDisk();
    if (fromYaml !== null)
    {
      setProjectRoot(fromYaml.projectRoot);
    }
    setProjectReloadGeneration((n) => n + 1);
  }, []);

  useEffect(() =>
  {
    if (!projectRoot)
    {
      return;
    }

    localStorage.setItem(LS_KEY_PROJECT_ROOT, projectRoot);
    SystemService.loadSystemData(rmmzDataPath)
      .then(() =>
      {
        setSystemDataGeneration((n) => n + 1);
      })
      .catch(console.error);
  }, [ projectRoot, rmmzDataPath, projectReloadGeneration ]);

  const value = useMemo(() => (
    {
      projectRoot,
      rmmzDataPath,
      setProjectRoot,
      systemDataGeneration,
      projectReloadGeneration,
      reloadProjectFromDisk,
    }
  ), [
    projectRoot,
    rmmzDataPath,
    systemDataGeneration,
    projectReloadGeneration,
    reloadProjectFromDisk,
  ]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjectPath(): ProjectPathValue
{
  const v = useContext(Ctx);
  if (!v)
  {
    throw new Error('useProjectPath must be used within <ProjectPathProvider />');
  }
  return v;
}
