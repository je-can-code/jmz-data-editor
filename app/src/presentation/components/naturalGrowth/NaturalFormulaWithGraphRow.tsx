import { Check } from '@mui/icons-material';
import { Box, InputAdornment, Stack, TextField } from '@mui/material';
import { type ChangeEvent, useEffect, useState } from 'react';
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

/**
 * What the field says while its formula uses a character a growth tag cannot hold.
 */
const CANNOT_BE_SAVED_TEXT =
  'Can\'t be saved: only letters, numbers, underscores, spaces, periods, parentheses and + - * / work in a formula.';

/**
 * One growth formula's field, with its graph beside it once the formula holds anything. The field shows the
 * formula exactly as it is being typed, spaces and all, while the note is handed every keystroke and keeps its own
 * tidied copy: trimmed, and left out entirely while it uses a character a growth tag cannot hold.
 * @param {NaturalFormulaWithGraphRowProps} props The parameter and quadrant the field is for, the formula as the
 * note keeps it, where each edit goes, and the level the graph starts from.
 * @returns {JSX.Element} The field, and its graph once there is a formula to draw.
 */
function NaturalFormulaWithGraphRow({
  paramName,
  quadrantLabel,
  formula,
  onFormulaChange,
  suggestedLevel,
}: NaturalFormulaWithGraphRowProps)
{
  // show the formula as it is being typed; reading it back out of the note would strip a space the moment it landed
  // at the end, and blank the field the moment a character the note cannot keep was typed.
  const [ typed, setTyped ] = useState(formula);

  // take up a formula that arrives from anywhere but this field, such as a copy or the graph, while the note handing
  // back only this field's own formula, tidied, leaves what was typed alone.
  useEffect(() =>
  {
    setTyped((current) => (
      NaturalGrowthQuadrantsParser.storedFormula(current) === formula
        ? current
        : formula
    ));
  }, [ formula ]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // keep every keystroke on screen, and let the note keep what it can of it.
    setTyped(event.target.value);
    onFormulaChange(event.target.value);
  };

  const trimmed = formula.trim();
  const showOk =
    trimmed.length > 0 && NaturalGrowthQuadrantsParser.isValidFormula(trimmed);

  // a character the note cannot keep leaves this formula out of it entirely, so say so where it was typed.
  const cannotBeSaved = NaturalGrowthQuadrantsParser.isValidFormula(typed) === false;
  const chartTitle = `${paramName} (${quadrantLabel})`;

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
      <TextField
        label={paramName}
        variant="outlined"
        fullWidth
        size="small"
        value={typed}
        onChange={handleChange}
        error={cannotBeSaved}
        helperText={cannotBeSaved
          ? CANNOT_BE_SAVED_TEXT
          : undefined}
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
