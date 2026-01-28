import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  useMemo
} from 'react';
import { useProjectPath } from '../project-path.context.tsx';
import { loadEnemies, executeSave } from '@services/DataService.ts';
import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import { EnemyDomainModel } from "@core/domain/entities/EnemyDomainEntity.ts";

type EnemiesContextValue = {
  enemies: EnemyDomainModel[];
  setEnemies: React.Dispatch<React.SetStateAction<EnemyDomainModel[]>>;
  save: (updatedList: EnemyDomainModel[]) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

const EnemiesContext = createContext<EnemiesContextValue | null>(null);

export function EnemiesProvider({ children }: { children: ReactNode }) {
  const { projectPath } = useProjectPath();
  const [enemies, setEnemies] = useState<EnemyDomainModel[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!projectPath || !projectPath.endsWith("/data")) return;
    setLoading(true);
    try {
      const data = await loadEnemies(projectPath);

      // Filter out the null at index 0 so the domain array is clean
      const validModels = data
        .filter((rmmz): rmmz is RPG_Enemy => rmmz !== null)
        .map(rmmz => new EnemyDomainModel(rmmz));

      setEnemies(validModels);
    } catch (error) {
      console.error("Failed to load enemies:", error);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  const save = useCallback(async (updatedList: EnemyDomainModel[]) => {
    if (!projectPath) return;
    try {
      const rmmzData = updatedList.map(e => e.toRmmz());

      // Prepend null to satisfy RPG Maker's 1-indexed requirement
      const finalData = [null, ...rmmzData];

      await executeSave(projectPath, DatabaseFilenames.Enemies, finalData);
      setEnemies(updatedList);
    } catch (error) {
      console.error("Failed to save enemies:", error);
      throw error;
    }
  }, [projectPath]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => ({
    enemies,
    setEnemies,
    save,
    reload,
    loading
  }), [enemies, save, reload, loading]);

  return (
    <EnemiesContext.Provider value={value}>
      {children}
    </EnemiesContext.Provider>
  );
}

export function useEnemies() {
  const context = useContext(EnemiesContext);
  if (!context) {
    throw new Error('useEnemies must be used within an EnemiesProvider');
  }
  return context;
}
