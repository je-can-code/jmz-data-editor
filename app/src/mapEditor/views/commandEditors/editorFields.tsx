import React, { useEffect, useState } from 'react';
import { Alert, Autocomplete, Box, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import type { CommandFieldKind } from '../../core/commands/catalogTypes.ts';
import type { RmmzEventCommand } from '../../core/model/rmmzTypes.ts';
import { useDatabaseOptions, type NamedOption } from './editorEnvironment.tsx';

/**
 * Lays an editor's inputs out in a wrapping row, so a short command stays on one line and a long one flows.
 * @param {{ children: React.ReactNode }} props The inputs.
 * @returns {React.JSX.Element} The row.
 */
const FieldRow = (props: { children: React.ReactNode }) =>
{
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
      {props.children}
    </Box>
  );
};

/**
 * Stacks an editor's rows.
 * @param {{ children: React.ReactNode }} props The rows.
 * @returns {React.JSX.Element} The stack.
 */
const EditorStack = (props: { children: React.ReactNode }) =>
{
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1 }}>
      {props.children}
    </Box>
  );
};

/**
 * Keeps a number inside its bounds.
 * @param {number} value The number.
 * @param {number | undefined} min The lowest allowed.
 * @param {number | undefined} max The highest allowed.
 * @returns {number} The number, inside the bounds.
 */
const clamp = (value: number, min?: number, max?: number): number =>
{
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
};

/**
 * What a number input takes.
 */
type NumberFieldProps = {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly decimals?: boolean;
  readonly width?: number;
  readonly helperText?: string;
};

/**
 * A number input that lets the author type freely: a half-typed number ("-", "1.") stays on screen, a complete
 * one inside the bounds is kept as it is typed, and leaving the input brings anything outside the bounds back
 * inside them.
 * @param {NumberFieldProps} props The value, its bounds and what to do with a new one.
 * @returns {React.JSX.Element} The input.
 */
const NumberField = (props: NumberFieldProps) =>
{
  const { label, value, onChange, min, max, decimals = false, width = 110, helperText } = props;
  const [ draft, setDraft ] = useState(String(value));

  // follow a value changed from outside, unless the draft already says it.
  useEffect(() =>
  {
    setDraft(current => (current.trim() !== '' && Number(current) === value ? current : String(value)));
  }, [ value ]);

  const parse = (text: string): number | null =>
  {
    const number = Number(text);
    return text.trim() !== '' && Number.isFinite(number) && (decimals || Number.isInteger(number))
      ? number
      : null;
  };

  return (
    <TextField
      size={'small'}
      label={label}
      value={draft}
      helperText={helperText}
      sx={{ width }}
      slotProps={{ htmlInput: { inputMode: decimals ? 'decimal' : 'numeric' } }}
      onChange={event =>
      {
        setDraft(event.target.value);
        const number = parse(event.target.value);
        if (number !== null && number === clamp(number, min, max) && number !== value)
        {
          onChange(number);
        }
      }}
      onBlur={() =>
      {
        const number = parse(draft);
        const kept = number === null ? value : clamp(number, min, max);
        if (kept !== value)
        {
          onChange(kept);
        }
        setDraft(String(kept));
      }}
    />
  );
};

/**
 * One choice of a dropdown.
 */
type SelectOption<T> = {
  readonly value: T;
  readonly label: string;
};

/**
 * A dropdown. A stored value none of the choices matches is still shown, as itself, so opening a command never
 * changes it.
 * @param {{ label: string, value: T, options: readonly SelectOption<T>[], onChange: (value: T) => void, width?: number }} props The value, its choices and what to do with a new one.
 * @returns {React.JSX.Element} The dropdown.
 */
