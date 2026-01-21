import { InMemoryBoardRegistry } from '@platform/registry/board';
import { registerBoards } from './boards.registration';

export const registry = new InMemoryBoardRegistry();
registerBoards(registry);
