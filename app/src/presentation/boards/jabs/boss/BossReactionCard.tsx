import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import BossStepCard from './BossStepCard.tsx';
import {
  BOSS_REACTION_TRIGGERS,
  type BossParticipant,
  type BossReaction,
  type BossRoutine,
  type BossStep,
  createBossStep,
} from '@core/domain/valueObjects/boss-config.ts';

/**
 * How each moment a reaction can answer reads to an author, rather than what the file stores.
 */
const TRIGGER_LABELS: Record<BossReaction['on'], string> = {
  start: 'When the fight begins',
  fallen: 'When these bodies have all fallen',
  health: 'When these bodies are worn down',
};

type BossReactionCardProps = {
  reaction: BossReaction;
  /** The bodies in this fight, which a reaction can wait on and its steps can act on. */
  participants: BossParticipant[];
  /** The routines in this fight, any of which a step can speed up. */
  routines: BossRoutine[];
  onChange: (updated: BossReaction) => void;
  onRemove: () => void;
};

/**
 * Describes when a reaction happens, for the card's subtitle.
 * @param {BossReaction} reaction The reaction being described.
 * @returns {string} One line saying when it happens.
 */
const describeMoment = (reaction: BossReaction): string =>
{
  // the fight beginning needs nobody named.
  if (reaction.on === 'start')
  {
    return 'Happens once, the moment the fight begins.';
  }

  // a health reaction naming nobody watches the boss.
  if (reaction.on === 'health')
  {
    const who = reaction.participants.length === 0
      ? 'the boss'
      : reaction.participants.join(' and ');

    return `Happens once, when ${who} drops to ${reaction.below}% health or less.`;
  }

  // a reaction waiting on nobody would never mean anything.
  if (reaction.participants.length === 0)
  {
    return 'Choose which bodies have to fall.';
  }

  const verb = reaction.participants.length === 1
    ? 'has'
    : 'have';

  return `Happens once, after ${reaction.participants.join(' and ')} ${verb} fallen.`;
};

/**
 * Something the fight does once, the moment a thing happens in it.
 */
const BossReactionCard = ({ reaction, participants, routines, onChange, onRemove }: BossReactionCardProps) =>
{
  const patchStep = (index: number, updated: BossStep) =>
  {
    const steps = reaction.steps.map((step, at) => (at === index
      ? updated
      : step));

    onChange({ ...reaction, steps });
  };

  const removeStep = (index: number) =>
  {
    const steps = reaction.steps.filter((_step, at) => at !== index);

    onChange({ ...reaction, steps });
  };

  const addStep = () =>
  {
    onChange({ ...reaction, steps: [ ...reaction.steps, createBossStep() ] });
  };

  const namedBodies = participants.filter(participant => participant.key.trim() !== '');

  return (
    <BoardSectionCard
      title={reaction.key.trim() === ''
        ? 'Untitled reaction'
        : reaction.key}
      subtitle={describeMoment(reaction)}
      collapsible
      defaultExpanded
    >
      <Stack spacing={2}>
        <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
          <TextField
            label={'Name'}
            size={'small'}
            fullWidth
            value={reaction.key}
            helperText={'What to call this moment, for your own reference.'}
            onChange={event => onChange({ ...reaction, key: event.target.value })}
          />
          <TextField
            select
            label={'When'}
            size={'small'}
            fullWidth
            value={reaction.on}
            onChange={event => onChange({ ...reaction, on: event.target.value as BossReaction['on'] })}
          >
            {BOSS_REACTION_TRIGGERS.map(trigger => (
              <MenuItem key={trigger} value={trigger}>{TRIGGER_LABELS[ trigger ]}</MenuItem>
            ))}
          </TextField>
          <Tooltip title={'Remove this reaction'}>
            <IconButton onClick={onRemove} sx={{ mt: 0.5 }}>
              <Delete/>
            </IconButton>
          </Tooltip>
        </Stack>

        {reaction.on === 'health' && (
          <TextField
            label={'At or below'}
            type={'number'}
            size={'small'}
            value={reaction.below}
            helperText={'Percent of health. Leave the bodies empty to watch the boss.'}
            onChange={event => onChange({ ...reaction, below: Number(event.target.value) })}
            slotProps={{ htmlInput: { step: 1, min: 1, max: 99 } }}
            sx={{ width: 220 }}
          />
        )}

        {reaction.on !== 'start' && (
          <FormControl size={'small'} fullWidth>
            <InputLabel id={'boss-reaction-bodies-label'}>Bodies</InputLabel>
            <Select
              labelId={'boss-reaction-bodies-label'}
              multiple={true}
              value={reaction.participants}
              input={<OutlinedInput label={'Bodies'}/>}
              renderValue={selected => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map(name => <Chip key={name} label={name} size={'small'}/>)}
                </Box>
              )}
              onChange={event => onChange({ ...reaction, participants: event.target.value as string[] })}
            >
              {namedBodies.map(participant => (
                <MenuItem key={participant.key} value={participant.key}>{participant.key}</MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {reaction.on === 'fallen'
                ? 'Every one of these has to fall before this happens.'
                : 'Every one of these has to be worn down before this happens.'}
            </FormHelperText>
          </FormControl>
        )}

        <Divider/>

        {reaction.steps.length === 0 && (
          <Typography variant={'body2'} color={'text.secondary'}>
            Nothing happens yet. Add a step below.
          </Typography>
        )}

        {reaction.steps.map((step, index) => (
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

export default BossReactionCard;
