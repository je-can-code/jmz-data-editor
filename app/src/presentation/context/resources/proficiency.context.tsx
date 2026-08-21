import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { createCompositeConfigContext } from '@presentation/context/resources/factories/composite-config.factory.tsx';

/**
 * Provide the base context for Proficiency configuration.
 *
 * Composite rather than single-key, because the file carries four root blocks now: the conditionals
 * this board was built for, and the three the knowledge extension reads. The single-key factory
 * rebuilds the whole file out of one key on save, so opening this board once under it would have
 * written the other three away.
 */
export const {
  Provider: ProficiencyProvider,
  useHook: useProficiencyInternal,
} = createCompositeConfigContext<Proficiency.Configuration>(
  ConfigFilenames.Proficiency,
  'Proficiency'
);

/**
 * Domain-friendly wrapper for Proficiency configuration.
 * Exposes conditionals and the knowledge blocks, with their respective setters.
 */
export function useProficiency()
{
  const {
    config,
    setConfig,
    save,
    reload,
    loading,
  } = useProficiencyInternal();

  const conditionals = config?.conditionals ?? [];
  const knowledgeTags = config?.knowledgeTags ?? [];
  const skillTypeMapping = config?.skillTypeMapping ?? {};
  const knowledgeExchanges = config?.knowledgeExchanges ?? [];

  /**
   * Replaces the authored proficiency conditionals.
   * @param {Proficiency.Conditional[]} updated The full list of conditionals, in display order.
   */
  const setConditionals = (updated: Proficiency.Conditional[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      conditionals: updated,
    });
  };

  /**
   * Replaces the authored knowledge tag vocabulary.
   * @param {Proficiency.KnowledgeTag[]} updated The full list of tags, in display order.
   */
  const setKnowledgeTags = (updated: Proficiency.KnowledgeTag[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      knowledgeTags: updated,
    });
  };

  /**
   * Replaces the mapping of skill types onto the kinds of knowledge their use produces.
   * @param {Proficiency.SkillTypeMapping} updated The full mapping, keyed by skill type id.
   */
  const setSkillTypeMapping = (updated: Proficiency.SkillTypeMapping) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      skillTypeMapping: updated,
    });
  };

  /**
   * Replaces the authored knowledge exchanges.
   * @param {Proficiency.KnowledgeExchange[]} updated The full list of exchanges, in display order.
   */
  const setKnowledgeExchanges = (updated: Proficiency.KnowledgeExchange[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      knowledgeExchanges: updated,
    });
  };

  return {
    // data
    conditionals,
    knowledgeTags,
    skillTypeMapping,
    knowledgeExchanges,

    // setters
    setConditionals,
    setKnowledgeTags,
    setSkillTypeMapping,
    setKnowledgeExchanges,

    // base controls
    save,
    reload,
    loading,

    // raw config access
    config,
    setConfig,
  } as const;
}
