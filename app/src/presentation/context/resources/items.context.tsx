import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { RPG_ItemDomainModel } from '@core/domain/entities/RPG_ItemDomainModel.ts';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';

export const {
  Provider: ItemsProvider,
  useResource: useItems
} = createResourceContext(
  DatabaseFilenames.Items,
  RPG_ItemDomainModel,
  'Items'
);
