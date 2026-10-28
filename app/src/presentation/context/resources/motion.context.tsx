import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ConfigFilenames from "@core/enums/ConfigFilenames.ts";
import { executeLoad, executeSave } from "@services/DataService.ts";
import { useProjectPath } from "@presentation/context/project-path.context.tsx";
import { useFileBackedState } from "@presentation/hooks/useFileBackedState.ts";
import {
  hydrateMotionConfig,
  type MotionConfigRoot,
  serializeMotionConfig,
} from "@core/domain/valueObjects/motion-config.ts";

/**
 * Shape exposed to consumers of the motion config (currently just the Motion board).
 *
 * J-Motion treats `config.motion.json` as the source of every motion type's defaults, so
 * {@link hydrateMotionConfig} fills in the sections the file does not author before the value ever
 * reaches React. Saving runs the inverse: the board edits a grouped shape, and
 * {@link serializeMotionConfig} flattens it back to the layout the plugins read.
 */
type MotionContextValue = {
  motionConfig: MotionConfigRoot | null;
  setConfig: (
    next: MotionConfigRoot
      | ((prev: MotionConfigRoot | null) => MotionConfigRoot)
  ) => void;
  save: (updatedConfig: MotionConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
  /**
   * True while the config holds edits the file does not, which is exactly when the board's Save lights.
   */
  hasUnsavedEdits: boolean;
};

const MotionContext = createContext<MotionContextValue | null>(null);

const MotionProvider = ({ children }: { children: ReactNode }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const {
    value: motionConfig,
    edit: setConfig,
    loaded,
    beginSave,
    hasUnsavedEdits,
  } = useFileBackedState<MotionConfigRoot | null>(null);
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
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.Motion);
      loaded(hydrateMotionConfig(result ?? null));
    }
    catch (error)
    {
      console.error("Failed to load Motion config:", error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath, loaded ]);

  const save = useCallback(async (updatedConfig: MotionConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === "")
    {
      return;
    }

    // the edits made by now are the ones this save carries.
    const saved = beginSave();
    try
    {
      // the board's grouped shape is an editing convenience; disk gets the flat layout back.
      const flattened = serializeMotionConfig(updatedConfig);
      await executeSave(rmmzDataPath, ConfigFilenames.Motion, flattened);
      saved(updatedConfig);
    }
    catch (error)
    {
      console.error("Failed to save Motion config:", error);
      throw error;
    }
  }, [ rmmzDataPath, beginSave ]);

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<MotionContextValue>(() => (
    {
      motionConfig,
      setConfig,
      save,
      reload,
      loading,
      hasUnsavedEdits,
    }
  ), [ motionConfig, setConfig, save, reload, loading, hasUnsavedEdits ]);

  return (
    <MotionContext.Provider value={value}>
      {children}
    </MotionContext.Provider>
  );
};

function useMotionConfig(): MotionContextValue
{
  const ctx = useContext(MotionContext);
  if (!ctx)
  {
    throw new Error("useMotionConfig must be used within a MotionProvider");
  }

  return ctx;
}

export {
  MotionProvider,
  useMotionConfig,
};
export type {
  MotionContextValue,
};
