import {
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { RPG_StateDomainModel } from '@core/domain/entities/RPG_StateDomainModel.ts';
import type { StatePassiveAbsExtension } from '@core/domain/entities/state/StatePassiveAbsExtension.ts';
import {
  findTierColorPresetByHex,
  TIER_COLOR_PRESETS,
  type TierColorPreset,
} from '@core/domain/valueObjects/tierColorPresets.ts';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

/**
 * Value shown in the tier-color autocomplete: a named preset, or a synthetic row for an out-of-list hex.
 */
const passiveAbsTierPresetValue = (hex: string): TierColorPreset =>
{
  const p = findTierColorPresetByHex(hex);
  if (p !== null)
  {
    return p;
  }
  const h = hex.trim()
    .toUpperCase();
  if (/^#[0-9A-F]{6}$/u.test(h))
  {
    return { label: `Custom (${h})`, hex: h };
  }
  return TIER_COLOR_PRESETS[ 0 ];
};

/** Common affix weights — only ratios vs siblings matter in-game. */
const AFFIX_WEIGHT_QUICK_PICKS = [
  10,
  25,
  50,
  100,
  200,
  500,
  1000,
] as const;

/**
 * Returns a CSS {@code #RRGGBB} when {@code hex} is valid; otherwise null (show “no color” swatch).
 *
 * @param hex Raw note or field value.
 */
const tierStripeResolveSolidHex = (hex: string): string | null =>
{
  const t = hex.trim();
  if (t === '')
  {
    return null;
  }
  if (/^#[0-9A-Fa-f]{6}$/u.test(t))
  {
    return t.toUpperCase();
  }
  return null;
};

type TierStripeSwatchProps = {
  hex: string;
  size?: number;
};

/**
 * Small square preview for tier stripe color (checker = none or invalid hex).
 */
const TierStripeSwatch = ({
  hex,
  size = 22,
}: TierStripeSwatchProps) =>
{
  const solid = tierStripeResolveSolidHex(hex);

  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: solid ?? 'transparent',
        backgroundImage:
          solid === null
            ? 'repeating-conic-gradient(rgba(128,128,128,0.28) 0% 25%, transparent 0% 50%)'
            : undefined,
        backgroundSize: solid === null
          ? '8px 8px'
          : undefined,
      }}
      aria-hidden={true}
    />
  );
};

type PoolShareLineProps = {
  poolName: string;
  weight: number;
  poolTotal: number;
  marginTop: number;
};

/**
 * Reports what share of one affix pool this state takes. Only rendered for a pool the state is actually
 * eligible for, since a share of a pool it cannot roll in would be misleading.
 */
const PoolShareLine = ({
  poolName,
  weight,
  poolTotal,
  marginTop,
}: PoolShareLineProps) =>
{
  const share = ((100 * weight) / poolTotal).toFixed(1);

  return (
    <Typography variant={'caption'} color={'text.secondary'} component={'div'} sx={{ mt: marginTop }}>
      This row in the {poolName} pool: {weight} / {poolTotal} ({share}% of that pool)
    </Typography>
  );
};

type StatePassiveAffixesSectionProps = {
  selectedState: RPG_StateDomainModel;
  patchPassiveAbs: (partial: Partial<StatePassiveAbsExtension>) => void;
  passiveAffixPrefixPoolTotal: number;
  passiveAffixSuffixPoolTotal: number;
};

/**
 * Enemy tier nameplates and the weighted prefix / suffix pools a state can be rolled into.
 */
