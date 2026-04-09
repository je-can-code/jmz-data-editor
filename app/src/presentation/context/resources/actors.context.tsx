import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { RPG_ActorDomainModel } from '@core/domain/entities/RPG_ActorDomainModel.ts';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';

export const {
  Provider: ActorsProvider,
  useResource: useActors
} = createResourceContext(
  DatabaseFilenames.Actors,
  RPG_ActorDomainModel,
  'Actors'
);
