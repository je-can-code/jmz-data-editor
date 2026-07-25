import { useState } from 'react';
import { Box, Button, InputAdornment, Stack, TextField } from '@mui/material';
import { Check, PlayArrow } from '@mui/icons-material';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import FormulaVisualizer from '@presentation/components/FormulaVisualizer.tsx';
import { ParamCurveSparkline } from '@presentation/components/classParams/ParamCurveSparkline.tsx';
import { ParamCurveCheckpoints } from '@presentation/components/classParams/ParamCurveCheckpoints.tsx';
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
   * The row's currently-saved curve, read-only. For the 8 base params this is `params[paramId]`
   * (levels 1-99, baked numbers). For MTP (no `params[]` slot) this is the saved `GrowthCurve` tag's
   * formula evaluated at levels 1-99, since the tag is the only source of truth for that stat.
   */
  currentValues: number[];
  /** The `<paramGrowthCurve:[formula]>` tag already saved on the class's note, if any (pre-fills the input). */
  savedFormula: string;
  /**
   * Whether this param has a `params[paramId]` array to write into (true for the 8 base params, false
   * for MTP). Controls whether Apply also overwrites levels 1-99, or only saves the formula tag.
   */
  hasParamsArray: boolean;
  /**
   * Generates the 1-99 curve from the typed formula and writes it into `RPG_ClassDomainModel.params`.
   * Only called when {@link hasParamsArray} is true.
   */
  onApplyValues: (values: number[]) => void;
  /** Persists the typed formula as a `<paramGrowthCurve:[formula]>` tag on the class's note. */
  onSaveFormula: (formula: string) => void;
};

/**
 * One row of the Classes board's "Parameters" tab: a read-only view of the currently-saved curve
 * (so applying a formula never overwrites values you can't already see), a scratch formula input for
 * one base stat (or MTP), a preview graph (including the beyond-99 extrapolation preview when
 * `trueMaxLevel` is known), and an explicit "Apply" action that both persists the formula as a
 * `GrowthCurve` note tag (read by J-LevelMaster/J-Base at runtime for growth beyond what's baked into
 * `params[]`, or for MTP's entire curve) and, for params with a `params[]` slot, overwrites levels 1-99.
 */
function ClassParamRow({
  param,
  applied,
  trueMaxLevel,
  currentValues,
  savedFormula,
  hasParamsArray,
  onApplyValues,
  onSaveFormula,
}: ClassParamRowProps)
{
  const [ formula, setFormula ] = useState(savedFormula);
  const trimmed = formula.trim();
  const canApply = trimmed.length > 0;

  const handleApply = () =>
  {
    if (!canApply)
    {
      return;
    }

    onSaveFormula(trimmed);

    if (hasParamsArray)
    {
      const points = GrowthParser.generateDataPoints(trimmed, 99, 1);
      const values: number[] = [];
      for (const point of points)
      {
        if (point.level >= 1 && point.level <= 99)
        {
          values[ point.level ] = Math.round(point.value);
        }
      }

      onApplyValues(values);
    }
  };

  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
        <ParamCurveSparkline values={currentValues}/>

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
            currentValues={currentValues}
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

      {/* 148px = the sparkline's 140px width + the row's 8px (spacing={1}) gap, so the checkpoints
          line up under the formula input rather than under the sparkline. */}
      <Box sx={{ pl: '148px' }}>
        <ParamCurveCheckpoints values={currentValues}/>
      </Box>
    </Stack>
  );
}

export { ClassParamRow };
