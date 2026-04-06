import { describe, expect, it } from 'vitest';
import {
  parseRmmzSkillScope,
  RmmzSkillScope,
  RMMZ_SKILL_SCOPE_OPTIONS,
  skillScopeOption
} from '@core/enums/RmmzSkillScope.ts';

describe('RmmzSkillScope', () =>
{
  it('parseRmmzSkillScope maps in-range integers', () =>
  {
    expect(parseRmmzSkillScope(0)).toBe(RmmzSkillScope.None);
    expect(parseRmmzSkillScope(14)).toBe(RmmzSkillScope.Everyone);
    expect(parseRmmzSkillScope(11)).toBe(RmmzSkillScope.User);
  });

  it('parseRmmzSkillScope returns None for out-of-range or non-integers', () =>
  {
    expect(parseRmmzSkillScope(-1)).toBe(RmmzSkillScope.None);
    expect(parseRmmzSkillScope(15)).toBe(RmmzSkillScope.None);
    expect(parseRmmzSkillScope(1.5)).toBe(RmmzSkillScope.None);
    expect(parseRmmzSkillScope(NaN)).toBe(RmmzSkillScope.None);
  });

  it('skillScopeOption returns the matching row or None', () =>
  {
    expect(skillScopeOption(RmmzSkillScope.OneEnemy).value).toBe(1);
    expect(skillScopeOption(99 as RmmzSkillScope).value).toBe(RmmzSkillScope.None);
  });

  it('RMMZ_SKILL_SCOPE_OPTIONS covers 0–14 exactly once', () =>
  {
    const values = RMMZ_SKILL_SCOPE_OPTIONS.map((o) => o.value)
      .sort((
        a,
        b
      ) => a - b);
    expect(values).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });
});
