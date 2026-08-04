import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { executeLoad, executeSave } from '@services/DataService.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { type BossConfigRoot, hydrateBossConfig } from '@core/domain/valueObjects/boss-config.ts';

/**
 * Shape exposed to consumers of the boss encounter config (the Boss board).
 *
 * J-ABS-Boss treats `config.boss.json` as strictly required and throws when it is absent, but the
 * editor is the thing that creates the file in the first place - so {@link hydrateBossConfig} turns a
 * missing or partial payload into an empty-but-valid configuration before React ever sees it.
 *
 * `bossConfig` is therefore always a fully populated {@link BossConfigRoot} once loading completes;
 * during the initial fetch it is {@code null} the same way other resource contexts behave.
 */
type BossContextValue = {
  bossConfig: BossConfigRoot | null;
  setConfig: (
    next: BossConfigRoot
      | ((prev: BossConfigRoot | null) => BossConfigRoot)
  ) => void;
  save: (updatedConfig: BossConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

const BossContext = createContext<BossContextValue | null>(null);

const BossProvider = ({ children }: { children: ReactNode }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const [ bossConfig, setBossConfigState ] = useState<BossConfigRoot | null>(null);
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
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.Bosses);
      setBossConfigState(hydrateBossConfig(result ?? null));
    }
    catch (error)
    {
      console.error('Failed to load Boss config:', error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath ]);

  const save = useCallback(async (updatedConfig: BossConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === '')
    {
      return;
    }

    try
    {
      await executeSave(rmmzDataPath, ConfigFilenames.Bosses, updatedConfig);
      setBossConfigState(updatedConfig);
    }
    catch (error)
    {
      console.error('Failed to save Boss config:', error);
      throw error;
    }
  }, [ rmmzDataPath ]);

  const setConfig = useCallback(
    (next: BossConfigRoot | ((prev: BossConfigRoot | null) => BossConfigRoot)) =>
    {
      if (typeof next === 'function')
      {
        setBossConfigState(prev => (next as (p: BossConfigRoot | null) => BossConfigRoot)(prev));
        return;
      }

      setBossConfigState(next);
    },
    []
  );

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<BossContextValue>(() => (
    {
      bossConfig,
      setConfig,
      save,
      reload,
      loading,
    }
  ), [ bossConfig, setConfig, save, reload, loading ]);

  return (
    <BossContext.Provider value={value}>
      {children}
    </BossContext.Provider>
  );
};

function useBossConfig(): BossContextValue
{
  const ctx = useContext(BossContext);
  if (!ctx)
  {
    throw new Error('useBossConfig must be used within a BossProvider');
  }

  return ctx;
}

export {
  BossProvider,
  useBossConfig,
};
export type {
  BossContextValue,
};
