import { describe, expect, it } from 'vitest';
import {
  parseRmmzSkillOccasion,
  RMMZ_SKILL_OCCASION_OPTIONS,
  RmmzSkillOccasion,
  skillOccasionOption
} from '@core/enums/RmmzSkillOccasion.ts';

describe('RmmzSkillOccasion', () =>
{
  it('parseRmmzSkillOccasion maps 0–3', () =>
  {
    expect(parseRmmzSkillOccasion(0)).toBe(RmmzSkillOccasion.Always);
    expect(parseRmmzSkillOccasion(1)).toBe(RmmzSkillOccasion.BattleScreen);
    expect(parseRmmzSkillOccasion(2)).toBe(RmmzSkillOccasion.MenuScreen);
    expect(parseRmmzSkillOccasion(3)).toBe(RmmzSkillOccasion.Never);
  });

  it('parseRmmzSkillOccasion returns Always for out-of-range or non-integers', () =>
  {
    expect(parseRmmzSkillOccasion(-1)).toBe(RmmzSkillOccasion.Always);
    expect(parseRmmzSkillOccasion(4)).toBe(RmmzSkillOccasion.Always);
    expect(parseRmmzSkillOccasion(1.5)).toBe(RmmzSkillOccasion.Always);
    expect(parseRmmzSkillOccasion(NaN)).toBe(RmmzSkillOccasion.Always);
  });

  it('skillOccasionOption returns the matching row or Always', () =>
  {
    expect(skillOccasionOption(RmmzSkillOccasion.MenuScreen).value).toBe(2);
    expect(skillOccasionOption(99 as RmmzSkillOccasion).value).toBe(RmmzSkillOccasion.Always);
  });

  it('RMMZ_SKILL_OCCASION_OPTIONS covers 0–3 exactly once', () =>
  {
    const values = RMMZ_SKILL_OCCASION_OPTIONS.map((o) => o.value)
      .sort((
        a,
        b
      ) => a - b);
    expect(values).toEqual([ 0, 1, 2, 3 ]);
  });
});
