import {
  autoApplyStateConditionOptionForValue,
  parseAutoApplyStateCondition,
  RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS,
  type RmmzAutoApplyStateCondition,
  type RmmzAutoApplyStateConditionOption,
} from '@core/enums/RmmzAutoApplyStateCondition.ts';

/**
 * {@code autoExecuteSkill} condition kinds (J-Passive-Conditional).
 * Includes every {@link RmmzAutoApplyStateCondition} plus {@link EnemiesNearby}.
 */
type RmmzAutoExecuteSkillCondition = RmmzAutoApplyStateCondition | 'enemiesNearby';

type RmmzAutoExecuteSkillConditionOption = {
  value: RmmzAutoExecuteSkillCondition;
  label: string;
  helperText: string;
  paramLabel: string;
  paramHelperText: string;
};

const RMMZ_AUTO_EXECUTE_SKILL_ENEMIES_NEARBY_OPTION: RmmzAutoExecuteSkillConditionOption = {
  value: 'enemiesNearby',
  label: 'When enemies are nearby',
  helperText: 'Fires while enough opposing battlers are within trigger range on the map.',
  paramLabel: 'Minimum enemies',
  paramHelperText: 'How many enemies must be in range before the skill can fire.',
};

const RMMZ_AUTO_EXECUTE_SKILL_CONDITION_OPTIONS: RmmzAutoExecuteSkillConditionOption[] = [
  ...RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS,
  RMMZ_AUTO_EXECUTE_SKILL_ENEMIES_NEARBY_OPTION,
];

/**
 * @param raw Parsed condition token from a notetag.
 * @returns A known kind, or {@code null} when unrecognized.
 */
function parseAutoExecuteSkillCondition(raw: string): RmmzAutoExecuteSkillCondition | null
{
  const token = raw.trim();
  if (token === 'enemiesNearby')
  {
    return 'enemiesNearby';
  }
  return parseAutoApplyStateCondition(token);
}

/**
 * @param condition Selected condition kind.
 * @returns Matching option row for labels and helper copy.
 */
function autoExecuteSkillConditionOptionForValue(
  condition: RmmzAutoExecuteSkillCondition | null
): RmmzAutoExecuteSkillConditionOption | null
{
  if (condition === null)
  {
    return null;
  }
  if (condition === 'enemiesNearby')
  {
    return RMMZ_AUTO_EXECUTE_SKILL_ENEMIES_NEARBY_OPTION;
  }
  const applyOption = autoApplyStateConditionOptionForValue(condition);
  if (applyOption === null)
  {
    return null;
  }
  return applyOption as RmmzAutoExecuteSkillConditionOption;
}

export {
  RMMZ_AUTO_EXECUTE_SKILL_CONDITION_OPTIONS,
  autoExecuteSkillConditionOptionForValue,
  parseAutoExecuteSkillCondition,
};
export type {
  RmmzAutoApplyStateConditionOption,
  RmmzAutoExecuteSkillCondition,
  RmmzAutoExecuteSkillConditionOption,
};
