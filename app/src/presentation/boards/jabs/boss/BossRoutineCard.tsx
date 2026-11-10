import { Button, Divider, FormControlLabel, IconButton, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import BossStepCard from './BossStepCard.tsx';
import {
  type BossParticipant,
  type BossRoutine,
  type BossStep,
  createBossStep,
} from '@core/domain/valueObjects/boss-config.ts';

type BossRoutineCardProps = {
  routine: BossRoutine;
  /** The bodies in this fight, any of which a step can act on. */
  participants: BossParticipant[];
  /** The routines in this fight, any of which a step can speed up. */
  routines: BossRoutine[];
  onChange: (updated: BossRoutine) => void;
  onRemove: () => void;
};

/**
 * Describes when a routine happens, for the card's subtitle.
 * @param {BossRoutine} routine The routine being described.
 * @returns {string} One line saying when it happens.
 */
const describeCadence = (routine: BossRoutine): string =>
{
  // a routine with no cadence yet has nothing to say.
  if (routine.cadence <= 0)
  {
    return 'Set how often this happens.';
  }

  // a dormant routine starts whenever a step wakes it, and plays at once when it does.
  if (routine.dormant)
  {
    return `Happens every ${routine.cadence} seconds once a step starts it, the first time right away.`;
  }

  return `Happens every ${routine.cadence} seconds, starting ${routine.cadence} seconds into the fight.`;
};

/**
 * A repeating sequence the boss performs for as long as the fight lasts, or from the moment a step starts it.
 */
const BossRoutineCard = ({ routine, participants, routines, onChange, onRemove }: BossRoutineCardProps) =>
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

  const cadenceHelper = describeCadence(routine);

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

        <FormControlLabel
          control={
            <Switch
              checked={routine.dormant}
              onChange={event => onChange({ ...routine, dormant: event.target.checked })}
            />
          }
          label={routine.dormant
            ? 'Waits until a "Start a routine" step wakes it.'
            : 'Runs from the moment the fight begins.'}
        />

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
            participants={participants}
            routines={routines}
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
