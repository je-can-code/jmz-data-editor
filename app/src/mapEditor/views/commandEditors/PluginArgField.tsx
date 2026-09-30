import React from 'react';
import { Autocomplete, Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { CommandFieldKind } from '../../core/commands/catalogTypes.ts';
import {
  decodeList,
  decodeNote,
  decodeStruct,
  encodeList,
  encodeNote,
  encodeStruct,
  parseArgType,
  type PluginArgType,
} from '../../core/commands/editors/pluginArgValues.ts';
import type { PluginArgSchema } from '../../core/commands/pluginHeaders/pluginHeader.ts';
import type { PluginHeaderLibrary } from '../../core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { IdField } from './editorFields.tsx';

/**
 * The database kind each header type names.
 */
const DATABASE_TYPES: Readonly<Record<string, CommandFieldKind>> = {
  actor: 'actor',
  class: 'class',
  skill: 'skill',
  item: 'item',
  weapon: 'weapon',
  armor: 'armor',
  enemy: 'enemy',
  troop: 'troop',
  state: 'state',
  animation: 'animation',
  tileset: 'tileset',
  common_event: 'common-event',
  switch: 'switch',
  variable: 'variable',
};

/**
 * What an argument's input takes: the argument as the header declares it, what its value means, the value as
 * stored, and where to look up the structs its plugin declares.
 */
type ArgInputProps = {
  readonly arg: PluginArgSchema;
  readonly type: PluginArgType;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly plugin: string;
  readonly library: PluginHeaderLibrary;
  readonly label: string;
};

/**
 * A plain text input, for text and for anything the form cannot type more closely.
 * @param {ArgInputProps} props The argument and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const TextInput = (props: ArgInputProps & { multiline?: boolean }) =>
{
  const { arg, value, onChange, label, multiline = false } = props;
  return (
    <TextField size={'small'} fullWidth label={label} value={value} multiline={multiline} minRows={multiline ? 2 : undefined}
      placeholder={arg.default} onChange={event => onChange(event.target.value)}/>
  );
};

/**
 * A number, kept as the text MZ stores it; the bounds and decimals the header gives show beneath it.
 * @param {ArgInputProps} props The argument and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const NumberInput = (props: ArgInputProps) =>
{
  const { arg, value, onChange, label } = props;
  const bounds = [ arg.min === undefined ? null : `at least ${arg.min}`, arg.max === undefined ? null : `at most ${arg.max}` ].filter(Boolean).join(', ');
  const number = Number(value);
  const invalid = value.trim() !== '' && (Number.isFinite(number) === false || (arg.min !== undefined && number < arg.min) || (arg.max !== undefined && number > arg.max));
  return (
    <TextField size={'small'} label={label} value={value} error={invalid} helperText={bounds === '' ? undefined : bounds} sx={{ width: 180 }}
      placeholder={arg.default} slotProps={{ htmlInput: { inputMode: (arg.decimals ?? 0) > 0 ? 'decimal' : 'numeric' } }}
      onChange={event => onChange(event.target.value)}/>
  );
};

/**
 * A boolean, read with the words the header gives its two states.
 * @param {ArgInputProps} props The argument and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const BooleanInput = (props: ArgInputProps) =>
{
  const { arg, value, onChange, label } = props;
  const known = value === 'true' || value === 'false';
  return (
    <TextField select size={'small'} label={label} value={value} sx={{ width: 220 }} onChange={event => onChange(event.target.value)}>
      <MenuItem value={'true'}>{arg.on ?? 'ON'}</MenuItem>
      <MenuItem value={'false'}>{arg.off ?? 'OFF'}</MenuItem>
      {known ? null : <MenuItem value={value}>{value === '' ? 'Not set' : value}</MenuItem>}
    </TextField>
  );
};

/**
 * One of the header's options; a combo also takes text of its own.
 * @param {ArgInputProps} props The argument and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const OptionInput = (props: ArgInputProps) =>
{
  const { arg, type, value, onChange, label } = props;
  const options = (arg.options ?? []).map(option => ({ value: String(option.value), label: option.label }));
  if (type.kind === 'simple' && type.name === 'combo')
  {
    return (
      <Autocomplete freeSolo size={'small'} sx={{ width: 260 }} options={options.map(option => option.value)} value={value}
        onInputChange={(_event, text) => onChange(text)} renderInput={params => <TextField {...params} label={label}/>}/>
    );
  }

  const shown = options.some(option => option.value === value) ? options : [ ...options, { value, label: value === '' ? 'Not set' : value } ];
  return (
    <TextField select size={'small'} label={label} value={value} sx={{ width: 260 }} onChange={event => onChange(event.target.value)}>
      {shown.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
    </TextField>
  );
};

/**
 * A database id, picked by name when the editor has names, kept as the text MZ stores it.
 * @param {ArgInputProps & { kind: CommandFieldKind }} props The argument, its kind and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const DatabaseInput = (props: ArgInputProps & { kind: CommandFieldKind }) =>
{
  const { kind, value, onChange, label } = props;
  const id = Number.parseInt(value, 10);
  return <IdField label={label} kind={kind} value={Number.isFinite(id) ? id : 0} min={0} onChange={next => onChange(String(next))}/>;
};

/**
 * A note: MZ stores it as the JSON of its text, which the input shows as the text itself.
 * @param {ArgInputProps} props The argument and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const NoteInput = (props: ArgInputProps) =>
{
  const { value, onChange, label } = props;
  return (
    <TextField size={'small'} fullWidth multiline minRows={2} label={label} value={value === '' ? '' : decodeNote(value)}
      onChange={event => onChange(encodeNote(event.target.value))}/>
  );
};

/**
 * A list: each item edited as the list's item type, with items added and removed. Text that is not a list is
 * shown as text, so nothing is destroyed.
 * @param {ArgInputProps & { item: PluginArgType }} props The argument, its item type and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const ListInput = (props: ArgInputProps & { item: PluginArgType }) =>
{
  const { item, value, onChange, label } = props;
  const items = decodeList(value);
  if (items === null)
  {
    return <TextInput {...props}/>;
  }

  const setItems = (next: string[]) => onChange(encodeList(next));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
      <Typography variant={'body2'}>{label}</Typography>
      {items.map((each, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start', pl: 1 }}>
          <PluginArgInput {...props} type={item} label={`${index + 1}`} value={each}
            onChange={next => setItems(items.map((old, at) => (at === index ? next : old)))}/>
          <Tooltip title={'Remove'}>
            <IconButton size={'small'} aria-label={`Remove ${label} ${index + 1}`} onClick={() => setItems(items.filter((_old, at) => at !== index))}>
              <DeleteOutlineIcon fontSize={'small'}/>
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      <Box>
        <Button size={'small'} startIcon={<AddIcon/>} onClick={() => setItems([ ...items, '' ])}>Add</Button>
      </Box>
    </Box>
  );
};

/**
 * A struct: each field the plugin declares, edited as its own type. A struct never filled in takes every
 * field's default the first time one is changed, as MZ fills it. Without the plugin's declaration, or for text
 * that is not a struct, the value is shown as text.
 * @param {ArgInputProps & { name: string }} props The argument, its struct's name and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const StructInput = (props: ArgInputProps & { name: string }) =>
{
  const { name, value, onChange, plugin, library, label } = props;
  const struct = library.struct(plugin, name);
  const fields = decodeStruct(value);
  if (struct === null || fields === null)
  {
    return <TextInput {...props}/>;
  }

  const setField = (key: string, next: string) =>
  {
    const filled = Object.fromEntries(struct.params.map(param => [ param.name, fields[param.name] ?? param.default ?? '' ]));
    onChange(encodeStruct({ ...fields, ...filled, [key]: next }));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', borderLeft: 2, borderColor: 'divider', pl: 1.5 }}>
      <Typography variant={'body2'}>{label}</Typography>
      {struct.params.map(param => (
        <PluginArgField key={param.name} arg={param} value={fields[param.name] ?? ''} plugin={plugin} library={library}
          onChange={next => setField(param.name, next)}/>
      ))}
    </Box>
  );
};

/**
 * Picks the input for a value of a type: lists and structs by their shape, simple types by name.
 * @param {ArgInputProps} props The argument, the type of the value and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const PluginArgInput = (props: ArgInputProps) =>
{
  const { type } = props;
  if (type.kind === 'list')
  {
    return <ListInput {...props} item={type.item}/>;
  }

  if (type.kind === 'struct')
  {
    return <StructInput {...props} name={type.name}/>;
  }

  const database = DATABASE_TYPES[type.name];
  if (database !== undefined)
  {
    return <DatabaseInput {...props} kind={database}/>;
  }

  switch (type.name)
  {
    case 'number':
      return <NumberInput {...props}/>;
    case 'boolean':
      return <BooleanInput {...props}/>;
    case 'select':
    case 'combo':
      return <OptionInput {...props}/>;
    case 'multiline_string':
      return <TextInput {...props} multiline/>;
    case 'note':
      return <NoteInput {...props}/>;
    default:
      return <TextInput {...props}/>;
  }
};

/**
 * One argument of a plugin command, or one field of a struct, edited as what its header says it is, with the
 * header's description beneath it. Every value stays the text MZ stores.
 * @param {{ arg: PluginArgSchema, value: string, onChange: (value: string) => void, plugin: string, library: PluginHeaderLibrary }} props The argument, its value, its plugin and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const PluginArgField = (props: { arg: PluginArgSchema; value: string; onChange: (value: string) => void; plugin: string; library: PluginHeaderLibrary }) =>
{
  const { arg } = props;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <PluginArgInput {...props} type={parseArgType(arg.type)} label={arg.text ?? arg.name}/>
      {arg.description === undefined
        ? null
        : <Typography variant={'caption'} color={'text.secondary'} sx={{ whiteSpace: 'pre-line' }}>{arg.description}</Typography>}
    </Box>
  );
};

export { PluginArgField };
