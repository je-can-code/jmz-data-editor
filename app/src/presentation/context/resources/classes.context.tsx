import DatabaseFilenames from "@core/enums/DatabaseFilenames.ts";
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';
import { RPG_ClassDomainModel } from '@core/domain/entities/RPG_ClassDomainModel.ts';

export const {
  Provider: ClassesProvider,
  useResource: useClasses
} = createResourceContext(
  DatabaseFilenames.Classes,
  RPG_ClassDomainModel,
  "Classes"
);
