/**
 * Client-side re-implementation of J-LevelMaster's runtime beyond-99 extrapolation, purely for the
 * Classes board's "Parameters" tab graph preview. Does not change engine behavior or write any data —
 * see `rmmz-plugins/src/plugins/level/core/objects/Game_Temp.js`
 * (`Game_Temp.prototype.buildBeyondMaxDataForClass`), which this must stay in lockstep with.
 *
 * The engine's algorithm: take the last 6 authored values (levels 94-99 for a 100-entry row), average
 * the 5 level-to-level deltas between them, then apply that flat average every level from 100 onward,
 * forever. It's a straight-line continuation, not a re-evaluation of whatever formula produced the
 * authored curve — so a quadratic/exponential curve silently goes linear past level 99. This preview
 * exists so that's visible before saving, not after.
 */

type BeyondMaxPreviewPoint = {
  level: number;
  value: number;
};

/**
 * Computes the beyond-99 preview curve for one stat's authored values.
 *
 * @param values The authored per-level curve (index 0 unused/padding, 1-99 authored — matches RMMZ's
 * `RPG_Class.params[paramId]` shape). Only the last 6 entries matter, matching the engine's algorithm.
 * @param trueMaxLevel How far out to compute the preview. Mirrors J-LevelMaster's config ceiling — the
 * engine itself always fills through level 999 regardless of this value, but nothing beyond the
 * configured ceiling is ever reachable, so previewing further is just noise.
 * @returns Points for levels 100..min(trueMaxLevel, 999), inclusive. Empty if `values` has fewer than 2
 * entries (nothing to derive a slope from) or `trueMaxLevel` is 99 or lower (nothing beyond 99 to show).
 */
function computeBeyondMaxPreview(
  values: number[],
  trueMaxLevel: number,
): BeyondMaxPreviewPoint[]
{
  const ceiling = Math.min(trueMaxLevel, 999);

  if (values.length < 2 || ceiling <= 99)
  {
    return [];
  }

  // mirrors `classParams.at(paramId).toSpliced(0, 0)` — a plain shallow copy, no actual splice.
  const parameterValues = [ ...values ];

  // last 6 authored entries -> 5 level-to-level deltas, exactly like the engine.
  const lastSix = parameterValues.slice(Math.max(0, parameterValues.length - 6));
  const growth: number[] = [];
  for (let i = 1; i < lastSix.length; i++)
  {
    growth.push(lastSix[ i ]! - lastSix[ i - 1 ]!);
  }

  const averageGrowth = growth.length > 0
    ? growth.reduce((sum, v) => sum + v, 0) / growth.length
    : 0;

  const points: BeyondMaxPreviewPoint[] = [];
  for (let level = 100; level <= ceiling; level++)
  {
    const previousValue = parameterValues[ level - 1 ]!;
    const nextValue = Math.ceil(previousValue + averageGrowth);
    parameterValues[ level ] = nextValue;
    points.push({ level, value: nextValue });
  }

  return points;
}

export { computeBeyondMaxPreview };
export type { BeyondMaxPreviewPoint };
