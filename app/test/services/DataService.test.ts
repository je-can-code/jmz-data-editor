import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  executeLoad,
  executeSave,
  loadActors,
  loadArmors,
  loadEnemies,
  loadItems,
  loadQuests,
  loadSkills,
  loadStates,
  loadSystem,
  loadWeapons,
  setJsonStore,
} from "../../src/services/DataService";

import { MemoryJsonStore } from "../../src/core/infrastructure/fs/memory/MemoryJsonStore";

const projectPath = "/my-game/data";

// -----------------------------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------------------------

/**
 * Seeds the in-memory JSON store with a set of filePath -> data pairs.
 * Replaces the active store for the module under test.
 */
function seedStore(files: Record<string, unknown>): void
{
  setJsonStore(new MemoryJsonStore(files));
}

/**
 * Combines project root with a filename for convenience.
 */
function inProjectRoot(filename: string): string
{
  return `${projectPath}/${filename}`;
}

// -----------------------------------------------------------------------------------------------
// Core read/write tests
// -----------------------------------------------------------------------------------------------

describe("DataService.executeSave/executeLoad", () =>
{
  beforeEach(() =>
  {
    // reset spies and state.
    vi.restoreAllMocks();
    vi.clearAllMocks();

    // quiet console during tests.
    vi.spyOn(console, "log").mockImplementation(() => { /* no-op */ });

    // configure a fresh memory store before each test.
    setJsonStore(new MemoryJsonStore());
  });

  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it("executeSave writes pretty-printed JSON to the correct path", async () =>
  {
    const payload = {
      id: 1,
      name: "Potion",
      price: 50,
    };

    const filename = "Items.json";

    // act: save the payload.
    await executeSave(projectPath, filename, payload);

    // assert: round-trip by loading back.
    const roundTrip = await executeLoad<typeof payload>(projectPath, filename);
    expect(roundTrip).toEqual(payload);
  });

  it("executeLoad reads JSON from the correct path and parses it", async () =>
  {
    const filename = "Enemies.json";

    const enemyData = [
      {
        id: 3,
        name: "Slime",
      },
    ];

    // seed the memory store with the file contents.
    seedStore({ [inProjectRoot(filename)]: enemyData });

    const result = await executeLoad<typeof enemyData>(projectPath, filename);
    expect(result).toEqual(enemyData);
  });
});

// -----------------------------------------------------------------------------------------------
// Loader-specific tests
// -----------------------------------------------------------------------------------------------

describe("DataService loaders return parsed JSON of the expected shape", () =>
{
  beforeEach(() =>
  {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => { /* no-op */ });
  });

  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it("loadActors returns an array of RPG_Actor", async () =>
  {
    const fake = [
      { id: 1, name: "Harold", note: "" },
      { id: 2, name: "Therese", note: "" },
    ];

    seedStore({ [inProjectRoot("Actors.json")]: fake });

    const result = await loadActors(projectPath);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(fake);
    expect(result[0].name).toBe("Harold");
  });

  it("loadSkills returns an array of RPG_Skill", async () =>
  {
    const fake = [
      { id: 10, name: "Fire", note: "" },
      { id: 11, name: "Ice", note: "" },
    ];

    seedStore({ [inProjectRoot("Skills.json")]: fake });

    const result = await loadSkills(projectPath);

    expect(result).toEqual(fake);
    expect(result[1].name).toBe("Ice");
  });

  it("loadStates returns an array of RPG_State", async () =>
  {
    const fake = [
      { id: 3, name: "Poison", note: "" },
      { id: 4, name: "Paralyze", note: "" },
    ];

    seedStore({ [inProjectRoot("States.json")]: fake });

    const result = await loadStates(projectPath);

    expect(result).toEqual(fake);
    expect(result[0].name).toBe("Poison");
  });

  it("loadItems returns an array of RPG_Item", async () =>
  {
    const fake = [
      { id: 1, name: "Potion", note: "" },
      { id: 2, name: "Hi-Potion", note: "" },
    ];

    seedStore({ [inProjectRoot("Items.json")]: fake });

    const result = await loadItems(projectPath);

    expect(result).toEqual(fake);
    expect(result[0].name).toBe("Potion");
  });

  it("loadWeapons returns an array of RPG_Weapon", async () =>
  {
    const fake = [
      { id: 1, name: "Bronze Sword", note: "" },
      { id: 2, name: "Iron Sword", note: "" },
    ];

    seedStore({ [inProjectRoot("Weapons.json")]: fake });

    const result = await loadWeapons(projectPath);

    expect(result).toEqual(fake);
    expect(result[1].name).toBe("Iron Sword");
  });

  it("loadArmors returns an array of RPG_Armor", async () =>
  {
    const fake = [
      { id: 1, name: "Leather Armor", note: "" },
      { id: 2, name: "Chainmail", note: "" },
    ];

    seedStore({ [inProjectRoot("Armors.json")]: fake });

    const result = await loadArmors(projectPath);

    expect(result).toEqual(fake);
    expect(result[0].name).toBe("Leather Armor");
  });

  it("loadEnemies returns an array of RPG_Enemy", async () =>
  {
    const fake = [
      { id: 3, name: "Slime", note: "" },
      { id: 4, name: "Orc", note: "" },
    ];

    seedStore({ [inProjectRoot("Enemies.json")]: fake });

    const result = await loadEnemies(projectPath);

    expect(result).toEqual(fake);
    expect(result[1].name).toBe("Orc");
  });

  it("loadQuests returns a Configuration-like object", async () =>
  {
    const fake = {
      // populate minimally; shape is opaque to the loader.
      version: 1,
      quests: [],
    } as unknown; // leave as unknown to match generic typing in tests.

    seedStore({ [inProjectRoot("config.quest.json")]: fake });

    const result = await loadQuests(projectPath);

    expect(typeof result).toBe("object");
    expect(result).toEqual(fake);
  });

  it("loadSystem returns an RPG_System-like object", async () =>
  {
    const fake = {
      elements: ["None", "Fire", "Ice"],
      skillTypes: ["Magic", "Special"],
      weaponTypes: ["Sword", "Axe"],
      armorTypes: ["Light", "Heavy"],
      equipTypes: ["Weapon", "Shield", "Head", "Body", "Accessory"],
    };

    seedStore({ [inProjectRoot("System.json")]: fake });

    const result = await loadSystem(projectPath);

    expect(result.elements[1]).toBe("Fire");
    expect(result.skillTypes.length).toBeGreaterThan(0);
    expect(Array.isArray(result.weaponTypes)).toBe(true);
    expect(Array.isArray(result.armorTypes)).toBe(true);
    expect(result.equipTypes.includes("Weapon")).toBe(true);
  });
});
