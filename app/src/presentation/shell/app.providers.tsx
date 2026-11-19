import React from 'react';
import { ProjectPathProvider } from '../context/project-path.context.tsx';
import { BoardActionsProvider } from '@presentation/context/board-actions.context.tsx';
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
import { JabsProvider } from '@presentation/context/resources/jabs.context.tsx';
import { LevelProvider } from '@presentation/context/resources/level.context.tsx';
import { DifficultyProvider } from '@presentation/context/resources/difficulty.context.tsx';
import { MotionProvider } from '@presentation/context/resources/motion.context.tsx';
import { WeatherProvider } from '@presentation/context/resources/weather.context.tsx';
import { NotetagLinesProvider } from '@presentation/context/resources/notetag-lines.context.tsx';
import { OmniProvider } from '@presentation/context/resources/omni.context.tsx';

type AppProvidersProps = {
  /**
   * The project root the API serves, which the editor starts on.
   */
  projectRoot: string;
  children: React.ReactNode;
};

const AppProviders = ({ projectRoot, children }: AppProvidersProps) =>
{
  // the project path sits outside the composer, since it alone is handed something: the root every provider below
  // loads from, there from the first render.
  return (
    <ProjectPathProvider initialProjectRoot={projectRoot}>
      <ProviderComposer
        providers={[
          BoardActionsProvider,
          IconSetAtlasProvider,
          SdpsProvider,
          ProficiencyProvider,
          QuestsProvider,
          CraftingProvider,
          JabsProvider,
          LevelProvider,
          DifficultyProvider,
          MotionProvider,
          WeatherProvider,
          NotetagLinesProvider,
          OmniProvider,
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
    </ProjectPathProvider>
  );
};

export { AppProviders };
