import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { executeSave, executeLoad } from '@services/DataService.ts';
import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Base = Rmmz.Base.RPG_Base;

/**
 * Common shape for all database resource contexts.
 */
export type ResourceContextValue<TModel> = {
  data: TModel[];
  setData: React.Dispatch<React.SetStateAction<TModel[]>>;
  save: (updatedList: TModel[]) => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
};

/**
 * Creates a standardized Database Resource Context and Provider.
 * @param {DatabaseFilenames} filename The RMMZ JSON filename.
 * @param {new (rmmz: TDto) => TModel} ModelClass The domain model constructor.
 * @param {string} displayName The name of the resource (for error messages).
 */
const createResourceContext = <TModel extends RPG_BaseDomainModel<TDto>, TDto extends RPG_Base>(
  filename: DatabaseFilenames,
  ModelClass: new (rmmz: TDto) => TModel,
  displayName: string
) =>
{
  const Context = createContext<ResourceContextValue<TModel> | null>(null);

  function ResourceProvider({ children }: { children: ReactNode })
  {
    const { projectPath } = useProjectPath();
    const [ data, setData ] = useState<TModel[]>([]);
    const [ loading, setLoading ] = useState(true);

    const reload = useCallback(async () =>
    {
      if (!projectPath || !projectPath.endsWith('/data'))
      {
        return;
      }

      setLoading(true);
      try
      {
        const rawData = await executeLoad<TDto[]>(projectPath, filename);

        // Filter out the null at index 0 and map to domain models.
        const validModels = rawData
          .filter((rmmz): rmmz is TDto => rmmz !== null)
          .map(rmmz => new ModelClass(rmmz));

        setData(validModels);
      }
      catch (error)
      {
        console.error(`Failed to load ${displayName}:`, error);
      }
      finally
      {
        setLoading(false);
      }
    }, [ projectPath ]);

    const save = useCallback(async (updatedList: TModel[]) =>
    {
      if (!projectPath)
      {
        return;
      }

      try
      {
        const rmmzData = updatedList.map(item => item.toRmmz());
        const finalData = [ null, ...rmmzData ];

        await executeSave(projectPath, filename, finalData);
        setData(updatedList);
      }
      catch (error)
      {
        console.error(`Failed to save ${displayName}:`, error);
        throw error;
      }
    }, [ projectPath ]);

    useEffect(() =>
    {
      reload();
    }, [ reload ]);

    const value = useMemo(() => (
      {
        data,
        setData,
        save,
        reload,
        loading,
      }
    ), [ data, save, reload, loading ]);

    return (
      <Context.Provider value={value}>
        {children}
      </Context.Provider>
    );
  }

  function useResource()
  {
    const ctx = useContext(Context);
    if (!ctx)
    {
      throw new Error(`use${displayName} must be used within a ${displayName}Provider`);
    }

    return ctx;
  }

  return {
    Provider: ResourceProvider,
    useResource,
  };
};

export { createResourceContext };
