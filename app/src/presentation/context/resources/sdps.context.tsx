import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { createConfigContext } from '@presentation/context/resources/factories/config.factory.tsx';

export const {
  Provider: SdpsProvider,
  useHook: useSdpsInternal
} = createConfigContext<Sdp.StatDistributionPanel>(
  ConfigFilenames.Sdps,
  'sdps',
  'Sdps'
);

export function useSdps()
{
  const {
    data,
    ...rest
  } = useSdpsInternal();
  return { sdps: data, ...rest };
}
