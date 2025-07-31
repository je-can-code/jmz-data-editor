// FormulaVisualizer.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Button, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, InputLabel, MenuItem, Select,
  Stack, TextField, Box, Typography, Divider, ButtonGroup
} from '@mui/material';
import { GrowthParser } from "../services/GrowthParser.ts";
import { ShowChart, Update, Functions } from "@mui/icons-material";
import { debounce } from 'lodash';

type FormulaVisualizerProps = {
  formula: string;
  paramName: string;
  onUpdateFormula?: (updatedFormula: string) => void;
};

const presetFormulas = {
  linear: {
    slow: "(a.level * 1.5)",
    medium: "(a.level * 4)",
    fast: "(a.level * 7)"
  },
  quadratic: {
    slow: "(0.05 * (a.level ** 2))",
    medium: "(0.1 * (a.level ** 2))",
    fast: "(0.2 * (a.level ** 2))"
  },
  exponential: {
    slow: "(10 * (1.02 ** a.level))",
    medium: "(10 * (1.03 ** a.level))",
    fast: "(10 * (1.04 ** a.level))"
  }
};

export default function FormulaVisualizer({
  formula,
  paramName,
  onUpdateFormula
}: FormulaVisualizerProps)
{
  const [ open, setOpen ] = useState(false);
  const [ maxLevel, setMaxLevel ] = useState(35);
  const [ localFormula, setLocalFormula ] = useState(formula);
  const [ displayFormula, setDisplayFormula ] = useState(formula);

  // Update local formula when prop changes
  useEffect(() =>
  {
    setLocalFormula(formula);
    setDisplayFormula(formula);
  }, [ formula ]);

  // Create debounced update function for chart data only
  const debouncedUpdateFormula = useCallback(
    debounce((value: string) =>
    {
      setLocalFormula(value);
    }, 300), // 300ms delay
    []
  );

  // Clean up debounced function on unmount
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
      // Only generate data points when the dialog is open.
      if (!open) return [];

      return GrowthParser.generateDataPoints(localFormula, maxLevel, 1);
    },
    [ localFormula, maxLevel, open ]
  );

  // Handle preset formula selection
  const handlePresetSelect = (preset: string) => {
    setDisplayFormula(preset);
    debouncedUpdateFormula(preset);
  };

  if (!formula) return null;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{ mt: 1 }}
      >
        <ShowChart/>
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth={"lg"}
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            position: 'absolute',
            right: 32, // Position from right edge
            top: 32,   // Position from top edge
            margin: 0  // Remove default margin
          },
          '& .MuiBackdrop-root': {
            backgroundColor: 'rgba(0, 0, 0, 0.5)' // Semi-transparent backdrop
          }
        }}
      >
        <DialogTitle>
          {paramName} Growth Visualization
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2}>
            <Box sx={{
              paddingTop: 1,
              display: 'flex',
              gap: 1,
              alignItems: 'center'
            }}>
              <TextField
                label="Formula"
                variant="outlined"
                fullWidth
                size="small"
                value={displayFormula}
                onChange={(event) =>
                {
                  const newValue = event.target.value;
                  // Update display immediately
                  setDisplayFormula(newValue);
                  // Debounce the chart update
                  debouncedUpdateFormula(newValue);
                }}
                sx={{
                  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                  '& .MuiInputBase-input': {
                    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace"
                  }
                }}
              />
            </Box>

            {/* Preset Formula Buttons Section */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                <Functions fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
                Preset Formulas
              </Typography>
              <Divider sx={{ mb: 1 }} />

              <Stack spacing={1}>
                {/* Linear Growth Presets */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{
                    fontWeight: 'bold',
                    width: '100px', // Fixed width for all labels
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
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{
                    fontWeight: 'bold',
                    width: '100px', // Fixed width for all labels
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
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" sx={{
                    fontWeight: 'bold',
                    width: '100px', // Fixed width for all labels
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
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={20}>20</MenuItem>
                <MenuItem value={35}>35</MenuItem>
                <MenuItem value={55}>55</MenuItem>
                <MenuItem value={75}>75</MenuItem>
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={120}>120</MenuItem>
                <MenuItem value={150}>150</MenuItem>
                <MenuItem value={200}>200</MenuItem>
                <MenuItem value={255}>255</MenuItem>
              </Select>
            </FormControl>

            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
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
                />
              </LineChart>
            </ResponsiveContainer>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            variant={"outlined"}
            color={"warning"}
            onClick={() => setOpen(false)}
          >
            Close
          </Button>

          {onUpdateFormula && (
            <Button
              variant="contained"
              color="info"
              startIcon={<Update/>}
              onClick={() => {
                onUpdateFormula(displayFormula);
                setOpen(false);
              }}
              sx={{
                minWidth: 'auto',
                whiteSpace: 'nowrap'
              }}
            >
              Update Formula
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}