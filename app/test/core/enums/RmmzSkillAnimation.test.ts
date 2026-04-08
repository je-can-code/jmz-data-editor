import { describe, expect, it } from 'vitest';
import {
  buildSkillAnimationAutocompleteOptions,
  normalizeSkillAnimationId,
  skillAnimationAutocompleteOptionsForSkill,
  skillAnimationOptionForValue
} from '@core/enums/RmmzSkillAnimation.ts';

describe('RmmzSkillAnimation', () =>
{
  it('normalizeSkillAnimationId truncates and allows -1', () =>
  {
    expect(normalizeSkillAnimationId(0)).toBe(0);
    expect(normalizeSkillAnimationId(-1)).toBe(-1);
    expect(normalizeSkillAnimationId(2.2)).toBe(2);
    expect(normalizeSkillAnimationId(NaN)).toBe(0);
  });

  it('buildSkillAnimationAutocompleteOptions includes built-ins and rows', () =>
  {
    const o = buildSkillAnimationAutocompleteOptions([ null, { id: 1, name: 'Hit' } ]);
    expect(o.some((x) => x.value === -1)).toBe(true);
    expect(o.some((x) => x.value === 0)).toBe(true);
    expect(o.some((x) => x.value === 1 && x.label.includes('Hit'))).toBe(true);
  });

  it('skillAnimationAutocompleteOptionsForSkill appends orphan ids', () =>
  {
    const base = buildSkillAnimationAutocompleteOptions([ null ]);
    const o = skillAnimationAutocompleteOptionsForSkill(99, base);
    expect(o.some((x) => x.value === 99)).toBe(true);
  });

  it('skillAnimationOptionForValue resolves -1 and orphans', () =>
  {
    const base = buildSkillAnimationAutocompleteOptions([ null ]);
    expect(skillAnimationOptionForValue(-1, base).value).toBe(-1);
    expect(skillAnimationOptionForValue(404, base).value).toBe(404);
  });
});
