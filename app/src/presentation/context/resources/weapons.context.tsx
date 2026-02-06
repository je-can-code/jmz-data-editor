import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { RPG_WeaponDomainModel } from '@core/domain/entities/RPG_WeaponDomainModel.ts';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';

export const {
  Provider: WeaponsProvider,
  useResource: useWeapons
} = createResourceContext(
  DatabaseFilenames.Weapons,
  RPG_WeaponDomainModel,
  'Weapons'
);
