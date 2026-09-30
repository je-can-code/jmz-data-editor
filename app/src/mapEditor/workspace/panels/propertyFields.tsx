import React, { useEffect, useState } from 'react';
import { Box, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { parseWholeNumber, type NumberLimits } from '../../core/properties/propertyInputs.ts';

/**
 * The narrowest a number field in a row of them may get before the row wraps, in pixels: room for its label and a
 * few digits.
 */
const NUMBER_FIELD_MIN_WIDTH = 84;

/**
 * Lays a few fields side by side, sharing the width evenly, as many to a line as fit at their minimum width. A narrow
 * panel wraps them onto more lines rather than squeezing their labels away.
 * @param {{ minWidth?: number, children: React.ReactNode }} props The narrowest each field may get, and the fields.
 * @returns {React.JSX.Element} The row.
 */
const FieldRow = (props: { minWidth?: number; children: React.ReactNode }) =>
{
  const { minWidth = NUMBER_FIELD_MIN_WIDTH, children } = props;
  return (
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, alignItems: 'start' }}>
      {children}
    </Box>
  );
};

/**
 * A text field that keeps what is typed to itself until it is committed, by leaving the field or pressing Enter,
 * so one change is one step in the map's history rather than one per keystroke. Escape puts back the saved value,
 * and so does any change to it from elsewhere, such as an undo.
 * @param {object} props The label, the saved value, whether it spans lines, and what to do with a committed value.
 * @returns {React.JSX.Element} The field.
 */
const CommitTextField = (props: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  helperText?: string;
}) =>
{
  const { label, value, onCommit, multiline = false, helperText } = props;
  const [ draft, setDraft ] = useState(value);

  useEffect(() =>
  {
    setDraft(value);
  }, [ value ]);

  /**
   * Hands on the draft when it differs from the saved value.
   */
  const commit = () =>
  {
    if (draft !== value)
    {
      onCommit(draft);
    }
  };

  return (
    <TextField
      label={label}
      value={draft}
      size={'small'}
      fullWidth
      multiline={multiline}
      minRows={multiline ? 3 : undefined}
      helperText={helperText}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          setDraft(value);
          return;
        }

        if (event.key === 'Enter' && multiline === false)
        {
          commit();
        }
      }}
    />
  );
};

/**
 * A whole-number field committed like {@link CommitTextField}. A value that is not a whole number inside its limits
 * is refused: the field says so and puts back the saved value. On its own it keeps a fixed width; in a
 * {@link FieldRow} it fills its share of the row.
 * @param {object} props The label, the saved value, its limits, what to do with a committed value, and whether it fills its space.
 * @returns {React.JSX.Element} The field.
 */
const CommitNumberField = (props: {
  label: string;
  value: number;
  limits: NumberLimits;
  onCommit: (value: number) => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) =>
{
  const { label, value, limits, onCommit, disabled = false, fullWidth = false } = props;
  const [ draft, setDraft ] = useState(String(value));
  const parsed = parseWholeNumber(draft, limits);

  useEffect(() =>
  {
    setDraft(String(value));
  }, [ value ]);

  /**
   * Hands on an allowed number that differs from the saved one, and puts back the saved value otherwise.
   */
  const commit = () =>
  {
    if (parsed === null)
    {
      setDraft(String(value));
      return;
    }

    if (parsed !== value)
    {
      onCommit(parsed);
    }
  };

  return (
    <TextField
      label={label}
      value={draft}
      size={'small'}
      disabled={disabled}
      fullWidth={fullWidth}
      error={parsed === null}
      helperText={parsed === null ? `${limits.min} to ${limits.max}` : undefined}
      slotProps={{ htmlInput: { inputMode: 'numeric' } }}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          setDraft(String(value));
          return;
        }

        if (event.key === 'Enter')
        {
          commit();
        }
      }}
      sx={fullWidth ? undefined : { width: 120 }}
    />
  );
};

/**
 * A checkbox that commits as soon as it is clicked.
 * @param {object} props The label, whether it is ticked, and what to do when it changes.
 * @returns {React.JSX.Element} The checkbox.
 */
const CheckField = (props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) =>
{
  const { label, checked, onChange } = props;
  return (
    <FormControlLabel
      control={<Checkbox size={'small'} checked={checked} onChange={event => onChange(event.target.checked)}/>}
      label={<Typography variant={'body2'}>{label}</Typography>}
    />
  );
};

/**
 * A drop-down that commits as soon as a choice is made.
 * @param {object} props The label, the chosen value, the choices, and what to do when it changes.
 * @returns {React.JSX.Element} The drop-down.
 */
const SelectField = (props: {
  label: string;
  value: number;
  options: readonly { readonly value: number; readonly label: string }[];
  onChange: (value: number) => void;
}) =>
{
  const { label, value, options, onChange } = props;
  const known = options.some(option => option.value === value);
  return (
    <TextField
      select
      label={label}
      value={known ? value : ''}
      size={'small'}
      fullWidth
      onChange={event => onChange(Number(event.target.value))}
    >
      {options.map(option => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
};

/**
 * A small heading over a group of fields.
 * @param {{ children: React.ReactNode }} props The heading's words.
 * @returns {React.JSX.Element} The heading.
 */
const SectionTitle = (props: { children: React.ReactNode }) =>
{
  const { children } = props;
  return (
    <Typography variant={'overline'} color={'text.secondary'} sx={{ display: 'block', lineHeight: 2, mt: 1 }}>
      {children}
    </Typography>
  );
};

export { CheckField, CommitNumberField, CommitTextField, FieldRow, SectionTitle, SelectField };
