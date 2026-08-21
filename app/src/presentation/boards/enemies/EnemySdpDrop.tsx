import { type ChangeEvent, useMemo } from 'react';
import { Autocomplete, Button, Checkbox, FormControlLabel, Stack, TextField } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { OpenInNew } from '@mui/icons-material';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import { useNavigate } from 'react-router-dom';
import { useSdps } from '@presentation/context/resources/sdps.context.tsx';

type EnemySdpDropProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (value: RPG_EnemyDomainModel) => void;
};

const EnemySdpDrop = ({
  selectedEnemy,
  updateEnemy,
}: EnemySdpDropProps) =>
{
  const { sdps } = useSdps();

  const navigate = useNavigate();

  const currentSdpDrop = selectedEnemy.sdpDrop;
  const isEnabled = selectedEnemy.sdpDrop.key !== '' || selectedEnemy.sdpDrop.isForcedOpen;

  const selectedPanel = useMemo(() =>
  {
    return sdps.find(p => p.key === currentSdpDrop?.key) ?? null;
  }, [ sdps, currentSdpDrop?.key ]);

  const canOpenInSdp = isEnabled && currentSdpDrop.key !== '' && sdps.length > 0;

  const handleToggleFields = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const { checked } = event.target;

    // Track state directly on the model
    selectedEnemy.sdpDrop.isForcedOpen = checked;

    if (!checked)
    {
      selectedEnemy.sdpDrop.key = '';
      selectedEnemy.sdpDrop.dropChance = 0;
    }

    updateEnemy(selectedEnemy);
  };

  const handleUpdateKey = (updatedKey: string) =>
  {
    selectedEnemy.sdpDrop.key = updatedKey;

    if (updatedKey !== '')
    {
      selectedEnemy.sdpDrop.isForcedOpen = false;
    }
    updateEnemy(selectedEnemy);
  };

  const handleUpdateDropChance = (updatedDropChance: number) =>
  {
    selectedEnemy.sdpDrop.dropChance = updatedDropChance;
    updateEnemy(selectedEnemy);
  };

  const handleOpenInSdp = () =>
  {
    if (!canOpenInSdp)
    {
      return;
    }
    navigate(`/sdp?sdpKey=${encodeURIComponent(currentSdpDrop.key)}`);
  };

  // the subtitle reports what this enemy actually drops: a named panel, an unnamed forced drop, or nothing.
  let dropSummary = 'Not configured';
  if (isEnabled)
  {
    dropSummary = currentSdpDrop.key !== ''
      ? currentSdpDrop.key
      : 'Forced open';
  }

  return (
    <BoardSectionCard
      title={'SDP Drop'}
      subtitle={dropSummary}
      collapsible
      defaultExpanded={false}
    >
      <Stack spacing={1}>
      <FormControlLabel
        control={<Checkbox checked={isEnabled} onChange={handleToggleFields}/>}
        label="Enable SDP Drop"
      />

      <Autocomplete
        size="small"
        options={sdps}
        value={selectedPanel}
        disabled={!isEnabled}
        isOptionEqualToValue={(
          opt,
          val
        ) => opt.key === val.key}
        getOptionLabel={(option) => option
          ? `[${option.key}] ${option.identity.name}`
          : ''}
        onChange={(
          _,
          newValue
        ) => handleUpdateKey(newValue?.key ?? '')}
        renderInput={(params) => <TextField {...params} size="small" label="SDP"/>}
        renderOption={(
          props,
          option
        ) => (
          <li {...props} key={option.key} style={{ height: 32 }}>
            {`[${option.key}] ${option.identity.name}`}
          </li>
        )}
      />

      <Button
        size="small"
        variant="outlined"
        startIcon={<OpenInNew/>}
        onClick={handleOpenInSdp}
        disabled={!canOpenInSdp}
      >
        Open in SDP
      </Button>

      <NumberInputWithLabel
        label="% Drop Chance"
        value={currentSdpDrop?.dropChance ?? 0}
        onChangeEventHandler={(e) => handleUpdateDropChance(parseInt(e.target.value) || 0)}
        disabled={!isEnabled}
      />
      </Stack>
    </BoardSectionCard>
  );
};

export default EnemySdpDrop;
