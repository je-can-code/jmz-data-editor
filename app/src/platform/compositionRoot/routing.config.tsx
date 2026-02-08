import React from "react";
import { BoardDefinition } from "@platform/registry/board.interfaces.ts";
import SdpBoard from "../../presentation/boards/sdp/SdpBoard.tsx";
import QuestBoard from "../../presentation/boards/quests/QuestBoard.tsx";
import CraftingBoard from "../../presentation/boards/crafting/CraftingBoard.tsx";
import ProficiencyBoard from "../../presentation/boards/proficiency/ProficiencyBoard.tsx";
import EnemiesBoard from "../../presentation/boards/enemies/EnemiesBoard.tsx";
import {
  AccountTree,
  Android,
  Construction,
  Hub,
  Rule,
} from '@mui/icons-material';
import IndexBoard from "@boards/_index/IndexBoard.tsx";

const indexBoard: BoardDefinition = {
  id: "root",
  title: "index",
  path: "/",
  component: IndexBoard,
  guard: () => true,
  icon: <Hub />,
  featureFlag: "root"
};

const enemyBoard: BoardDefinition = {
  id: "enemies",
  title: "Enemies",
  path: "/enemies",
  component: EnemiesBoard,
  guard: () => true,
  icon: <Android fontSize={"small"}/>,
  featureFlag: "db.enemies",
};

const sdpBoard: BoardDefinition = {
  id: "sdp",
  title: "SDP",
  path: "/sdp",
  component: SdpBoard,
  guard: () => true,
  icon: <Rule fontSize={"small"}/>,
  featureFlag: "sdp",
};

const questBoard: BoardDefinition = {
  id: "quests",
  title: "Quests",
  path: "/quests",
  component: QuestBoard,
  guard: () => true,
  icon: <Hub fontSize={"small"}/>,
  featureFlag: "quests",
};

const craftingBoard: BoardDefinition = {
  id: "crafting",
  title: "Crafting",
  path: "/crafting",
  component: CraftingBoard,
  guard: () => true,
  icon: <Construction fontSize={"small"}/>,
  featureFlag: "crafting",
};

const proficiencyBoard: BoardDefinition = {
  id: "proficiency",
  title: "Proficiency",
  path: "/proficiency",
  component: ProficiencyBoard,
  guard: () => true,
  icon: <AccountTree fontSize={"small"}/>,
  featureFlag: "proficiency",
};

const APP_ROUTES: BoardDefinition[] = [
  indexBoard,
  enemyBoard,
  sdpBoard,
  questBoard,
  craftingBoard,
  proficiencyBoard,
];

export { APP_ROUTES };
