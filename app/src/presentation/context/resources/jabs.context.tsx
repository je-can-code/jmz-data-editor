import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ConfigFilenames from "@core/enums/ConfigFilenames.ts";
import { executeLoad, executeSave } from "@services/DataService.ts";
import { useProjectPath } from "@presentation/context/project-path.context.tsx";
import { hydrateJabsConfig, type JabsConfigRoot } from "@core/domain/valueObjects/jabs-config.ts";

/**
 * Shape exposed to consumers of the JABS config (boards, skill panel, enemy team picker).
 *
 * The plugin treats `config.jabs.json` -> `juice` as strictly required and throws when it is absent.
 * The editor cannot rely on the file being well-formed at every load — so {@link hydrateJabsConfig}
 * fills in missing pieces from {@code JUICE_DEFAULTS} before we ever hand the value to React.
 *
 * `jabsConfig` is therefore always a fully populated {@link JabsConfigRoot} once loading completes;
 * during the initial fetch it is {@code null} the same way other resource contexts behave.
 */
type JabsContextValue = {
  jabsConfig: JabsConfigRoot | null;
  setConfig: (
    next: JabsConfigRoot
      | ((prev: JabsConfigRoot | null) => JabsConfigRoot)
  ) => void;
  save: (updatedConfig: JabsConfigRoot) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

const JabsContext = createContext<JabsContextValue | null>(null);

const JabsProvider = ({ children }: { children: ReactNode }) =>
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const [ jabsConfig, setJabsConfigState ] = useState<JabsConfigRoot | null>(null);
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
      // raw payload may legitimately lack a `juice` block (older config files predate the migration);
      // hydrate fills the gaps so the editor always renders against a complete shape.
      const result = await executeLoad<unknown>(rmmzDataPath, ConfigFilenames.Jabs);
      setJabsConfigState(hydrateJabsConfig(result ?? null));
    }
    catch (error)
    {
      console.error("Failed to load Jabs config:", error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath ]);

  const save = useCallback(async (updatedConfig: JabsConfigRoot) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === "")
    {
      return;
    }

    try
    {
      await executeSave(rmmzDataPath, ConfigFilenames.Jabs, updatedConfig);
      setJabsConfigState(updatedConfig);
    }
    catch (error)
    {
      console.error("Failed to save Jabs config:", error);
      throw error;
    }
  }, [ rmmzDataPath ]);

  const setConfig = useCallback(
    (next: JabsConfigRoot | ((prev: JabsConfigRoot | null) => JabsConfigRoot)) =>
    {
      if (typeof next === "function")
      {
        setJabsConfigState(prev => (next as (p: JabsConfigRoot | null) => JabsConfigRoot)(prev));
        return;
      }

      setJabsConfigState(next);
    },
    []
  );

  useEffect(() =>
  {
    reload();
  }, [ reload, projectReloadGeneration ]);

  const value = useMemo<JabsContextValue>(() => (
    {
      jabsConfig,
      setConfig,
      save,
      reload,
      loading,
    }
  ), [ jabsConfig, setConfig, save, reload, loading ]);

  return (
    <JabsContext.Provider value={value}>
      {children}
    </JabsContext.Provider>
  );
};

function useJabs(): JabsContextValue
{
  const ctx = useContext(JabsContext);
  if (!ctx)
  {
    throw new Error("useJabs must be used within a JabsProvider");
  }

  return ctx;
}

export {
  JabsProvider,
  useJabs,
};
export type {
  JabsContextValue,
};