import { useMemo } from 'react';

type ParamCurvePoint = {
  level: number;
  value: number;
};

/**
 * Shared level-extraction logic for {@link ParamCurveSparkline} and {@link ParamCurveCheckpoints}, both
 * of which read the same sparse `params[paramId]` array but render different slices of it (a full-curve
 * chart vs. a handful of labeled checkpoints).
 *
 * @param values Sparse 1-indexed array (index 0 unused, index N = value at level N), matching
 * `RPG_ClassDomainModel.params[paramId]`.
 */
function useParamCurvePoints(values: number[]): {
  levels: ParamCurvePoint[];
  checkpointLevels: ParamCurvePoint[];
}
{
  // levels start at index 1 (index 0 is unused by the engine), so strip that slot and any other holes
  // out before charting- a sparse array here would otherwise render as gaps/zeroes.
  const levels = useMemo(
    () => values
      .map((value, level) => ({ level, value }))
      .filter((point) => point.level >= 1 && typeof point.value === 'number'),
    [ values ],
  );

  // the checkpoint strip shows exact numbers, not the full curve- that's what the chart is for. Thin it
  // down to level 1, every 10th level, and whatever the actual last level is (normally 99, but not
  // assumed in case a class has fewer levels saved).
  const checkpointLevels = useMemo(
    () =>
    {
      if (levels.length === 0)
      {
        return [];
      }

      const byLevel = new Map(levels.map((point) => [ point.level, point ]));
      const lastLevel = levels[ levels.length - 1 ]!.level;
      const wantedLevels = [ 1, 10, 20, 30, 40, 50, 60, 70, 80, 90, lastLevel ];

      const seen = new Set<number>();
      const checkpoints = [];
      for (const level of wantedLevels)
      {
        const point = byLevel.get(level);
        if (point && !seen.has(level))
        {
          seen.add(level);
          checkpoints.push(point);
        }
      }
      return checkpoints;
    },
    [ levels ],
  );

  return { levels, checkpointLevels };
}

export { useParamCurvePoints };
export type { ParamCurvePoint };
