import { Box, Card, CardContent, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { Delete } from '@mui/icons-material';
import { useEnemies } from '@presentation/context/resources/enemies.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import {
  type BossParticipant,
  type BossRoutine,
  type BossStep,
  withSkillSelection,
  withSpawnSelection,
  withStateSelection,
} from '@core/domain/valueObjects/boss-config.ts';

/**
 * The label shown for each verb a step can perform. Authors think in terms of what the boss does, not
 * in terms of the property name the file stores.
 */
const VERB_LABELS: Record<BossStep['verb'], string> = {
  forceSkill: 'Use a skill',
  addState: 'Put a state on a body',
  removeState: 'Take a state off a body',
  changeImage: 'Change how a body looks',
  quickenRoutine: 'Speed up a routine',
  spawn: 'Put something on a tile',
  tint: 'Tint the screen',
  animation: 'Play an animation over a body',
  dialogue: 'Have a body say a line',
  blink: 'Blink a body to a tile',
  wait: 'Pause before the next step',
  learnSkill: 'Teach a body a skill',
  startRoutine: 'Start a routine',
};

/**
 * The ways a blink can leave a body facing, as an author reads them.
 */
const BLINK_FACINGS = [
  { value: 0, label: 'Keep its facing' },
  { value: 2, label: 'Down' },
  { value: 4, label: 'Left' },
  { value: 6, label: 'Right' },
  { value: 8, label: 'Up' },
] as const;

/**
 * The four channels of a screen tone, in the order the file stores them, with the range each one takes.
 */
const TONE_CHANNELS = [
  { label: 'Red', min: -255, max: 255 },
  { label: 'Green', min: -255, max: 255 },
  { label: 'Blue', min: -255, max: 255 },
  { label: 'Gray', min: 0, max: 255 },
] as const;

/**
 * The verbs that act on nobody in particular, so they have no use for choosing a body.
 */
const VERBS_WITHOUT_A_BODY: BossStep['verb'][] = [ 'quickenRoutine', 'spawn', 'tint', 'wait', 'startRoutine' ];

type BossStepCardProps = {
  step: BossStep;
  index: number;
  /** The bodies in this fight, any of which a step can act on. */
  participants: BossParticipant[];
  /** The routines in this fight, any of which a step can speed up. */
  routines: BossRoutine[];
  onChange: (updated: BossStep) => void;
  onRemove: () => void;
};

/**
 * One instruction inside a routine or a reaction, always expanded so the whole sequence reads top to
 * bottom without clicking anything. Only the fields the chosen verb uses are shown.
 */
