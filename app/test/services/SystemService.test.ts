import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemService } from '@services/SystemService.ts';
import { loadAnimations, loadCommonEvents, loadSystem } from '@services/DataService.ts';

// Mock DataService before importing the module under test
vi.mock('@services/DataService.ts', () =>
{
  return {
    loadSystem: vi.fn(),
    loadAnimations: vi.fn(),
    loadCommonEvents: vi.fn(),
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

    // Reset static cache to a clean state before each test
    (SystemService as any).systemData = undefined;
    (SystemService as any).elements = undefined;
    (SystemService as any).skillTypes = undefined;
    (SystemService as any).weaponTypes = undefined;
    (SystemService as any).armorTypes = undefined;
    (SystemService as any).equipTypes = undefined;
    (SystemService as any).skillAnimationAutocompleteOptions = [];
    (SystemService as any).commonEventAutocompleteRows = [];

    vi.mocked(loadAnimations)
      .mockReset();
    vi.mocked(loadCommonEvents)
      .mockReset();
  });

  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it('loads system, states, and skills, and populates static properties', async () =>
  {
    const sys = makeSystem('');

    vi.mocked(loadSystem)
      .mockResolvedValueOnce(sys as any);
    vi.mocked(loadAnimations)
      .mockResolvedValueOnce([
        null,
        {
          id: 1,
          name: 'Hit Physical'
        }
      ] as any);
    vi.mocked(loadCommonEvents)
      .mockResolvedValueOnce([
        null,
        {
          id: 1,
          name: 'Test CE'
        }
      ] as any);

    await SystemService.loadSystemData(projectPath);

    // Delegation to DataService with correct path
    expect(loadSystem)
      .toHaveBeenCalledTimes(1);

    expect(loadSystem)
      .toHaveBeenCalledWith(projectPath);

    expect(loadAnimations)
      .toHaveBeenCalledWith(projectPath);

    expect(loadCommonEvents)
      .toHaveBeenCalledWith(projectPath);

    expect(SystemService.commonEventAutocompleteRows.some((o) => o.id === 1 && o.label.includes('Test CE')))
      .toBe(true);

    expect(SystemService.skillAnimationAutocompleteOptions.some((o) => o.value === 1))
      .toBe(true);

    // Static caches are populated correctly from the returned data
    expect(SystemService.systemData)
      .toEqual(sys);

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
    expect(SystemService.elements[ 1 ])
      .toBe('Fire');
    expect(SystemService.equipTypes.includes('Accessory'))
      .toBe(true);
  });

  it('subsequent calls overwrite previously cached data', async () =>
  {
    // First load
    vi.mocked(loadSystem)
      .mockResolvedValueOnce(makeSystem(' A') as any);
    vi.mocked(loadAnimations)
      .mockResolvedValueOnce([ null ] as any);
    vi.mocked(loadCommonEvents)
      .mockResolvedValueOnce([ null ] as any);

    await SystemService.loadSystemData(projectPath);

    // Second load (different data)
    vi.mocked(loadSystem)
      .mockResolvedValueOnce(makeSystem(' B') as any);
    vi.mocked(loadAnimations)
      .mockResolvedValueOnce([ null ] as any);
    vi.mocked(loadCommonEvents)
      .mockResolvedValueOnce([ null ] as any);

    await SystemService.loadSystemData(projectPath);

    // Assert data reflects the second invocation
    expect(SystemService.elements[ 0 ])
      .toBe('None B');
    expect(SystemService.skillTypes[ 1 ])
      .toBe('Magic B');
    expect(SystemService.weaponTypes)
      .toEqual([ 'Sword B', 'Axe B' ]);
  });

  it('propagates errors from loadSystem and leaves state unchanged', async () =>
  {
    // Arrange: make loadSystem reject
    const err = new Error('failed to load system');
    vi.mocked(loadSystem)
      .mockRejectedValueOnce(err);

    // Provide fallbacks for the others (should not be called in this case)

    // Act + Assert
    // noinspection ES6RedundantAwait
    await expect(SystemService.loadSystemData(projectPath))
      .rejects
      .toThrow('failed to load system');

    expect(loadAnimations)
      .not
      .toHaveBeenCalled();

    expect(loadCommonEvents)
      .not
      .toHaveBeenCalled();

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
  });
});
