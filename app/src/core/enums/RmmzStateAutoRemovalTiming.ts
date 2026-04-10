/**
 * RPG Maker MZ state auto-removal timing (`RPG_State.autoRemovalTiming`).
 * {@code removeStatesAuto(1)} runs after all actions end; {@code removeStatesAuto(2)} on turn end.
 */
type RmmzStateAutoRemovalTimingOption = {
  value: number;
  label: string;
};

const RMMZ_STATE_AUTO_REMOVAL_TIMING_OPTIONS: readonly RmmzStateAutoRemovalTimingOption[] = [
  {
    value: 0,
    label: 'None'
  },
  {
    value: 1,
    label: 'Action End'
  },
  {
    value: 2,
    label: 'Turn End'
  },
] as const;

export {
  RMMZ_STATE_AUTO_REMOVAL_TIMING_OPTIONS,
};

export type { RmmzStateAutoRemovalTimingOption };
