import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useProjectPath } from "@presentation/context/project-path.context.tsx";
import { useFileBackedState } from "@presentation/hooks/useFileBackedState.ts";
import { executeLoad, executeSave } from "@services/DataService.ts";
import ConfigFilenames from "@core/enums/ConfigFilenames.ts";
import {
  normalizeSdpConfigurationFromDisk,
  serializeSdpConfigurationForDisk,
} from "@services/sdp/sdpPanelShape.ts";

export type SdpConfigContextValue = {
  config: Sdp.Configuration | null;
  setConfig: React.Dispatch<React.SetStateAction<Sdp.Configuration | null>>;
  save: (updatedConfig: Sdp.Configuration) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
  /**
   * True while the configuration holds edits the file does not, which is exactly when the board's Save lights.
   */
  hasUnsavedEdits: boolean;
};

const SdpConfigContext = createContext<SdpConfigContextValue | null>(null);

function SdpsProvider({ children }: { children: ReactNode })
{
  const {
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();
  const {
    value: config,
    edit: setConfig,
    loaded,
    beginSave,
    hasUnsavedEdits,
  } = useFileBackedState<Sdp.Configuration | null>(null);
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
      const result = await executeLoad<Sdp.Configuration | Sdp.StatDistributionPanel[]>(
        rmmzDataPath,
        ConfigFilenames.Sdps
      );
      loaded(normalizeSdpConfigurationFromDisk(result));
    }
    catch (error)
    {
      console.error("Failed to load Sdps:", error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ rmmzDataPath, loaded ]);

  const save = useCallback(async (updatedConfig: Sdp.Configuration) =>
  {
    if (!rmmzDataPath || rmmzDataPath.trim() === "")
    {
      return;
    }

    // the edits made by now are the ones this save carries.
    const saved = beginSave();
    try
    {
      const payload = serializeSdpConfigurationForDisk(updatedConfig);
      await executeSave(rmmzDataPath, ConfigFilenames.Sdps, payload);
      saved(normalizeSdpConfigurationFromDisk(payload));
    }
    catch (error)
    {
      console.error("Failed to save Sdps:", error);
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
    <SdpConfigContext.Provider value={value}>
      {children}
    </SdpConfigContext.Provider>
  );
}

function useSdpsInternal()
{
  const ctx = useContext(SdpConfigContext);
  if (!ctx)
  {
    throw new Error("useSdps must be used within a SdpsProvider");
  }

  return ctx;
}

/**
 * Domain-friendly wrapper for SDP configuration.
 * Exposes panels, subgroups, and their respective setters.
 */
export function useSdps()
{
  const {
    config,
    setConfig,
    save,
    reload,
    loading,
    hasUnsavedEdits,
  } = useSdpsInternal();

  const sdps = config?.sdps ?? [];
  const subgroups = config?.subgroups ?? [];
  const families = config?.families ?? [];

  const setSdps = (updated: Sdp.StatDistributionPanel[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      sdps: updated,
    });
  };

  const setSubgroups = (updated: Sdp.PanelSubgroup[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      subgroups: updated,
    });
  };

  const setFamilies = (updated: Sdp.PanelFamily[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      families: updated,
    });
  };

  const savePanels = async (updatedPanels: Sdp.StatDistributionPanel[]) =>
  {
    if (!config)
    {
      return;
    }

    await save({
      ...config,
      sdps: updatedPanels,
    });
  };

  const saveAll = async (updatedConfig: Sdp.Configuration) =>
  {
    await save(updatedConfig);
  };

  return {
    sdps,
    subgroups,
    families,
    setSdps,
    setSubgroups,
    setFamilies,
    save: saveAll,
    savePanels,
    reload,
    loading,
    hasUnsavedEdits,
    config,
    setConfig,
  } as const;
}

export {
  SdpsProvider,
};
