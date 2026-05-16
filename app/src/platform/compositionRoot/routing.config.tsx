import React from 'react';
import { BoardDefinition } from '@platform/registry/board.interfaces.ts';
import SdpBoard from '../../presentation/boards/sdp/SdpBoard.tsx';
import QuestBoard from '../../presentation/boards/quests/QuestBoard.tsx';
import CraftingBoard from '../../presentation/boards/crafting/CraftingBoard.tsx';
import ProficiencyBoard from '../../presentation/boards/proficiency/ProficiencyBoard.tsx';
import EnemiesBoard from '../../presentation/boards/enemies/EnemiesBoard.tsx';
import JabsConfigBoard from '@boards/jabs/JabsConfigBoard.tsx';
import { AccountTree, Android, Build, Construction, Hub, Inventory2, LocalHospital, Rule, School, Groups, Shield, } from '@mui/icons-material';
import IndexBoard from '@boards/_index/IndexBoard.tsx';
import SkillsBoard from '@boards/skills/SkillsBoard.tsx';
import StatesBoard from '@boards/states/StatesBoard.tsx';
import WeaponsBoard from '@boards/weapons/WeaponsBoard.tsx';
import ArmorsBoard from '@boards/armors/ArmorsBoard.tsx';
import ItemsBoard from '@boards/items/ItemsBoard.tsx';

const indexBoard: BoardDefinition = {
  id: 'root',
  title: 'index',
  path: '/',
  component: IndexBoard,
  guard: () => true,
  icon: <Hub/>,
  featureFlag: 'root'
};

const enemyBoard: BoardDefinition = {
  id: 'enemies',
  title: 'Enemies',
  path: '/enemies',
  component: EnemiesBoard,
  guard: () => true,
  icon: <Android fontSize={'small'}/>,
  featureFlag: 'db.enemies',
};

const skillsBoard: BoardDefinition = {
  id: 'skills',
  title: 'Skills',
  path: '/skills',
  component: SkillsBoard,
  guard: () => true,
  icon: <School fontSize={'small'}/>,
  featureFlag: 'db.skills',
};

const statesBoard: BoardDefinition = {
  id: 'states',
  title: 'States',
  path: '/states',
  component: StatesBoard,
  guard: () => true,
  icon: <LocalHospital fontSize={'small'}/>,
  featureFlag: 'db.states',
};

const sdpBoard: BoardDefinition = {
  id: 'sdp',
  title: 'SDP',
  path: '/sdp',
  component: SdpBoard,
  guard: () => true,
  icon: <Rule fontSize={'small'}/>,
  featureFlag: 'sdp',
};

const questBoard: BoardDefinition = {
  id: 'quests',
  title: 'Quests',
  path: '/quests',
  component: QuestBoard,
  guard: () => true,
  icon: <Hub fontSize={'small'}/>,
  featureFlag: 'quests',
};

const craftingBoard: BoardDefinition = {
  id: 'crafting',
  title: 'Crafting',
  path: '/crafting',
  component: CraftingBoard,
  guard: () => true,
  icon: <Construction fontSize={'small'}/>,
  featureFlag: 'crafting',
};

const proficiencyBoard: BoardDefinition = {
  id: 'proficiency',
  title: 'Proficiency',
  path: '/proficiency',
  component: ProficiencyBoard,
  guard: () => true,
  icon: <AccountTree fontSize={'small'}/>,
  featureFlag: 'proficiency',
};

const jabsConfigBoard: BoardDefinition = {
  id: 'jabs-config',
  title: 'JABS',
  path: '/jabs',
  component: JabsConfigBoard,
  guard: () => true,
  icon: <Groups fontSize={'small'}/>,
  featureFlag: 'jabs',
};

const weaponsBoard: BoardDefinition = {
  id: 'weapons',
  title: 'Weapons',
  path: '/weapons',
  component: WeaponsBoard,
  guard: () => true,
  icon: <Build fontSize={'small'}/>,
  featureFlag: 'db.weapons',
};

const armorsBoard: BoardDefinition = {
  id: 'armors',
  title: 'Armors',
  path: '/armors',
  component: ArmorsBoard,
  guard: () => true,
  icon: <Shield fontSize={'small'}/>,
  featureFlag: 'db.armors',
};

const itemsBoard: BoardDefinition = {
  id: 'items',
  title: 'Items',
  path: '/items',
  component: ItemsBoard,
  guard: () => true,
  icon: <Inventory2 fontSize={'small'}/>,
  featureFlag: 'db.items',
};

const APP_ROUTES: BoardDefinition[] = [
  indexBoard,
  enemyBoard,
  skillsBoard,
  statesBoard,
  weaponsBoard,
  armorsBoard,
  itemsBoard,
  sdpBoard,
  questBoard,
  craftingBoard,
  proficiencyBoard,
  jabsConfigBoard,
];

export { APP_ROUTES };