const SelectField = <T extends string | number,>(props: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  width?: number;
}) =>
{
  const { label, value, options, onChange, width = 170 } = props;
  const known = options.some(option => option.value === value);
  const shown = known ? options : [ ...options, { value, label: String(value) } ];

  return (
    <TextField
      select
      size={'small'}
      label={label}
      value={String(value)}
      sx={{ width }}
      onChange={event =>
      {
        const picked = shown.find(option => String(option.value) === event.target.value);
        if (picked !== undefined)
        {
          onChange(picked.value);
        }
      }}
    >
      {shown.map(option => (
        <MenuItem key={String(option.value)} value={String(option.value)}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
};

/**
 * A checkbox with its words.
 * @param {{ label: string, checked: boolean, onChange: (checked: boolean) => void }} props The state and what to do with a new one.
 * @returns {React.JSX.Element} The checkbox.
 */
const CheckField = (props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) =>
{
  const { label, checked, onChange } = props;
  return (
    <FormControlLabel
      label={label}
      control={<Checkbox size={'small'} checked={checked} onChange={event => onChange(event.target.checked)}/>}
    />
  );
};

/**
 * Writes an id the way MZ lists it: switches and variables padded to four digits.
 * @param {CommandFieldKind} kind The kind of id.
 * @param {number} id The id.
 * @returns {string} The id as shown.
 */
const idText = (kind: CommandFieldKind, id: number): string =>
{
  return kind === 'switch' || kind === 'variable'
    ? String(id).padStart(4, '0')
    : String(id);
};

/**
 * Picks a database row by id: from the database's names when the editor has them, or as a typed number when it
 * does not. An id the database lacks is still shown and kept.
 * @param {{ label: string, kind: CommandFieldKind, value: number, onChange: (id: number) => void, min?: number, width?: number }} props The id, its kind and what to do with a new one.
 * @returns {React.JSX.Element} The picker.
 */
const IdField = (props: { label: string; kind: CommandFieldKind; value: number; onChange: (id: number) => void; min?: number; width?: number }) =>
{
  const { label, kind, value, onChange, min = 1, width = 240 } = props;
  const options = useDatabaseOptions(kind);
  if (options.length === 0)
  {
    return <NumberField label={label} value={value} onChange={onChange} min={min}/>;
  }

  const selected: NamedOption = options.find(option => option.id === value) ?? { id: value, name: '' };
  return (
    <Autocomplete
      size={'small'}
      sx={{ width }}
      disableClearable
      options={options.some(option => option.id === value) ? options : [ selected, ...options ]}
      value={selected}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={option => `${idText(kind, option.id)} ${option.name}`.trim()}
      onChange={(_event, picked) => onChange(picked.id)}
      renderInput={params => <TextField {...params} label={label}/>}
    />
  );
};

/**
 * Who a character id names: the player, the event running the command, or another event on the map.
 */
const CHARACTER_TARGETS = [
  { value: -1, label: 'Player' },
  { value: 0, label: 'This event' },
  { value: 1, label: 'Another event' },
];

/**
 * Picks a character: the player (-1), this event (0), or another event by its id.
 * @param {{ label: string, value: number, onChange: (characterId: number) => void }} props The character and what to do with a new one.
 * @returns {React.JSX.Element} The picker.
 */
const CharacterField = (props: { label: string; value: number; onChange: (characterId: number) => void }) =>
{
  const { label, value, onChange } = props;
  const target = Math.min(1, value);
  return (
    <>
      <SelectField label={label} value={target} options={CHARACTER_TARGETS} width={150}
        onChange={picked => onChange(picked === 1 ? Math.max(1, value) : picked)}/>
      {target === 1 ? <NumberField label={'Event id'} value={value} min={1} onChange={onChange}/> : null}
    </>
  );
};

/**
 * Says a command is shaped in a way its editor does not know, so it is left exactly as it is, and shows it raw.
 * @param {{ command: RmmzEventCommand }} props The command.
 * @returns {React.JSX.Element} The notice.
 */
const UneditableCommand = (props: { command: RmmzEventCommand }) =>
{
  return (
    <EditorStack>
      <Alert severity={'info'} variant={'outlined'}>
        This command is written in a way this editor does not recognise, so it is kept exactly as it is.
      </Alert>
      <Typography component={'pre'} variant={'caption'} sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
        {JSON.stringify(props.command.parameters, null, 2)}
      </Typography>
    </EditorStack>
  );
};

export { CharacterField, CheckField, clamp, EditorStack, FieldRow, IdField, NumberField, SelectField, UneditableCommand };
export type { SelectOption };
