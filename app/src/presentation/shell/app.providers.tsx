import React from 'react';
import { ProjectPathProvider } from '../context/project-path.context.tsx';
import { EnemiesProvider } from "@presentation/context/resources/enemies.context.tsx";

export function AppProviders({ children }: { children: React.ReactNode })
{
  return (
    <ProjectPathProvider>
      <EnemiesProvider>
        {children}
      </EnemiesProvider>
    </ProjectPathProvider>
  );
}
