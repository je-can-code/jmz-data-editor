import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { defaultDataPath } from '../../constants/PathConstants';
import { SystemService } from '@services/SystemService';

type ProjectPathValue = {
  /**
   * Absolute path to the RPG Maker MZ {@code data} directory (same folder as {@code Skills.json}); not the game executable root label in the UI sense, but the JSON root the editor was built around.
   */
  projectPath: string;
  setProjectPath: (value: string) => void;
  /** Increments after {@link SystemService.loadSystemData} finishes (skills UI can depend on this). */
  systemDataGeneration: number;
};

const Ctx = createContext<ProjectPathValue | null>(null);

export function ProjectPathProvider({ children }: { children: React.ReactNode })
{
  const [ projectPath, setProjectPath ] = useState<string>(() =>
    localStorage.getItem('projectPath') ?? defaultDataPath
  );
  const [ systemDataGeneration, setSystemDataGeneration ] = useState(0);

  useEffect(() =>
  {
    if (!projectPath) return;
    localStorage.setItem('projectPath', projectPath);
    SystemService.loadSystemData(projectPath)
      .then(() =>
      {
        setSystemDataGeneration((n) => n + 1);
      })
      .catch(console.error);
  }, [ projectPath ]);

  const value = useMemo(() => (
    {
      projectPath,
      setProjectPath,
      systemDataGeneration,
    }
  ), [ projectPath, systemDataGeneration ]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjectPath(): ProjectPathValue
{
  const v = useContext(Ctx);
  if (!v) throw new Error('useProjectPath must be used within <ProjectPathProvider />');
  return v;
}
