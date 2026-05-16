import React from 'react';
import {
  Autocomplete,
  FormHelperText,
  Grid,
  Stack,
  TextField,
} from '@mui/material';
import {
  RMMZ_USABLE_HIT_TYPE_OPTIONS,
  type RmmzUsableHitTypeOption,
  usableHitTypeOption,
} from '@core/enums/RmmzUsableHitType.ts';
import {
  RMMZ_SKILL_SCOPE_OPTIONS,
  type RmmzSkillScopeOption,
  skillScopeOption,
} from '@core/enums/RmmzSkillScope.ts';
import {
  RMMZ_SKILL_OCCASION_OPTIONS,
  type RmmzSkillOccasionOption,
  skillOccasionOption,
} from '@core/enums/RmmzSkillOccasion.ts';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';

type UsableItemInvocationValue = {
  scope: number;
  occasion: number;
  speed: number;
  successRate: number;
  repeats: number;
  tpGain: number;
  hitType: number;
};

type UsableItemInvocationSectionProps = {
  value: UsableItemInvocationValue;
  onChange: (next: UsableItemInvocationValue) => void;
};

function parseIntInput(raw: string, fallback: number): number
{
  const n = parseInt(raw, 10);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function UsableItemInvocationSection({ value, onChange }: UsableItemInvocationSectionProps)
{
  const patch = (partial: Partial<UsableItemInvocationValue>) =>
  {
    onChange({ ...value, ...partial });
  };

  return (
    <Grid container spacing={2} alignItems={'flex-start'}>
      <Grid size={6}>
        <Autocomplete<RmmzSkillScopeOption>
          size={'small'}
          fullWidth
          options={[ ...RMMZ_SKILL_SCOPE_OPTIONS ]}
          groupBy={(o) => o.group}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.value === b.value}
          value={skillScopeOption(value.scope)}
          onChange={(_, o) => patch({ scope: o?.value ?? 0 })}
          renderInput={(params) => (
            <TextField {...params} label={'Scope'}/>
          )}
        />
      </Grid>
      <Grid size={6}>
        <Autocomplete<RmmzSkillOccasionOption>
          size={'small'}
          fullWidth
          options={[ ...RMMZ_SKILL_OCCASION_OPTIONS ]}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.value === b.value}
          value={skillOccasionOption(value.occasion)}
          onChange={(_, o) => patch({ occasion: o?.value ?? 0 })}
          renderInput={(params) => (
            <TextField {...params} label={'Occasion'}/>
          )}
        />
      </Grid>

      <Grid size={4}>
        <Autocomplete<RmmzUsableHitTypeOption>
          size={'small'}
          fullWidth
          options={[ ...RMMZ_USABLE_HIT_TYPE_OPTIONS ]}
          groupBy={(o) => o.group}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.value === b.value}
          value={usableHitTypeOption(value.hitType)}
          onChange={(_, o) => patch({ hitType: o?.value ?? 0 })}
          renderInput={(params) => (
            <TextField {...params} label={'Hit Type'}/>
          )}
        />
      </Grid>

      <Grid size={2}>
        <Stack spacing={0.5}>
          <NumberInputWithLabel
            label={'Speed'}
            value={value.speed}
            onChangeEventHandler={(e) => patch({ speed: parseIntInput(e.target.value, 0) })}
            variant={'outlined'}
            size={'small'}
            fullWidth
          />
          <FormHelperText>ATB modifier</FormHelperText>
        </Stack>
      </Grid>
      <Grid size={2}>
        <Stack spacing={0.5}>
          <NumberInputWithLabel
            label={'Success %'}
            value={value.successRate}
            onChangeEventHandler={(e) => patch({ successRate: Math.max(0, Math.min(100, parseIntInput(e.target.value, 100))) })}
            variant={'outlined'}
            size={'small'}
            fullWidth
          />
          <FormHelperText>0–100</FormHelperText>
        </Stack>
      </Grid>
      <Grid size={2}>
        <Stack spacing={0.5}>
          <NumberInputWithLabel
            label={'Repeats'}
            value={value.repeats}
            onChangeEventHandler={(e) => patch({ repeats: Math.max(1, parseIntInput(e.target.value, 1)) })}
            variant={'outlined'}
            size={'small'}
            fullWidth
          />
          <FormHelperText>Min 1</FormHelperText>
        </Stack>
      </Grid>
      <Grid size={2}>
        <Stack spacing={0.5}>
          <NumberInputWithLabel
            label={'TP Gain'}
            value={value.tpGain}
            onChangeEventHandler={(e) => patch({ tpGain: parseIntInput(e.target.value, 0) })}
            variant={'outlined'}
            size={'small'}
            fullWidth
          />
          <FormHelperText>On hit</FormHelperText>
        </Stack>
      </Grid>
    </Grid>
  );
}

export { UsableItemInvocationSection };
export type { UsableItemInvocationValue, UsableItemInvocationSectionProps };
