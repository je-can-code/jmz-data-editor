import { describe, expect, it } from 'vitest';
import {
  catalogRowForEffectCode,
  cloneUsableEffectsFromRmmz,
  defaultUsableEffectForCode,
  normalizeUsableEffect,
  RMMZ_EFFECT_ADD_STATE,
  RMMZ_EFFECT_GAIN_TP,
  RMMZ_EFFECT_RECOVER_HP,
} from '@core/enums/RmmzUsableEffectCatalog.ts';

describe('RmmzUsableEffectCatalog', () =>
{
  it('defaultUsableEffectForCode returns MZ-shaped rows for vanilla codes', () =>
  {
    const hp = defaultUsableEffectForCode(RMMZ_EFFECT_RECOVER_HP);
    expect(hp.code)
      .toBe(RMMZ_EFFECT_RECOVER_HP);
    expect(hp.value1)
      .toBe(0);
    expect(hp.value2)
      .toBe(0);

    const st = defaultUsableEffectForCode(RMMZ_EFFECT_ADD_STATE);
    expect(st.dataId)
      .toBe(0);
    expect(st.value1)
      .toBe(1);

    const tp = defaultUsableEffectForCode(RMMZ_EFFECT_GAIN_TP);
    expect(tp.value1)
      .toBe(0);
  });

  it('catalogRowForEffectCode returns metadata for vanilla codes only', () =>
  {
    const row = catalogRowForEffectCode(RMMZ_EFFECT_RECOVER_HP);
    expect(row)
      .not
      .toBeNull();
    expect(row!.label)
      .toContain('HP');

    expect(catalogRowForEffectCode(9999))
      .toBeNull();
  });

  it('cloneUsableEffectsFromRmmz normalizes and clones', () =>
  {
    const raw = [
      {
        code: '11',
        dataId: 0,
        value1: 0.5,
        value2: 10,
      },
    ];
    const out = cloneUsableEffectsFromRmmz(raw);
    expect(out)
      .toHaveLength(1);
    expect(out[ 0 ])
      .toEqual({
        code: 11,
        dataId: 0,
        value1: 0.5,
        value2: 10,
      });
  });

  it('normalizeUsableEffect coerces invalid numbers to fallbacks', () =>
  {
    const n = normalizeUsableEffect({
      code: NaN,
      dataId: 'x',
      value1: null,
      value2: undefined,
    });
    expect(n.code)
      .toBe(RMMZ_EFFECT_RECOVER_HP);
    expect(n.dataId)
      .toBe(0);
    expect(n.value1)
      .toBe(0);
    expect(n.value2)
      .toBe(0);
  });
});
