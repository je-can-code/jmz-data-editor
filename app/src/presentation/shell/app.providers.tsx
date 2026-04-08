import React from 'react';
import { ProjectPathProvider } from '../context/project-path.context.tsx';
import { IconSetAtlasProvider } from '@presentation/context/icon-set-atlas.context.tsx';
import { EnemiesProvider } from '@presentation/context/resources/enemies.context.tsx';
import { SdpsProvider } from '@presentation/context/resources/sdps.context.tsx';
import { ItemsProvider } from '@presentation/context/resources/items.context.tsx';
import { WeaponsProvider } from '@presentation/context/resources/weapons.context.tsx';
import { ArmorsProvider } from '@presentation/context/resources/armors.context.tsx';
import { ClassesProvider } from '@presentation/context/resources/classes.context.tsx';
import { ActorsProvider } from '@presentation/context/resources/actors.context.tsx';
import { SkillsProvider } from '@presentation/context/resources/skills.context.tsx';
import { StatesProvider } from '@presentation/context/resources/states.context.tsx';
import { ProviderComposer } from '@presentation/components/composer.provider.tsx';
import { ProficiencyProvider } from '@presentation/context/resources/proficiency.context.tsx';
import { QuestsProvider } from '@presentation/context/resources/quests.context.tsx';
import { CraftingProvider } from '@presentation/context/resources/crafting.context.tsx';

const AppProviders = ({ children }: { children: React.ReactNode }) =>
{
  return (
    <ProviderComposer
      providers={[
        ProjectPathProvider,
        IconSetAtlasProvider,
        SdpsProvider,
        ProficiencyProvider,
        QuestsProvider,
        CraftingProvider,
        ItemsProvider,
        WeaponsProvider,
        ArmorsProvider,
        ActorsProvider,
        SkillsProvider,
        StatesProvider,
        ClassesProvider,
        EnemiesProvider,
      ]}
    >
      {children}
    </ProviderComposer>
  );
}

export { AppProviders };
