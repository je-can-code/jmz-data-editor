import { InMemoryBoardRegistry } from "../registry/board.ts";

export function registerBoards(registry: InMemoryBoardRegistry) {
  registry.register({
    id: "enemies",
    title: "Enemies",
    category: "Database",
    path: "/database/enemies",
    lazyComponent: () => import("@presentation/database/enemies/EnemiesBoard"),
    guard: () => true, // wire real guards later
    featureFlag: "db.enemies",
  });
  // add more...
}
