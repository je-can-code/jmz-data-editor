import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { executeLoad, executeSave } from '@services/DataService.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { useFileBackedState } from '@presentation/hooks/useFileBackedState.ts';
import {
  hydrateOmniConfig,
  type OmniConfigRoot,
} from '@core/domain/valueObjects/omni-config.ts';

/**
 * Shape exposed to consumers of the Omnipedia config.
 *
 * `config.omni.json` is read by the game the moment it boots, and the game treats it as strictly required.
 * {@link hydrateOmniConfig} fills in anything a hand-edited page left out before the value reaches React, so the board
 * never has to ask whether a field was written.
 *
 * `omniConfig` is therefore always fully populated once loading completes; during the initial fetch it is
 * {@code null}, matching the other resource contexts.
 */
type OmniContextValue = {
  omniConfig: OmniConfigRoot | null;
  setConfig: (
    next: OmniConfigRoot
      | ((prev: OmniConfigRoot | null) => OmniConfigRoot)
  ) => void;
  save: (updatedConfig: OmniConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
  /**
   * True while the config holds edits the file does not, which is exactly when the board's Save lights.
   */
  hasUnsavedEdits: boolean;
};

const OmniContext = createContext<OmniContextValue | null>(null);

const OmniProvider = ({ children }: { children: ReactNode }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const {
    value: omniConfig,
    edit: setConfig,
    loaded,
    beginSave,
    hasUnsavedEdits,
  } = useFileBackedState<OmniConfigRoot | null>(null);
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
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.Omni);
      loaded(hydrateOmniConfig(result ?? null));
    }
    catch (error)
    {
      console.error('Failed to load Omnipedia config:', error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath, loaded ]);

  const save = useCallback(async (updatedConfig: OmniConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === '')
    {
      return;
    }

    // the edits made by now are the ones this save carries.
    const saved = beginSave();
    try
    {
      await executeSave(rmmzDataPath, ConfigFilenames.Omni, updatedConfig);
      saved(updatedConfig);
    }
    catch (error)
    {
      console.error('Failed to save Omnipedia config:', error);
      throw error;
    }
  }, [ rmmzDataPath, beginSave ]);

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<OmniContextValue>(() => (
    {
      omniConfig,
      setConfig,
      save,
      reload,
      loading,
      hasUnsavedEdits,
    }
  ), [ omniConfig, setConfig, save, reload, loading, hasUnsavedEdits ]);

  return (
    <OmniContext.Provider value={value}>
      {children}
    </OmniContext.Provider>
  );
};

function useOmniConfig(): OmniContextValue
{
  const ctx = useContext(OmniContext);
  if (!ctx)
  {
    throw new Error('useOmniConfig must be used within an OmniProvider');
  }

  return ctx;
}

export {
  OmniProvider,
  useOmniConfig,
};
export type {
  OmniContextValue,
};
