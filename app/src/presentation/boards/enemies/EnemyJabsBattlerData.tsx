import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { Divider, Stack, Typography } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { AccessAlarm, DirectionsRun, Speed, TrendingUp, Visibility } from '@mui/icons-material';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';

type EnemyJabsBattlerDataProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (value: RPG_EnemyDomainModel) => void;
};

const EnemyJabsBattlerData = ({
  selectedEnemy,
  updateEnemy,
}: EnemyJabsBattlerDataProps) =>
{
  const handleSightChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.sight = newValue;
    updateEnemy(selectedEnemy);
  };

  const handlePursuitChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.pursuit = newValue;
    updateEnemy(selectedEnemy);
  };

  const handlePrepareSpeedChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.prepareSpeed = newValue;
    updateEnemy(selectedEnemy);
  };

  const handleAlertDurationChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.alertDuration = newValue;
    updateEnemy(selectedEnemy);
  };

  const handleAlertSightBoostChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.alertSightBoost = newValue;
    updateEnemy(selectedEnemy);
  };

  const handleAlertPursuitBoostChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.alertPursuitBoost = newValue;
    updateEnemy(selectedEnemy);
  };

  return (
    <BoardSectionCard title={'Battler Data'}>
    <Stack
      spacing={2}
      direction={'column'}
    >
      <Stack spacing={1}>
        <Typography variant="subtitle2" color="text.secondary">Basic Parameters</Typography>
        <NumberInputWithLabel
          label="Sight Range"
          value={selectedEnemy.jabsBattlerData.sight}
          onChangeEventHandler={(event) => handleSightChange(Number(event.target.value))}
          endAdornment={<Visibility color={'info'}/>}
        />
        <NumberInputWithLabel
          label="Pursuit Range"
          value={selectedEnemy.jabsBattlerData.pursuit}
          onChangeEventHandler={(event) => handlePursuitChange(Number(event.target.value))}
          endAdornment={<DirectionsRun color={'success'}/>}
        />
        <NumberInputWithLabel
          label="Prepare Speed"
          value={selectedEnemy.jabsBattlerData.prepareSpeed}
          onChangeEventHandler={(event) => handlePrepareSpeedChange(Number(event.target.value))}
        />
      </Stack>

      <Divider/>

      {/* Alert-related data section */}
      <Stack spacing={1}>
        <Typography variant="subtitle2" color="text.secondary">Alert Parameters</Typography>
        <NumberInputWithLabel
          label="Alert Duration"
          value={selectedEnemy.jabsBattlerData.alertDuration}
          onChangeEventHandler={(event) => handleAlertDurationChange(Number(event.target.value))}
          endAdornment={<AccessAlarm color={'warning'}/>} // Orange/yellow for caution/alert
        />
        <NumberInputWithLabel
          label="Alert Sight Boost"
          value={selectedEnemy.jabsBattlerData.alertSightBoost}
          onChangeEventHandler={(event) => handleAlertSightBoostChange(Number(event.target.value))}
          endAdornment={<TrendingUp color={'secondary'}/>} // Purple for enhancement
        />
        <NumberInputWithLabel
          label="Alert Pursuit Boost"
          value={selectedEnemy.jabsBattlerData.alertPursuitBoost}
          onChangeEventHandler={(event) => handleAlertPursuitBoostChange(Number(event.target.value))}
          endAdornment={<Speed color={'error'}/>} // Red for speed/intensity
        />
      </Stack>
    </Stack>
    </BoardSectionCard>
  );
};

export { EnemyJabsBattlerData };
