import React, { useEffect, useState } from 'react';
import { Autocomplete, Box, MenuItem, Stack, TextField } from '@mui/material';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import { namedRows, type NamedRow } from '../../core/commandList/databaseNames.ts';
import { mapLabel, mapOptions, type MapOption } from '../../core/commands/editors/mapOptions.ts';
import type { GraphicValue, QuickOption, SharedField } from '../../core/eventKinds/quickFields.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { RmmzEventImage } from '../../core/model/rmmzTypes.ts';
import { parseWholeNumber, type NumberLimits } from '../../core/properties/propertyInputs.ts';
import { eventFrame, sheetKind } from '../../render/engine/characterFrames.ts';
import type { QuickResources } from './quickResources.ts';

/**
 * What a field shows when the selected events hold different values.
 */
const MIXED = 'Mixed';

/**
 * The size a picture preview fits inside, in pixels.
 */
const PREVIEW_SIZE = 56;

/**
 * The tile size MZ draws characters against, which a tile picture's frame is cut to.
 */
const TILE_SIZE = 48;

/**
 * What every control is handed: its shared field, what it reads besides, and what to do with a new value.
 */
type ControlProps = {
  readonly field: SharedField;
  readonly resources: QuickResources;
  readonly onChange: (value: JsonValue) => void;
};

/**
 * Keeps a label raised while a field shows "Mixed" in place of a value, so the two never overlap.
 * @param {boolean} mixed Whether the field is mixed.
 * @returns {{ inputLabel: { shrink: true } } | undefined} The label's props, when it must stay raised.
 */
const raisedWhenMixed = (mixed: boolean): { inputLabel: { shrink: true } } | undefined =>
{
  return mixed
    ? { inputLabel: { shrink: true } }
    : undefined;
};

/**
 * A text box that keeps what is typed to itself until it is committed, so one change is one step: leaving the box,
 * Enter (Ctrl+Enter over several lines), and never merely by losing focus untouched. Escape puts back the value, as
 * does any change to it from elsewhere, such as an undo.
 * @param {ControlProps & { multiline: boolean }} props The field, and whether it runs over several lines.
 * @returns {React.JSX.Element} The box.
 */
const TextControl = (props: ControlProps & { multiline: boolean }) =>
{
  const { field, onChange, multiline } = props;
  const shown = field.mixed ? '' : String(field.value);
  const [ draft, setDraft ] = useState(shown);
  const [ touched, setTouched ] = useState(false);

  useEffect(() =>
  {
    setDraft(shown);
    setTouched(false);
  }, [ shown ]);

  /**
   * Hands on what was typed, when anything was.
   */
  const commit = () =>
  {
    if (touched && draft !== shown)
    {
      onChange(draft);
    }

    setTouched(false);
  };

  return (
    <TextField
      label={field.label}
      value={draft}
      size={'small'}
      fullWidth
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      placeholder={field.mixed ? MIXED : undefined}
      helperText={field.hint}
      slotProps={raisedWhenMixed(field.mixed)}
      onChange={event =>
      {
        setDraft(event.target.value);
        setTouched(true);
      }}
      onBlur={commit}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          setDraft(shown);
          setTouched(false);
          return;
        }

        if (event.key === 'Enter' && (multiline === false || event.ctrlKey || event.metaKey))
        {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
};

/**
 * A whole-number box committed like {@link TextControl}. A number outside its bounds is refused: the box says so,
 * and leaving it puts back the value.
 * @param {ControlProps & { limits: NumberLimits }} props The field and its bounds.
 * @returns {React.JSX.Element} The box.
 */
const NumberControl = (props: ControlProps & { limits: NumberLimits }) =>
{
  const { field, onChange, limits } = props;
  const shown = field.mixed ? '' : String(field.value);
  const [ draft, setDraft ] = useState(shown);
  const parsed = parseWholeNumber(draft, limits);
  const refused = draft !== shown && parsed === null;

  useEffect(() =>
  {
    setDraft(shown);
  }, [ shown ]);

  /**
   * Hands on an allowed number that differs from the value, and puts back the value otherwise.
   */
  const commit = () =>
  {
    if (draft === shown)
    {
      return;
    }

    if (parsed === null)
    {
      setDraft(shown);
      return;
    }

    onChange(parsed);
  };

  return (
    <TextField
      label={field.label}
      value={draft}
      size={'small'}
      placeholder={field.mixed ? MIXED : undefined}
      error={refused}
      helperText={refused ? `${limits.min} to ${limits.max}` : undefined}
      slotProps={{ ...raisedWhenMixed(field.mixed), htmlInput: { inputMode: 'numeric' } }}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          setDraft(shown);
          return;
        }

        if (event.key === 'Enter')
        {
          commit();
        }
      }}
      sx={{ width: 110 }}
    />
  );
};

/**
 * A drop-down committed as soon as a choice is made. A value none of the choices names is still shown, as itself.
 * @param {ControlProps & { options: readonly QuickOption[] }} props The field and its choices.
 * @returns {React.JSX.Element} The drop-down.
 */
