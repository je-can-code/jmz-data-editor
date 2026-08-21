import React, { type ChangeEvent, type ReactNode, useCallback, useMemo, useState, } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowDownward, ArrowUpward, DeleteOutline, Percent, } from '@mui/icons-material';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import {
  buildBparamAutocompleteOptions,
  catalogRowForEffectCode,
  defaultUsableEffectForCode,
  RMMZ_SPECIAL_EFFECT_ESCAPE,
  RMMZ_USABLE_EFFECT_OPTIONS,
  type RmmzUsableEffectCatalogOption,
} from '@core/enums/RmmzUsableEffectCatalog.ts';

type IdLabelRow = {
  id: number;
  label: string;
};

type ForeignEffectTypeOption = {
  code: number;
  label: string;
  optionKey: string;
  isForeign: true;
};

type UsableEffectTypeOption = RmmzUsableEffectCatalogOption | ForeignEffectTypeOption;

type UsableEffectsEditorProps = {
  value: Rmmz.Data.RPG_UsableEffect[];
  onChange: (next: Rmmz.Data.RPG_UsableEffect[]) => void;
  stateRows: IdLabelRow[];
  skillRows: IdLabelRow[];
  commonEventRows: IdLabelRow[];
};

const SPECIAL_EFFECT_ROWS: IdLabelRow[] = [
  {
    id: RMMZ_SPECIAL_EFFECT_ESCAPE,
    label: `${RMMZ_SPECIAL_EFFECT_ESCAPE}: Escape`,
  },
];

/**
 * Grid: order | type | parameters | delete.
 * Type uses a fixed px track so Autocomplete never expands {@code max-content} to the full viewport.
 * Type column is compact; parameters use {@code 1fr} for the remainder of the row.
 */
const USABLE_EFFECTS_TYPE_COL_PX = 232;
const USABLE_EFFECTS_GRID_TEMPLATE =
  `88px ${USABLE_EFFECTS_TYPE_COL_PX}px minmax(0, 1fr) 52px`;

/** Uniform {@link NumberInputWithLabel} control width in this editor (label length does not change it). */
const USABLE_EFFECTS_NUMBER_INPUT_PX = 128;

/**
 * Gap between stacked parameter lines (picker ↔ knobs, % max ↔ + flat); keep tight so rows match real “2 lines” height.
 */
const USABLE_EFFECTS_STACKED_PARAMETER_SPACING = 1;

function wrapUsableEffectParameters(content: ReactNode): ReactNode
{
  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minWidth: 0,
        width: '100%',
      }}
    >
      {content}
    </Box>
  );
}

