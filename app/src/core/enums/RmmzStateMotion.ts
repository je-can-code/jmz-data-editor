/**
 * RPG Maker MZ state [SV] motion (`RPG_State.motion`).
 * Drives side-view actor pose when no higher-priority motion applies; see {@code Sprite_Actor.refreshMotion}.
 */
type RmmzStateMotionOption = {
  value: number;
  label: string;
};

const RMMZ_STATE_MOTION_OPTIONS: readonly RmmzStateMotionOption[] = [
  {
    value: 0,
    label: 'Normal'
  },
  {
    value: 1,
    label: 'Abnormal'
  },
  {
    value: 2,
    label: 'Sleep'
  },
  {
    value: 3,
    label: 'Dead'
  },
] as const;

export {
  RMMZ_STATE_MOTION_OPTIONS,
};

export type { RmmzStateMotionOption };
