import { Check } from '@mui/icons-material';
import { Box, InputAdornment, Stack, TextField } from '@mui/material';
import { NaturalGrowthQuadrantsParser } from '@services/parsers/NaturalGrowthQuadrantsParser.ts';
import FormulaVisualizer from '@presentation/components/FormulaVisualizer.tsx';

type NaturalFormulaWithGraphRowProps = {
  paramName: string;
  quadrantLabel: string;
  formula: string;
  onFormulaChange: (next: string) => void;
  suggestedLevel?: number;
};

const monocodeSx = {
  fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace',
  '& .MuiInputBase-input': {
    fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace',
  },
} as const;

function NaturalFormulaWithGraphRow({
  paramName,
  quadrantLabel,
  formula,
  onFormulaChange,
  suggestedLevel,
}: NaturalFormulaWithGraphRowProps)
{
  const trimmed = formula.trim();
  const showOk =
    trimmed.length > 0 && NaturalGrowthQuadrantsParser.isValidFormula(trimmed);
  const chartTitle = `${paramName} (${quadrantLabel})`;

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
      <TextField
        label={paramName}
        variant="outlined"
        fullWidth
        size="small"
        value={formula}
        onChange={(e) => onFormulaChange(e.target.value)}
        sx={monocodeSx}
        slotProps={{
          input: {
            endAdornment: showOk
              ? (
                <InputAdornment position="end">
                  <Check color="success"/>
                </InputAdornment>
              )
              : undefined,
          },
        }}
      />
      {trimmed.length > 0 && (
        <Box sx={{ flexShrink: 0 }}>
          <FormulaVisualizer
            formula={formula}
            paramName={chartTitle}
            onUpdateFormula={onFormulaChange}
            suggestedLevel={suggestedLevel}
          />
        </Box>
      )}
    </Stack>
  );
}

export type { NaturalFormulaWithGraphRowProps };
export { NaturalFormulaWithGraphRow };
