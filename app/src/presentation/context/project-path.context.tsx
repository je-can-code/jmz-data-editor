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
  projectPath: string;
  setProjectPath: (value: string) => void;
};

const Ctx = createContext<ProjectPathValue | null>(null);

export function ProjectPathProvider({ children }: { children: React.ReactNode })
{
  const [ projectPath, setProjectPath ] = useState<string>(() =>
    localStorage.getItem('projectPath') ?? defaultDataPath
  );

  useEffect(() =>
  {
    if (!projectPath) return;
    localStorage.setItem('projectPath', projectPath);
    SystemService.loadSystemData(projectPath)
      .catch(console.error);
  }, [ projectPath ]);

  const value = useMemo(() => (
    {
      projectPath,
      setProjectPath
    }
  ), [ projectPath ]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjectPath(): ProjectPathValue
{
  const v = useContext(Ctx);
  if (!v) throw new Error('useProjectPath must be used within <ProjectPathProvider />');
  return v;
}
