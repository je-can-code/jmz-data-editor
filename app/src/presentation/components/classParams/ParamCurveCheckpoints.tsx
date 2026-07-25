import { Box, Stack, Tooltip } from '@mui/material';
import { useParamCurvePoints } from '@presentation/components/classParams/useParamCurvePoints.ts';

type ParamCurveCheckpointsProps = {
  /** Sparse 1-indexed array (index 0 unused, index N = value at level N), matching RPG_ClassDomainModel.params[paramId]. */
  values: number[];
};

/**
 * Horizontally-scrollable strip of exact "Lv N: value" numbers for a class's currently-saved
 * params[paramId] curve, rendered under {@link ClassParamRow}'s formula input. Split out of
 * {@link ParamCurveSparkline} so the chart can move beside the formula input while this stays where the
 * shape-vs-exact-numbers split still makes sense- right under the input it's describing.
 */
function ParamCurveCheckpoints({ values }: ParamCurveCheckpointsProps)
{
  const { checkpointLevels } = useParamCurvePoints(values);

  if (checkpointLevels.length === 0)
  {
    return null;
  }

  return (
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
  );
}

export { ParamCurveCheckpoints };
