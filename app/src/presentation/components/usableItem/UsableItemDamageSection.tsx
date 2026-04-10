import React, { ChangeEvent, useMemo } from 'react';
import {
  Autocomplete,
  Box,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK } from '@core/enums/RmmzDamageElementId.ts';
import { RMMZ_DAMAGE_TYPE_OPTIONS, RmmzDamageType, } from '@core/enums/RmmzDamageType.ts';

type UsableItemDamageEditorValue = {
  damageType: number;
  damageElementId: number;
  damageFormula: string;
  damageVariance: number;
  damageCritical: boolean;
  attackElementIds: number[];
  thisCritChanceFormula: string;
  thisCritDamageMultiplierFormula: string;
  thisCritsAlways: boolean;
};

type ElementOption = {
  id: number;
  label: string;
};

type UsableItemDamageSectionProps = {
  value: UsableItemDamageEditorValue;
  onChange: (next: UsableItemDamageEditorValue) => void;
  elementNames: string[];
  /**
   * When true, omits the outer {@link Paper} and title (e.g. inside an accordion summary/details).
   */
  embedded?: boolean;
};

function buildElementOptions(names: string[]): ElementOption[]
{
  return names.map((
    name,
    id
  ) =>
  {
    if (id === 0)
    {
      return {
        id,
        label: 'None',
      };
    }
    return {
      id,
      label: name.length > 0
        ? name
        : `Element ${id}`,
    };
  });
}

/**
 * @param raw Editor or database variance.
 * @returns Integer in [0, 100] for the slider.
 */
function clampDamageVariance(raw: number): number
{
  if (!Number.isFinite(raw))
  {
    return 0;
  }
  let v = Math.trunc(raw);
  if (v < 0)
  {
    v = 0;
  }
  if (v > 100)
  {
    v = 100;
  }
  return v;
}

/**
 * Damage block for {@link Rmmz.Core.RPG_UsableItem}: core {@code damage} fields plus
 * J-Elementalistics / J-CriticalFactors note tags. Same shape supports a future items board.
 */
