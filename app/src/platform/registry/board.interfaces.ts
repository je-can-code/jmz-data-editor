import React from 'react';
import {
  BoardId
} from "./board.types.ts";

export interface BoardDefinition
{
  id: BoardId;
  title: string;
  path: string;
  component: React.ComponentType<any>;
  icon?: React.ReactNode;
  guard?: () => Promise<boolean> | boolean;
  featureFlag?: string;
}
