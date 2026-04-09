import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { executeLoad, executeSave } from '@services/DataService.ts';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';

export type ConfigContextValue<T> = {
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  save: (updatedList: T[]) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

/**
 * Factory for custom plugin configurations (non-RMMZ data).
 * @param filename The JSON filename from ConfigFilenames.
 * @param rootKey The key in the JSON object that holds the array (e.g., 'sdps' or 'conditionals').
 * @param displayName Name for error logging and the hook error message.
 */
export function createConfigContext<T>(
  filename: ConfigFilenames,
  rootKey: string,
  displayName: string
)
{
  const Context = createContext<ConfigContextValue<T> | null>(null);

  function ConfigProvider({ children }: { children: ReactNode })
  {
    const {
      rmmzDataPath,
      projectReloadGeneration
    } = useProjectPath();
    const [ data, setData ] = useState<T[]>([]);
    const [ loading, setLoading ] = useState(true);

    const reload = useCallback(async () =>
    {
      if (!rmmzDataPath || rmmzDataPath.trim() === '')
      {
        return;
      }
      setLoading(true);
      try
      {
        const result = await executeLoad<any>(rmmzDataPath, filename);
        setData(result?.[ rootKey ] ?? []);
      }
      catch (error)
      { console.error(`Failed to load ${displayName}:`, error); }
      finally
      { setLoading(false); }
    }, [ rmmzDataPath ]);

    const save = useCallback(async (updatedList: T[]) =>
    {
      if (!rmmzDataPath || rmmzDataPath.trim() === '')
      {
        return;
      }
      try
      {
        const payload = { [ rootKey ]: updatedList };
        await executeSave(rmmzDataPath, filename, payload);
        setData(updatedList);
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

    const value = useMemo(() => ({
      data,
      setData,
      save,
      reload,
      loading
    }), [ data, save, reload, loading ]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
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
    Provider: ConfigProvider,
    useHook
  };
}
