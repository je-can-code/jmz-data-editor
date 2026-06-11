import { describe, expect, it } from 'vitest';
import { parseAutoExecuteSkillCondition } from '@core/enums/RmmzAutoExecuteSkillCondition.ts';

describe('RmmzAutoExecuteSkillCondition', () =>
{
  it('parses enemiesNearby', () =>
  {
    expect(parseAutoExecuteSkillCondition('enemiesNearby'))
      .toBe('enemiesNearby');
  });

  it('parses shared auto-apply conditions', () =>
  {
    expect(parseAutoExecuteSkillCondition('time'))
      .toBe('time');
    expect(parseAutoExecuteSkillCondition('whenCrit'))
      .toBe('whenCrit');
  });

  it('returns null for unknown tokens', () =>
  {
    expect(parseAutoExecuteSkillCondition('notARealTrigger'))
      .toBeNull();
  });
});
