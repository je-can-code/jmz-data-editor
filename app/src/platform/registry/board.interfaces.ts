import React from 'react';

export interface BoardDefinition
{
  id: string;
  title: string;
  path: string;
  component: React.ComponentType<any>;
  icon?: React.ReactNode;
  guard?: () => Promise<boolean> | boolean;
  featureFlag?: string;
}
