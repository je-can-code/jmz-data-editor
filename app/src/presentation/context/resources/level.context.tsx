import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ConfigFilenames from "@core/enums/ConfigFilenames.ts";
import { executeLoad, executeSave } from "@services/DataService.ts";
import { useProjectPath } from "@presentation/context/project-path.context.tsx";
import { useFileBackedState } from "@presentation/hooks/useFileBackedState.ts";
import { hydrateLevelConfig, type LevelConfigRoot } from "@core/domain/valueObjects/level-config.ts";

/**
 * Shape exposed to consumers of the level config (the Level board, and the class Parameters tab's
 * beyond-99 extrapolation preview).
 *
 * J-LevelMaster treats `config.level.json` as strictly required and throws when it is absent. The
 * editor cannot rely on the file being well-formed at every load — so {@link hydrateLevelConfig} fills
 * in missing pieces from its own defaults before we ever hand the value to React.
 *
 * `levelConfig` is therefore always a fully populated {@link LevelConfigRoot} once loading completes;
 * during the initial fetch it is {@code null} the same way other resource contexts behave.
 */
type LevelContextValue = {
  levelConfig: LevelConfigRoot | null;
  setConfig: (
    next: LevelConfigRoot
      | ((prev: LevelConfigRoot | null) => LevelConfigRoot)
  ) => void;
  save: (updatedConfig: LevelConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
  /**
   * True while the config holds edits the file does not, which is exactly when the board's Save lights.
   */
  hasUnsavedEdits: boolean;
};

const LevelContext = createContext<LevelContextValue | null>(null);

const LevelProvider = ({ children }: { children: ReactNode }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const {
    value: levelConfig,
    edit: setConfig,
    loaded,
    beginSave,
    hasUnsavedEdits,
  } = useFileBackedState<LevelConfigRoot | null>(null);
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
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.Level);
      loaded(hydrateLevelConfig(result ?? null));
    }
    catch (error)
    {
      console.error("Failed to load Level config:", error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath, loaded ]);

  const save = useCallback(async (updatedConfig: LevelConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === "")
    {
      return;
    }

    // the edits made by now are the ones this save carries.
    const saved = beginSave();
    try
    {
      await executeSave(rmmzDataPath, ConfigFilenames.Level, updatedConfig);
      saved(updatedConfig);
    }
    catch (error)
    {
      console.error("Failed to save Level config:", error);
      throw error;
    }
  }, [ rmmzDataPath, beginSave ]);

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<LevelContextValue>(() => (
    {
      levelConfig,
      setConfig,
      save,
      reload,
      loading,
      hasUnsavedEdits,
    }
  ), [ levelConfig, setConfig, save, reload, loading, hasUnsavedEdits ]);

  return (
    <LevelContext.Provider value={value}>
      {children}
    </LevelContext.Provider>
  );
};

function useLevelConfig(): LevelContextValue
{
  const ctx = useContext(LevelContext);
  if (!ctx)
  {
    throw new Error("useLevelConfig must be used within a LevelProvider");
  }

  return ctx;
}

export {
  LevelProvider,
  useLevelConfig,
};
export type {
  LevelContextValue,
};
