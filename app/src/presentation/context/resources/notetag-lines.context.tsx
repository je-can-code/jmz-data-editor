import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { executeLoad, executeSave } from '@services/DataService.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import {
  hydrateNotetagLinesConfig,
  type NotetagLinesConfigRoot,
} from '@core/domain/valueObjects/notetag-lines-config.ts';

/**
 * Shape exposed to consumers of the tag lines config.
 *
 * `config.notetag-lines.json` is a bare array rather than an object, and the game treats it as strictly required.
 * {@link hydrateNotetagLinesConfig} fills in anything a hand-edited line left out before the value reaches React, so
 * the board never has to ask whether a field was written.
 *
 * `notetagLinesConfig` is therefore always fully populated once loading completes; during the initial fetch it is
 * {@code null}, matching the other resource contexts.
 */
type NotetagLinesContextValue = {
  notetagLinesConfig: NotetagLinesConfigRoot | null;
  setConfig: (
    next: NotetagLinesConfigRoot
      | ((prev: NotetagLinesConfigRoot | null) => NotetagLinesConfigRoot)
  ) => void;
  save: (updatedConfig: NotetagLinesConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

const NotetagLinesContext = createContext<NotetagLinesContextValue | null>(null);

const NotetagLinesProvider = ({ children }: { children: ReactNode }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const [ notetagLinesConfig, setNotetagLinesConfigState ] = useState<NotetagLinesConfigRoot | null>(null);
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
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.NotetagLines);
      setNotetagLinesConfigState(hydrateNotetagLinesConfig(result ?? null));
    }
    catch (error)
    {
      console.error('Failed to load Tag Lines config:', error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath ]);

  const save = useCallback(async (updatedConfig: NotetagLinesConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === '')
    {
      return;
    }

    try
    {
      await executeSave(rmmzDataPath, ConfigFilenames.NotetagLines, updatedConfig);
      setNotetagLinesConfigState(updatedConfig);
    }
    catch (error)
    {
      console.error('Failed to save Tag Lines config:', error);
      throw error;
    }
  }, [ rmmzDataPath ]);

  const setConfig = useCallback(
    (next: NotetagLinesConfigRoot | ((prev: NotetagLinesConfigRoot | null) => NotetagLinesConfigRoot)) =>
    {
      if (typeof next === 'function')
      {
        setNotetagLinesConfigState(prev => (next as (p: NotetagLinesConfigRoot | null) => NotetagLinesConfigRoot)(prev));
        return;
      }

      setNotetagLinesConfigState(next);
    },
    []
  );

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<NotetagLinesContextValue>(() => (
    {
      notetagLinesConfig,
      setConfig,
      save,
      reload,
      loading,
    }
  ), [ notetagLinesConfig, setConfig, save, reload, loading ]);

  return (
    <NotetagLinesContext.Provider value={value}>
      {children}
    </NotetagLinesContext.Provider>
  );
};

function useNotetagLinesConfig(): NotetagLinesContextValue
{
  const ctx = useContext(NotetagLinesContext);
  if (!ctx)
  {
    throw new Error('useNotetagLinesConfig must be used within a NotetagLinesProvider');
  }

  return ctx;
}

export {
  NotetagLinesProvider,
  useNotetagLinesConfig,
};
export type {
  NotetagLinesContextValue,
};