const SelectControl = (props: ControlProps & { options: readonly QuickOption[] }) =>
{
  const { field, onChange, options } = props;
  const known = field.mixed || options.some(option => option.value === field.value);
  const shown = known ? options : [ ...options, { value: field.value as number, label: String(field.value) } ];

  /**
   * Says what a stored choice reads as, or that the events differ.
   * @param {unknown} selected The choice's value, as the drop-down holds it.
   * @returns {string} The words.
   */
  const renderValue = (selected: unknown): string =>
  {
    const picked = shown.find(option => String(option.value) === selected);
    return picked === undefined
      ? MIXED
      : picked.label;
  };

  return (
    <TextField
      select
      label={field.label}
      value={field.mixed ? '' : String(field.value)}
      size={'small'}
      sx={{ minWidth: 150 }}
      slotProps={{ ...raisedWhenMixed(field.mixed), select: { displayEmpty: true, renderValue } }}
      onChange={event => onChange(Number(event.target.value))}
    >
      {shown.map(option => (
        <MenuItem key={option.value} value={String(option.value)}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
};

/**
 * Picks an item, weapon or armor by name, or types its id before the names arrive. An id the database lacks is
 * still shown and kept.
 * @param {ControlProps & { list: 'item' | 'weapon' | 'armor' }} props The field and the table it picks from.
 * @returns {React.JSX.Element} The picker.
 */
const RowControl = (props: ControlProps & { list: 'item' | 'weapon' | 'armor' }) =>
{
  const { field, resources, onChange, list } = props;
  const rows = namedRows(resources.names, list);
  if (rows.length === 0)
  {
    return <NumberControl field={field} resources={resources} onChange={onChange} limits={{ min: 1, max: 9999 }}/>;
  }

  const value = field.mixed
    ? null
    : rows.find(row => row.id === field.value) ?? { id: field.value as number, name: '' };
  const options = value === null || rows.some(row => row.id === value.id) ? rows : [ value, ...rows ];

  return (
    <Autocomplete<NamedRow>
      size={'small'}
      sx={{ width: 250 }}
      options={options}
      value={value}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={row => `${row.id} ${row.name}`.trim()}
      onChange={(_event, picked) =>
      {
        if (picked !== null)
        {
          onChange(picked.id);
        }
      }}
      renderInput={params => <TextField {...params} label={field.label} placeholder={field.mixed ? MIXED : undefined} slotProps={raisedWhenMixed(field.mixed)}/>}
    />
  );
};

/**
 * Picks a map from the map tree, listed as the tree shows it, or types its id before the tree arrives.
 * @param {ControlProps} props The field.
 * @returns {React.JSX.Element} The picker.
 */
const MapControl = (props: ControlProps) =>
{
  const { field, resources, onChange } = props;
  const maps = resources.mapRows === null ? [] : mapOptions(resources.mapRows);
  if (maps.length === 0)
  {
    return <NumberControl field={field} resources={resources} onChange={onChange} limits={{ min: 1, max: 9999 }}/>;
  }

  const value = field.mixed
    ? null
    : maps.find(map => map.id === field.value) ?? { id: field.value as number, name: '', depth: 0 };
  const options = value === null || maps.some(map => map.id === value.id) ? maps : [ value, ...maps ];

  return (
    <Autocomplete<MapOption>
      size={'small'}
      sx={{ width: 280 }}
      options={options}
      value={value}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={map => mapLabel(map.id, map.name)}
      renderOption={(optionProps, map) =>
      {
        const { key, ...rest } = optionProps;
        return (
          <Box component={'li'} key={key} {...rest} sx={{ pl: `${16 + map.depth * 14}px !important` }}>
            {mapLabel(map.id, map.name)}
          </Box>
        );
      }}
      onChange={(_event, picked) =>
      {
        if (picked !== null)
        {
          onChange(picked.id);
        }
      }}
      renderInput={params => <TextField {...params} label={field.label} placeholder={field.mixed ? MIXED : undefined} slotProps={raisedWhenMixed(field.mixed)}/>}
    />
  );
};

/**
 * Shows the frame a page's picture draws, cut from its sheet the way the engine cuts it, shrunk to fit.
 * @param {{ api: MapEditorApi | null, image: RmmzEventImage | undefined }} props The server and the picture.
 * @returns {React.JSX.Element} The preview.
 */
const GraphicPreview = (props: { api: MapEditorApi | null; image: RmmzEventImage | undefined }) =>
{
  const { api, image } = props;
  const url = api === null || image === undefined || image.tileId > 0 || image.characterName === ''
    ? null
    : api.imageUrl('characters', image.characterName);
  const [ sheet, setSheet ] = useState<{ url: string; width: number; height: number } | null>(null);

  // the sheet's size decides how its frames are cut, so it is read before anything is drawn.
  useEffect(() =>
  {
    if (url === null)
    {
      return undefined;
    }

    let live = true;
    const loader = new Image();
    loader.onload = () =>
    {
      if (live)
      {
        setSheet({ url, width: loader.naturalWidth, height: loader.naturalHeight });
      }
    };
    loader.src = url;
    return () =>
    {
      live = false;
    };
  }, [ url ]);

  const loaded = sheet !== null && sheet.url === url ? sheet : null;
  const frame = image === undefined || loaded === null ? null : eventFrame(image, loaded, TILE_SIZE);
  const box = { width: PREVIEW_SIZE, height: PREVIEW_SIZE, flexShrink: 0, display: 'grid', placeItems: 'center', border: 1, borderColor: 'divider', borderRadius: 1 };
  if (url === null || loaded === null || frame === null)
  {
    return <Box sx={box} data-testid={'graphic-preview'}/>;
  }

  const scale = Math.min(1, PREVIEW_SIZE / Math.max(frame.width, frame.height));
  return (
    <Box sx={box} data-testid={'graphic-preview'}>
      <Box sx={{
        width: frame.width * scale,
        height: frame.height * scale,
        backgroundImage: `url("${url}")`,
        backgroundPosition: `-${frame.sx * scale}px -${frame.sy * scale}px`,
        backgroundSize: `${loaded.width * scale}px ${loaded.height * scale}px`,
        imageRendering: 'pixelated',
      }}/>
    </Box>
  );
};

/**
 * The eight characters of a normal sheet, four across and two down.
 */
const CHARACTER_OPTIONS: readonly QuickOption[] = Array.from({ length: 8 }, (_, index) => ({ value: index, label: `Character ${index + 1}` }));

/**
 * Picks a page's picture: a character sheet, and which of its eight characters unless the sheet holds one alone,
 * with a preview of the frame it draws. A tile picture reads as such, and picking a sheet replaces it.
 * @param {ControlProps} props The field.
 * @returns {React.JSX.Element} The picker.
 */
const GraphicControl = (props: ControlProps) =>
{
  const { field, resources, onChange } = props;
  const value = field.mixed ? null : field.value as GraphicValue;
  const listed = resources.sheets ?? [];
  const current = value === null || value.tileId > 0 ? null : value.characterName;
  const sheets = current === null || current === '' || listed.includes(current) ? [ '', ...listed ] : [ '', current, ...listed ];
  const single = value !== null && sheetKind(value.characterName).big;

  /**
   * Picks a sheet, keeping the character where the new sheet has eight.
   * @param {string} name The sheet, or empty for no picture.
   */
  const pickSheet = (name: string) =>
  {
    const keeps = name !== '' && sheetKind(name).big === false;
    onChange({ characterName: name, characterIndex: keeps ? value?.characterIndex ?? 0 : 0, tileId: 0 });
  };

  const placeholder = value !== null && value.tileId > 0 ? `Tile ${value.tileId}` : MIXED;
  return (
    <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ width: '100%' }}>
      <GraphicPreview api={resources.api} image={field.mixed ? undefined : field.preview}/>
      <Autocomplete<string, false, true>
        size={'small'}
        sx={{ flex: 1, minWidth: 160 }}
        options={sheets}
        value={current ?? undefined}
        disableClearable
        getOptionLabel={name => (name === '' ? '(None)' : name)}
        onChange={(_event, picked) => pickSheet(picked)}
        renderInput={params => <TextField {...params} label={field.label} placeholder={current === null ? placeholder : undefined} slotProps={raisedWhenMixed(current === null)}/>}
      />
      {value !== null && value.characterName !== '' && value.tileId === 0 && single === false && (
        <TextField
          select
          label={'Character'}
          value={String(value.characterIndex)}
          size={'small'}
          sx={{ width: 140 }}
          onChange={event => onChange({ ...value, characterIndex: Number(event.target.value) })}
        >
          {CHARACTER_OPTIONS.map(option => (
            <MenuItem key={option.value} value={String(option.value)}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Stack>
  );
};

/**
 * Shows the control a field asks for.
 * @param {ControlProps} props The field, what it reads besides, and what to do with a new value.
 * @returns {React.JSX.Element} The control.
 */
const QuickControl = (props: ControlProps) =>
{
  const { field } = props;
  const { control } = field;
  switch (control.kind)
  {
    case 'number':
      return <NumberControl {...props} limits={{ min: control.min, max: control.max }}/>;
    case 'select':
      return <SelectControl {...props} options={control.options}/>;
    case 'text':
      return <TextControl {...props} multiline={control.multiline}/>;
    case 'row':
      return <RowControl {...props} list={control.list}/>;
    case 'map':
      return <MapControl {...props}/>;
    case 'graphic':
      return <GraphicControl {...props}/>;
  }
};

/**
 * Reports whether a field's control takes a whole row to itself.
 * @param {SharedField} field The field.
 * @returns {boolean} True for text over several lines and pictures.
 */
const takesWholeRow = (field: SharedField): boolean =>
{
  return field.control.kind === 'graphic' || (field.control.kind === 'text' && field.control.multiline);
};

export { GraphicPreview, MIXED, QuickControl, takesWholeRow };
export type { ControlProps };
