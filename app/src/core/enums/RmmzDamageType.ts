/**
 * RPG Maker MZ {@link Rmmz.Data.RPG_SkillDamage.type} values (`Game_Action` damage checks).
 */
enum RmmzDamageType
{
  HpDamage = 1,
  MpDamage = 2,
  HpRecover = 3,
  MpRecover = 4,
  HpDrain = 5,
  MpDrain = 6,
}

type RmmzDamageTypeOption = {
  value: RmmzDamageType;
  label: string;
};

const RMMZ_DAMAGE_TYPE_OPTIONS: readonly RmmzDamageTypeOption[] = [
  { value: RmmzDamageType.HpDamage, label: "HP damage" },
  { value: RmmzDamageType.MpDamage, label: "MP damage" },
  { value: RmmzDamageType.HpRecover, label: "HP recovery" },
  { value: RmmzDamageType.MpRecover, label: "MP recovery" },
  { value: RmmzDamageType.HpDrain, label: "HP drain" },
  { value: RmmzDamageType.MpDrain, label: "MP drain" },
] as const;

/**
 * @param raw Damage type from database JSON.
 * @returns Integer in [1, 6] when valid; otherwise {@link RmmzDamageType.HpDamage}.
 */
function parseRmmzDamageType(raw: number): RmmzDamageType
{
  if (!Number.isInteger(raw))
  {
    return RmmzDamageType.HpDamage;
  }
  if (raw < RmmzDamageType.HpDamage || raw > RmmzDamageType.MpDrain)
  {
    return RmmzDamageType.HpDamage;
  }
  return raw as RmmzDamageType;
}

/**
 * @param raw Variance percent from database JSON.
 * @returns Integer in [0, 100].
 */
function parseRmmzDamageVariance(raw: number): number
{
  if (!Number.isInteger(raw) || raw < 0)
  {
    return 0;
  }
  if (raw > 100)
  {
    return 100;
  }
  return raw;
}

export {
  RmmzDamageType,
  RMMZ_DAMAGE_TYPE_OPTIONS,
  parseRmmzDamageType,
  parseRmmzDamageVariance
};

export type { RmmzDamageTypeOption };
