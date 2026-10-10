import React, { useEffect, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import { namedRows, type NamedRow } from '../../core/commandList/databaseNames.ts';
import { mapLabel, mapOptions, type MapOption } from '../../core/commands/editors/mapOptions.ts';
import type {
  ColorControl as ColorSpec,
  GraphicValue,
  QuickOption,
  SharedField,
  SliderControl as SliderSpec,
} from '../../core/eventKinds/quickFields.ts';
import type { MapLocation } from '../../core/locations/LocationPicks.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { RmmzEventImage } from '../../core/model/rmmzTypes.ts';
import { parseDecimal, parseWholeNumber, type NumberLimits } from '../../core/properties/propertyInputs.ts';
import { eventFrame, sheetKind } from '../../render/engine/characterFrames.ts';
import { PickOnMapButton } from '../locationPicker/PickOnMapButton.tsx';
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
 * Where the colour picker starts for events holding different colours, which have no one colour to start from.
 */
const MIXED_COLOR_START = '#808080';

/**
 * What every control is handed: its shared field, what it reads besides, what to do with a new value, and what to do
 * with a value still being chosen.
 */
type ControlProps = {
  readonly field: SharedField;
  readonly resources: QuickResources;
  readonly onChange: (value: JsonValue) => void;

  /**
   * Shows a value while it is still being chosen, such as a slider mid-drag, without making it a change of its own:
   * the next call to {@link onChange} ends it, with the value chosen.
   */
  readonly onPreview: (value: JsonValue) => void;
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
 * A drop-down committed as soon as a choice is made, handing on the choice's own value, a number or a name. A value none
 * of the choices names is still shown, as itself, and the field's hint, such as what the choice does, sits under it.
 * It always shows words, a choice named by nothing included, so its label always sits raised above them.
 * @param {ControlProps & { options: readonly QuickOption[] }} props The field and its choices.
 * @returns {React.JSX.Element} The drop-down.
 */
const SelectControl = (props: ControlProps & { options: readonly QuickOption[] }) =>
{
  const { field, onChange, options } = props;
  const known = field.mixed || options.some(option => option.value === field.value);
  const shown = known ? options : [ ...options, { value: field.value as number | string, label: String(field.value) } ];

  /**
   * Says what a stored choice reads as, or that the events differ, whatever the choices hold: a choice named by an empty
   * value must never read as events that differ, nor they as it.
   * @param {unknown} selected The choice's value, as the drop-down holds it.
   * @returns {string} The words.
   */
  const renderValue = (selected: unknown): string =>
  {
    const picked = shown.find(option => String(option.value) === selected);
    return field.mixed || picked === undefined
      ? MIXED
      : picked.label;
  };

  /**
   * Finds the choice the drop-down hands back by its text, so a name stays a name and a number a number.
   * @param {string} selected The choice's value, as the drop-down holds it.
   * @returns {number | string} The choice's own value.
   */
  const valueOf = (selected: string): number | string =>
  {
    // every item the drop-down offers is one of the choices shown, so the one picked is always among them.
    return (shown.find(option => String(option.value) === selected) as QuickOption).value;
  };

  return (
    <TextField
      select
      label={field.label}
      value={field.mixed ? '' : String(field.value)}
      size={'small'}
      sx={{ minWidth: 150 }}
      helperText={field.hint}
      slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue } }}
      onChange={event => onChange(valueOf(event.target.value))}
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
 * Shows a line of small print under a control, such as what a setting is or that its value is a default.
 * @param {{ line: string | undefined }} props The line, or undefined for none.
 * @returns {React.JSX.Element | null} The line, or nothing.
 */
const SmallPrint = (props: { line: string | undefined }) =>
{
  if (props.line === undefined)
  {
    return null;
  }

  return (
    <Typography variant={'caption'} color={'text.secondary'} component={'div'}>
      {props.line}
    </Typography>
  );
};

/**
 * A number dragged along a track or typed into the box beside it. Dragging shows each value on the map as it goes, and
 * hands on the value it is let go at, as one change; a press that moves nothing hands on nothing. The box commits like
 * {@link NumberControl}, taking fractions to the places the field allows and refusing a number outside its limits. A
 * value past either end of the track still shows in the box, with the track's thumb held at that end. Events holding
 * different values show the box empty, reading "Mixed", and the thumb at the track's start.
 * @param {ControlProps & { control: SliderSpec }} props The field and how it is dragged and typed.
 * @returns {React.JSX.Element} The control.
 */
const SliderControl = (props: ControlProps & { control: SliderSpec }) =>
{
  const { field, onChange, onPreview, control } = props;
  const { min, max, places, track, step, unit, ends, about } = control;
  const [ from, to ] = track;
  const shown = field.mixed ? '' : String(field.value);
  const [ draft, setDraft ] = useState(shown);
  const moved = useRef(false);
  const parsed = parseDecimal(draft, { min, max, places });
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

  const thumb = field.mixed
    ? from
    : Math.min(Math.max(field.value as number, from), to);
  const adornment = unit === ''
    ? undefined
    : { endAdornment: <InputAdornment position={'end'}>{unit}</InputAdornment> };

  return (
    <Box sx={{ width: '100%' }}>
      <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
        <TextField
          label={field.label}
          value={draft}
          size={'small'}
          placeholder={field.mixed ? MIXED : undefined}
          error={refused}
          helperText={refused ? `${min} to ${max}` : undefined}
          slotProps={{ ...raisedWhenMixed(field.mixed), htmlInput: { inputMode: 'decimal' }, input: adornment }}
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
          sx={{ width: 130, flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
          <Slider
            size={'small'}
            value={thumb}
            min={from}
            max={to}
            step={step}
            aria-label={field.label}
            onChange={(_event, value) =>
            {
              moved.current = true;
              onPreview(value as number);
            }}
            onChangeCommitted={(_event, value) =>
            {
              // a press that moved nothing hands on nothing, whatever value the slider last moved to before it.
              if (moved.current)
              {
                moved.current = false;
                onChange(value as number);
              }
            }}
          />
          {ends !== undefined && (
            <Stack direction={'row'} justifyContent={'space-between'} sx={{ mt: -1 }}>
              <Typography variant={'caption'} color={'text.secondary'}>
                {ends[0]}
              </Typography>
              <Typography variant={'caption'} color={'text.secondary'}>
                {ends[1]}
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>
      <SmallPrint line={about}/>
      <SmallPrint line={field.hint}/>
    </Box>
  );
};

/**
 * Hands on the colour a picker settled on, once, when it was picking: what ends its choosing, whether it closes on a
 * colour or is left, hands on whatever it shows, and a picker that showed nothing new hands on nothing.
 * @param {HTMLInputElement} picker The colour picker.
 * @param {React.RefObject<boolean>} picking Whether it has shown a colour since it last handed one on.
 * @param {(value: JsonValue) => void} onChange What to hand the colour to.
 */
const settlePicked = (picker: HTMLInputElement, picking: React.RefObject<boolean>, onChange: (value: JsonValue) => void): void =>
{
  if (picking.current)
  {
    picking.current = false;
    onChange(picker.value);
  }
};

/**
 * Picks a colour: the system's colour picker behind a swatch of the colour as it is, its digits beside it, then the
 * swatches the kind offers. The picker shows each colour on the map as it is chosen, and hands on the colour it settles
 * on as one change, when it closes on a new one or is left; a picker opened and closed untouched hands on nothing. A
 * swatch hands on its colour at once, and the swatch of the colour the events hold is ringed. Events holding different
 * colours read "Mixed". A colour that may be unset has a button that hands on an empty value at once.
 * @param {ControlProps & { control: ColorSpec }} props The field, and whether its colour may be unset.
 * @returns {React.JSX.Element} The control.
 */
const ColorControl = (props: ControlProps & { control: ColorSpec }) =>
{
  const { field, resources, onChange, onPreview, control } = props;
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const picking = useRef(false);
  const value = field.mixed ? null : field.value as string;

  // the listener below outlives a render, so it hands on through whichever handler the latest render was given.
  const latest = useRef(onChange);
  latest.current = onChange;

  // React hears a colour input change with each colour it passes through; the colour it closes on comes as the input's
  // own change event, which only a listener on the input itself hears.
  useEffect(() =>
  {
    const picker = pickerRef.current as HTMLInputElement;
    const closed = () => settlePicked(picker, picking, latest.current);
    picker.addEventListener('change', closed);
    return () => picker.removeEventListener('change', closed);
  }, []);

  return (
    <Box>
      <Typography variant={'caption'} color={'text.secondary'} component={'div'}>
        {field.label}
      </Typography>
      <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        <Box
          component={'input'}
          type={'color'}
          ref={pickerRef}
          aria-label={field.label}
          value={value ?? MIXED_COLOR_START}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          {
            picking.current = true;
            onPreview(event.target.value);
          }}
          onBlur={(event: React.FocusEvent<HTMLInputElement>) => settlePicked(event.currentTarget, picking, onChange)}
          sx={{ width: 44, height: 30, p: 0, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'transparent', cursor: 'pointer' }}
        />
        <Typography variant={'body2'} sx={{ fontFamily: 'monospace', minWidth: 64 }}>
          {value ?? MIXED}
        </Typography>
        {resources.swatches.map(swatch => (
          <ButtonBase
            key={swatch}
            title={swatch}
            aria-label={swatch}
            onClick={() => onChange(swatch)}
            sx={{ width: 20, height: 20, borderRadius: 0.5, bgcolor: swatch, border: 2, borderColor: swatch === value ? 'text.primary' : 'divider' }}
          />
        ))}
        {control.clear !== undefined && (
          <Button size={'small'} onClick={() => onChange('')}>
            {control.clear}
          </Button>
        )}
      </Stack>
      <SmallPrint line={field.hint}/>
    </Box>
  );
};

/**
 * A tick box, committed as soon as it is clicked, with the field's hint under it. Events holding it differently show it
 * half ticked, and a click ticks it for all of them.
 * @param {ControlProps} props The field.
 * @returns {React.JSX.Element} The tick box.
 */
const CheckControl = (props: ControlProps) =>
{
  const { field, onChange } = props;
  return (
    <Box>
      <FormControlLabel
        control={<Checkbox size={'small'} checked={field.value === true} indeterminate={field.mixed} onChange={event => onChange(event.target.checked)}/>}
        label={<Typography variant={'body2'}>{field.label}</Typography>}
      />
      <SmallPrint line={field.hint}/>
    </Box>
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
    return <NumberControl {...props} limits={{ min: 1, max: 9999 }}/>;
  }

  const value = field.mixed
    ? null
    : rows.find(row => row.id === field.value) ?? { id: field.value as number, name: '' };
  const options = value === null || rows.some(row => row.id === value.id) ? rows : [ value, ...rows ];

  // a mixed field holds no row, which the picker shows as an empty box reading "Mixed"; there is nothing to clear.
  return (
    <Autocomplete<NamedRow, false, true>
      size={'small'}
      sx={{ width: 250 }}
      disableClearable
      options={options}
      value={value as NamedRow}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={row => `${row.id} ${row.name}`.trim()}
      onChange={(_event, picked) => onChange(picked.id)}
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
    return <NumberControl {...props} limits={{ min: 1, max: 9999 }}/>;
  }

  const value = field.mixed
    ? null
    : maps.find(map => map.id === field.value) ?? { id: field.value as number, name: '', depth: 0 };
  const options = value === null || maps.some(map => map.id === value.id) ? maps : [ value, ...maps ];

  return (
    <Autocomplete<MapOption, false, true>
      size={'small'}
      sx={{ width: 280 }}
      disableClearable
      options={options}
      value={value as MapOption}
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
      onChange={(_event, picked) => onChange(picked.id)}
      renderInput={params => <TextField {...params} label={field.label} placeholder={field.mixed ? MIXED : undefined} slotProps={raisedWhenMixed(field.mixed)}/>}
    />
  );
};

/**
 * Picks a map and a tile together by clicking the tile on the map, starting from the place the field holds. Several
 * events going to different places have no one place to start from, so the button waits until they agree; without a
 * server there are no maps to pick from, so there is no button at all. A place where the player lands has the picker
 * refuse the tiles the player cannot stand on.
 * @param {ControlProps & { landing: boolean }} props The field, and whether the player lands on the place.
 * @returns {React.JSX.Element | null} The button, or nothing without a server.
 */
const PlaceControl = (props: ControlProps & { readonly landing: boolean }) =>
{
  const { field, resources, landing, onChange } = props;
  if (resources.api === null)
  {
    return null;
  }

  // a field the selected events hold differently holds no place, which leaves the button waiting.
  return (
    <Box sx={{ minHeight: 40, display: 'flex', alignItems: 'center' }}>
      <PickOnMapButton
        start={field.value as unknown as MapLocation | null}
        landing={landing}
        onPick={location => onChange(location as unknown as JsonValue)}
      />
    </Box>
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

  // the frame's numbers change with every picture, so they go inline rather than into a style class each.
  const scale = Math.min(1, PREVIEW_SIZE / Math.max(frame.width, frame.height));
  return (
    <Box sx={box} data-testid={'graphic-preview'}>
      <Box
        sx={{ imageRendering: 'pixelated' }}
        style={{
          width: `${frame.width * scale}px`,
          height: `${frame.height * scale}px`,
          backgroundImage: `url("${url}")`,
          backgroundPosition: `-${frame.sx * scale}px -${frame.sy * scale}px`,
          backgroundSize: `${loaded.width * scale}px ${loaded.height * scale}px`,
        }}
      />
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
        value={current as string}
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
    case 'place':
      return <PlaceControl {...props} landing={control.landing}/>;
    case 'slider':
      return <SliderControl {...props} control={control}/>;
    case 'color':
      return <ColorControl {...props} control={control}/>;
    case 'check':
      return <CheckControl {...props}/>;
  }
};

/**
 * Reports whether a field's control takes a whole row to itself.
 * @param {SharedField} field The field.
 * @returns {boolean} True for text over several lines, pictures, sliders and colours.
 */
const takesWholeRow = (field: SharedField): boolean =>
{
  const { control } = field;
  return [ 'graphic', 'slider', 'color' ].includes(control.kind) || (control.kind === 'text' && control.multiline);
};

export { GraphicPreview, MIXED, QuickControl, takesWholeRow };
export type { ControlProps };
