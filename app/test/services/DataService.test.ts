import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
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
} from '../../src/services/DataService';

import { filesystem } from '@neutralinojs/lib';

// Mock Neutralino filesystem before importing the module under test
vi.mock('@neutralinojs/lib', () =>
{
  const writeFile = vi.fn();
  const readFile = vi.fn();

  return {
    filesystem: {
      writeFile,
      readFile,
    },
  };
});

const projectPath = '/my-game/data';

describe('DataService.executeSave/executeLoad', () =>
{
  const projectPath = '/my-game/data';

  beforeEach(() =>
  {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    // Silence console during tests
    vi.spyOn(console, 'log')
      .mockImplementation(() =>
      {
      });
  });

  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it('executeSave writes pretty-printed JSON to the correct path', async () =>
  {
    const payload = {
      id: 1,
      name: 'Potion',
      price: 50
    };
    const filename = 'Items.json';

    await executeSave(projectPath, filename, payload);

    expect(filesystem.writeFile)
      .toHaveBeenCalledTimes(1);

    const [ destination, dataWritten ] =
      (filesystem.writeFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(destination)
      .toBe(`${projectPath}/${filename}`);
    expect(dataWritten)
      .toBe(JSON.stringify(payload, null, 2));
  });

  it('executeLoad reads JSON from the correct path and parses it', async () =>
  {
    const filename = 'Enemies.json';
    const enemyData = [
      {
        id: 3,
        name: 'Slime'
      } ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(enemyData));

    const result = await executeLoad<typeof enemyData>(projectPath, filename);

    expect(filesystem.readFile)
      .toHaveBeenCalledWith(`${projectPath}/${filename}`);

    expect(result)
      .toEqual(enemyData);
  });
});

describe('DataService loaders return parsed JSON of the expected shape', () =>
{
  beforeEach(() =>
  {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    // Silence DataService logs
    vi.spyOn(console, 'log')
      .mockImplementation(() =>
      {
      });
  });

  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it('loadActors returns an array of RPG_Actor', async () =>
  {
    const fake: any[] = [
      {
        id: 1,
        name: 'Harold',
        note: ''
      },
      {
        id: 2,
        name: 'Therese',
        note: ''
      },
    ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadActors(projectPath);

    expect(result)
      .toEqual(fake);
    expect(Array.isArray(result))
      .toBe(true);
    expect(result[0].name)
      .toBe('Harold');
  });

  it('loadSkills returns an array of RPG_Skill', async () =>
  {
    const fake: any[] = [
      {
        id: 10,
        name: 'Fire',
        note: ''
      },
      {
        id: 11,
        name: 'Ice',
        note: ''
      },
    ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadSkills(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result[1].name)
      .toBe('Ice');
  });

  it('loadStates returns an array of RPG_State', async () =>
  {
    const fake: any[] = [
      {
        id: 3,
        name: 'Poison',
        note: ''
      },
      {
        id: 4,
        name: 'Paralyze',
        note: ''
      },
    ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadStates(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result[0].name)
      .toBe('Poison');
  });

  it('loadItems returns an array of RPG_Item', async () =>
  {
    const fake: any[] = [
      {
        id: 1,
        name: 'Potion',
        note: ''
      },
      {
        id: 2,
        name: 'Hi-Potion',
        note: ''
      },
    ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadItems(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result[1].name)
      .toBe('Hi-Potion');
  });

  it('loadWeapons returns an array of RPG_Weapon', async () =>
  {
    const fake: any[] = [
      {
        id: 5,
        name: 'Bronze Sword',
        note: ''
      },
      {
        id: 6,
        name: 'Iron Sword',
        note: ''
      },
    ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadWeapons(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result[0].name)
      .toBe('Bronze Sword');
  });

  it('loadArmors returns an array of RPG_Armor', async () =>
  {
    const fake: any[] = [
      {
        id: 7,
        name: 'Cloth Armor',
        note: ''
      },
      {
        id: 8,
        name: 'Leather Armor',
        note: ''
      },
    ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadArmors(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result[1].name)
      .toBe('Leather Armor');
  });

  it('loadEnemies returns an array of RPG_Enemy', async () =>
  {
    const fake: any[] = [
      {
        id: 3,
        name: 'Slime',
        note: ''
      },
      {
        id: 4,
        name: 'Bat',
        note: ''
      },
    ];

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadEnemies(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result[0].name)
      .toBe('Slime');
  });

  it('loadQuests returns a Questopedia.Configuration object', async () =>
  {
    // Using the ambient Questopedia namespace defined in src/types/custom/Quests.d.ts
    const fake: Questopedia.Configuration = {
      quests: [
        {
          name: 'Find the Herb',
          key: 'quest_find_herb',
          categoryKey: 'side',
          tagKeys: [ 'gathering' ],
          unknownHint: 'A rare herb grows near water.',
          overview: 'Collect an herb for the healer.',
          recommendedLevel: 1,
          objectives: [
            {
              id: 1,
              // If your enum is numeric, replace with the appropriate value; using any keeps focus on shape
              type: 0 as any,
              description: 'Collect 3 Healing Herbs',
              logs: {
                inactive: 'You have not started collecting herbs.',
                active: 'Collect 3 Healing Herbs.',
                completed: 'You collected the herbs.',
                failed: 'You failed to collect the herbs.',
                missed: 'You missed the opportunity to collect the herbs.',
              },
              fulfillment: {
                indiscriminate: { hint: 'Any herbs will work.' },
                destination: {
                  mapId: 1,
                  x1: 1,
                  x2: 2,
                  y1: 3,
                  y2: 4
                },
                fetch: {
                  type: 1,
                  id: 5,
                  amount: 3
                },
                slay: {
                  id: 0,
                  amount: 0
                },
                quest: { keys: [] },
              },
              hiddenByDefault: false,
              isOptional: false,
            },
          ],
        },
      ],
      tags: [
        {
          key: 'gathering',
          name: 'Gathering',
          iconIndex: 0
        } ],
      categories: [
        {
          key: 'side',
          name: 'Side Quests',
          iconIndex: 1
        } ],
    };

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadQuests(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result.quests[0].key)
      .toBe('quest_find_herb');
    expect(result.tags[0].name)
      .toBe('Gathering');
    expect(result.categories[0].key)
      .toBe('side');
  });

  it('loadSystem returns an RPG_System object', async () =>
  {
    // Minimal but representative subset of RPG_System used around the app
    const fake: any = {
      elements: [ 'None', 'Fire', 'Ice' ],
      skillTypes: [ 'None', 'Magic' ],
      weaponTypes: [ 'Sword', 'Axe' ],
      armorTypes: [ 'Light', 'Heavy' ],
      equipTypes: [ 'Weapon', 'Shield', 'Head', 'Body', 'Accessory' ],
    };

    (filesystem.readFile as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(JSON.stringify(fake));

    const result = await loadSystem(projectPath);

    expect(result)
      .toEqual(fake);
    expect(result.elements[1])
      .toBe('Fire');
    expect(result.equipTypes.includes('Accessory'))
      .toBe(true);
  });
});