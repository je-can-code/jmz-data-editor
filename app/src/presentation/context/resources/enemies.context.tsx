import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';

export const {
  Provider: EnemiesProvider,
  useResource: useEnemies
} = createResourceContext(
  DatabaseFilenames.Enemies,
  RPG_EnemyDomainModel,
  'Enemies'
);
