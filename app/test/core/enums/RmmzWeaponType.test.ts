import { describe, expect, it } from 'vitest';
import {
  normalizeRequiredWtypeId,
  weaponTypeAutocompleteOptions,
  weaponTypeOptionForValue,
  weaponTypeOptionsFromNames
} from '@core/enums/RmmzWeaponType.ts';

describe('RmmzWeaponType', () =>
{
  it('normalizeRequiredWtypeId truncates and rejects negatives', () =>
  {
    expect(normalizeRequiredWtypeId(0))
      .toBe(0);
    expect(normalizeRequiredWtypeId(2))
      .toBe(2);
    expect(normalizeRequiredWtypeId(2.7))
      .toBe(2);
    expect(normalizeRequiredWtypeId(-1))
      .toBe(0);
    expect(normalizeRequiredWtypeId(NaN))
      .toBe(0);
    expect(normalizeRequiredWtypeId(Infinity))
      .toBe(0);
  });

  it('weaponTypeOptionsFromNames falls back to None-only when empty', () =>
  {
    const o = weaponTypeOptionsFromNames([]);
    expect(o)
      .toHaveLength(1);
    expect(o[ 0 ].value)
      .toBe(0);
    expect(o[ 0 ].label)
      .toBe('None');
    expect(o[ 0 ].group)
      .toBe('No requirement');
  });

  it('weaponTypeOptionsFromNames maps indices and groups', () =>
  {
    const o = weaponTypeOptionsFromNames([ 'None', 'Blade', 'Bow' ]);
    expect(o.map((x) => x.value))
      .toEqual([ 0, 1, 2 ]);
    expect(o[ 0 ].group)
      .toBe('No requirement');
    expect(o[ 1 ].group)
      .toBe('Weapon types');
    expect(o[ 2 ].group)
      .toBe('Weapon types');
  });

  it('weaponTypeOptionsFromNames uses None when index 0 name is blank', () =>
  {
    const o = weaponTypeOptionsFromNames([ '   ', 'Blade' ]);
    expect(o[ 0 ].label)
      .toBe('None');
    expect(o[ 1 ].label)
      .toBe('Blade');
  });

  it('weaponTypeAutocompleteOptions appends orphan when wtypeId is OOB', () =>
  {
    const o = weaponTypeAutocompleteOptions(5, [ 'None', 'Blade' ]);
    expect(o.some((x) => x.value === 5 && x.group === 'Invalid'))
      .toBe(true);
  });

  it('weaponTypeOptionForValue resolves in-range and OOB', () =>
  {
    expect(weaponTypeOptionForValue(1, [ 'None', 'Blade' ]).label)
      .toBe('Blade');
    expect(weaponTypeOptionForValue(9, [ 'None', 'Blade' ]).value)
      .toBe(9);
  });
});
