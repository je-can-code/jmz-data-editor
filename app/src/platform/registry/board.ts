import {
  BoardDefinition,
  BoardRegistry
} from "./board.interfaces.ts";
import { BoardId } from "./board.types.ts";

export class InMemoryBoardRegistry
  implements BoardRegistry
{
  private map = new Map<BoardId, BoardDefinition>();

  register(board: BoardDefinition)
  {
    this.map.set(board.id, board);
  }

  all()
  {
    return Array.from(this.map.values());
  }

  get(id: BoardId)
  {
    return this.map.get(id);
  }
}
