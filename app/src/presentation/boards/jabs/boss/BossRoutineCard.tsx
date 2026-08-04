import { Button, Divider, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import BossStepCard from './BossStepCard.tsx';
import { type BossRoutine, type BossStep, createBossStep } from '@core/domain/valueObjects/boss-config.ts';

type BossRoutineCardProps = {
  routine: BossRoutine;
  onChange: (updated: BossRoutine) => void;
  onRemove: () => void;
};

/**
 * A repeating sequence the boss performs for as long as the fight lasts.
 */
const BossRoutineCard = ({ routine, onChange, onRemove }: BossRoutineCardProps) =>
{
  const patchStep = (index: number, updated: BossStep) =>
  {
    const steps = routine.steps.map((step, at) => (at === index
      ? updated
      : step));

    onChange({ ...routine, steps });
  };

  const removeStep = (index: number) =>
  {
    const steps = routine.steps.filter((_step, at) => at !== index);

    onChange({ ...routine, steps });
  };

  const addStep = () =>
  {
    onChange({ ...routine, steps: [ ...routine.steps, createBossStep() ] });
  };

  const cadenceHelper = routine.cadence > 0
    ? `Happens every ${routine.cadence} seconds, starting ${routine.cadence} seconds into the fight.`
    : 'Set how often this happens.';

  return (
    <BoardSectionCard
      title={routine.key.trim() === ''
        ? 'Untitled routine'
        : routine.key}
      subtitle={cadenceHelper}
      collapsible
      defaultExpanded
    >
      <Stack spacing={2}>
        <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
          <TextField
            label={'Name'}
            size={'small'}
            fullWidth
            value={routine.key}
            helperText={'What to call this behavior, for your own reference.'}
            onChange={event => onChange({ ...routine, key: event.target.value })}
          />
          <TextField
            label={'Every'}
            type={'number'}
            size={'small'}
            value={routine.cadence}
            helperText={'Seconds between each time it happens.'}
            onChange={event => onChange({ ...routine, cadence: Number(event.target.value) })}
            slotProps={{ htmlInput: { step: 1, min: 0 } }}
            sx={{ width: 160 }}
          />
          <Tooltip title={'Remove this routine'}>
            <IconButton onClick={onRemove} sx={{ mt: 0.5 }}>
              <Delete/>
            </IconButton>
          </Tooltip>
        </Stack>

        <Divider/>

        {routine.steps.length === 0 && (
          <Typography variant={'body2'} color={'text.secondary'}>
            Nothing happens yet. Add a step below.
          </Typography>
        )}

        {routine.steps.map((step, index) => (
          <BossStepCard
            key={index}
            step={step}
            index={index}
            onChange={updated => patchStep(index, updated)}
            onRemove={() => removeStep(index)}
          />
        ))}

        <Button startIcon={<Add/>} onClick={addStep} size={'small'} sx={{ alignSelf: 'flex-start' }}>
          Add step
        </Button>
      </Stack>
    </BoardSectionCard>
  );
};

export default BossRoutineCard;
