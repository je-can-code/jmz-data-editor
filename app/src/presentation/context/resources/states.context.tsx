import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { RPG_StateDomainModel } from '@core/domain/entities/RPG_StateDomainModel.ts';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';

const base = createResourceContext(
  DatabaseFilenames.States,
  RPG_StateDomainModel,
  'States',
);

export const StatesProvider = base.Provider;

export function useStates()
{
  const {
    data,
    byId,
    ...rest
  } = base.useResource();

  /**
   * Maps a state ID to its name.
   * @param {number} id The state ID.
   * @returns {string} The state name or a fallback.
   */
  const toName = (id: number): string =>
  {
    return byId.get(id)?.name ?? `Unknown State (id:${id})`;
  };

  return {
    states: data,
    byId,
    toName,
    ...rest
  } as const;
}
