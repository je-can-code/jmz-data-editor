import React from 'react';
import { ProjectPathProvider } from '../context/project-path.context.tsx';

export function AppProviders({ children }: { children: React.ReactNode })
{
  return (
    <ProjectPathProvider>
      {children}
    </ProjectPathProvider>
  );
}
