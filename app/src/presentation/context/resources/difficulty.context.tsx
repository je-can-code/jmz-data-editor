import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { executeLoad, executeSave } from '@services/DataService.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { hydrateDifficultyConfig, type DifficultyConfigRoot } from '@core/domain/valueObjects/difficulty-config.ts';

/**
 * Shape exposed to consumers of the difficulty config.
 *
 * `config.difficulty.json` is a bare array rather than an object, and J-Difficulty treats it as
 * strictly required. {@link hydrateDifficultyConfig} fills in anything a hand-authored layer left
 * out before the value reaches React, so the board never has to ask whether a field was written.
 *
 * `difficultyConfig` is therefore always a fully populated {@link DifficultyConfigRoot} once loading
 * completes; during the initial fetch it is {@code null}, matching the other resource contexts.
 */
type DifficultyContextValue = {
  difficultyConfig: DifficultyConfigRoot | null;
  setConfig: (
    next: DifficultyConfigRoot
      | ((prev: DifficultyConfigRoot | null) => DifficultyConfigRoot)
  ) => void;
  save: (updatedConfig: DifficultyConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

const DifficultyContext = createContext<DifficultyContextValue | null>(null);

const DifficultyProvider = ({ children }: { children: ReactNode }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const [ difficultyConfig, setDifficultyConfigState ] = useState<DifficultyConfigRoot | null>(null);
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
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.Difficulty);
      setDifficultyConfigState(hydrateDifficultyConfig(result ?? null));
    }
    catch (error)
    {
      console.error('Failed to load Difficulty config:', error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath ]);

  const save = useCallback(async (updatedConfig: DifficultyConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === '')
    {
      return;
    }

    try
    {
      await executeSave(rmmzDataPath, ConfigFilenames.Difficulty, updatedConfig);
      setDifficultyConfigState(updatedConfig);
    }
    catch (error)
    {
      console.error('Failed to save Difficulty config:', error);
      throw error;
    }
  }, [ rmmzDataPath ]);

  const setConfig = useCallback(
    (next: DifficultyConfigRoot | ((prev: DifficultyConfigRoot | null) => DifficultyConfigRoot)) =>
    {
      if (typeof next === 'function')
      {
        setDifficultyConfigState(prev => (next as (p: DifficultyConfigRoot | null) => DifficultyConfigRoot)(prev));
        return;
      }

      setDifficultyConfigState(next);
    },
    []
  );

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<DifficultyContextValue>(() => (
    {
      difficultyConfig,
      setConfig,
      save,
      reload,
      loading,
    }
  ), [ difficultyConfig, setConfig, save, reload, loading ]);

  return (
    <DifficultyContext.Provider value={value}>
      {children}
    </DifficultyContext.Provider>
  );
};

function useDifficultyConfig(): DifficultyContextValue
{
  const ctx = useContext(DifficultyContext);
  if (!ctx)
  {
    throw new Error('useDifficultyConfig must be used within a DifficultyProvider');
  }

  return ctx;
}

export {
  DifficultyProvider,
  useDifficultyConfig,
};
export type {
  DifficultyContextValue,
};
