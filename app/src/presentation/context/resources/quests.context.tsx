import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { createCompositeConfigContext } from '@presentation/context/resources/factories/composite-config.factory.tsx';

export const {
  Provider: QuestsProvider,
  useHook: useQuestsInternal,
} = createCompositeConfigContext<Questopedia.Configuration>(
  ConfigFilenames.Quests,
  'Quests'
);

/**
 * Thin wrapper that exposes domain-specific arrays and convenience setters.
 */
export function useQuests()
{
  const {
    config,
    setConfig,
    save,
    reload,
    loading,
  } = useQuestsInternal();

  const quests = config?.quests ?? [];
  const tags = config?.tags ?? [];
  const categories = config?.categories ?? [];

  const setQuests = (updated: Questopedia.OmniQuest[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      quests: updated,
    });
  };

  const setTags = (updated: Questopedia.OmniTag[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      tags: updated,
    });
  };

  const setCategories = (updated: Questopedia.OmniCategory[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      categories: updated,
    });
  };

  return {
    // data
    quests,
    tags,
    categories,

    // setters (update only one root field while preserving others)
    setQuests,
    setTags,
    setCategories,

    // base controls
    save,
    reload,
    loading,

    // expose raw config if a caller truly needs it
    config,
    setConfig,
  } as const;
}
