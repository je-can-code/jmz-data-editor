import React from 'react';

/**
 * The sections the navigation rail is divided into, in the order they appear.
 *
 * The split is not cosmetic: boards that edit stock RMMZ database files and boards that edit Jeremy's
 * own plugin configuration are genuinely different kinds of thing. Listing them as peers is what let
 * the rail quietly grow taller than the window.
 */
const BOARD_GROUPS = [ 'Database', 'Systems' ] as const;

type BoardGroup = typeof BOARD_GROUPS[number];

export interface BoardDefinition
{
  id: string;
  title: string;
  path: string;
  component: React.ComponentType<any>;
  icon?: React.ReactNode;
  guard?: () => Promise<boolean> | boolean;
  featureFlag?: string;

  /**
   * Which section of the rail this board belongs to. A board with no group is pinned above every
   * section, which is how the index sits at the top.
   */
  group?: BoardGroup;
}

export { BOARD_GROUPS };
export type { BoardGroup };
