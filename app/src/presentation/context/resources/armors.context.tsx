import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';
import { RPG_ArmorDomainModel } from '@core/domain/entities/RPG_ArmorDomainModel.ts';

export const {
  Provider: ArmorsProvider,
  useResource: useArmors
} = createResourceContext(
  DatabaseFilenames.Armors,
  RPG_ArmorDomainModel,
  'Armors'
);
