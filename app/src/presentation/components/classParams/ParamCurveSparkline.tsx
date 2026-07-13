import { useMemo } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';

type ParamCurveSparklineProps = {
  /** Sparse 1-indexed array (index 0 unused, index N = value at level N), matching RPG_ClassDomainModel.params[paramId]. */
  values: number[];
};

/**
 * Always-visible, read-only view of a class's currently-saved params[paramId] curve: a tiny inline
 * chart for the overall shape, plus a horizontally-scrollable strip of exact "Lv N: value" numbers.
 * Exists because {@link ClassParamRow}'s formula input is write-only — applying a formula overwrites
 * params[paramId] but there was previously no way to see what was already saved before overwriting it.
 */
function ParamCurveSparkline({ values }: ParamCurveSparklineProps)
{
  // Levels start at index 1 (index 0 is unused by the engine), so strip that slot and any other
  // holes out before charting — a sparse array here would otherwise render as gaps/zeroes.
  const levels = useMemo(
    () => values
      .map((value, level) => ({ level, value }))
      .filter((point) => point.level >= 1 && typeof point.value === 'number'),
    [ values ],
  );

  // The strip below shows exact numbers, not the full 99-level curve — that's what the chart above is
  // for. Thin it down to level 1, every 10th level, and whatever the actual last level is (normally 99,
  // but not assumed in case a class has fewer levels saved).
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

  if (levels.length === 0)
  {
    return (
      <Typography variant={'caption'} color={'text.secondary'}>
        No saved values yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      <Box sx={{ width: '100%', height: 36 }}>
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

      <Stack
        direction={'row'}
        spacing={0.75}
        sx={{
          overflowX: 'auto',
          pb: 0.5,
          '&::-webkit-scrollbar': { height: 6 },
        }}
      >
        {checkpointLevels.map((point) => (
          <Tooltip key={point.level} title={`Level ${point.level}`} disableInteractive>
            <Box
              sx={{
                flexShrink: 0,
                px: 0.75,
                py: 0.25,
                borderRadius: 0.5,
                bgcolor: 'action.selected',
                fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace',
                fontSize: '0.7rem',
                whiteSpace: 'nowrap',
              }}
            >
              {point.level}: {Math.round(point.value)}
            </Box>
          </Tooltip>
        ))}
      </Stack>
    </Stack>
  );
}

export { ParamCurveSparkline };
