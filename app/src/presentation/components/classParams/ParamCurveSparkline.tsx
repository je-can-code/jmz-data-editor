import { Box, Typography } from '@mui/material';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { useParamCurvePoints } from '@presentation/components/classParams/useParamCurvePoints.ts';

type ParamCurveSparklineProps = {
  /** Sparse 1-indexed array (index 0 unused, index N = value at level N), matching RPG_ClassDomainModel.params[paramId]. */
  values: number[];
};

/**
 * Always-visible, read-only chart of a class's currently-saved params[paramId] curve. Sits to the left
 * of {@link ClassParamRow}'s formula input rather than stretched full-width above it- at full row width
 * a curve this gentle reads as a near-flat line with no useful shape, so this stays small and dense
 * instead. Exists because the formula input is write-only- applying a formula overwrites params[paramId]
 * but there was previously no way to see what was already saved before overwriting it.
 */
function ParamCurveSparkline({ values }: ParamCurveSparklineProps)
{
  const { levels } = useParamCurvePoints(values);

  if (levels.length === 0)
  {
    return (
      <Typography variant={'caption'} color={'text.secondary'} sx={{ whiteSpace: 'nowrap' }}>
        No saved values yet.
      </Typography>
    );
  }

  return (
    <Box sx={{ width: 140, height: 40, flexShrink: 0 }}>
      <ResponsiveContainer width={'100%'} height={'100%'}>
        <LineChart data={levels}>
          <YAxis hide domain={[ 'dataMin', 'dataMax' ]}/>
          <Line
            type={'monotone'}
            dataKey={'value'}
            stroke={'#8884d8'}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export { ParamCurveSparkline };
