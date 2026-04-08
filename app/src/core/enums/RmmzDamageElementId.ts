/**
 * Special {@link Rmmz.Data.RPG_SkillDamage.elementId} values for usable items (skills/items).
 * When {@link RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK}, {@code Game_Action.calcElementRate} uses
 * {@code subject().attackElements()} (weapon + attack-element traits) instead of a fixed type.
 */
const RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK = -1;

/**
 * @param raw {@code damage.elementId} from database JSON.
 * @returns {@link RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK}, a non-negative index, or {@code 0} if invalid.
 */
function parseRmmzDamageElementId(raw: number): number
{
  if (!Number.isInteger(raw))
  {
    return 0;
  }
  if (raw === RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK)
  {
    return RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK;
  }
  if (raw >= 0)
  {
    return raw;
  }
  return 0;
}

export {
  RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK,
  parseRmmzDamageElementId
};
