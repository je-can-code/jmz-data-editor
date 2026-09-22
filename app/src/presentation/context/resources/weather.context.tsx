import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { executeLoad, executeSave } from '@services/DataService.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import {
  hydrateWeatherConfig,
  serializeWeatherConfig,
  type WeatherConfigRoot,
} from '@core/domain/valueObjects/weather-config.ts';

/**
 * Shape exposed to consumers of the weather config, which today is just the Weather board.
 *
 * The file holds far more than this editor offers controls for - seventeen motions and fifteen
 * layer stacks of hand-tuned numbers - so {@link hydrateWeatherConfig} keeps the whole of it and
 * {@link serializeWeatherConfig} lays the edits back on top. Saving therefore rewrites only the
 * lines that actually changed.
 */
type WeatherContextValue = {
  weatherConfig: WeatherConfigRoot | null;
  setConfig: (
    next: WeatherConfigRoot
      | ((prev: WeatherConfigRoot | null) => WeatherConfigRoot)
  ) => void;
  save: (updatedConfig: WeatherConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

const WeatherContext = createContext<WeatherContextValue | null>(null);

const WeatherProvider = ({ children }: { children: ReactNode; }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const [ weatherConfig, setWeatherConfigState ] = useState<WeatherConfigRoot | null>(null);
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
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.Weather);
      setWeatherConfigState(hydrateWeatherConfig(result ?? null));
    }
    catch (error)
    {
      console.error('Failed to load Weather config:', error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath ]);

  const save = useCallback(async (updatedConfig: WeatherConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === '')
    {
      return;
    }

    try
    {
      // the edited sections are laid back over the file as it was read, so the motions and layer
      // stacks this editor never shows come back out exactly as they went in.
      const merged = serializeWeatherConfig(updatedConfig);
      await executeSave(rmmzDataPath, ConfigFilenames.Weather, merged);

      // re-hydrate from what was actually written, so the in-memory source matches disk and a
      // second save does not lay edits over a stale original.
      setWeatherConfigState(hydrateWeatherConfig(merged));
    }
    catch (error)
    {
      console.error('Failed to save Weather config:', error);
      throw error;
    }
  }, [ rmmzDataPath ]);

  const setConfig = useCallback(
    (next: WeatherConfigRoot | ((prev: WeatherConfigRoot | null) => WeatherConfigRoot)) =>
    {
      if (typeof next === 'function')
      {
        setWeatherConfigState(prev => (next as (p: WeatherConfigRoot | null) => WeatherConfigRoot)(prev));
        return;
      }

      setWeatherConfigState(next);
    },
    []
  );

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<WeatherContextValue>(() => (
    {
      weatherConfig,
      setConfig,
      save,
      reload,
      loading,
    }
  ), [ weatherConfig, setConfig, save, reload, loading ]);

  return (
    <WeatherContext.Provider value={value}>
      {children}
    </WeatherContext.Provider>
  );
};

function useWeatherConfig(): WeatherContextValue
{
  const ctx = useContext(WeatherContext);
  if (!ctx)
  {
    throw new Error('useWeatherConfig must be used within a WeatherProvider');
  }

  return ctx;
}

export {
  useWeatherConfig,
  WeatherProvider,
};
export type {
  WeatherContextValue,
};