function UsableItemDamageSection({
  value,
  onChange,
  elementNames,
  embedded = false,
}: UsableItemDamageSectionProps)
{
  const primaryOptions = useMemo(
    () => buildElementOptions(elementNames),
    [ elementNames ]
  );

  const extraElementOptions = useMemo(
    () =>
      primaryOptions.filter(
        (o) => o.id !== value.damageElementId && o.id > 0
      ),
    [ primaryOptions, value.damageElementId ]
  );

  const selectedExtraOptions = useMemo(
    () =>
    {
      const byId = new Map(extraElementOptions.map((o) => [ o.id, o ]));
      return value.attackElementIds
        .map((id) => byId.get(id))
        .filter((o): o is ElementOption => o !== undefined);
    },
    [ extraElementOptions, value.attackElementIds ]
  );

  const patch = (partial: Partial<UsableItemDamageEditorValue>) =>
  {
    onChange({
      ...value,
      ...partial,
    });
  };

  const handleDamageTypeSelectChange = (event: SelectChangeEvent<number>) =>
  {
    const raw = event.target.value;
    const n = typeof raw === 'string'
      ? parseInt(raw, 10)
      : raw;
    if (Number.isInteger(n) && n >= RmmzDamageType.None && n <= RmmzDamageType.MpDrain)
    {
      patch({ damageType: n });
      return;
    }
    patch({ damageType: RmmzDamageType.HpDamage });
  };

  const handlePrimaryElementSelectChange = (event: SelectChangeEvent<number>) =>
  {
    const raw = event.target.value;
    const elementId = typeof raw === 'string'
      ? parseInt(raw, 10)
      : raw;
    if (!Number.isInteger(elementId) || elementId < RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK)
    {
      return;
    }
    const nextExtras = value.attackElementIds.filter((id) => id !== elementId);
    patch({
      damageElementId: elementId,
      attackElementIds: nextExtras,
    });
  };

  const handleFormulaChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patch({ damageFormula: event.target.value });
  };

  const handleVarianceSliderChange = (
    _event: Event,
    newValue: number | number[]
  ) =>
  {
    const n = typeof newValue === 'number'
      ? newValue
      : newValue[ 0 ];
    patch({ damageVariance: clampDamageVariance(n) });
  };

  const handleCriticalSwitchChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patch({ damageCritical: event.target.checked });
  };

  const handleExtraElementsChange = (
    _event: React.SyntheticEvent,
    options: ElementOption[]
  ) =>
  {
    patch({
      attackElementIds: options.map((o) => o.id),
    });
  };

  const handleThisCritChanceChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patch({ thisCritChanceFormula: event.target.value });
  };

  const handleThisCritMultiplierChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patch({ thisCritDamageMultiplierFormula: event.target.value });
  };

  const handleThisCritsAlwaysChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patch({ thisCritsAlways: event.target.checked });
  };

  const damageDisabled = value.damageType === RmmzDamageType.None;

  const critExtrasDisabled = damageDisabled || value.damageCritical === false;

  const varianceClamped = clampDamageVariance(value.damageVariance);

  const narrowFormulaSx = {
    width: 'min(100%, 320px)',
    '& .MuiInputBase-input': { fontFamily: 'monospace' },
  } as const;

  const fullWidthMonospaceFieldSx = {
    width: '100%',
    '& .MuiInputBase-input': { fontFamily: 'monospace' },
  } as const;

  const damageSubGroupSx = {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    padding: 1.5,
  };

  const damageSectionTitleSx = {
    marginBottom: 1,
    fontWeight: 600,
    letterSpacing: '0.02em',
  } as const;

  const body = (
    <Grid container spacing={2} alignItems={'flex-start'}>
      <Grid size={damageDisabled
        ? 12
        : 6}>
        <Stack spacing={2}>
          <Box sx={damageSubGroupSx}>
            <Typography
              variant={'subtitle2'}
              color={'text.secondary'}
              sx={damageSectionTitleSx}
            >
              {damageDisabled
                ? 'Damage type'
                : 'Type, formula, and variance'}
            </Typography>
            <Stack spacing={1.5}>
              <FormControl size={'small'} fullWidth>
                <InputLabel id={'usable-item-damage-type-label'}>Type</InputLabel>
                <Select<number>
                  labelId={'usable-item-damage-type-label'}
                  label={'Type'}
                  value={value.damageType}
                  onChange={handleDamageTypeSelectChange}
                >
                  {RMMZ_DAMAGE_TYPE_OPTIONS.map((opt) =>
                    (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              {damageDisabled
                ? (
                  <FormHelperText>
                    No damage step runs for this skill. Effects, states, and costs still apply.
                  </FormHelperText>
                )
                : null}
              {damageDisabled
                ? null
                : (
                  <>
                    <TextField
                      label={'Formula'}
                      value={value.damageFormula}
                      onChange={handleFormulaChange}
                      variant={'outlined'}
                      size={'small'}
                      sx={narrowFormulaSx}
                    />
                    <Stack spacing={1} sx={{
                      width: '100%',
                      maxWidth: 'min(100%, 320px)'
                    }}>
                      <Typography
                        variant={'body2'}
                        color={'text.secondary'}
                        component={'div'}
                      >
                        {`Variance · ${varianceClamped}%`}
                      </Typography>
                      <Slider
                        size={'small'}
                        value={varianceClamped}
                        onChange={handleVarianceSliderChange}
                        min={0}
                        max={100}
                        step={1}
                        valueLabelDisplay={'auto'}
                        valueLabelFormat={(v) => `${v}%`}
                        aria-label={'Damage variance percent'}
                        getAriaValueText={(v) => `${v}%`}
                      />
                    </Stack>
                  </>
                )}
            </Stack>
          </Box>

          {damageDisabled
            ? null
            : (
              <Box sx={damageSubGroupSx}>
                <Typography
                  variant={'subtitle2'}
                  color={'text.secondary'}
                  sx={damageSectionTitleSx}
                >
                  Element
                </Typography>
                <Stack spacing={1.5}>
                  <FormControl size={'small'} fullWidth>
                    <InputLabel id={'usable-item-damage-element-label'}>
                      Primary Element
                    </InputLabel>
                    <Select<number>
                      labelId={'usable-item-damage-element-label'}
                      label={'Primary Element'}
                      value={value.damageElementId}
                      onChange={handlePrimaryElementSelectChange}
                    >
                      <MenuItem value={RMMZ_DAMAGE_ELEMENT_NORMAL_ATTACK}>
                        Normal attack
                      </MenuItem>
                      {primaryOptions.map((opt) =>
                        (
                          <MenuItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  <Autocomplete<ElementOption, true, false, false>
                    multiple
                    size={'small'}
                    options={extraElementOptions}
                    getOptionLabel={(o) => o.label}
                    isOptionEqualToValue={(
                      a,
                      b
                    ) => a.id === b.id}
                    value={selectedExtraOptions}
                    onChange={handleExtraElementsChange}
                    sx={{ width: '100%' }}
                    renderInput={(params) =>
                      (
                        <TextField
                          {...params}
                          variant={'outlined'}
                          label={'Additional Elements'}
                          placeholder={'Add…'}
                        />
                      )}
                  />
                </Stack>
              </Box>
            )}
        </Stack>
      </Grid>

      {damageDisabled
        ? null
        : (
          <Grid size={6}>
            <Box sx={damageSubGroupSx}>
              <Typography
                variant={'subtitle2'}
                color={'text.secondary'}
                sx={damageSectionTitleSx}
              >
                Critical
              </Typography>
              <Stack spacing={1.5}>
                <FormControlLabel
                  label={'Can score a critical hit'}
                  control={
                    <Switch
                      size={'small'}
                      checked={value.damageCritical}
                      onChange={handleCriticalSwitchChange}
                    />
                  }
                />
                <FormControlLabel
                  disabled={critExtrasDisabled}
                  label={'Always critical'}
                  control={
                    <Switch
                      size={'small'}
                      disabled={critExtrasDisabled}
                      checked={value.thisCritsAlways}
                      onChange={handleThisCritsAlwaysChange}
                    />
                  }
                />
                <TextField
                  label={'Bonus crit chance'}
                  value={value.thisCritChanceFormula}
                  onChange={handleThisCritChanceChange}
                  variant={'outlined'}
                  size={'small'}
                  disabled={critExtrasDisabled}
                  placeholder={'e.g. 25 or a.luk * 0.5'}
                  sx={fullWidthMonospaceFieldSx}
                />
                <TextField
                  label={'Bonus crit damage multiplier'}
                  value={value.thisCritDamageMultiplierFormula}
                  onChange={handleThisCritMultiplierChange}
                  variant={'outlined'}
                  size={'small'}
                  disabled={critExtrasDisabled}
                  placeholder={'e.g. 10 + a.agi'}
                  sx={fullWidthMonospaceFieldSx}
                />
                {critExtrasDisabled
                  ? (
                    <FormHelperText>
                      {`Turn on "Can score a critical hit" to edit the fields below.`}
                    </FormHelperText>
                  )
                  : null}
              </Stack>
            </Box>
          </Grid>
        )}
    </Grid>
  );

  if (embedded)
  {
    return (
      <Box
        sx={{
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {body}
      </Box>
    );
  }

  return (
    <Paper
      variant={'outlined'}
      sx={{
        padding: 2,
        borderColor: 'divider',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Typography variant={'h6'} sx={{ marginBottom: 2 }}>
        Damage
      </Typography>
      {body}
    </Paper>
  );
}

export {
  UsableItemDamageSection
};

export type {
  UsableItemDamageEditorValue,
  UsableItemDamageSectionProps
};
