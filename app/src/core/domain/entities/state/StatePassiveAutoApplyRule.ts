import type { RmmzAutoApplyStateCondition } from '@core/enums/RmmzAutoApplyStateCondition.ts';

/**
 * One {@code autoApplyState} tuple on a state row.
 */
type StatePassiveAutoApplyRule = {
  stateId: number | null;
  condition: RmmzAutoApplyStateCondition | null;
  param: number | null;
};

/**
 * @param rule Hydrated auto-apply row from the editor.
 * @returns True when every field is valid for note emission.
 */
function isCompleteStatePassiveAutoApplyRule(rule: StatePassiveAutoApplyRule): boolean
{
  return rule.stateId !== null
    && rule.stateId >= 1
    && rule.condition !== null
    && rule.param !== null
    && rule.param >= 1;
}

/**
 * @returns Empty editor row for a new auto-apply rule.
 */
function createEmptyStatePassiveAutoApplyRule(): StatePassiveAutoApplyRule
{
  return {
    stateId: null,
    condition: null,
    param: null,
  };
}

export {
  createEmptyStatePassiveAutoApplyRule,
  isCompleteStatePassiveAutoApplyRule,
};
export type { StatePassiveAutoApplyRule };
