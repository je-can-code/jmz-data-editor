// FormulaVisualizer.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import { computeBeyondMaxPreview } from '@services/parsers/BeyondMaxLevelPreview.ts';
import { Functions, ShowChart, Update } from '@mui/icons-material';
import { debounce } from 'lodash';

type FormulaVisualizerProps = {
  formula: string;
  paramName: string;
  onUpdateFormula?: (updatedFormula: string) => void;
  suggestedLevel?: number;
  /**
   * When provided (e.g. from `useLevelConfig().levelConfig.trueMaxLevel`), renders a second, visually
   * distinct dashed line previewing J-LevelMaster's actual beyond-99 runtime extrapolation
   * ({@link computeBeyondMaxPreview}) for the currently-typed formula. Purely a preview — has no effect
   * on the formula, the authored curve, or anything that gets saved. Requires the chart's max level to
   * reach at least 99 (the preview is derived from levels 94-99) — pick a "Max Level" of 100+ to see it.
   */
  trueMaxLevel?: number;
};

const presetFormulas = {
  linear: {
    slow: '(a.level * 1.5)',
    medium: '(a.level * 4)',
    fast: '(a.level * 7)'
  },
  quadratic: {
    slow: '(0.05 * (a.level ** 2))',
    medium: '(0.1 * (a.level ** 2))',
    fast: '(0.2 * (a.level ** 2))'
  },
  exponential: {
    slow: '(10 * (1.02 ** a.level))',
    medium: '(10 * (1.03 ** a.level))',
    fast: '(10 * (1.04 ** a.level))'
  }
};

const levelOptions = [ 10, 20, 35, 55, 75, 100, 120, 150, 200, 255 ];

function pickNextHighestLevel(target: number): number
{
  for (let i = 0; i < levelOptions.length; i++)
  {
    const option = levelOptions[ i ];
    if (option >= target)
    {
      return option;
    }
  }
  return levelOptions[ levelOptions.length - 1 ];
}

