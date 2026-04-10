import { describe, expect, it } from 'vitest';
import {
  normalizeSkillRepeats,
  normalizeSkillSpeed,
  normalizeSkillSuccessRate
} from '@core/enums/RmmzSkillInvocation.ts';

describe('RmmzSkillInvocation', () =>
{
  it('normalizeSkillSpeed truncates', () =>
  {
    expect(normalizeSkillSpeed(0))
      .toBe(0);
    expect(normalizeSkillSpeed(-3))
      .toBe(-3);
    expect(normalizeSkillSpeed(2.9))
      .toBe(2);
    expect(normalizeSkillSpeed(NaN))
      .toBe(0);
  });

  it('normalizeSkillSuccessRate clamps 0–100', () =>
  {
    expect(normalizeSkillSuccessRate(100))
      .toBe(100);
    expect(normalizeSkillSuccessRate(-5))
      .toBe(0);
    expect(normalizeSkillSuccessRate(150))
      .toBe(100);
    expect(normalizeSkillSuccessRate(NaN))
      .toBe(100);
  });

  it('normalizeSkillRepeats is at least 1', () =>
  {
    expect(normalizeSkillRepeats(1))
      .toBe(1);
    expect(normalizeSkillRepeats(4))
      .toBe(4);
    expect(normalizeSkillRepeats(0))
      .toBe(1);
    expect(normalizeSkillRepeats(NaN))
      .toBe(1);
  });
});
