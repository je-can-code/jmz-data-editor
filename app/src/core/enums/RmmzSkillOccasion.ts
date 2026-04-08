/**
 * RPG Maker MZ skill / item occasion (`RPG_Skill.occasion`, `RPG_Item.occasion`).
 * Controls when the engine lists or allows the skill outside plugin overrides.
 */
enum RmmzSkillOccasion
{
  Always = 0,
  BattleScreen = 1,
  MenuScreen = 2,
  Never = 3,
}

type RmmzSkillOccasionOption = {
  value: RmmzSkillOccasion;
  /** Primary label in lists and the closed field (matches MZ editor names). */
  label: string;
  /** Extra phrases for Autocomplete filtering (not shown as secondary line). */
  detail: string;
};

const RMMZ_SKILL_OCCASION_OPTIONS: readonly RmmzSkillOccasionOption[] = [
  {
    value: RmmzSkillOccasion.Always,
    label: 'Always',
    detail: 'Battle screen and menu',
  },
  {
    value: RmmzSkillOccasion.BattleScreen,
    label: 'Battle screen',
    detail: 'Battle screen only',
  },
  {
    value: RmmzSkillOccasion.MenuScreen,
    label: 'Menu screen',
    detail: 'Menu screen only',
  },
  {
    value: RmmzSkillOccasion.Never,
    label: 'Never',
    detail: 'Never (not listed for the player)',
  },
];

/**
 * @param raw Integer from database; non-integers and values outside 0–3 map to {@link RmmzSkillOccasion.Always}.
 */
function parseRmmzSkillOccasion(raw: number): RmmzSkillOccasion
{
  if (!Number.isInteger(raw))
  {
    return RmmzSkillOccasion.Always;
  }
  if (raw < RmmzSkillOccasion.Always || raw > RmmzSkillOccasion.Never)
  {
    return RmmzSkillOccasion.Always;
  }
  return raw as RmmzSkillOccasion;
}

/**
 * @param occasion Valid MZ occasion after `parseRmmzSkillOccasion`; unknown values map to Always in the domain.
 */
function skillOccasionOption(occasion: RmmzSkillOccasion): RmmzSkillOccasionOption
{
  const found = RMMZ_SKILL_OCCASION_OPTIONS.find((o) => o.value === occasion);
  if (found !== undefined)
  {
    return found;
  }
  return RMMZ_SKILL_OCCASION_OPTIONS[ 0 ];
}

export {
  parseRmmzSkillOccasion,
  RMMZ_SKILL_OCCASION_OPTIONS,
  RmmzSkillOccasion,
  skillOccasionOption,
};

export type { RmmzSkillOccasionOption };
