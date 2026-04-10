/**
 * RPG Maker MZ state [SV] overlay (`RPG_State.overlay`).
 * Index into the state overlay strip (0 = none; {@code Sprite_StateOverlay} uses {@code overlayIndex} from battler).
 */
type RmmzStateOverlayOption = {
  value: number;
  label: string;
};

const RMMZ_STATE_OVERLAY_OPTIONS: readonly RmmzStateOverlayOption[] = [
  {
    value: 0,
    label: 'None'
  },
  {
    value: 1,
    label: 'Berserk'
  },
  {
    value: 2,
    label: 'Rage'
  },
  {
    value: 3,
    label: 'Silence'
  },
  {
    value: 4,
    label: 'Sleep'
  },
  {
    value: 5,
    label: 'Darkness'
  },
  {
    value: 6,
    label: 'Confusion'
  },
  {
    value: 7,
    label: 'Fear'
  },
  {
    value: 8,
    label: 'Stun'
  },
  {
    value: 9,
    label: 'Curse'
  },
  {
    value: 10,
    label: 'Poison'
  },
] as const;

export {
  RMMZ_STATE_OVERLAY_OPTIONS,
};

export type { RmmzStateOverlayOption };