const StatePassiveAffixesSection = ({
  selectedState,
  patchPassiveAbs,
  passiveAffixPrefixPoolTotal,
  passiveAffixSuffixPoolTotal,
}: StatePassiveAffixesSectionProps) =>
{
  const { passiveAbs } = selectedState;

  // an omitted weight counts as 100 in game, so the share lines have to read it the same way.
  const effectiveWeight = passiveAbs.affixWeight ?? 100;
  const usesCustomWeight = passiveAbs.affixWeight !== null;

  const weightHelperText = usesCustomWeight
    ? 'Only how this compares to other affix weights in the pool matters — not the absolute size.'
    : 'Turn on custom weight above, then type a value or use quick picks.';

  const showsPrefixShare = passiveAbs.enemyPrefix === true && passiveAffixPrefixPoolTotal > 0;
  const showsSuffixShare = passiveAbs.enemySuffix === true && passiveAffixSuffixPoolTotal > 0;

  return (
    <BoardSectionCard title={'Passive Affixes'} collapsible defaultExpanded={false}>
      <Stack spacing={2} alignItems={'stretch'}>
        <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
          Enemy tier nameplates and weighted prefix or suffix pools. Affix weights only matter relative to other
          options in the same pool. The HUD picks the closest windowskin text color to your tier color (no separate
          setting).
        </Typography>
        <Stack direction={'row'} spacing={2} flexWrap={'wrap'}>
          <FormControlLabel
            control={
              <Checkbox
                checked={passiveAbs.enemyPrefix}
                onChange={(
                  _,
                  checked
                ) => patchPassiveAbs({ enemyPrefix: checked })}
              />
            }
            label={'Eligible as rolled prefix passive'}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={passiveAbs.enemySuffix}
                onChange={(
                  _,
                  checked
                ) => patchPassiveAbs({ enemySuffix: checked })}
              />
            }
            label={'Eligible as rolled suffix passive'}
          />
        </Stack>
        <FormControlLabel
          control={
            <Switch
              checked={usesCustomWeight}
              onChange={(
                _,
                on
              ) =>
              {
                if (on === true)
                {
                  patchPassiveAbs({ affixWeight: effectiveWeight });
                }
                else
                {
                  patchPassiveAbs({ affixWeight: null });
                }
              }}
            />
          }
          label={'Use custom affix weight'}
        />
        <Stack spacing={1.5}>
          <TextField
            type={'number'}
            variant={'outlined'}
            label={'Weight'}
            disabled={usesCustomWeight === false}
            helperText={weightHelperText}
            value={usesCustomWeight
              ? String(passiveAbs.affixWeight)
              : ''}
            onChange={(e) =>
            {
              const t = e.target.value.trim();
              if (t === '')
              {
                return;
              }
              const n = parseInt(t, 10);
              if (Number.isNaN(n) === false && n >= 1)
              {
                patchPassiveAbs({ affixWeight: n });
              }
            }}
            size={'small'}
            fullWidth
            slotProps={{ htmlInput: { min: 1, max: 999999 } }}
          />
          <Box>
            <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', mb: 0.75 }}>
              Quick picks
            </Typography>
            <Stack
              direction={'row'}
              flexWrap={'wrap'}
              useFlexGap={true}
              sx={{ gap: 0.75 }}
            >
              {AFFIX_WEIGHT_QUICK_PICKS.map((w) =>
              {
                const active = passiveAbs.affixWeight === w;
                return (
                  <Chip
                    key={w}
                    label={String(w)}
                    size={'small'}
                    disabled={usesCustomWeight === false}
                    color={active
                      ? 'primary'
                      : 'default'}
                    variant={active
                      ? 'filled'
                      : 'outlined'}
                    onClick={() =>
                    {
                      patchPassiveAbs({ affixWeight: w });
                    }}
                  />
                );
              })}
            </Stack>
          </Box>
          <Box>
            <Typography
              variant={'caption'}
              color={'text.secondary'}
              component={'div'}
              sx={{ lineHeight: 1.65 }}
            >
              Loaded states: prefix pool total weight {passiveAffixPrefixPoolTotal}, suffix pool total{' '}
              {passiveAffixSuffixPoolTotal}. Omitted weights count as 100, matching the game.
            </Typography>
            {showsPrefixShare && (
              <PoolShareLine
                poolName={'prefix'}
                weight={effectiveWeight}
                poolTotal={passiveAffixPrefixPoolTotal}
                marginTop={0.75}
              />
            )}
            {showsSuffixShare && (
              <PoolShareLine
                poolName={'suffix'}
                weight={effectiveWeight}
                poolTotal={passiveAffixSuffixPoolTotal}
                marginTop={0.5}
              />
            )}
          </Box>
        </Stack>
        <Stack
          direction={'row'}
          spacing={1.5}
          alignItems={'flex-start'}
        >
          <Box sx={{ pt: 0.5 }}>
            <TierStripeSwatch
              hex={passiveAbs.tierColorHex}
              size={36}
            />
          </Box>
          <Stack
            spacing={2}
            sx={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <Autocomplete
              options={TIER_COLOR_PRESETS}
              getOptionLabel={(o) => o.label}
              value={passiveAbsTierPresetValue(passiveAbs.tierColorHex)}
              isOptionEqualToValue={(
                a,
                b
              ) => a.hex.toUpperCase() === b.hex.toUpperCase()}
              onChange={(
                _,
                next
              ) =>
              {
                patchPassiveAbs({ tierColorHex: next?.hex ?? '' });
              }}
              renderOption={(optionProps, option) =>
              {
                const { key, ...liProps } = optionProps;
                return (
                  <li key={key} {...liProps}>
                    <Stack
                      direction={'row'}
                      spacing={1}
                      alignItems={'center'}
                      sx={{ width: '100%' }}
                    >
                      <TierStripeSwatch
                        hex={option.hex}
                        size={20}
                      />
                      <Typography variant={'body2'} component={'span'}>
                        {option.label}
                      </Typography>
                    </Stack>
                  </li>
                );
              }}
              renderInput={(params) =>
              {
                return (
                  <TextField
                    {...params}
                    label={'Tier stripe color'}
                    helperText={'Map stripe and HUD text tint both follow this color (HUD uses nearest windowskin palette match).'}
                    size={'small'}
                  />
                );
              }}
            />
            <TextField
              variant={'outlined'}
              label={'Exact hex'}
              helperText={'Optional: override with any #RRGGBB if you need a value not in the list. The preview square updates when the value is valid.'}
              value={passiveAbs.tierColorHex}
              onChange={(e) =>
              {
                patchPassiveAbs({ tierColorHex: e.target.value });
              }}
              size={'small'}
              fullWidth
              placeholder={'#RRGGBB'}
            />
          </Stack>
        </Stack>
      </Stack>
    </BoardSectionCard>
  );
};

export { StatePassiveAffixesSection };