export default function FormulaVisualizer({
  formula,
  paramName,
  onUpdateFormula,
  suggestedLevel,
  trueMaxLevel
}: FormulaVisualizerProps)
{
  const [ open, setOpen ] = useState(false);
  const [ maxLevel, setMaxLevel ] = useState<number>(
    suggestedLevel
      ? pickNextHighestLevel(suggestedLevel)
      : 35
  );
  const [ localFormula, setLocalFormula ] = useState(formula);
  const [ displayFormula, setDisplayFormula ] = useState(formula);

  useEffect(() =>
  {
    setLocalFormula(formula);
    setDisplayFormula(formula);
  }, [ formula ]);

  useEffect(() =>
  {
    if (open && suggestedLevel)
    {
      setMaxLevel(pickNextHighestLevel(suggestedLevel));
    }
  }, [ open, suggestedLevel ]);

  const debouncedUpdateFormula = useCallback(
    debounce((value: string) =>
    {
      setLocalFormula(value);
    }, 300),
    []
  );

  useEffect(() =>
  {
    return () =>
    {
      debouncedUpdateFormula.cancel();
    };
  }, [ debouncedUpdateFormula ]);

  const chartData = useMemo(
    () =>
    {
      if (!open)
      {
        return [];
      }
      return GrowthParser.generateDataPoints(localFormula, maxLevel, 1);
    },
    [ localFormula, maxLevel, open ]
  );

  // Derives J-LevelMaster's actual beyond-99 extrapolation from the currently-typed formula's own
  // chart data (not the class's currently-saved params — this previews what WOULD happen if the
  // formula is applied). Requires chartData to actually reach level 99 (levels 94-99 drive the slope);
  // a "Max Level" selection below 99 yields no preview rather than a misleading one.
  const extrapolationPreview = useMemo(
    () =>
    {
      if (typeof trueMaxLevel !== 'number' || chartData.length === 0)
      {
        return [];
      }

      const lastLevel = chartData[ chartData.length - 1 ]!.level;
      if (lastLevel < 99)
      {
        return [];
      }

      const values: number[] = [];
      for (const point of chartData)
      {
        values[ point.level ] = point.value;
      }

      return computeBeyondMaxPreview(values, trueMaxLevel);
    },
    [ chartData, trueMaxLevel ]
  );

  const hasExtrapolationPreview = extrapolationPreview.length > 0;

  // Merges the authored curve with the optional beyond-max preview into one level-sorted series for a
  // single Recharts LineChart. The last authored point is duplicated onto `extrapolatedValue` too, so
  // the dashed preview line starts exactly where the solid authored line ends instead of leaving a gap.
  const combinedChartData = useMemo(
    () =>
    {
      if (!hasExtrapolationPreview || chartData.length === 0)
      {
        return chartData;
      }

      const byLevel = new Map<number, { level: number, value?: number, extrapolatedValue?: number }>();

      for (const point of chartData)
      {
        byLevel.set(point.level, { level: point.level, value: point.value });
      }

      const lastAuthored = chartData[ chartData.length - 1 ]!;
      byLevel.set(lastAuthored.level, {
        ...byLevel.get(lastAuthored.level),
        level: lastAuthored.level,
        extrapolatedValue: lastAuthored.value,
      });

      for (const point of extrapolationPreview)
      {
        byLevel.set(point.level, {
          ...byLevel.get(point.level),
          level: point.level,
          extrapolatedValue: point.value,
        });
      }

      return [ ...byLevel.values() ].sort((a, b) => a.level - b.level);
    },
    [ chartData, extrapolationPreview, hasExtrapolationPreview ]
  );

  const handlePresetSelect = (value: string) =>
  {
    setDisplayFormula(value);
    debouncedUpdateFormula(value);
  };

  return <>
    <Button
      color={'inherit'}
      variant={'outlined'}
      startIcon={<ShowChart/>}
      onClick={() => setOpen(true)}
      size={'small'}
    >
      Visualize
    </Button>

    <Dialog
      open={open}
      maxWidth={'lg'}
      fullWidth={true}
      onClose={() => setOpen(false)}
    >
      <DialogTitle>
        {paramName} Growth Visualizer
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          <TextField
            label={'Formula'}
            variant={'outlined'}
            fullWidth={true}
            size={'small'}
            value={displayFormula}
            onChange={(e) =>
            {
              const value = e.target.value;
              setDisplayFormula(value);
              debouncedUpdateFormula(value);
            }}
            sx={{
              fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace',
              '& .MuiInputBase-input': {
                fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace'
              }
            }}
          />

          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Box sx={{
              flex: 1,
              mr: 2
            }}>
              <Typography variant="subtitle2" sx={{
                display: 'flex',
                alignItems: 'center',
                color: 'text.secondary'
              }}>
                <Functions sx={{
                  fontSize: 18,
                  verticalAlign: 'middle',
                  mr: 1
                }}/>
                Preset Formulas
              </Typography>
              <Divider sx={{ mb: 1 }}/>

              <Stack spacing={1}>
                {/* Linear Growth Presets */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Typography variant="caption" sx={{
                    fontWeight: 'bold',
                    width: '100px',
                    display: 'inline-block'
                  }}>
                    Linear:
                  </Typography>
                  <ButtonGroup size="small">
                    <Button onClick={() => handlePresetSelect(presetFormulas.linear.slow)}>Slow</Button>
                    <Button onClick={() => handlePresetSelect(presetFormulas.linear.medium)}>Medium</Button>
                    <Button onClick={() => handlePresetSelect(presetFormulas.linear.fast)}>Fast</Button>
                  </ButtonGroup>
                </Box>

                {/* Quadratic Growth Presets */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Typography variant="caption" sx={{
                    fontWeight: 'bold',
                    width: '100px',
                    display: 'inline-block'
                  }}>
                    Quadratic:
                  </Typography>
                  <ButtonGroup size="small">
                    <Button onClick={() => handlePresetSelect(presetFormulas.quadratic.slow)}>Slow</Button>
                    <Button onClick={() => handlePresetSelect(presetFormulas.quadratic.medium)}>Medium</Button>
                    <Button onClick={() => handlePresetSelect(presetFormulas.quadratic.fast)}>Fast</Button>
                  </ButtonGroup>
                </Box>

                {/* Exponential Growth Presets */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Typography variant="caption" sx={{
                    fontWeight: 'bold',
                    width: '100px',
                    display: 'inline-block'
                  }}>
                    Exponential:
                  </Typography>
                  <ButtonGroup size="small">
                    <Button onClick={() => handlePresetSelect(presetFormulas.exponential.slow)}>Slow</Button>
                    <Button onClick={() => handlePresetSelect(presetFormulas.exponential.medium)}>Medium</Button>
                    <Button onClick={() => handlePresetSelect(presetFormulas.exponential.fast)}>Fast</Button>
                  </ButtonGroup>
                </Box>
              </Stack>
            </Box>

            <FormControl size="small" sx={{
              width: 150,
              mb: 2
            }}>
              <InputLabel>Max Level</InputLabel>
              <Select
                value={maxLevel}
                label="Max Level"
                onChange={(e) => setMaxLevel(Number(e.target.value))}
              >
                {levelOptions.map(option => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={combinedChartData}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis
                dataKey="level"
                label={{
                  value: 'Level',
                  position: 'insideBottomRight',
                  offset: -5
                }}
              />
              <YAxis
                label={{
                  value: paramName,
                  angle: -90,
                  position: 'insideLeft'
                }}
              />
              <Tooltip
                formatter={(value) => Math.round(Number(value))}
                labelFormatter={(label) => `Level ${label}`}
              />
              <Legend/>
              <Line
                type="monotone"
                dataKey="value"
                name={paramName}
                stroke="#8884d8"
                activeDot={{ r: 8 }}
                connectNulls={false}
              />
              {hasExtrapolationPreview && (
                <Line
                  type="monotone"
                  dataKey="extrapolatedValue"
                  name={`${paramName} (beyond level 99, preview)`}
                  stroke="#8884d8"
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          color={'inherit'}
          onClick={() => setOpen(false)}
        >
          Close
        </Button>
        {onUpdateFormula && (
          <Button
            color={'primary'}
            variant={'contained'}
            startIcon={<Update/>}
            onClick={() =>
            {
              onUpdateFormula(displayFormula);
              setOpen(false);
            }}
          >
            Update Formula
          </Button>
        )}
      </DialogActions>
    </Dialog>
  </>;
}
