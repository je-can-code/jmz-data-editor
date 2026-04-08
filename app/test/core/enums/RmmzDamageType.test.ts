import { describe, expect, it } from 'vitest';
import {
  parseRmmzDamageType,
  RmmzDamageType,
  RMMZ_DAMAGE_TYPE_OPTIONS
} from '@core/enums/RmmzDamageType.ts';

describe('RmmzDamageType', () =>
{
  it('parseRmmzDamageType preserves 0 as None', () =>
  {
    expect(parseRmmzDamageType(0)).toBe(RmmzDamageType.None);
  });

  it('parseRmmzDamageType maps 1–6', () =>
  {
    expect(parseRmmzDamageType(1)).toBe(RmmzDamageType.HpDamage);
    expect(parseRmmzDamageType(2)).toBe(RmmzDamageType.MpDamage);
    expect(parseRmmzDamageType(3)).toBe(RmmzDamageType.HpRecover);
    expect(parseRmmzDamageType(4)).toBe(RmmzDamageType.MpRecover);
    expect(parseRmmzDamageType(5)).toBe(RmmzDamageType.HpDrain);
    expect(parseRmmzDamageType(6)).toBe(RmmzDamageType.MpDrain);
  });

  it('parseRmmzDamageType returns HpDamage for invalid values', () =>
  {
    expect(parseRmmzDamageType(-1)).toBe(RmmzDamageType.HpDamage);
    expect(parseRmmzDamageType(7)).toBe(RmmzDamageType.HpDamage);
    expect(parseRmmzDamageType(1.5)).toBe(RmmzDamageType.HpDamage);
  });

  it('RMMZ_DAMAGE_TYPE_OPTIONS lists None first then 1–6', () =>
  {
    const values = RMMZ_DAMAGE_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toEqual([ 0, 1, 2, 3, 4, 5, 6 ]);
  });
});
