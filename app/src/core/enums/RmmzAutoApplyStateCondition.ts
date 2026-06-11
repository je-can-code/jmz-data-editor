/**
 * {@code autoApplyState} condition kinds (J-Passive-Conditional).
 * Third tuple value is frames for most kinds; {@link Move} uses whole map tiles.
 */

type RmmzAutoApplyStateCondition =
  | 'time'
  | 'hpDmg'
  | 'mpDmg'
  | 'tpDmg'
  | 'anyDmg'
  | 'whenCrit'
  | 'negaStateAdded'
  | 'posiStateAdded'
  | 'anyStateAdded'
  | 'move'
  | 'stand';

type RmmzAutoApplyStateConditionOption = {
  value: RmmzAutoApplyStateCondition;
  label: string;
  helperText: string;
  paramLabel: string;
  paramHelperText: string;
};

const RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS: RmmzAutoApplyStateConditionOption[] = [
  {
    value: 'time',
    label: 'On a map timer',
    helperText: 'Reapplies while this unit is active on the map.',
    paramLabel: 'Interval (frames)',
    paramHelperText: 'Time between each apply in frames.',
  },
  {
    value: 'hpDmg',
    label: 'When HP is lost in combat',
    helperText: 'Fires on combat HP loss, not skill costs.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies from repeated damage.',
  },
  {
    value: 'mpDmg',
    label: 'When MP is lost in combat',
    helperText: 'Fires on combat MP loss, not skill costs.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies from repeated damage.',
  },
  {
    value: 'tpDmg',
    label: 'When TP is lost in combat',
    helperText: 'Fires on combat TP loss.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies from repeated damage.',
  },
  {
    value: 'anyDmg',
    label: 'When any pool is lost in combat',
    helperText: 'Fires when HP, MP, or TP takes combat damage.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies from repeated damage.',
  },
  {
    value: 'whenCrit',
    label: 'When critically hit',
    helperText: 'Fires when this unit is the victim of a critical hit.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies from repeated crits.',
  },
  {
    value: 'negaStateAdded',
    label: 'When a negative state is applied',
    helperText: 'Fires when a debuff or other negative state is added.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies.',
  },
  {
    value: 'posiStateAdded',
    label: 'When a positive state is applied',
    helperText: 'Fires when a buff or other positive state is added.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies.',
  },
  {
    value: 'anyStateAdded',
    label: 'When any state is applied',
    helperText: 'Fires when any combat state is added to this unit.',
    paramLabel: 'Cooldown (frames)',
    paramHelperText: 'Minimum frames between applies.',
  },
  {
    value: 'move',
    label: 'After moving on the map',
    helperText: 'Applies after this unit travels whole map tiles.',
    paramLabel: 'Tiles traveled',
    paramHelperText: 'Whole tiles required between each apply.',
  },
  {
    value: 'stand',
    label: 'While standing still on the map',
    helperText: 'Applies only while this unit has not moved that frame.',
    paramLabel: 'Interval (frames)',
    paramHelperText: 'Minimum frames standing still between each apply.',
  },
];

/**
 * @param raw Parsed condition token from a notetag.
 * @returns A known kind, or {@code null} when unrecognized.
 */
function parseAutoApplyStateCondition(raw: string): RmmzAutoApplyStateCondition | null
{
  const token = raw.trim();
  for (const option of RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS)
  {
    if (option.value === token)
    {
      return option.value;
    }
  }
  return null;
}

/**
 * @param condition Selected condition kind.
 * @returns Matching option row for labels and helper copy.
 */
function autoApplyStateConditionOptionForValue(
  condition: RmmzAutoApplyStateCondition | null
): RmmzAutoApplyStateConditionOption | null
{
  if (condition === null)
  {
    return null;
  }
  return RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS.find((o) => o.value === condition) ?? null;
}

export {
  RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS,
  autoApplyStateConditionOptionForValue,
  parseAutoApplyStateCondition,
};
export type {
  RmmzAutoApplyStateCondition,
  RmmzAutoApplyStateConditionOption,
};
