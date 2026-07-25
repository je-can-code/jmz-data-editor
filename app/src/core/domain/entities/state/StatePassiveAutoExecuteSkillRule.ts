import type { RmmzAutoExecuteSkillCondition } from '@core/enums/RmmzAutoExecuteSkillCondition.ts';

/**
 * One {@code autoExecuteSkill} tuple on a state row.
 */
type StatePassiveAutoExecuteSkillRule = {
  skillId: number | null;
  condition: RmmzAutoExecuteSkillCondition | null;
  /** Third tuple value for standard conditions (frames or tiles). */
  param: number | null;
  /** Minimum opposing battlers in range ({@code enemiesNearby}). */
  enemyMinCount: number | null;
  /** Cooldown between firings ({@code enemiesNearby}). */
  enemyCooldownFrames: number | null;
  /** Optional trigger radius in tiles ({@code enemiesNearby}); null defers to plugin default. */
  enemyTriggerTiles: number | null;
};

/**
 * @param rule Hydrated auto-execute row from the editor.
 * @returns True when every field is valid for note emission.
 */
function isCompleteStatePassiveAutoExecuteSkillRule(rule: StatePassiveAutoExecuteSkillRule): boolean
{
  if (rule.skillId === null || rule.skillId < 1 || rule.condition === null)
  {
    return false;
  }
  if (rule.condition === 'enemiesNearby')
  {
    return rule.enemyMinCount !== null
      && rule.enemyMinCount >= 1
      && rule.enemyCooldownFrames !== null
      && rule.enemyCooldownFrames >= 0
      && (rule.enemyTriggerTiles === null || rule.enemyTriggerTiles >= 1);
  }
  return rule.param !== null && rule.param >= 0;
}

/**
 * @returns Empty editor row for a new auto-execute rule.
 */
function createEmptyStatePassiveAutoExecuteSkillRule(): StatePassiveAutoExecuteSkillRule
{
  return {
    skillId: null,
    condition: null,
    param: null,
    enemyMinCount: null,
    enemyCooldownFrames: null,
    enemyTriggerTiles: null,
  };
}

export {
  createEmptyStatePassiveAutoExecuteSkillRule,
  isCompleteStatePassiveAutoExecuteSkillRule,
};
export type { StatePassiveAutoExecuteSkillRule };
