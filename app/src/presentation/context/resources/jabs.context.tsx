import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { createCompositeConfigContext } from '@presentation/context/resources/factories/composite-config.factory.tsx';
import type { JabsConfigRoot } from '@core/domain/valueObjects/jabs-teams.ts';

export const {
  Provider: JabsProvider,
  useHook: useJabsInternal,
} = createCompositeConfigContext<JabsConfigRoot>(
  ConfigFilenames.Jabs,
  'Jabs'
);

export function useJabs()
{
  const {
    config,
    ...rest
  } = useJabsInternal();

  return {
    jabsConfig: config,
    ...rest,
  };
}

