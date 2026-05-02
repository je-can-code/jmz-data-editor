/**
 * Mirrors J-SDP **v3** plugin parameters (`sdpDefault*`) for rank-up cost by rarity (**0–5**).
 * Keep aligned with `rmmz-plugins` J-SDP annotations when tuning the spine.
 */
export const SDP_RARITY_COST_DEFAULTS_ROWS: ReadonlyArray<{
  baseCost: number;
  flatGrowthCost: number;
  multGrowthCost: number;
}> = [
  { baseCost: 0, flatGrowthCost: 70, multGrowthCost: 1.06 },
  { baseCost: 0, flatGrowthCost: 235, multGrowthCost: 1.06 },
  { baseCost: 0, flatGrowthCost: 1180, multGrowthCost: 1.06 },
  { baseCost: 0, flatGrowthCost: 4320, multGrowthCost: 1.06 },
  { baseCost: 0, flatGrowthCost: 11900, multGrowthCost: 1.06 },
  { baseCost: 0, flatGrowthCost: 30500, multGrowthCost: 1.06 },
];

/**
 * Resolved rank-up knobs after combining rarity defaults with panel offsets from `config.sdp.json`.
 *
 * @param rarity Panel rarity **0–5** (Common..Godlike).
 * @param baseOffset `baseCost` from JSON (additive).
 * @param flatOffset `flatGrowthCost` from JSON (additive).
 * @param multScale `multGrowthCost` from JSON (multiplier on rarity mult; **1** = use default only).
 */
export function resolveSdpEffectiveRankUpParts(
  rarity: number,
  baseOffset: number,
  flatOffset: number,
  multScale: number,
): { baseCost: number; flatGrowthCost: number; multGrowthCost: number }
{
  const idx = Math.min(Math.max(rarity, 0), SDP_RARITY_COST_DEFAULTS_ROWS.length - 1);
  const row = SDP_RARITY_COST_DEFAULTS_ROWS[idx];
  const safeScale = multScale > 0
    ? multScale
    : 1;

  return {
    baseCost: row.baseCost + baseOffset,
    flatGrowthCost: row.flatGrowthCost + flatOffset,
    multGrowthCost: row.multGrowthCost * safeScale,
  };
}
