/**
 * RPG Maker MZ usable hit type (`RPG_Skill.hitType`, `RPG_Item.hitType`).
 * Matches {@code Game_Action.HITTYPE_*} in {@code rmmz_objects.js}.
 */
enum RmmzUsableHitType
{
  CertainHit = 0,
  PhysicalAttack = 1,
  MagicalAttack = 2,
}

type RmmzUsableHitTypeOption = {
  value: RmmzUsableHitType;
  label: string;
  detail: string;
  group: string;
};

const RMMZ_USABLE_HIT_TYPE_OPTIONS: readonly RmmzUsableHitTypeOption[] = [
  {
    value: RmmzUsableHitType.CertainHit,
    label: 'Certain hit',
    detail: 'Ignores evasion',
    group: 'Hit type',
  },
  {
    value: RmmzUsableHitType.PhysicalAttack,
    label: 'Physical attack',
    detail: 'Physical evasion',
    group: 'Hit type',
  },
  {
    value: RmmzUsableHitType.MagicalAttack,
    label: 'Magical attack',
    detail: 'Magical evasion',
    group: 'Hit type',
  },
];

/**
 * @param raw Integer from database; non-integers and values outside 0–2 map to {@link RmmzUsableHitType.PhysicalAttack}.
 */
function parseRmmzUsableHitType(raw: number): RmmzUsableHitType
{
  if (!Number.isInteger(raw))
  {
    return RmmzUsableHitType.PhysicalAttack;
  }
  if (raw < RmmzUsableHitType.CertainHit || raw > RmmzUsableHitType.MagicalAttack)
  {
    return RmmzUsableHitType.PhysicalAttack;
  }
  return raw as RmmzUsableHitType;
}

/**
 * @param hitType Valid MZ value after {@link parseRmmzUsableHitType}; unknown maps to Physical.
 */
function usableHitTypeOption(hitType: RmmzUsableHitType): RmmzUsableHitTypeOption
{
  const found = RMMZ_USABLE_HIT_TYPE_OPTIONS.find((o) => o.value === hitType);
  if (found !== undefined)
  {
    return found;
  }
  return RMMZ_USABLE_HIT_TYPE_OPTIONS[ 1 ];
}

export {
  parseRmmzUsableHitType,
  RMMZ_USABLE_HIT_TYPE_OPTIONS,
  RmmzUsableHitType,
  usableHitTypeOption,
};

export type { RmmzUsableHitTypeOption };
