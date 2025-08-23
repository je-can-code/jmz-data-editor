import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { SystemService } from '../../src/services/SystemService';
import {
  loadSkills,
  loadStates,
  loadSystem
} from '../../src/services/DataService';

// Mock DataService before importing the module under test
vi.mock('../../src/services/DataService', () =>
{
  return {
    loadSystem: vi.fn(),
    loadStates: vi.fn(),
    loadSkills: vi.fn(),
  };
});

describe('SystemService.loadSystemData', () =>
{
  const projectPath = '/my-game/data';

  const makeSystem = (suffix: string) => ({
    elements: [ `None${suffix}`, `Fire${suffix}`, `Ice${suffix}` ],
    skillTypes: [ `None${suffix}`, `Magic${suffix}` ],
    weaponTypes: [ `Sword${suffix}`, `Axe${suffix}` ],
    armorTypes: [ `Light${suffix}`, `Heavy${suffix}` ],
    equipTypes: [ `Weapon${suffix}`, `Shield${suffix}`, `Head${suffix}`, `Body${suffix}`, `Accessory${suffix}` ],
  });

  const makeStates = (suffix: string) => ([
    {
      id: 1,
      name: `Poison${suffix}`,
      note: ''
    },
    {
      id: 2,
      name: `Paralyze${suffix}`,
      note: ''
    },
  ] as any);

  const makeSkills = (suffix: string) => ([
    {
      id: 10,
      name: `Fire${suffix}`,
      note: ''
    },
    {
      id: 11,
      name: `Ice${suffix}`,
      note: ''
    },
  ] as any);

  beforeEach(() =>
  {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    // Silence console if needed
    vi.spyOn(console, 'log')
      .mockImplementation(() =>
      {
      });

    // Ensure mocked functions are still mocks after restore
    vi.mocked(loadSystem)
      .mockReset();
    vi.mocked(loadStates)
      .mockReset();
    vi.mocked(loadSkills)
      .mockReset();

    // Reset static cache to a clean state before each test
    (SystemService as any).systemData = undefined;
    (SystemService as any).stateData = undefined;
    (SystemService as any).skillData = undefined;
    (SystemService as any).elements = undefined;
    (SystemService as any).skillTypes = undefined;
    (SystemService as any).weaponTypes = undefined;
    (SystemService as any).armorTypes = undefined;
    (SystemService as any).equipTypes = undefined;
  });

  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it('loads system, states, and skills, and populates static properties', async () =>
  {
    const sys = makeSystem('');
    const states = makeStates('');
    const skills = makeSkills('');

    vi.mocked(loadSystem)
      .mockResolvedValueOnce(sys as any);
    vi.mocked(loadStates)
      .mockResolvedValueOnce(states as any);
    vi.mocked(loadSkills)
      .mockResolvedValueOnce(skills as any);

    await SystemService.loadSystemData(projectPath);

    // Delegation to DataService with correct path
    expect(loadSystem)
      .toHaveBeenCalledTimes(1);
    expect(loadStates)
      .toHaveBeenCalledTimes(1);
    expect(loadSkills)
      .toHaveBeenCalledTimes(1);

    expect(loadSystem)
      .toHaveBeenCalledWith(projectPath);
    expect(loadStates)
      .toHaveBeenCalledWith(projectPath);
    expect(loadSkills)
      .toHaveBeenCalledWith(projectPath);

    // Static caches are populated correctly from the returned data
    expect(SystemService.systemData)
      .toEqual(sys);
    expect(SystemService.stateData)
      .toEqual(states);
    expect(SystemService.skillData)
      .toEqual(skills);

    expect(SystemService.elements)
      .toEqual(sys.elements);
    expect(SystemService.skillTypes)
      .toEqual(sys.skillTypes);
    expect(SystemService.weaponTypes)
      .toEqual(sys.weaponTypes);
    expect(SystemService.armorTypes)
      .toEqual(sys.armorTypes);
    expect(SystemService.equipTypes)
      .toEqual(sys.equipTypes);

    // spot checks
    expect(SystemService.elements[1])
      .toBe('Fire');
    expect(SystemService.equipTypes.includes('Accessory'))
      .toBe(true);
  });

  it('subsequent calls overwrite previously cached data', async () =>
  {
    // First load
    vi.mocked(loadSystem)
      .mockResolvedValueOnce(makeSystem(' A') as any);
    vi.mocked(loadStates)
      .mockResolvedValueOnce(makeStates(' A') as any);
    vi.mocked(loadSkills)
      .mockResolvedValueOnce(makeSkills(' A') as any);

    await SystemService.loadSystemData(projectPath);

    // Second load (different data)
    vi.mocked(loadSystem)
      .mockResolvedValueOnce(makeSystem(' B') as any);
    vi.mocked(loadStates)
      .mockResolvedValueOnce(makeStates(' B') as any);
    vi.mocked(loadSkills)
      .mockResolvedValueOnce(makeSkills(' B') as any);

    await SystemService.loadSystemData(projectPath);

    // Assert data reflects the second invocation
    expect(SystemService.elements[0])
      .toBe('None B');
    expect(SystemService.skillTypes[1])
      .toBe('Magic B');
    expect(SystemService.weaponTypes)
      .toEqual([ 'Sword B', 'Axe B' ]);
    expect(SystemService.stateData?.[0]?.name)
      .toBe('Poison B');
    expect(SystemService.skillData?.[1]?.name)
      .toBe('Ice B');
  });

  it('propagates errors from loadSystem and leaves state unchanged', async () =>
  {
    // Arrange: make loadSystem reject
    const err = new Error('failed to load system');
    vi.mocked(loadSystem)
      .mockRejectedValueOnce(err);

    // Provide fallbacks for the others (should not be called in this case)
    vi.mocked(loadStates)
      .mockResolvedValueOnce(makeStates('') as any);
    vi.mocked(loadSkills)
      .mockResolvedValueOnce(makeSkills('') as any);

    // Act + Assert
    await expect(SystemService.loadSystemData(projectPath))
      .rejects
      .toThrow('failed to load system');

    // Ensure no partial state was set
    expect(SystemService.systemData)
      .toBeUndefined();
    expect(SystemService.elements)
      .toBeUndefined();
    expect(SystemService.skillTypes)
      .toBeUndefined();
    expect(SystemService.weaponTypes)
      .toBeUndefined();
    expect(SystemService.armorTypes)
      .toBeUndefined();
    expect(SystemService.equipTypes)
      .toBeUndefined();

    // Depending on desired behavior, loadStates/loadSkills may or may not be called.
    // Given implementation awaits loadSystem first, these should not be called if loadSystem rejects.
    expect(loadStates)
      .not
      .toHaveBeenCalled();
    expect(loadSkills)
      .not
      .toHaveBeenCalled();
  });
});