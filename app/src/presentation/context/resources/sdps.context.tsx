import {
  createContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
  useContext
} from 'react';
import StatDistributionPanel = Sdp.StatDistributionPanel;
import { useProjectPath } from "@presentation/context/project-path.context.tsx";
import {
  executeSave,
  loadEnemies,
  loadSdps
} from "@services/DataService.ts";
import { RPG_EnemyDomainModel } from "@core/domain/entities/RPG_EnemyDomainModel.ts";
import DatabaseFilenames from "@core/enums/DatabaseFilenames.ts";
import ConfigFilenames from "@core/enums/ConfigFilenames.ts";
import Configuration = Sdp.Configuration;

type SdpsContextValues = {
  sdps: StatDistributionPanel[];
  setSdps: (s: StatDistributionPanel[]) => void;
  save: (updatedList: StatDistributionPanel[]) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
}

const SdpsContext = createContext<SdpsContextValues | null>(null);

export function SdpsProvider({ children }: { children: ReactNode })
{
  const { projectPath } = useProjectPath();
  const [ sdps, setSdps ] = useState<StatDistributionPanel[]>([]);
  const [ loading, setLoading ] = useState(true);

  const reload = useCallback(async () =>
  {
    if (!projectPath || !projectPath.endsWith("/data")) return;
    setLoading(true);
    try
    {
      const data = await loadSdps(projectPath);
      setSdps(data.sdps);
    }
    catch (error)
    {
      console.error("Failed to load SDPs:", error);
    }
    finally
    {
      setLoading(false);
    }
  }, [ projectPath ]);

  const save = useCallback(async (updatedList: StatDistributionPanel[]) =>
  {
    if (!projectPath) return;
    try
    {
      const updatedConfiguration = {
        sdps: updatedList,
      } as Configuration;

      await executeSave(projectPath, ConfigFilenames.Sdps, updatedConfiguration);
      setSdps(updatedList);
    }
    catch (error)
    {
      console.error("Failed to save SDPs:", error);
      throw error;
    }
  }, [ projectPath ]);

  const value = useMemo(() => (
    {
      sdps,
      setSdps,
      save,
      reload,
      loading
    }
  ), [ sdps, save, reload, loading ]);

  return (
    <SdpsContext.Provider value={value}>
      {children}
    </SdpsContext.Provider>
  );
}

/**
 * A re-usable hook for accessing and modifying SDP data.
 */
export function useSdps()
{
  const context = useContext(SdpsContext);
  if (!context)
  {
    throw new Error('useSdps must be used within an SdpsContext');
  }

  return context;
}
