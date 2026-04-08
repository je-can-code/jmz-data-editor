import DatabaseFilenames from "../core/enums/DatabaseFilenames.ts";
import ConfigFilenames from "../core/enums/ConfigFilenames.ts";
import { JsonStore } from "../core/infrastructure/fs/JsonStore.ts";
import RPG_Actor = Rmmz.Implementations.RPG_Actor;
import RPG_Skill = Rmmz.Implementations.RPG_Skill;
import RPG_Item = Rmmz.Implementations.RPG_Item;
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;
import RPG_Armor = Rmmz.Implementations.RPG_Armor;
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import RPG_System = Rmmz.System.RPG_System;
import RPG_State = Rmmz.Implementations.RPG_State;
import RPG_Animation = Rmmz.Implementations.RPG_Animation;
import RPG_CommonEvent = Rmmz.Implementations.RPG_CommonEvent;
import type { RmmzMapJson } from "@core/types/RmmzMapJson.ts";

type QuestConfiguration = Questopedia.Configuration;
type SdpConfiguration = Sdp.Configuration;

const debug = false;

// the active json store implementation; set at app startup.
let jsonStore: JsonStore | null = null;

/**
 * Sets the underlying JsonStore implementation for data operations.
 * Call this once during app initialization.
 * @param {JsonStore} store The JsonStore to use for IO.
 */
const setJsonStore = (store: JsonStore): void =>
{
  jsonStore = store;
};

/**
 * Saves the given data by the given filename at the given projectPath.
 * @param projectPath The basepath to the location where the file should live.
 * @param filename The filename itself, including the extension.
 * @param data The data that will be JSONified at save.
 */
const executeSave = async (projectPath: string, filename: string, data: any) =>
{
  // guard against missing store configuration.
  if (!jsonStore)
  {
    throw new Error("JsonStore not configured");
  }

  console.log("saving...");

  // build the destination filepath to write the data to.
  const destination = `${projectPath}/${filename}`;

  // execute the write to the backing store.
  await jsonStore.writeJson(destination, data);

  if (debug)
  {
    console.log(data);
  }

  console.log(`saved data to ${destination} successfully.`);
};

/**
 * Loads file as the designated type by the given filename at the given projectPath.
 * @param projectPath The basepath to the location where the file should live.
 * @param filename The filename itself, including the extension.
 */
const executeLoad = async <T>(projectPath: string, filename: string): Promise<T> =>
{
  // guard against missing store configuration.
  if (!jsonStore)
  {
    throw new Error("JsonStore not configured");
  }

  // build the target filepath to read the data from.
  const target = `${projectPath}/${filename}`;

  // read and return the parsed content from the store.
  const result = await jsonStore.readJson<T>(target);

  // console.log(`[ ${filename} ] data loaded successfully.`);

  if (debug)
  {
    console.log(result);
  }

  return result;
};

const loadActors = async (projectPath: string): Promise<RPG_Actor[]> =>
{
  return await executeLoad<RPG_Actor[]>(projectPath, DatabaseFilenames.Actors);
};

const loadSkills = async (projectPath: string): Promise<RPG_Skill[]> =>
{
  return await executeLoad<RPG_Skill[]>(projectPath, DatabaseFilenames.Skills);
};

const loadStates = async (projectPath: string): Promise<RPG_State[]> =>
{
  return await executeLoad<RPG_State[]>(projectPath, DatabaseFilenames.States);
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

const loadQuests = async (projectPath: string): Promise<QuestConfiguration> =>
{
  return await executeLoad<QuestConfiguration>(projectPath, ConfigFilenames.Quests);
};

const loadSdps = async (projectPath: string): Promise<SdpConfiguration> =>
{
  return await executeLoad<SdpConfiguration>(projectPath, ConfigFilenames.Sdps);
};

const loadSystem = async (projectPath: string): Promise<RPG_System> =>
{
  return await executeLoad<RPG_System>(projectPath, ConfigFilenames.System);
};

const loadAnimations = async (projectPath: string): Promise<(RPG_Animation | null)[]> =>
{
  return await executeLoad<(RPG_Animation | null)[]>(projectPath, DatabaseFilenames.Animations);
};

const loadCommonEvents = async (projectPath: string): Promise<(RPG_CommonEvent | null)[]> =>
{
  return await executeLoad<(RPG_CommonEvent | null)[]>(projectPath, DatabaseFilenames.CommonEvents);
};

/**
 * @param mapId RMMZ map id (e.g. {@code 2} for {@code Map002.json}).
 */
function rmmzMapDataFilename(mapId: number): string
{
  const n = Math.max(0, Math.trunc(mapId));
  return `Map${String(n).padStart(3, "0")}.json`;
}

/**
 * Loads a single map JSON from the project's {@code data/} folder.
 * @param rmmzDataPath Absolute path to {@code data/}.
 * @param mapId Map id as in MapInfos / editor.
 */
const loadMapJson = async (rmmzDataPath: string, mapId: number): Promise<RmmzMapJson> =>
{
  return await executeLoad<RmmzMapJson>(rmmzDataPath, rmmzMapDataFilename(mapId));
};

export {
  setJsonStore,
  executeSave,
  executeLoad,

  loadActors,
  loadSkills,
  loadItems,
  loadWeapons,
  loadArmors,
  loadEnemies,

  loadStates,
  loadSystem,
  loadAnimations,
  loadCommonEvents,
  loadMapJson,
  rmmzMapDataFilename,

  loadQuests,
  loadSdps,
};
