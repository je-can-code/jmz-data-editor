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

type EnemiesContextValue = {
  enemies: RPG_Enemy[];
  setEnemies: React.Dispatch<React.SetStateAction<RPG_Enemy[]>>;
  save: (updatedList: RPG_Enemy[]) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

const EnemiesContext = createContext<EnemiesContextValue | null>(null);

export function EnemiesProvider({ children }: { children: ReactNode }) {
  const { projectPath } = useProjectPath();
  const [enemies, setEnemies] = useState<RPG_Enemy[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!projectPath || !projectPath.endsWith("/data")) return;
    setLoading(true);
    try {
      const data = await loadEnemies(projectPath);
      setEnemies(data);
    } catch (error) {
      console.error("Failed to load enemies:", error);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  const save = useCallback(async (updatedList: RPG_Enemy[]) => {
    if (!projectPath) return;
    try {
      await executeSave(projectPath, DatabaseFilenames.Enemies, updatedList);
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
