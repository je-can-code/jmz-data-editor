/**
 * RPG Maker MZ state restriction (`RPG_State.restriction`).
 * The database editor lists five modes (0–4). Values above 4 are not offered in the stock UI
 * but can appear from plugins or hand-edited data; the board shows them as {@code Other (n)}.
 * Engine: {@code Game_BattlerBase.prototype.restriction} uses max across states;
 * {@code canMove} is true when {@code restriction < 4}.
 */
type RmmzStateRestrictionOption = {
  value: number;
  label: string;
};

const RMMZ_STATE_RESTRICTION_OPTIONS: readonly RmmzStateRestrictionOption[] = [
  {
    value: 0,
    label: 'None'
  },
  {
    value: 1,
    label: 'Attack an enemy'
  },
  {
    value: 2,
    label: 'Attack anyone'
  },
  {
    value: 3,
    label: 'Attack an ally'
  },
  {
    value: 4,
    label: 'Cannot move'
  },
] as const;

export {
  RMMZ_STATE_RESTRICTION_OPTIONS,
};

export type { RmmzStateRestrictionOption };
