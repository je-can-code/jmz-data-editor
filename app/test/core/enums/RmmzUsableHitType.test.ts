import { describe, expect, it } from 'vitest';
import {
  parseRmmzUsableHitType,
  RmmzUsableHitType,
  RMMZ_USABLE_HIT_TYPE_OPTIONS,
  usableHitTypeOption
} from '@core/enums/RmmzUsableHitType.ts';

describe('RmmzUsableHitType', () =>
{
  it('parseRmmzUsableHitType maps 0–2', () =>
  {
    expect(parseRmmzUsableHitType(0)).toBe(RmmzUsableHitType.CertainHit);
    expect(parseRmmzUsableHitType(1)).toBe(RmmzUsableHitType.PhysicalAttack);
    expect(parseRmmzUsableHitType(2)).toBe(RmmzUsableHitType.MagicalAttack);
  });

  it('parseRmmzUsableHitType returns Physical for out-of-range or non-integers', () =>
  {
    expect(parseRmmzUsableHitType(-1)).toBe(RmmzUsableHitType.PhysicalAttack);
    expect(parseRmmzUsableHitType(3)).toBe(RmmzUsableHitType.PhysicalAttack);
    expect(parseRmmzUsableHitType(1.5)).toBe(RmmzUsableHitType.PhysicalAttack);
  });

  it('usableHitTypeOption falls back to Physical', () =>
  {
    expect(usableHitTypeOption(RmmzUsableHitType.CertainHit).value).toBe(0);
    expect(usableHitTypeOption(99 as RmmzUsableHitType).value).toBe(1);
  });

  it('RMMZ_USABLE_HIT_TYPE_OPTIONS covers 0–2 once', () =>
  {
    const values = RMMZ_USABLE_HIT_TYPE_OPTIONS.map((o) => o.value)
      .sort((
        a,
        b
      ) => a - b);
    expect(values).toEqual([ 0, 1, 2 ]);
  });
});
