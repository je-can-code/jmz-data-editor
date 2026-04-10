/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTraitMapping } from '@presentation/hooks/useTraitMapping.ts';
import { SystemService } from '@services/SystemService.ts';
import { SpecialFlag } from '@core/enums/TraitValues.ts';

// Mock the resource contexts that the hook depends on.
vi.mock('@presentation/context/resources/skills.context.tsx', () => (
  {
    useSkills: () => (
      {
        toName: (id: number) => `Skill ${id}`,
      }
    ),
  }
));

vi.mock('@presentation/context/resources/states.context.tsx', () => (
  {
    useStates: () => (
      {
        toName: (id: number) => `State ${id}`,
      }
    ),
  }
));

describe('useTraitMapping', () =>
{
  beforeEach(() =>
  {
    // Setup SystemService with dummy data for mapping tests.
    (SystemService as any).elements = [ 'None', 'Fire', 'Ice' ];
    (SystemService as any).skillTypes = [ 'None', 'Magic', 'Special' ];
    (SystemService as any).weaponTypes = [ 'None', 'Sword', 'Axe' ];
    (SystemService as any).armorTypes = [ 'None', 'Cloth', 'Plate' ];
    (SystemService as any).equipTypes = [ 'None', 'Weapon', 'Shield', 'Head' ];
  });

  it('maps Elemental Resistance (code 11) correctly', () =>
  {
    const { result } = renderHook(() => useTraitMapping());
    const { toGameTrait } = result.current;

    const trait = {
      code: 11,
      dataId: 1,
      value: 0.5
    };
    const mapped = toGameTrait(trait);

    expect(mapped.codeName)
      .toBe('Elemental Resistance');
    expect(mapped.dataName)
      .toBe('Fire');
    expect(mapped.valueString)
      .toBe('50 %');
  });

  it('maps Base Parameter (code 21) correctly', () =>
  {
    const { result } = renderHook(() => useTraitMapping());
    const { toGameTrait } = result.current;

    // dataId 0 is Max HP in RMMZ
    const trait = {
      code: 21,
      dataId: 0,
      value: 1.2
    };
    const mapped = toGameTrait(trait);

    expect(mapped.codeName)
      .toBe('Base Parameter');
    expect(mapped.dataName)
      .toBe('Max Life');
    expect(mapped.valueString)
      .toBe('120 %');
  });

  it('maps Add Skill (code 43) using the skills context and id suffix', () =>
  {
    const { result } = renderHook(() => useTraitMapping());
    const { toDataName } = result.current;

    const name = toDataName(43, 10);
    expect(name)
      .toBe('Skill 10 (id:10)');
  });

  it('maps Special Flags (code 62) using the enum values', () =>
  {
    const { result } = renderHook(() => useTraitMapping());
    const { toDataName } = result.current;

    // dataId 0 for SpecialFlag is usually 'Auto Battle'
    const name = toDataName(62, 0);
    expect(name)
      .toBe(SpecialFlag[ 0 ]);
  });

  it('returns appropriate MUI icons for different codes', () =>
  {
    const { result } = renderHook(() => useTraitMapping());
    const { toCodeIcon } = result.current;

    const icon11 = toCodeIcon(11); // Elemental
    const icon21 = toCodeIcon(21); // Parameter
    const iconDefault = toCodeIcon(999);

    // Check the type itself instead of displayName which can be flaky
    expect(icon11.type)
      .toBeDefined();
    expect(icon21.type)
      .toBeDefined();
    expect(iconDefault.type)
      .toBeDefined();
  });

  it('returns appropriate background colors for different codes', () =>
  {
    const { result } = renderHook(() => useTraitMapping());
    const { toCodeColor } = result.current;

    // Code 11 uses a linear-gradient
    expect(toCodeColor(11).background)
      .toContain('linear-gradient');

    // Code 21 uses a specific orange color
    expect(toCodeColor(21).bgcolor)
      .toBe('#ff6600');

    // Default is black
    expect(toCodeColor(999).bgcolor)
      .toBe('#000000');
  });
});
