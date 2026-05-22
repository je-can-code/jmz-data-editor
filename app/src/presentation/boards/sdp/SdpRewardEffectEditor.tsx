import React from 'react';
import {
  Autocomplete,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import {
  type SdpEffectType,
  type SdpRewardEffect,
  SDP_EFFECT_TYPE_LABELS,
  defaultEffect,
  generateRewardEffect,
  parseRewardEffect,
} from '@services/sdp/sdpRewardEffect.ts';
import { useItems } from '@presentation/context/resources/items.context.tsx';
import { useWeapons } from '@presentation/context/resources/weapons.context.tsx';
import { useArmors } from '@presentation/context/resources/armors.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useSdps } from '@presentation/context/resources/sdps.context.tsx';

type SdpRewardEffectEditorProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

const ALL_EFFECT_TYPES = Object.keys(SDP_EFFECT_TYPE_LABELS) as SdpEffectType[];

function SdpRewardEffectEditor(props: SdpRewardEffectEditorProps)
{
  const { value, onChange, disabled } = props;

  const { data: items, byId: itemsById } = useItems();
  const { data: weapons, byId: weaponsById } = useWeapons();
  const { data: armors, byId: armorsById } = useArmors();
  const { skills, byId: skillsById } = useSkills();
  const { sdps } = useSdps();

  const parsed = parseRewardEffect(value);

  const handleTypeChange = (newType: SdpEffectType) =>
  {
    onChange(generateRewardEffect(defaultEffect(newType)));
  };

  const commit = (updated: SdpRewardEffect) =>
  {
    onChange(generateRewardEffect(updated));
  };

  const renderFields = (): React.ReactNode =>
  {
    switch (parsed.type)
    {
      case 'unlock-sdp-learner':
      case 'unlock-sdp-party':
        return (
          <Autocomplete
            size={'small'}
            fullWidth
            disabled={disabled}
            options={sdps}
            getOptionLabel={(opt) => `[${opt.key}] ${opt.name}`}
            isOptionEqualToValue={(a, b) => a.key === b.key}
            value={sdps.find(s => s.key === parsed.key) ?? null}
            onChange={(_e, val) =>
            {
              if (val) commit({ ...parsed, key: val.key });
            }}
            renderInput={(params) => (
              <TextField {...params} label={'SDP'} variant={'outlined'}/>
            )}
          />
        );

      case 'gain-exp':
      case 'gain-gold':
      case 'gain-ap':
      case 'gain-sdp-points':
        return (
          <TextField
            type={'number'}
            size={'small'}
            label={'Amount'}
            variant={'outlined'}
            sx={{ width: 160 }}
            disabled={disabled}
            value={parsed.amount}
            onChange={e => commit({ ...parsed, amount: parseInt(e.target.value, 10) || 0 })}
            slotProps={{ htmlInput: { min: '0', step: '1' } }}
          />
        );

      case 'gain-item':
        return (
          <Stack direction={'row'} spacing={1.5}>
            <Autocomplete
              size={'small'}
              sx={{ flex: 1 }}
              disabled={disabled}
              options={items}
              getOptionLabel={(opt) => `[${opt.id}] ${opt.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              value={itemsById.get(parsed.itemId) ?? null}
              onChange={(_e, val) =>
              {
                if (val) commit({ ...parsed, itemId: val.id });
              }}
              renderInput={(params) => (
                <TextField {...params} label={'Item'} variant={'outlined'}/>
              )}
            />
            <TextField
              type={'number'}
              size={'small'}
              label={'Count'}
              variant={'outlined'}
              sx={{ width: 90 }}
              disabled={disabled}
              value={parsed.count}
              onChange={e => commit({ ...parsed, count: parseInt(e.target.value, 10) || 1 })}
              slotProps={{ htmlInput: { min: '1', step: '1' } }}
            />
          </Stack>
        );

      case 'gain-weapon':
        return (
          <Stack direction={'row'} spacing={1.5}>
            <Autocomplete
              size={'small'}
              sx={{ flex: 1 }}
              disabled={disabled}
              options={weapons}
              getOptionLabel={(opt) => `[${opt.id}] ${opt.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              value={weaponsById.get(parsed.weaponId) ?? null}
              onChange={(_e, val) =>
              {
                if (val) commit({ ...parsed, weaponId: val.id });
              }}
              renderInput={(params) => (
                <TextField {...params} label={'Weapon'} variant={'outlined'}/>
              )}
            />
            <TextField
              type={'number'}
              size={'small'}
              label={'Count'}
              variant={'outlined'}
              sx={{ width: 90 }}
              disabled={disabled}
              value={parsed.count}
              onChange={e => commit({ ...parsed, count: parseInt(e.target.value, 10) || 1 })}
              slotProps={{ htmlInput: { min: '1', step: '1' } }}
            />
          </Stack>
        );

      case 'gain-armor':
        return (
          <Stack direction={'row'} spacing={1.5}>
            <Autocomplete
              size={'small'}
              sx={{ flex: 1 }}
              disabled={disabled}
              options={armors}
              getOptionLabel={(opt) => `[${opt.id}] ${opt.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              value={armorsById.get(parsed.armorId) ?? null}
              onChange={(_e, val) =>
              {
                if (val) commit({ ...parsed, armorId: val.id });
              }}
              renderInput={(params) => (
                <TextField {...params} label={'Armor'} variant={'outlined'}/>
              )}
            />
            <TextField
              type={'number'}
              size={'small'}
              label={'Count'}
              variant={'outlined'}
              sx={{ width: 90 }}
              disabled={disabled}
              value={parsed.count}
              onChange={e => commit({ ...parsed, count: parseInt(e.target.value, 10) || 1 })}
              slotProps={{ htmlInput: { min: '1', step: '1' } }}
            />
          </Stack>
        );

      case 'learn-skill':
        return (
          <Autocomplete
            size={'small'}
            fullWidth
            disabled={disabled}
            options={skills}
            getOptionLabel={(opt) => `[${opt.id}] ${opt.name}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={skillsById.get(parsed.skillId) ?? null}
            onChange={(_e, val) =>
            {
              if (val) commit({ ...parsed, skillId: val.id });
            }}
            renderInput={(params) => (
              <TextField {...params} label={'Skill'} variant={'outlined'}/>
            )}
          />
        );

      case 'custom':
        return (
          <TextField
            fullWidth
            size={'small'}
            variant={'outlined'}
            label={'Raw JS'}
            multiline
            rows={3}
            disabled={disabled}
            value={parsed.raw}
            onChange={e => commit({ ...parsed, raw: e.target.value })}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: 'monospace',
                fontSize: 13,
              },
            }}
          />
        );
    }
  };

  return (
    <Stack spacing={1.5}>
      <FormControl size={'small'} fullWidth disabled={disabled}>
        <InputLabel id={'sdp-effect-type-label'}>Reward Type</InputLabel>
        <Select
          labelId={'sdp-effect-type-label'}
          label={'Reward Type'}
          value={parsed.type}
          onChange={event => handleTypeChange(event.target.value as SdpEffectType)}
        >
          {ALL_EFFECT_TYPES.map(t => (
            <MenuItem key={t} value={t}>{SDP_EFFECT_TYPE_LABELS[t]}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {renderFields()}
    </Stack>
  );
}

export { SdpRewardEffectEditor, type SdpRewardEffectEditorProps };
