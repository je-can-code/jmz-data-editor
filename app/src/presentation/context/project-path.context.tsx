import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resolveRmmzDataDirectory } from '../../constants/PathConstants';
import { SystemService } from '@services/SystemService';

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

type ProjectPathProviderProps = {
  /**
   * The project root the API serves, from its health check.
   */
  initialProjectRoot: string;
  children: React.ReactNode;
};

/**
 * Holds the project root the editor shows and loads from.
 * @param {ProjectPathProviderProps} props The API's project root, and what sits inside.
 */
export function ProjectPathProvider({ initialProjectRoot, children }: ProjectPathProviderProps)
{
  // the root starts as the API's own rather than one an earlier session remembered, so the bar shows the folder
  // actually being edited. Starting on it, rather than correcting a default later, means no resource ever loads, or
  // skips loading, on any other root.
  const [ projectRoot, setProjectRoot ] = useState<string>(initialProjectRoot);
  const [ systemDataGeneration, setSystemDataGeneration ] = useState(0);
  const [ projectReloadGeneration, setProjectReloadGeneration ] = useState(0);

  const rmmzDataPath = useMemo(
    () => resolveRmmzDataDirectory(projectRoot),
    [ projectRoot ]
  );

  useEffect(() =>
  {
    // no-op.
  }, []);

  const reloadProjectFromDisk = useCallback(async () =>
  {
    setProjectReloadGeneration((n) => n + 1);
  }, []);

  useEffect(() =>
  {
    if (!projectRoot)
    {
      return;
    }

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
