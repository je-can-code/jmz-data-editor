import { Box, Button, InputAdornment, Stack, TextField } from '@mui/material';
import { Check, PlayArrow } from '@mui/icons-material';
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
  trueMaxLevel?: number;
  /**
   * The row's currently-saved curve, read-only. For the 8 base params this is `params[paramId]`
   * (levels 1-99, baked numbers). For MTP (no `params[]` slot) this is the saved `GrowthCurve` tag's
   * formula evaluated at levels 1-99, since the tag is the only source of truth for that stat.
   */
  currentValues: number[];
  /** What the row's input shows: whatever has been typed into it, or else the class's saved formula. */
  formula: string;
  /** Whether this row has been applied since the rows last started over, for the checkmark. */
  applied: boolean;
  /** Reports what is typed into the input, or picked in the formula visualizer. */
  onFormulaChange: (formula: string) => void;
  /** Applies the row's formula to the class. Only offered while the input holds something to apply. */
  onApply: () => void;
};

/**
 * One row of the Classes board's Parameter Growth card: a read-only view of the currently-saved curve (so
 * applying a formula never overwrites values you can't already see), a formula input for one base stat (or
 * MTP), a preview graph (including the beyond-99 extrapolation preview when `trueMaxLevel` is known), and an
 * explicit "Apply" action.
 *
 * The row only draws and reports. What is typed into it is kept by {@link ClassParamRows} above it, which is
 * what lets one click apply every edited row at once.
 */
function ClassParamRow({
  param,
  trueMaxLevel,
  currentValues,
  formula,
  applied,
  onFormulaChange,
  onApply,
}: ClassParamRowProps)
{
  // an empty input has nothing to apply.
  const canApply = formula.trim().length > 0;

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
          onChange={(e) => onFormulaChange(e.target.value)}
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
            onUpdateFormula={onFormulaChange}
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
          onClick={onApply}
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