const BossStepCard = ({ step, index, participants, routines, onChange, onRemove }: BossStepCardProps) =>
{
  const { skills, byId: skillsById } = useSkills();
  const { states, byId: statesById } = useStates();
  const { data: enemies, byId: enemiesById } = useEnemies();

  const handleSkillChange = (skillId: number) =>
  {
    const selected = skillsById.get(skillId);
    const name = selected ? selected.name : '';

    onChange(withSkillSelection(step, skillId, name));
  };

  const handleStateChange = (stateId: number) =>
  {
    const selected = statesById.get(stateId);
    const name = selected ? selected.name : '';

    onChange(withStateSelection(step, stateId, name));
  };

  const handleSpawnChange = (enemyId: number) =>
  {
    const selected = enemiesById.get(enemyId);
    const name = selected ? selected.name : '';

    onChange(withSpawnSelection(step, enemyId, name));
  };

  const handleToneChange = (channel: number, value: number) =>
  {
    // a tone always holds all four channels, so a step tinted for the first time starts from no tint at all.
    const tone = TONE_CHANNELS.map((_channel, at) => (at === channel
      ? value
      : step.tone[ at ] ?? 0));

    onChange({ ...step, tone });
  };

  const selectableSkills = skills.filter(skill => skill.name.trim() !== '');
  const selectableStates = states.filter(state => state.name.trim() !== '');
  const selectableEnemies = enemies.filter(enemy => enemy.name.trim() !== '');
  const namedBodies = participants.filter(participant => participant.key.trim() !== '');
  const namedRoutines = routines.filter(routine => routine.key.trim() !== '');

  const whoField = (
    <TextField
      select
      label={'Who'}
      size={'small'}
      fullWidth
      value={step.participant}
      helperText={'Which body this happens to.'}
      onChange={event => onChange({ ...step, participant: event.target.value })}
    >
      <MenuItem value={''}>The boss (the first body)</MenuItem>
      {namedBodies.map(participant => (
        <MenuItem key={participant.key} value={participant.key}>{participant.key}</MenuItem>
      ))}
    </TextField>
  );

  const skillSelect = (
    <TextField
      select
      label={'Skill'}
      size={'small'}
      fullWidth
      value={step.skill === 0 ? '' : step.skill}
      onChange={event => handleSkillChange(Number(event.target.value))}
    >
      {selectableSkills.map(skill => (
        <MenuItem key={skill.id} value={skill.id}>
          {`${skill.name} (${skill.id})`}
        </MenuItem>
      ))}
    </TextField>
  );

  const skillFields = (
    <>
      {skillSelect}

      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={step.cast}
              onChange={event => onChange({ ...step, cast: event.target.checked })}
            />
          }
          label={step.cast
            ? 'Winds up before striking, so it can be seen coming and dodged.'
            : 'Strikes instantly, with no wind-up to react to.'}
        />
      </Box>
    </>
  );

  const stateField = (
    <TextField
      select
      label={'State'}
      size={'small'}
      fullWidth
      value={step.state === 0 ? '' : step.state}
      onChange={event => handleStateChange(Number(event.target.value))}
    >
      {selectableStates.map(state => (
        <MenuItem key={state.id} value={state.id}>
          {`${state.name} (${state.id})`}
        </MenuItem>
      ))}
    </TextField>
  );

  const imageFields = (
    <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
      <TextField
        label={'Character sheet'}
        size={'small'}
        fullWidth
        value={step.image}
        helperText={'The sheet\'s file name, as it appears in the characters folder.'}
        onChange={event => onChange({ ...step, image: event.target.value })}
      />
      <TextField
        label={'Character'}
        type={'number'}
        size={'small'}
        value={step.index}
        helperText={'Which character on the sheet.'}
        onChange={event => onChange({ ...step, index: Number(event.target.value) })}
        slotProps={{ htmlInput: { step: 1, min: 0, max: 7 } }}
        sx={{ width: 160 }}
      />
    </Stack>
  );

  const quickenFields = (
    <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
      <TextField
        select
        label={'Routine'}
        size={'small'}
        fullWidth
        value={step.routine}
        helperText={'From now on, this happens sooner each time.'}
        onChange={event => onChange({ ...step, routine: event.target.value })}
      >
        {namedRoutines.map(routine => (
          <MenuItem key={routine.key} value={routine.key}>{routine.key}</MenuItem>
        ))}
      </TextField>
      <TextField
        label={'Faster by'}
        type={'number'}
        size={'small'}
        value={step.seconds}
        helperText={'Seconds taken off each wait.'}
        onChange={event => onChange({ ...step, seconds: Number(event.target.value) })}
        slotProps={{ htmlInput: { step: 0.5, min: 0 } }}
        sx={{ width: 160 }}
      />
    </Stack>
  );

  const spawnFields = (
    <Stack spacing={2}>
      <TextField
        select
        label={'Enemy'}
        size={'small'}
        fullWidth
        value={step.enemyId === 0 ? '' : step.enemyId}
        helperText={'Part of the fight, but nobody has to fell it to win. Whatever still stands leaves with the fight.'}
        onChange={event => handleSpawnChange(Number(event.target.value))}
      >
        {selectableEnemies.map(enemy => (
          <MenuItem key={enemy.id} value={enemy.id}>
            {`${enemy.name} (${enemy.id})`}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
        <TextField
          label={'X'}
          type={'number'}
          size={'small'}
          value={step.x}
          helperText={'The tile it appears on.'}
          onChange={event => onChange({ ...step, x: Number(event.target.value) })}
          slotProps={{ htmlInput: { step: 1, min: 0 } }}
          sx={{ width: 120 }}
        />
        <TextField
          label={'Y'}
          type={'number'}
          size={'small'}
          value={step.y}
          onChange={event => onChange({ ...step, y: Number(event.target.value) })}
          slotProps={{ htmlInput: { step: 1, min: 0 } }}
          sx={{ width: 120 }}
        />
        <TextField
          label={'Template'}
          type={'number'}
          size={'small'}
          value={step.template}
          helperText={'A clone map event to copy instead of the enemy\'s own, or 0.'}
          onChange={event => onChange({ ...step, template: Number(event.target.value) })}
          slotProps={{ htmlInput: { step: 1, min: 0 } }}
          fullWidth
        />
      </Stack>
    </Stack>
  );

  const tintFields = (
    <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
      {TONE_CHANNELS.map((channel, at) => (
        <TextField
          key={channel.label}
          label={channel.label}
          type={'number'}
          size={'small'}
          value={step.tone[ at ] ?? 0}
          onChange={event => handleToneChange(at, Number(event.target.value))}
          slotProps={{ htmlInput: { step: 1, min: channel.min, max: channel.max } }}
          sx={{ width: 110 }}
        />
      ))}
      <TextField
        label={'Over'}
        type={'number'}
        size={'small'}
        value={step.seconds}
        helperText={'Seconds to settle.'}
        onChange={event => onChange({ ...step, seconds: Number(event.target.value) })}
        slotProps={{ htmlInput: { step: 0.5, min: 0 } }}
        sx={{ width: 140 }}
      />
    </Stack>
  );

  const animationField = (
    <TextField
      label={'Animation'}
      type={'number'}
      size={'small'}
      value={step.animation}
      helperText={'The animation\'s id in the database.'}
      onChange={event => onChange({ ...step, animation: Number(event.target.value) })}
      slotProps={{ htmlInput: { step: 1, min: 1 } }}
      sx={{ width: 200 }}
    />
  );

  const dialogueFields = (
    <Stack spacing={2}>
      <TextField
        label={'Speaker'}
        size={'small'}
        fullWidth
        value={step.speaker}
        helperText={'The name shown with the line. Text codes work here.'}
        onChange={event => onChange({ ...step, speaker: event.target.value })}
      />
      <TextField
        label={'Line'}
        size={'small'}
        fullWidth
        multiline
        minRows={2}
        value={step.lines.join('\n')}
        helperText={'One message; each row is a row of it. The fight holds until the player has read it.'}
        onChange={event => onChange({ ...step, lines: event.target.value.split('\n') })}
      />
    </Stack>
  );

  const animationNumberField = (label: string, helperText: string) => (
    <TextField
      label={label}
      type={'number'}
      size={'small'}
      value={step.animation}
      helperText={helperText}
      onChange={event => onChange({ ...step, animation: Number(event.target.value) })}
      slotProps={{ htmlInput: { step: 1, min: 0 } }}
      sx={{ width: 200 }}
    />
  );

  const blinkFields = (
    <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
      <TextField
        label={'X'}
        type={'number'}
        size={'small'}
        value={step.x}
        helperText={'The tile it reappears on.'}
        onChange={event => onChange({ ...step, x: Number(event.target.value) })}
        slotProps={{ htmlInput: { step: 1, min: 0 } }}
        sx={{ width: 120 }}
      />
      <TextField
        label={'Y'}
        type={'number'}
        size={'small'}
        value={step.y}
        onChange={event => onChange({ ...step, y: Number(event.target.value) })}
        slotProps={{ htmlInput: { step: 1, min: 0 } }}
        sx={{ width: 120 }}
      />
      <TextField
        select
        label={'Facing'}
        size={'small'}
        value={step.direction}
        onChange={event => onChange({ ...step, direction: Number(event.target.value) })}
        sx={{ width: 180 }}
      >
        {BLINK_FACINGS.map(facing => (
          <MenuItem key={facing.value} value={facing.value}>{facing.label}</MenuItem>
        ))}
      </TextField>
      {animationNumberField('Flare', 'Plays where it vanishes and where it lands; 0 for none.')}
    </Stack>
  );

  const waitField = (
    <TextField
      label={'For'}
      type={'number'}
      size={'small'}
      value={step.seconds}
      helperText={'Seconds before the next step. The fight carries on meanwhile.'}
      onChange={event => onChange({ ...step, seconds: Number(event.target.value) })}
      slotProps={{ htmlInput: { step: 0.5, min: 0 } }}
      sx={{ width: 220 }}
    />
  );

  const startRoutineField = (
    <TextField
      select
      label={'Routine'}
      size={'small'}
      fullWidth
      value={step.routine}
      helperText={'It plays at once, then keeps its own cadence. Mark it as starting dormant.'}
      onChange={event => onChange({ ...step, routine: event.target.value })}
    >
      {namedRoutines.map(routine => (
        <MenuItem key={routine.key} value={routine.key}>{routine.key}</MenuItem>
      ))}
    </TextField>
  );

  const faceFields = (
    <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
      <TextField
        label={'Face'}
        size={'small'}
        fullWidth
        value={step.face}
        helperText={'The face image\'s file name, or empty for none.'}
        onChange={event => onChange({ ...step, face: event.target.value })}
      />
      <TextField
        label={'Face index'}
        type={'number'}
        size={'small'}
        value={step.faceIndex}
        onChange={event => onChange({ ...step, faceIndex: Number(event.target.value) })}
        slotProps={{ htmlInput: { step: 1, min: 0, max: 7 } }}
        sx={{ width: 160 }}
      />
    </Stack>
  );

  const usesWho = VERBS_WITHOUT_A_BODY.includes(step.verb) === false;
  const usesSkill = step.verb === 'forceSkill';
  const usesLearnedSkill = step.verb === 'learnSkill';
  const usesBlink = step.verb === 'blink';
  const usesWait = step.verb === 'wait';
  const usesStartRoutine = step.verb === 'startRoutine';
  const usesState = step.verb === 'addState' || step.verb === 'removeState';
  const usesImage = step.verb === 'changeImage';
  const usesQuicken = step.verb === 'quickenRoutine';
  const usesSpawn = step.verb === 'spawn';
  const usesTint = step.verb === 'tint';
  const usesAnimation = step.verb === 'animation';
  const usesDialogue = step.verb === 'dialogue';

  return (
    <Card variant={'outlined'}>
      <CardContent sx={{ pb: 1 }}>
        <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'} sx={{ mb: 1.5 }}>
          <Typography variant={'subtitle2'} color={'text.secondary'}>
            {`Step ${index + 1}`}
          </Typography>
          <Tooltip title={'Remove this step'}>
            <IconButton size={'small'} onClick={onRemove}>
              <Delete fontSize={'small'}/>
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack spacing={2}>
          <TextField
            select
            label={'Does'}
            size={'small'}
            fullWidth
            value={step.verb}
            onChange={event => onChange({ ...step, verb: event.target.value as BossStep['verb'] })}
          >
            {Object.entries(VERB_LABELS)
              .map(([ verb, label ]) => (
                <MenuItem key={verb} value={verb}>{label}</MenuItem>
              ))}
          </TextField>

          {usesWho && whoField}
          {usesSkill && skillFields}
          {usesState && stateField}
          {usesImage && imageFields}
          {usesQuicken && quickenFields}
          {usesSpawn && spawnFields}
          {usesSpawn && animationNumberField('Arrives in', 'An animation played over it as it arrives; 0 for none.')}
          {usesTint && tintFields}
          {usesAnimation && animationField}
          {usesDialogue && faceFields}
          {usesDialogue && dialogueFields}
          {usesBlink && blinkFields}
          {usesWait && waitField}
          {usesLearnedSkill && skillSelect}
          {usesStartRoutine && startRoutineField}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default BossStepCard;
