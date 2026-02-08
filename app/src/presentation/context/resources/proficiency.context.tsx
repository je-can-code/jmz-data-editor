import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { createConfigContext } from '@presentation/context/resources/factories/config.factory.tsx';

export const {
  Provider: ProficiencyProvider,
  useHook: useProficiencyInternal,
} = createConfigContext<Proficiency.Conditional>(
  ConfigFilenames.Proficiency,
  'conditionals',
  'Proficiency'
);

/**
 * Domain-friendly wrapper; preserves naming used throughout the board.
 */
export function useProficiency()
{
  const {
    data,
    setData,
    save,
    reload,
    loading,
  } = useProficiencyInternal();

  return {
    conditionals: data,
    setConditionals: setData,
    save,
    reload,
    loading,
  } as const;
}
