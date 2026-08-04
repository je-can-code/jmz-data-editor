import { Box, Card, CardContent, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { Delete } from '@mui/icons-material';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { type BossStep, withSkillSelection } from '@core/domain/valueObjects/boss-config.ts';

/**
 * The label shown for each verb a step can perform. Authors think in terms of what the boss does, not
 * in terms of the property name the file stores.
 */
const VERB_LABELS: Record<string, string> = {
  forceSkill: 'Use a skill',
};

type BossStepCardProps = {
  step: BossStep;
  index: number;
  onChange: (updated: BossStep) => void;
  onRemove: () => void;
};

/**
 * One instruction inside a routine, always expanded so a whole routine reads top to bottom without
 * clicking anything.
 */
const BossStepCard = ({ step, index, onChange, onRemove }: BossStepCardProps) =>
{
  const { skills, byId } = useSkills();

  const handleSkillChange = (skillId: number) =>
  {
    const selected = byId.get(skillId);
    const name = selected ? selected.name : '';

    onChange(withSkillSelection(step, skillId, name));
  };

  const selectableSkills = skills.filter(skill => skill.name.trim() !== '');

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
        </Stack>
      </CardContent>
    </Card>
  );
};

export default BossStepCard;
