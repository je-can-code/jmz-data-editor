import React from 'react';
import { ProjectPathProvider } from '../context/project-path.context.tsx';
import { EnemiesProvider } from "@presentation/context/resources/enemies.context.tsx";
import { SdpsProvider } from "@presentation/context/resources/sdps.context.tsx";

export function AppProviders({ children }: { children: React.ReactNode })
{
  return (
    <ProjectPathProvider>
      <SdpsProvider>
        <EnemiesProvider>
          {children}
        </EnemiesProvider>
      </SdpsProvider>
    </ProjectPathProvider>
  );
}
