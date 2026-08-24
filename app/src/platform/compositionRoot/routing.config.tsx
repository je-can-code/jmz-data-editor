import React from 'react';
import { BoardDefinition } from '@platform/registry/board.interfaces.ts';
import SdpBoard from '../../presentation/boards/sdp/SdpBoard.tsx';
import QuestBoard from '../../presentation/boards/quests/QuestBoard.tsx';
import CraftingBoard from '../../presentation/boards/crafting/CraftingBoard.tsx';
import ProficiencyBoard from '../../presentation/boards/proficiency/ProficiencyBoard.tsx';
import EnemiesBoard from '../../presentation/boards/enemies/EnemiesBoard.tsx';
import JabsConfigBoard from '@boards/jabs/JabsConfigBoard.tsx';
import LevelConfigBoard from '@boards/level/LevelConfigBoard.tsx';
import DifficultyBoard from '@boards/difficulty/DifficultyBoard.tsx';
import { AccountTree, Android, Build, Construction, Diversity3, Hub, Inventory2, LocalHospital, Rule, School, Groups, Shield, TrendingUp, Whatshot, } from '@mui/icons-material';
import IndexBoard from '@boards/_index/IndexBoard.tsx';
import SkillsBoard from '@boards/skills/SkillsBoard.tsx';
import StatesBoard from '@boards/states/StatesBoard.tsx';
import WeaponsBoard from '@boards/weapons/WeaponsBoard.tsx';
import ArmorsBoard from '@boards/armors/ArmorsBoard.tsx';
import ItemsBoard from '@boards/items/ItemsBoard.tsx';
import ClassesBoard from '@boards/classes/ClassesBoard.tsx';

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
  group: 'Database',
};

const skillsBoard: BoardDefinition = {
  id: 'skills',
  title: 'Skills',
  path: '/skills',
  component: SkillsBoard,
  guard: () => true,
  icon: <School fontSize={'small'}/>,
  featureFlag: 'db.skills',
  group: 'Database',
};

const statesBoard: BoardDefinition = {
  id: 'states',
  title: 'States',
  path: '/states',
  component: StatesBoard,
  guard: () => true,
  icon: <LocalHospital fontSize={'small'}/>,
  featureFlag: 'db.states',
  group: 'Database',
};

const sdpBoard: BoardDefinition = {
  id: 'sdp',
  title: 'SDP',
  path: '/sdp',
  component: SdpBoard,
  guard: () => true,
  icon: <Rule fontSize={'small'}/>,
  featureFlag: 'sdp',
  group: 'Systems',
};

const classesBoard: BoardDefinition = {
  id: 'classes',
  title: 'Classes',
  path: '/classes',
  component: ClassesBoard,
  guard: () => true,
  icon: <Diversity3 fontSize={'small'}/>,
  featureFlag: 'db.classes',
  group: 'Database',
};

const questBoard: BoardDefinition = {
  id: 'quests',
  title: 'Quests',
  path: '/quests',
  component: QuestBoard,
  guard: () => true,
  icon: <Hub fontSize={'small'}/>,
  featureFlag: 'quests',
  group: 'Systems',
};

const craftingBoard: BoardDefinition = {
  id: 'crafting',
  title: 'Crafting',
  path: '/crafting',
  component: CraftingBoard,
  guard: () => true,
  icon: <Construction fontSize={'small'}/>,
  featureFlag: 'crafting',
  group: 'Systems',
};

const proficiencyBoard: BoardDefinition = {
  id: 'proficiency',
  title: 'Proficiency',
  path: '/proficiency',
  component: ProficiencyBoard,
  guard: () => true,
  icon: <AccountTree fontSize={'small'}/>,
  featureFlag: 'proficiency',
  group: 'Systems',
};

const jabsConfigBoard: BoardDefinition = {
  id: 'jabs-config',
  title: 'JABS',
  path: '/jabs',
  component: JabsConfigBoard,
  guard: () => true,
  icon: <Groups fontSize={'small'}/>,
  featureFlag: 'jabs',
  group: 'Systems',
};

const levelConfigBoard: BoardDefinition = {
  id: 'level-config',
  title: 'Level',
  path: '/level',
  component: LevelConfigBoard,
  guard: () => true,
  icon: <TrendingUp fontSize={'small'}/>,
  featureFlag: 'level',
  group: 'Systems',
};

const difficultyBoard: BoardDefinition = {
  id: 'difficulty-config',
  title: 'Difficulty',
  path: '/difficulty',
  component: DifficultyBoard,
  guard: () => true,
  icon: <Whatshot fontSize={'small'}/>,
  featureFlag: 'difficulty',
  group: 'Systems',
};

const weaponsBoard: BoardDefinition = {
  id: 'weapons',
  title: 'Weapons',
  path: '/weapons',
  component: WeaponsBoard,
  guard: () => true,
  icon: <Build fontSize={'small'}/>,
  featureFlag: 'db.weapons',
  group: 'Database',
};

const armorsBoard: BoardDefinition = {
  id: 'armors',
  title: 'Armors',
  path: '/armors',
  component: ArmorsBoard,
  guard: () => true,
  icon: <Shield fontSize={'small'}/>,
  featureFlag: 'db.armors',
  group: 'Database',
};

const itemsBoard: BoardDefinition = {
  id: 'items',
  title: 'Items',
  path: '/items',
  component: ItemsBoard,
  guard: () => true,
  icon: <Inventory2 fontSize={'small'}/>,
  featureFlag: 'db.items',
  group: 'Database',
};

const APP_ROUTES: BoardDefinition[] = [
  indexBoard,
  classesBoard,
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
  levelConfigBoard,
  difficultyBoard,
];

export { APP_ROUTES };
