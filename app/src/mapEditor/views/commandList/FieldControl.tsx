import React, { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  createFilterOptions,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import { Add, Close, PlayArrow } from '@mui/icons-material';
import type { AudioFolder, MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { CommandField, CommandFieldKind } from '../../core/commands/catalogTypes.ts';
import { isNamedKind, namedRows, type DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';
import { isJsonObject, type JsonValue } from '../../core/model/json.ts';
import { CommitTextField } from './CommitTextField.tsx';
import type { SoundPlayer } from './commandListResources.ts';

/**
 * What every input control takes.
 */
type FieldControlProps = {
  readonly field: CommandField;
  readonly value: JsonValue | undefined;
  readonly onChange: (value: JsonValue) => void;
  readonly names: DatabaseNamesJson | null;
  readonly api: MapEditorApi | null;
  readonly playSound: SoundPlayer;
};

/**
 * One choice an id picker offers: a row, or one of the field's own special values (the whole party, none).
 */
type IdOption = {
  readonly id: number;
  readonly label: string;
};

/**
 * The folders sounds can be played from.
 */
const AUDIO_FOLDERS: ReadonlySet<string> = new Set([ 'bgm', 'bgs', 'me', 'se' ]);

/**
 * Keeps the id picker's list short while typing, however large the table.
 */
const filterIds = createFilterOptions<IdOption>({ limit: 200 });

/**
 * Reads a value as a number, as a field kept as text holds one.
 * @param {JsonValue | undefined} value The value.
 * @returns {number | null} The number, or null when it is none.
 */
const numberOf = (value: JsonValue | undefined): number | null =>
{
  const number = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value;
  return typeof number === 'number' && Number.isFinite(number)
    ? number
    : null;
};

/**
 * Keeps a number inside a field's bounds.
 * @param {CommandField} field The field.
 * @param {number} value The number.
 * @returns {number} The number, bounded.
 */
const withinBounds = (field: CommandField, value: number): number =>
{
  const low = field.min ?? Number.NEGATIVE_INFINITY;
  const high = field.max ?? Number.POSITIVE_INFINITY;
  return Math.min(high, Math.max(low, value));
};

/**
 * A number input, committed when the author is done, bounded by the field.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const NumberControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  const number = numberOf(value);
  return (
    <CommitTextField
      label={field.label}
      helperText={field.help}
      type={'number'}
      size={'small'}
      fullWidth
      value={number === null ? '' : String(number)}
      slotProps={{ htmlInput: { min: field.min, max: field.max } }}
      onCommit={text =>
      {
        const typed = Number(text);
        if (text.trim() !== '' && Number.isFinite(typed))
        {
          onChange(withinBounds(field, typed));
        }
      }}
    />
  );
};

/**
 * A text input, one line or several, committed when the author is done. Text that runs over several of a command's
 * lines (Show Text's message, a comment) has no cap on how many.
 * @param {FieldControlProps & { multiline?: boolean }} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const TextControl = (props: FieldControlProps & { readonly multiline?: boolean }) =>
{
  const { field, value, onChange, multiline } = props;
  return (
    <CommitTextField
      label={field.label}
      helperText={field.help ?? (multiline === true ? 'Ctrl+Enter to finish.' : undefined)}
      size={'small'}
      fullWidth
      multiline={multiline}
      minRows={multiline === true ? 3 : undefined}
      value={typeof value === 'string' ? value : String(value ?? '')}
      slotProps={{ htmlInput: { spellCheck: multiline === true } }}
      onCommit={onChange}
    />
  );
};

/**
 * A checkbox, changed at once.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const BooleanControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  const checked = value === true || value === 'true';
  return (
    <FormControlLabel
      label={field.label}
      control={(
        <Checkbox
          size={'small'}
          checked={checked}
          onChange={event => onChange(field.storage === 'string' ? String(event.target.checked) : event.target.checked)}
        />
      )}
    />
  );
};

/**
 * A choice from the field's options, changed at once. A value none of the options names is offered as it is, so
 * showing the control never changes what the command holds.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const SelectControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  const options = field.options ?? [];
  const current = String(value ?? '');
  const known = options.some(option => String(option.value) === current);
  return (
    <FormControl size={'small'} fullWidth>
      <InputLabel>{field.label}</InputLabel>
      <Select
        label={field.label}
        value={current}
        onChange={event =>
        {
          const picked = options.find(option => String(option.value) === event.target.value);
          if (picked !== undefined)
          {
            onChange(picked.value);
          }
        }}
      >
        {options.map(option => (
          <MenuItem key={String(option.value)} value={String(option.value)}>
            {option.label}
          </MenuItem>
        ))}
        {known === false && (
          <MenuItem value={current} disabled>
            {`Other (${current === '' ? 'none' : current})`}
          </MenuItem>
        )}
      </Select>
    </FormControl>
  );
};

/**
 * Writes an id the way MZ shows one: switches and variables padded to four digits.
 * @param {CommandField} field The field.
 * @param {number} id The id.
 * @returns {string} Such as "#0012" or "#5".
 */
const idNumber = (field: CommandField, id: number): string =>
{
  return field.kind === 'switch' || field.kind === 'variable'
    ? `#${String(id).padStart(4, '0')}`
    : `#${id}`;
};

/**
 * Picks a database row, a switch or a variable by name, changed at once. Until the names arrive, or for an id no
 * table has, it is a number input, so it never stands in the way.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const IdControl = (props: FieldControlProps) =>
{
  const { field, value, onChange, names } = props;
  const rows = namedRows(names, field.kind);
  const id = numberOf(value);
  if (rows.length === 0)
  {
    return <NumberControl {...props}/>;
  }

  const special: IdOption[] = (field.options ?? []).map(option => ({ id: Number(option.value), label: option.label }));
  const options: IdOption[] = [ ...special, ...rows.map(row => ({ id: row.id, label: `${idNumber(field, row.id)} ${row.name}`.trim() })) ];
  const selected = options.find(option => option.id === id) ?? (id === null ? null : { id, label: idNumber(field, id) });
  return (
    <Autocomplete
      size={'small'}
      fullWidth
      options={options}
      value={selected}
      filterOptions={filterIds}
      getOptionLabel={option => option.label}
      isOptionEqualToValue={(option, other) => option.id === other.id}
      disableClearable={selected !== null}
      onChange={(_event, picked) =>
      {
        if (picked !== null)
        {
          onChange(field.storage === 'string' ? String(picked.id) : picked.id);
        }
      }}
      renderInput={params => <TextField {...params} label={field.label} helperText={field.help}/>}
    />
  );
};

/**
 * Picks the character a command acts on: the player, the event running it, or another event by id.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const CharacterControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  const id = numberOf(value) ?? 0;
  let choice = 'event';
  if (id < 0)
  {
    choice = 'player';
  }
  else if (id === 0)
  {
    choice = 'self';
  }

  return (
    <Stack direction={'row'} spacing={1}>
      <FormControl size={'small'} fullWidth>
        <InputLabel>{field.label}</InputLabel>
        <Select
          label={field.label}
          value={choice}
          onChange={event =>
          {
            const picked = { player: -1, self: 0, event: Math.max(id, 1) }[event.target.value as 'player' | 'self' | 'event'];
            onChange(picked);
          }}
        >
          <MenuItem value={'player'}>Player</MenuItem>
          <MenuItem value={'self'}>This Event</MenuItem>
          <MenuItem value={'event'}>Another event</MenuItem>
        </Select>
      </FormControl>
      {choice === 'event' && <NumberControl {...props} field={{ ...field, label: 'Event id', min: 1 }}/>}
    </Stack>
  );
};

/**
 * Edits a sound: its file, volume, pitch and pan, with a button that plays it as the game would.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const AudioControl = (props: FieldControlProps) =>
{
  const { field, value, onChange, api, playSound } = props;
  const sound = isJsonObject(value)
    ? value
    : { name: '', volume: 90, pitch: 100, pan: 0 };
  const name = String(sound['name'] ?? '');
  const folder = field.folder ?? 'se';
  const playable = api !== null && name !== '' && AUDIO_FOLDERS.has(folder);

  /**
   * Builds a number control for one part of the sound.
   * @param {string} key The part.
   * @param {string} label What it is called.
   * @param {number} min The lowest it goes.
   * @param {number} max The highest it goes.
   * @returns {React.JSX.Element} The control.
   */
  const part = (key: string, label: string, min: number, max: number) => (
    <NumberControl
      {...props}
      field={{ ...field, key, label, kind: 'number', min, max, help: undefined }}
      value={sound[key]}
      onChange={next => onChange({ ...sound, [key]: next })}
    />
  );

  return (
    <Stack direction={'row'} spacing={1} alignItems={'flex-start'}>
      <CommitTextField
        label={field.label}
        helperText={`From audio/${folder}`}
        size={'small'}
        fullWidth
        value={name}
        onCommit={next => onChange({ ...sound, name: next })}
      />
      {part('volume', 'Volume', 0, 100)}
      {part('pitch', 'Pitch', 50, 150)}
      {part('pan', 'Pan', -100, 100)}
      <Tooltip title={'Play'}>
        <span>
          <IconButton
            aria-label={'Play sound'}
            disabled={playable === false}
            onClick={() => api !== null && playSound(api.audioUrl(folder as AudioFolder, name), { volume: Number(sound['volume'] ?? 90), pitch: Number(sound['pitch'] ?? 100) })}
          >
            <PlayArrow/>
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
};

/**
 * Edits a tone or a color, channel by channel. A tone's channels run from -255, and its fourth is gray; a color's
 * run from 0, and its fourth is strength.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const ColorControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  const channels = Array.isArray(value)
    ? value
    : [ 0, 0, 0, 0 ];
  const tone = (field.min ?? 0) < 0;
  const labels = [ 'Red', 'Green', 'Blue', tone ? 'Gray' : 'Strength' ];
  return (
    <Box>
      <Box sx={{ typography: 'caption', color: 'text.secondary', mb: 0.5 }}>{field.label}</Box>
      <Stack direction={'row'} spacing={1}>
        {labels.map((label, channel) => (
          <NumberControl
            key={label}
            {...props}
            field={{ ...field, key: label, label, kind: 'number', min: channel === 3 ? 0 : field.min, max: 255, help: undefined }}
            value={channels[channel]}
            onChange={next => onChange(channels.map((each, position) => (position === channel ? next : each)))}
          />
        ))}
      </Stack>
    </Box>
  );
};

/**
 * Edits the name of a file the command uses (a face, a picture, a movie), with where it comes from underneath.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const FileNameControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  return (
    <CommitTextField
      label={field.label}
      helperText={field.help ?? (field.folder === undefined ? undefined : `From img/${field.folder}`)}
      size={'small'}
      fullWidth
      value={String(value ?? '')}
      onCommit={onChange}
    />
  );
};

/**
 * Edits any value as JSON, for inputs no simpler control fits. Text that is not JSON is shown as a problem and
 * never saved.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const JsonControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  const [ problem, setProblem ] = useState<string | null>(null);
  return (
    <CommitTextField
      label={field.label}
      helperText={problem ?? field.help ?? 'As JSON. Ctrl+Enter to finish.'}
      error={problem !== null}
      size={'small'}
      fullWidth
      multiline
      minRows={3}
      value={JSON.stringify(value ?? null, null, 2)}
      slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace' } } }}
      onCommit={text =>
      {
        try
        {
          onChange(JSON.parse(text) as JsonValue);
          setProblem(null);
        }
        catch (error)
        {
          setProblem(`Not saved, that is not JSON: ${(error as Error).message}`);
        }
      }}
    />
  );
};

/**
 * Edits a list of texts (choices) one per line, with rows added and taken away. Any other list edits as JSON.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const ListControl = (props: FieldControlProps) =>
{
  const { field, value, onChange } = props;
  if (Array.isArray(value) === false || value.every(each => typeof each === 'string') === false)
  {
    return <JsonControl {...props}/>;
  }

  const texts = value as string[];
  return (
    <Stack spacing={1}>
      <Box sx={{ typography: 'caption', color: 'text.secondary' }}>{field.label}</Box>
      {texts.map((text, position) => (
        <Stack key={position} direction={'row'} spacing={1} alignItems={'center'}>
          <CommitTextField
            size={'small'}
            fullWidth
            label={`#${position + 1}`}
            value={text}
            onCommit={next => onChange(texts.map((each, at) => (at === position ? next : each)))}
          />
          <IconButton aria-label={`Remove #${position + 1}`} size={'small'} onClick={() => onChange(texts.filter((_, at) => at !== position))}>
            <Close fontSize={'small'}/>
          </IconButton>
        </Stack>
      ))}
      <Box>
        <Button size={'small'} startIcon={<Add/>} onClick={() => onChange([ ...texts, '' ])}>
          Add
        </Button>
      </Box>
    </Stack>
  );
};

/**
 * The control each kind of input edits with; ids of database rows pick by name, and anything else edits as JSON.
 */
const CONTROLS_BY_KIND: Readonly<Partial<Record<CommandFieldKind, (props: FieldControlProps) => React.JSX.Element>>> = {
  'number': NumberControl,
  'text': TextControl,
  'boolean': BooleanControl,
  'select': SelectControl,
  'self-switch': SelectControl,
  'event': CharacterControl,
  'audio': AudioControl,
  'color': ColorControl,
  'face': FileNameControl,
  'character': FileNameControl,
  'image': FileNameControl,
  'file': FileNameControl,
  'list': ListControl,
};

/**
 * Reports whether a field edits as text over several lines: text on a command's lines, a multiline field, or a
 * plugin's structured argument, which is kept as text and edits as the text it is.
 * @param {CommandField} field The field.
 * @returns {boolean} True when it does.
 */
const editsAsLongText = (field: CommandField): boolean =>
{
  return field.lines !== undefined
    || field.kind === 'multiline'
    || (field.storage === 'string' && [ 'list', 'struct', 'json' ].includes(field.kind));
};

/**
 * The control for one input, chosen by what kind of input it is.
 * @param {FieldControlProps} props The control's props.
 * @returns {React.JSX.Element} The control.
 */
const FieldControl = (props: FieldControlProps) =>
{
  const { field } = props;
  if (editsAsLongText(field))
  {
    return <TextControl {...props} multiline/>;
  }

  const fallback = isNamedKind(field.kind)
    ? IdControl
    : JsonControl;
  const Control = CONTROLS_BY_KIND[field.kind] ?? fallback;
  return <Control {...props}/>;
};

/**
 * Reports whether a field's control wants a whole row of the form to itself.
 * @param {CommandField} field The field.
 * @returns {boolean} True for text over several lines, sounds, lists and JSON.
 */
const isWideField = (field: CommandField): boolean =>
{
  return field.lines !== undefined
    || [ 'multiline', 'audio', 'list', 'json', 'struct', 'color' ].includes(field.kind);
};

export { FieldControl, isWideField };
export type { FieldControlProps };