function clampFinite(
  n: number,
  lo: number,
  hi: number
): number
{
  if (!Number.isFinite(n))
  {
    return lo;
  }
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Editor percent −100…+100 ↔ stored {@code value1} fraction for recover HP/MP (MZ: {@code mhp * value1 + value2}).
 */
function recoverPercentFromStored(stored: number): number
{
  if (!Number.isFinite(stored))
  {
    return 0;
  }
  return clampFinite(Math.round(stored * 100), -100, 100);
}

/**
 * Editor whole percent 0–100 ↔ stored probability for add/remove state ({@code Math.random() < value1} in MZ).
 */
function stateChancePercentFromStored(stored: number): number
{
  if (!Number.isFinite(stored))
  {
    return 0;
  }
  return clampFinite(Math.round(stored * 100), 0, 100);
}

function isForeignEffectOption(opt: UsableEffectTypeOption): opt is ForeignEffectTypeOption
{
  return 'isForeign' in opt && opt.isForeign === true;
}

function optionForEffect(effect: Rmmz.Data.RPG_UsableEffect): UsableEffectTypeOption
{
  const hit = RMMZ_USABLE_EFFECT_OPTIONS.find((o) => o.code === effect.code);
  if (hit)
  {
    return hit;
  }
  return {
    code: effect.code,
    label: `Non-vanilla (code ${effect.code})`,
    optionKey: `foreign-${effect.code}`,
    isForeign: true,
  };
}

function replaceAt(
  list: Rmmz.Data.RPG_UsableEffect[],
  index: number,
  row: Rmmz.Data.RPG_UsableEffect
): Rmmz.Data.RPG_UsableEffect[]
{
  return list.map((
    item,
    i
  ) =>
  {
    if (i !== index)
    {
      return item;
    }
    return {
      ...row,
    };
  });
}

/**
 * Dense table editor for vanilla {@link Rmmz.Data.RPG_UsableEffect} lists (skills / items).
 */
function UsableEffectsEditor(props: UsableEffectsEditorProps)
{
  const {
    value,
    onChange,
    stateRows,
    skillRows,
    commonEventRows,
  } = props;

  const bparamRows = useMemo(() => buildBparamAutocompleteOptions(), []);

  const [ addMenuAnchor, setAddMenuAnchor ] = useState<null | HTMLElement>(null);

  const handleAddOpen = (event: React.MouseEvent<HTMLButtonElement>) =>
  {
    setAddMenuAnchor(event.currentTarget);
  };

  const handleAddClose = () =>
  {
    setAddMenuAnchor(null);
  };

  const handleAddPick = (code: number) =>
  {
    const row = defaultUsableEffectForCode(code);
    onChange([ ...value, row ]);
    handleAddClose();
  };

  const handleMove = (
    index: number,
    delta: number
  ) =>
  {
    const j = index + delta;
    if (j < 0 || j >= value.length)
    {
      return;
    }
    const next = value.slice();
    const tmp = next[ index ]!;
    next[ index ] = next[ j ]!;
    next[ j ] = tmp;
    onChange(next);
  };

  const handleRemove = (index: number) =>
  {
    onChange(value.filter((
      _,
      i
    ) => i !== index));
  };

  const handleTypeChange = (
    index: number,
    opt: UsableEffectTypeOption | null
  ) =>
  {
    if (opt === null)
    {
      return;
    }
    if (isForeignEffectOption(opt))
    {
      return;
    }
    onChange(replaceAt(value, index, defaultUsableEffectForCode(opt.code)));
  };

  const patchRow = useCallback(
    (
      index: number,
      patch: Partial<Rmmz.Data.RPG_UsableEffect>
    ) =>
    {
      const cur = value[ index ];
      if (!cur)
      {
        return;
      }
      onChange(replaceAt(value, index, {
        ...cur,
        ...patch,
      }));
    },
    [ onChange, value ]
  );

  const renderValueFields = (
    index: number,
    effect: Rmmz.Data.RPG_UsableEffect,
    catalog: ReturnType<typeof catalogRowForEffectCode>
  ) =>
  {
    if (catalog === null)
    {
      return wrapUsableEffectParameters(
        (
          <Stack direction={'row'} spacing={1} useFlexGap sx={{
            flexWrap: 'wrap',
            alignItems: 'center'
          }}>
            <NumberInputWithLabel
              label={'Code'}
              variant={'outlined'}
              size={'small'}
              value={effect.code}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{ step: 1 }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const n = Number(e.target.value);
                patchRow(index, {
                  code: Number.isFinite(n)
                    ? Math.trunc(n)
                    : effect.code,
                });
              }}
            />
            <NumberInputWithLabel
              label={'dataId'}
              variant={'outlined'}
              size={'small'}
              value={effect.dataId}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{ step: 1 }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const n = Number(e.target.value);
                patchRow(index, {
                  dataId: Number.isFinite(n)
                    ? Math.trunc(n)
                    : effect.dataId,
                });
              }}
            />
            <NumberInputWithLabel
              label={'value1'}
              variant={'outlined'}
              size={'small'}
              value={effect.value1}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{ step: 1 }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const n = Number(e.target.value);
                patchRow(index, {
                  value1: Number.isFinite(n)
                    ? n
                    : effect.value1,
                });
              }}
            />
            <NumberInputWithLabel
              label={'value2'}
              variant={'outlined'}
              size={'small'}
              value={effect.value2}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{ step: 1 }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const n = Number(e.target.value);
                patchRow(index, {
                  value2: Number.isFinite(n)
                    ? n
                    : effect.value2,
                });
              }}
            />
          </Stack>
        ),
      );
    }

    const dataCell = () =>
    {
      switch (catalog.dataId)
      {
        case 'none':
          return null;
        case 'state_add':
        case 'state_remove':
          return (
            <Autocomplete
              fullWidth
              size={'small'}
              sx={{ minWidth: 0 }}
              options={stateRows}
              value={
                stateRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}: (unset)`,
                }
              }
              onChange={(
                _e,
                opt
              ) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  margin={'dense'}
                  label={'dataId'}
                  placeholder={'State'}
                />
              )}
            />
          );
        case 'param':
          return (
            <Autocomplete
              fullWidth
              size={'small'}
              sx={{ minWidth: 0 }}
              options={bparamRows}
              value={
                bparamRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}`,
                }
              }
              onChange={(
                _e,
                opt
              ) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  margin={'dense'}
                  label={'dataId'}
                  placeholder={'Param'}
                />
              )}
            />
          );
        case 'special':
          return (
            <Autocomplete
              fullWidth
              size={'small'}
              sx={{ minWidth: 0 }}
              options={SPECIAL_EFFECT_ROWS}
              value={
                SPECIAL_EFFECT_ROWS.find((r) => r.id === effect.dataId) ?? SPECIAL_EFFECT_ROWS[ 0 ]
              }
              onChange={(
                _e,
                opt
              ) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  margin={'dense'}
                  label={'dataId'}
                />
              )}
            />
          );
        case 'skill':
          return (
            <Autocomplete
              fullWidth
              size={'small'}
              sx={{ minWidth: 0 }}
              options={skillRows}
              value={
                skillRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}: (unset)`,
                }
              }
              onChange={(
                _e,
                opt
              ) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  margin={'dense'}
                  label={'dataId'}
                  placeholder={'Skill'}
                />
              )}
            />
          );
        case 'common_event':
          return (
            <Autocomplete
              fullWidth
              size={'small'}
              sx={{ minWidth: 0 }}
              options={commonEventRows}
              value={
                commonEventRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}: (unset)`,
                }
              }
              onChange={(
                _e,
                opt
              ) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  margin={'dense'}
                  label={'dataId'}
                  placeholder={'Common event'}
                />
              )}
            />
          );
        default:
          return null;
      }
    };

    const v1 = () =>
    {
      switch (catalog.value1)
      {
        case 'recover_fraction':
          return (
            <NumberInputWithLabel
              label={'% max'}
              variant={'outlined'}
              size={'small'}
              value={recoverPercentFromStored(effect.value1)}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{
                min: -100,
                max: 100,
                step: 1,
              }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(raw, -100, 100) / 100,
                });
              }}
            />
          );
        case 'tp_amount':
          return (
            <NumberInputWithLabel
              label={'TP amount'}
              variant={'outlined'}
              size={'small'}
              value={clampFinite(Math.trunc(effect.value1), -9999, 9999)}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{
                min: -9999,
                max: 9999,
                step: 1,
              }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), -9999, 9999),
                });
              }}
            />
          );
        case 'state_chance':
          return (
            <NumberInputWithLabel
              label={'Chance'}
              variant={'outlined'}
              size={'small'}
              value={stateChancePercentFromStored(effect.value1)}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{
                min: 0,
                max: 100,
                step: 1,
              }}
              endAdornment={<Percent/>}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), 0, 100) / 100,
                });
              }}
            />
          );
        case 'buff_turns':
        case 'debuff_turns':
          return (
            <NumberInputWithLabel
              label={'Turns'}
              variant={'outlined'}
              size={'small'}
              value={clampFinite(Math.trunc(effect.value1), 0, 9999)}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{
                min: 0,
                max: 9999,
                step: 1,
              }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), 0, 9999),
                });
              }}
            />
          );
        case 'grow_delta':
          return (
            <NumberInputWithLabel
              label={'Amount'}
              variant={'outlined'}
              size={'small'}
              value={Math.trunc(effect.value1)}
              sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
              htmlInput={{
                min: -999999,
                max: 999999,
                step: 1,
              }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), -999999, 999999),
                });
              }}
            />
          );
        case 'unused':
        default:
          return null;
      }
    };

    const v2 = () =>
    {
      if (catalog.value2 === 'recover_flat')
      {
        return (
          <NumberInputWithLabel
            label={'+ flat'}
            variant={'outlined'}
            size={'small'}
            value={clampFinite(Math.trunc(effect.value2), -999999, 999999)}
            sx={{ width: USABLE_EFFECTS_NUMBER_INPUT_PX }}
            htmlInput={{
              min: -999999,
              max: 999999,
              step: 1,
            }}
            onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw))
              {
                return;
              }
              patchRow(index, {
                value2: clampFinite(Math.trunc(raw), -999999, 999999),
              });
            }}
          />
        );
      }
      return null;
    };

    const dataEl = dataCell();
    const v1El = v1();
    const v2El = v2();

    const hasDataPicker = dataEl !== null;
    const hasNumericRow = v1El !== null || v2El !== null;

    const numericOnlyFormControlSx = {
      width: '100%',
      minWidth: 0,
      '& .MuiFormControlLabel-root': {
        marginLeft: 0,
        marginRight: 0,
      },
    };

    let inner: ReactNode;

    if (hasDataPicker && hasNumericRow)
    {
      inner = (
        <Stack
          spacing={USABLE_EFFECTS_STACKED_PARAMETER_SPACING}
          sx={{
            alignItems: 'stretch',
            minWidth: 0,
            width: '100%',
          }}
        >
          <Box sx={{
            width: '100%',
            minWidth: 0
          }}>{dataEl}</Box>
          <Box sx={numericOnlyFormControlSx}>
            <Stack
              direction={'row'}
              spacing={1}
              useFlexGap
              sx={{
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {v1El !== null && (
                <Box sx={{ flexShrink: 0 }}>{v1El}</Box>
              )}
              {v2El !== null && (
                <Box sx={{ flexShrink: 0 }}>{v2El}</Box>
              )}
            </Stack>
          </Box>
        </Stack>
      );
    }
    else if (!hasDataPicker && hasNumericRow)
    {
      if (v1El !== null && v2El !== null)
      {
        inner = (
          <Stack
            spacing={USABLE_EFFECTS_STACKED_PARAMETER_SPACING}
            sx={{
              alignItems: 'stretch',
              minWidth: 0,
              width: '100%',
            }}
          >
            <Box sx={numericOnlyFormControlSx}>{v1El}</Box>
            <Box sx={numericOnlyFormControlSx}>{v2El}</Box>
          </Stack>
        );
      }
      else if (v1El !== null)
      {
        inner = (
          <Box sx={numericOnlyFormControlSx}>{v1El}</Box>
        );
      }
      else
      {
        inner = (
          <Box sx={numericOnlyFormControlSx}>{v2El}</Box>
        );
      }
    }
    else
    {
      inner = (
        <Stack
          direction={'row'}
          spacing={1}
          useFlexGap
          sx={{
            flexWrap: 'wrap',
            alignItems: 'center',
            minWidth: 0,
            width: '100%',
          }}
        >
          {dataEl !== null && (
            <Box sx={{
              flex: '1 1 280px',
              minWidth: 200,
              maxWidth: '100%'
            }}>{dataEl}</Box>
          )}
          {v1El !== null && (
            <Box sx={{ flexShrink: 0 }}>{v1El}</Box>
          )}
          {v2El !== null && (
            <Box sx={{ flexShrink: 0 }}>{v2El}</Box>
          )}
        </Stack>
      );
    }

    return wrapUsableEffectParameters(inner);
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={'row'} alignItems={'center'} spacing={1}>
        <Button
          variant={'outlined'}
          size={'small'}
          onClick={handleAddOpen}
        >
          Add effect
        </Button>
        <Menu
          anchorEl={addMenuAnchor}
          open={addMenuAnchor !== null}
          onClose={handleAddClose}
          slotProps={{
            list: {
              dense: true,
              sx: { maxHeight: 360 },
            },
          }}
        >
          {RMMZ_USABLE_EFFECT_OPTIONS.map((opt) => (
            <MenuItem
              key={opt.optionKey}
              onClick={() =>
              {
                handleAddPick(opt.code);
              }}
            >
              <Stack spacing={0}>
                <Typography variant={'body2'}>{opt.label}</Typography>
                <Typography variant={'caption'} color={'text.secondary'}>
                  code {opt.code}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      {value.length === 0
        ? (
          <Typography variant={'body2'} color={'text.secondary'}>
            No effects. Use &quot;Add effect&quot; to append a row.
          </Typography>
        )
        : (
          <Box sx={{
            overflowX: 'auto',
            width: '100%'
          }}>
            <Stack spacing={0}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: USABLE_EFFECTS_GRID_TEMPLATE,
                  columnGap: 1.5,
                  alignItems: 'end',
                  pb: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  minWidth: 0,
                }}
              >
                <Typography variant={'caption'} fontWeight={600} color={'text.secondary'}>
                  Order
                </Typography>
                <Typography variant={'caption'} fontWeight={600} color={'text.secondary'}>
                  Type
                </Typography>
                <Typography
                  variant={'caption'}
                  fontWeight={600}
                  color={'text.secondary'}
                  sx={{ minWidth: 0 }}
                >
                  Parameters
                </Typography>
                <Box/>
              </Box>
              {value.map((
                effect,
                index
              ) =>
              {
                const catalog = catalogRowForEffectCode(effect.code);
                const typeOpt = optionForEffect(effect);
                return (
                  <Box
                    key={`${index}-${effect.code}-${effect.dataId}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: USABLE_EFFECTS_GRID_TEMPLATE,
                      columnGap: 1.5,
                      alignItems: 'center',
                      py: 0.5,
                      borderBottom: 1,
                      borderColor: 'divider',
                      minWidth: 0,
                      '&:last-of-type': {
                        borderBottom: 0,
                      },
                    }}
                  >
                    <Stack
                      direction={'row'}
                      spacing={0}
                      sx={{
                        justifyContent: 'center',
                      }}
                    >
                      <Tooltip title={'Move up'}>
                        <span>
                          <IconButton
                            size={'small'}
                            disabled={index === 0}
                            onClick={() =>
                            {
                              handleMove(index, -1);
                            }}
                          >
                            <ArrowUpward fontSize={'inherit'}/>
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={'Move down'}>
                        <span>
                          <IconButton
                            size={'small'}
                            disabled={index >= value.length - 1}
                            onClick={() =>
                            {
                              handleMove(index, 1);
                            }}
                          >
                            <ArrowDownward fontSize={'inherit'}/>
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                    <Box sx={{
                      minWidth: 0,
                      width: '100%'
                    }}>
                      <Autocomplete
                        fullWidth
                        size={'small'}
                        options={RMMZ_USABLE_EFFECT_OPTIONS}
                        value={isForeignEffectOption(typeOpt)
                          ? null
                          : typeOpt}
                        onChange={(
                          _e,
                          opt
                        ) =>
                        {
                          handleTypeChange(index, opt);
                        }}
                        getOptionLabel={(o) => o.label}
                        isOptionEqualToValue={(
                          a,
                          b
                        ) => a.code === b.code}
                        renderOption={(
                          optionProps,
                          option
                        ) =>
                        {
                          const {
                            key,
                            ...rest
                          } = optionProps;
                          return (
                            <li key={key} {...rest}>
                              <Stack spacing={0}>
                                <Typography variant={'body2'}>{option.label}</Typography>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  code {option.code}
                                </Typography>
                              </Stack>
                            </li>
                          );
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            fullWidth
                            margin={'dense'}
                            label={'Effect'}
                            placeholder={isForeignEffectOption(typeOpt)
                              ? typeOpt.label
                              : ''}
                          />
                        )}
                      />
                      {isForeignEffectOption(typeOpt) && (
                        <Typography variant={'caption'} color={'warning.main'} display={'block'} sx={{ mt: 0.5 }}>
                          Non-vanilla code — use parameter fields on the right, or pick a standard type above.
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{
                      minWidth: 0,
                      width: '100%'
                    }}>
                      {renderValueFields(index, effect, catalog)}
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                      }}
                    >
                      <Tooltip title={'Remove'}>
                        <IconButton
                          size={'small'}
                          color={'error'}
                          onClick={() =>
                          {
                            handleRemove(index);
                          }}
                        >
                          <DeleteOutline fontSize={'small'}/>
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}
    </Stack>
  );
}

export {
  UsableEffectsEditor,
  type UsableEffectsEditorProps,
  type IdLabelRow,
};
