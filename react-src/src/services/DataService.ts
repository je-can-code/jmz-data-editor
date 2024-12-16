import { filesystem } from "@neutralinojs/lib";
import RPG_Actor = Rmmz.Implementations.RPG_Actor;
import DatabaseFilenames from "../enums/DatabaseFilenames.ts";
import RPG_Skill = Rmmz.Implementations.RPG_Skill;
import RPG_Item = Rmmz.Implementations.RPG_Item;
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;
import RPG_Armor = Rmmz.Implementations.RPG_Armor;
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import { Questopedia } from "../../types/custom/Quests";
import Configuration = Questopedia.Configuration;
import ConfigFilenames from "../enums/ConfigFilenames.ts";

/**
 * Saves the given data by the given filename at the given projectPath.
 * @param projectPath The basepath to the location where the file should live.
 * @param filename The filename itself, including the extension.
 * @param data The data that will be JSONified at save.
 */
const executeSave = async (projectPath: string, filename: string, data: any) =>
{
  console.log('saving...');

  // build the destination filepath to write the data to.
  const destination = `${projectPath}/${filename}`;

  // stringify the incoming data.
  const saveData = JSON.stringify(data, null, 2);

  // execute the write to disk.
  await filesystem.writeFile(destination, saveData);

  console.log(`saved ${destination}.`);
};

/**
 * Loads file as the designated type by the given filename at the given projectPath.
 * @param projectPath The basepath to the location where the file should live.
 * @param filename The filename itself, including the extension.
 */
const executeLoad = async <T>(projectPath: string, filename: string): Promise<T> =>
{
  // build the destination filepath to write the data to.
  const target = `${projectPath}/${filename}`;

  // read the data from the file as JSON.
  const json = await filesystem.readFile(target);

  // return the parsed content.
  return JSON.parse(json) as T;
};

const loadActors = async (projectPath: string): Promise<RPG_Actor[]> =>
{
  return await executeLoad<RPG_Actor[]>(projectPath, DatabaseFilenames.Actors);
};

const loadSkills = async (projectPath: string): Promise<RPG_Skill[]> =>
{
  return await executeLoad<RPG_Skill[]>(projectPath, DatabaseFilenames.Skills);
};

const loadItems = async (projectPath: string): Promise<RPG_Item[]> =>
{
  return await executeLoad<RPG_Item[]>(projectPath, DatabaseFilenames.Items);

};

const loadWeapons = async (projectPath: string): Promise<RPG_Weapon[]> =>
{
  return await executeLoad<RPG_Weapon[]>(projectPath, DatabaseFilenames.Weapons);
};

const loadArmors = async (projectPath: string): Promise<RPG_Armor[]> =>
{
  return await executeLoad<RPG_Armor[]>(projectPath, DatabaseFilenames.Armors);
};

const loadEnemies = async (projectPath: string): Promise<RPG_Enemy[]> =>
{
  return await executeLoad<RPG_Enemy[]>(projectPath, DatabaseFilenames.Enemies);
};

const loadQuests = async (projectPath: string): Promise<Configuration> =>
{
  return await executeLoad<Configuration>(projectPath, ConfigFilenames.Quests);
};

export {
  executeSave,
  executeLoad,
  loadActors,
  loadSkills,
  loadItems,
  loadWeapons,
  loadArmors,
  loadEnemies,
  loadQuests,
};