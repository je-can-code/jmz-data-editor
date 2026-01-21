import {
  BoardCategory,
  BoardId
} from "./board.types.ts";

export interface BoardDefinition
{
  id: BoardId;
  title: string;
  category?: BoardCategory;
  path: string; // e.g., "/database/enemies"
  icon?: React.ReactNode | string;
  lazyComponent: () => Promise<{ default: React.ComponentType<any> }>;
  guard?: () => Promise<boolean> | boolean; // e.g., project is open
  featureFlag?: string; // e.g., "db.enemies"
}

export interface BoardRegistry
{
  register(board: BoardDefinition): void;

  all(): ReadonlyArray<BoardDefinition>;

  get(id: BoardId): BoardDefinition | undefined;
}
