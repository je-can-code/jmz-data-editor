import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';
import { RPG_SkillDomainModel } from '@core/domain/entities/RPG_SkillDomainModel.ts';

const base = createResourceContext(
  DatabaseFilenames.Skills,
  RPG_SkillDomainModel,
  'Skills',
);

export const SkillsProvider = base.Provider;

export function useSkills()
{
  const {
    data,
    byId,
    ...rest
  } = base.useResource();

  /**
   * Maps a skill ID to its name.
   * @param {number} id The skill ID.
   * @returns {string} The skill name or a fallback.
   */
  const toName = (id: number): string =>
  {
    return byId.get(id)?.name ?? `Unknown Skill (id:${id})`;
  };

  return {
    skills: data,
    byId,
    toName,
    ...rest
  } as const;
}
