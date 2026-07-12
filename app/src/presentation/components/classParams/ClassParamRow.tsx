import { useState } from 'react';
import { Box, Button, InputAdornment, Stack, TextField } from '@mui/material';
import { Check, PlayArrow } from '@mui/icons-material';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import FormulaVisualizer from '@presentation/components/FormulaVisualizer.tsx';
import type { KnownParameter } from '../../../mappers/ParameterIdMapper.ts';

const monocodeSx = {
  fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace',
  '& .MuiInputBase-input': {
    fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace',
  },
} as const;

type ClassParamRowProps = {
  param: KnownParameter;
  /** Whether a formula has been generated and applied since this row last mounted (for the checkmark). */
  applied: boolean;
  trueMaxLevel?: number;
  /**
   * Generates the 1-99 curve from the typed formula and writes it into `RPG_ClassDomainModel.params`.
   * One-shot by design — the formula itself is never persisted, only the resulting numbers.
   */
  onApply: (values: number[]) => void;
};

/**
 * One row of the Classes board's "Parameters" tab: a scratch formula input for one base stat, a preview
 * graph (including the beyond-99 extrapolation preview when `trueMaxLevel` is known), and an explicit
 * "Apply" action that writes the generated levels 1-99 into the class's `params[paramId]` array.
 */
function ClassParamRow({ param, applied, trueMaxLevel, onApply }: ClassParamRowProps)
{
  const [ formula, setFormula ] = useState('');
  const trimmed = formula.trim();
  const canApply = trimmed.length > 0;

  const handleApply = () =>
  {
    if (!canApply)
    {
      return;
    }

    const points = GrowthParser.generateDataPoints(trimmed, 99, 1);
    const values: number[] = [];
    for (const point of points)
    {
      if (point.level >= 1 && point.level <= 99)
      {
        values[ point.level ] = Math.round(point.value);
      }
    }

    onApply(values);
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
      <TextField
        label={param.name}
        variant="outlined"
        fullWidth
        size="small"
        value={formula}
        onChange={(e) => setFormula(e.target.value)}
        placeholder="e.g. (5 + a.level * 3)"
        sx={monocodeSx}
        slotProps={{
          input: {
            endAdornment: applied
              ? (
                <InputAdornment position="end">
                  <Check color="success"/>
                </InputAdornment>
              )
              : undefined,
          },
        }}
      />
      <Box sx={{ flexShrink: 0 }}>
        <FormulaVisualizer
          formula={formula}
          paramName={param.name}
          onUpdateFormula={setFormula}
          suggestedLevel={99}
          trueMaxLevel={trueMaxLevel}
        />
      </Box>
      <Button
        variant="contained"
        color="success"
        size="small"
        startIcon={<PlayArrow/>}
        disabled={!canApply}
        onClick={handleApply}
        sx={{ flexShrink: 0 }}
      >
        Apply
      </Button>
    </Stack>
  );
}

export { ClassParamRow };
