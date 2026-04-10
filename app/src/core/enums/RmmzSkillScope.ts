/**
 * RPG Maker MZ skill / item scope (`RPG_Skill.scope`, `RPG_Item.scope`).
 * Values match `Game_Action` target logic in `rmmz_objects.js`.
 */
enum RmmzSkillScope
{
  None = 0,
  OneEnemy = 1,
  AllEnemies = 2,
  OneRandomEnemy = 3,
  TwoRandomEnemies = 4,
  ThreeRandomEnemies = 5,
  FourRandomEnemies = 6,
  OneAlly = 7,
  AllAllies = 8,
  OneDeadAlly = 9,
  AllDeadAllies = 10,
  User = 11,
  OneAllyUnconditional = 12,
  AllAlliesUnconditional = 13,
  Everyone = 14,
}

type RmmzSkillScopeOption = {
  value: RmmzSkillScope;
  label: string;
  group: string;
};

const RMMZ_SKILL_SCOPE_OPTIONS: readonly RmmzSkillScopeOption[] = [
  {
    value: RmmzSkillScope.None,
    label: 'None',
    group: 'None',
  },
  {
    value: RmmzSkillScope.OneEnemy,
    label: 'One enemy',
    group: 'Enemies',
  },
  {
    value: RmmzSkillScope.AllEnemies,
    label: 'All enemies',
    group: 'Enemies',
  },
  {
    value: RmmzSkillScope.OneRandomEnemy,
    label: '1 random enemy',
    group: 'Enemies',
  },
  {
    value: RmmzSkillScope.TwoRandomEnemies,
    label: '2 random enemies',
    group: 'Enemies',
  },
  {
    value: RmmzSkillScope.ThreeRandomEnemies,
    label: '3 random enemies',
    group: 'Enemies',
  },
  {
    value: RmmzSkillScope.FourRandomEnemies,
    label: '4 random enemies',
    group: 'Enemies',
  },
  {
    value: RmmzSkillScope.OneAlly,
    label: 'One ally (alive)',
    group: 'Party',
  },
  {
    value: RmmzSkillScope.AllAllies,
    label: 'All allies (alive)',
    group: 'Party',
  },
  {
    value: RmmzSkillScope.OneDeadAlly,
    label: 'One ally (dead)',
    group: 'Party',
  },
  {
    value: RmmzSkillScope.AllDeadAllies,
    label: 'All allies (dead)',
    group: 'Party',
  },
  {
    value: RmmzSkillScope.User,
    label: 'User (self)',
    group: 'Party',
  },
  {
    value: RmmzSkillScope.OneAllyUnconditional,
    label: 'One ally (any state)',
    group: 'Party',
  },
  {
    value: RmmzSkillScope.AllAlliesUnconditional,
    label: 'All allies (any state)',
    group: 'Party',
  },
  {
    value: RmmzSkillScope.Everyone,
    label: 'Everyone (all living combatants)',
    group: 'Everyone',
  },
] as const;

/**
 * @param raw Scope from database JSON.
 * @returns Coerced enum when in range; otherwise `None`.
 */
function parseRmmzSkillScope(raw: number): RmmzSkillScope
{
  if (!Number.isInteger(raw))
  {
    return RmmzSkillScope.None;
  }
  if (raw < RmmzSkillScope.None || raw > RmmzSkillScope.Everyone)
  {
    return RmmzSkillScope.None;
  }
  return raw as RmmzSkillScope;
}

/**
 * @param scope Valid MZ scope after `parseRmmzSkillScope`; unknown values map to `None` in the domain.
 * @returns The matching option row, or **None** if `scope` does not match any known id.
 */
function skillScopeOption(scope: RmmzSkillScope): RmmzSkillScopeOption
{
  const found = RMMZ_SKILL_SCOPE_OPTIONS.find((o) => o.value === scope);
  if (found)
  {
    return found;
  }
  return RMMZ_SKILL_SCOPE_OPTIONS[ 0 ];
}

export {
  RmmzSkillScope,
  RMMZ_SKILL_SCOPE_OPTIONS,
  parseRmmzSkillScope,
  skillScopeOption
};

export type { RmmzSkillScopeOption };
