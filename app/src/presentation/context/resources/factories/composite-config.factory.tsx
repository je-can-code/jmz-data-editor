import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState, } from 'react';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { useFileBackedState } from '@presentation/hooks/useFileBackedState.ts';
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
  /**
   * True while the configuration holds edits the file does not, which is exactly when the board's Save lights.
   */
  hasUnsavedEdits: boolean;
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
    const {
      rmmzDataPath,
      projectReloadGeneration
    } = useProjectPath();
    const {
      value: config,
      edit: setConfig,
      loaded,
      beginSave,
      hasUnsavedEdits,
    } = useFileBackedState<T | null>(null);
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
        const result = await executeLoad<T>(rmmzDataPath, filename);
        loaded(result ?? null);
      }
      catch (error)
      {
        console.error(`Failed to load ${displayName}:`, error);
      }
      finally
      {
        setLoading(false);
      }
    }, [ rmmzDataPath, loaded ]);

    const save = useCallback(async (updatedConfig: T) =>
    {
      if (!rmmzDataPath || rmmzDataPath.trim() === '')
      {
        return;
      }

      // the edits made by now are the ones this save carries.
      const saved = beginSave();
      try
      {
        await executeSave(rmmzDataPath, filename, updatedConfig);
        saved(updatedConfig);
      }
      catch (error)
      {
        console.error(`Failed to save ${displayName}:`, error);
        throw error;
      }
    }, [ rmmzDataPath, beginSave ]);

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
        hasUnsavedEdits,
      }
    ), [ config, setConfig, save, reload, loading, hasUnsavedEdits ]);

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
