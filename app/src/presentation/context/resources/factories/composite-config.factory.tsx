import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { executeLoad, executeSave } from '@services/DataService.ts';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';

/**
 * Context value for composite configuration files.
 */
export type CompositeConfigContextValue<T> = {
  config: T | null;
  setConfig: React.Dispatch<React.SetStateAction<T | null>>;
  save: (updatedConfig: T) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

/**
 * Factory for complex custom configurations (non-RMMZ) that have multiple root-level keys.
 * @param {ConfigFilenames} filename The config filename.
 * @param {string} displayName Display name for error/wrapper messages.
 */
export function createCompositeConfigContext<T>(
  filename: ConfigFilenames,
  displayName: string
)
{
  const Context = createContext<CompositeConfigContextValue<T> | null>(null);

  function CompositeConfigProvider({ children }: { children: ReactNode })
  {
    const { rmmzDataPath, projectReloadGeneration } = useProjectPath();
    const [ config, setConfig ] = useState<T | null>(null);
    const [ loading, setLoading ] = useState(true);

    const reload = useCallback(async () =>
    {
      if (!rmmzDataPath || rmmzDataPath.trim() === "")
      {
        return;
      }

      setLoading(true);
      try
      {
        const result = await executeLoad<T>(rmmzDataPath, filename);
        setConfig(result ?? null);
      }
      catch (error)
      {
        console.error(`Failed to load ${displayName}:`, error);
      }
      finally
      {
        setLoading(false);
      }
    }, [ rmmzDataPath ]);

    const save = useCallback(async (updatedConfig: T) =>
    {
      if (!rmmzDataPath || rmmzDataPath.trim() === "")
      {
        return;
      }

      try
      {
        await executeSave(rmmzDataPath, filename, updatedConfig);
        setConfig(updatedConfig);
      }
      catch (error)
      {
        console.error(`Failed to save ${displayName}:`, error);
        throw error;
      }
    }, [ rmmzDataPath ]);

    useEffect(() =>
    {
      reload();
    }, [ reload, projectReloadGeneration ]);

    const value = useMemo(() => (
      {
        config,
        setConfig,
        save,
        reload,
        loading,
      }
    ), [ config, save, reload, loading ]);

    return (
      <Context.Provider value={value}>
        {children}
      </Context.Provider>
    );
  }

  function useHook()
  {
    const ctx = useContext(Context);
    if (!ctx)
    {
      throw new Error(`use${displayName} must be used within a ${displayName}Provider`);
    }

    return ctx;
  }

  return {
    Provider: CompositeConfigProvider,
    useHook,
  };
}
