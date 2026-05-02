import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { createConfigContext } from '@presentation/context/resources/factories/config.factory.tsx';
import { normalizeSdpPanelList } from '@services/sdp/sdpPanelRarity.ts';

export const {
  Provider: SdpsProvider,
  useHook: useSdpsInternal
} = createConfigContext<Sdp.StatDistributionPanel>(
  ConfigFilenames.Sdps,
  'sdps',
  'Sdps',
  normalizeSdpPanelList
);

export function useSdps()
{
  const {
    data,
    ...rest
  } = useSdpsInternal();
  return { sdps: data, ...rest };
}
