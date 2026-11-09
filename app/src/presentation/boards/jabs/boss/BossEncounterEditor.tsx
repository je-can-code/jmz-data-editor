import { Button, Grid, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { useEnemies } from '@presentation/context/resources/enemies.context.tsx';
import BossReactionCard from './BossReactionCard.tsx';
import BossRoutineCard from './BossRoutineCard.tsx';
import {
  AI_CONTROL_MODES,
  type BossEncounter,
  type BossParticipant,
  type BossReaction,
  type BossRoutine,
  createBossParticipant,
  createBossReaction,
  createBossRoutine,
  withEnemySelection,
} from '@core/domain/valueObjects/boss-config.ts';

/**
 * How each control mode reads to an author, rather than what the file stores.
 */
const AI_CONTROL_LABELS: Record<string, string> = {
  shared: 'Fights normally, with these behaviors layered on top',
  scripted: 'These behaviors drive the fight completely',
};

type BossEncounterEditorProps = {
  encounter: BossEncounter;
  onChange: (updated: BossEncounter) => void;
};

/**
 * The full editor for a single boss fight.
 */
const BossEncounterEditor = ({ encounter, onChange }: BossEncounterEditorProps) =>
{
  const { data: enemies, byId: enemiesById } = useEnemies();

  const patchParticipant = (index: number, updated: BossParticipant) =>
  {
    const participants = encounter.participants.map((participant, at) => (at === index
      ? updated
      : participant));

    onChange({ ...encounter, participants });
  };

  const handleEnemyChange = (index: number, enemyId: number) =>
  {
    const selected = enemiesById.get(enemyId);
    const name = selected ? selected.name : '';

    patchParticipant(index, withEnemySelection(encounter.participants[ index ], enemyId, name));
  };

  const patchRoutine = (index: number, updated: BossRoutine) =>
  {
    const routines = encounter.routines.map((routine, at) => (at === index
      ? updated
      : routine));

    onChange({ ...encounter, routines });
  };

  const patchReaction = (index: number, updated: BossReaction) =>
  {
    const reactions = encounter.reactions.map((reaction, at) => (at === index
      ? updated
      : reaction));

    onChange({ ...encounter, reactions });
  };

  const selectableEnemies = enemies.filter(enemy => enemy.name.trim() !== '');

  return (
    <Stack spacing={2}>
      <BoardSectionCard title={'The Fight'} subtitle={'Where it happens and who takes part'}>
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid size={5}>
              <TextField
                label={'Name'}
                size={'small'}
                fullWidth
                value={encounter.key}
                helperText={'Used to start this fight from an event.'}
                onChange={event => onChange({ ...encounter, key: event.target.value })}
              />
            </Grid>
            <Grid size={3}>
              <TextField
                label={'Map'}
                type={'number'}
                size={'small'}
                fullWidth
                value={encounter.map}
                helperText={'The map holding this fight\'s arena.'}
                onChange={event => onChange({ ...encounter, map: Number(event.target.value) })}
                slotProps={{ htmlInput: { min: 0 } }}
              />
            </Grid>
            <Grid size={4}>
              <TextField
                select
                label={'Control'}
                size={'small'}
                fullWidth
                value={encounter.aiControl}
                onChange={event => onChange({
                  ...encounter,
                  aiControl: event.target.value as BossEncounter['aiControl'],
                })}
              >
                {AI_CONTROL_MODES.map(mode => (
                  <MenuItem key={mode} value={mode}>{AI_CONTROL_LABELS[ mode ]}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={5}>
              <TextField
                label={'Defeat switch'}
                type={'number'}
                size={'small'}
                fullWidth
                value={encounter.defeatSwitch}
                helperText={'Turned on once every body falls in this arena. Leave at 0 for none.'}
                onChange={event => onChange({ ...encounter, defeatSwitch: Number(event.target.value) })}
                slotProps={{ htmlInput: { min: 0 } }}
              />
            </Grid>
          </Grid>

          <Typography variant={'subtitle2'} color={'text.secondary'}>
            Bodies in this fight. Each one appears on its tile when the fight starts.
          </Typography>

          {encounter.participants.map((participant, index) => (
            <Grid container spacing={2} key={index} alignItems={'flex-start'}>
              <Grid size={2}>
                <TextField
                  label={'Name'}
                  size={'small'}
                  fullWidth
                  value={participant.key}
                  onChange={event => patchParticipant(index, { ...participant, key: event.target.value })}
                />
              </Grid>
              <Grid size={3}>
                <TextField
                  select
                  label={'Enemy'}
                  size={'small'}
                  fullWidth
                  value={participant.enemyId === 0
                    ? ''
                    : participant.enemyId}
                  helperText={'Which foe this body should be.'}
                  onChange={event => handleEnemyChange(index, Number(event.target.value))}
                >
                  {selectableEnemies.map(enemy => (
                    <MenuItem key={enemy.id} value={enemy.id}>
                      {`${enemy.name} (${enemy.id})`}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={2}>
                <TextField
                  label={'X'}
                  type={'number'}
                  size={'small'}
                  fullWidth
                  value={participant.x}
                  onChange={event => patchParticipant(index, { ...participant, x: Number(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Grid>
              <Grid size={2}>
                <TextField
                  label={'Y'}
                  type={'number'}
                  size={'small'}
                  fullWidth
                  value={participant.y}
                  onChange={event => patchParticipant(index, { ...participant, y: Number(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Grid>
              <Grid size={2}>
                <TextField
                  label={'Template'}
                  type={'number'}
                  size={'small'}
                  fullWidth
                  value={participant.template}
                  helperText={'A dressed-up copy on the enemy map. 0 for the usual one.'}
                  onChange={event => patchParticipant(index, { ...participant, template: Number(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Grid>
              <Grid size={1}>
                <Tooltip title={'Remove this body'}>
                  <span>
                    <IconButton
                      sx={{ mt: 0.5 }}
                      disabled={encounter.participants.length <= 1}
                      onClick={() => onChange({
                        ...encounter,
                        participants: encounter.participants.filter((_p, at) => at !== index),
                      })}
                    >
                      <Delete/>
                    </IconButton>
                  </span>
                </Tooltip>
              </Grid>
            </Grid>
          ))}

          <Button
            startIcon={<Add/>}
            size={'small'}
            sx={{ alignSelf: 'flex-start' }}
            onClick={() => onChange({
              ...encounter,
              participants: [ ...encounter.participants, createBossParticipant() ],
            })}
          >
            Add body
          </Button>
        </Stack>
      </BoardSectionCard>

      {encounter.routines.map((routine, index) => (
        <BossRoutineCard
          key={index}
          routine={routine}
          participants={encounter.participants}
          routines={encounter.routines}
          onChange={updated => patchRoutine(index, updated)}
          onRemove={() => onChange({
            ...encounter,
            routines: encounter.routines.filter((_r, at) => at !== index),
          })}
        />
      ))}

      <Button
        startIcon={<Add/>}
        variant={'outlined'}
        sx={{ alignSelf: 'flex-start' }}
        onClick={() => onChange({ ...encounter, routines: [ ...encounter.routines, createBossRoutine() ] })}
      >
        Add routine
      </Button>

      {encounter.reactions.map((reaction, index) => (
        <BossReactionCard
          key={index}
          reaction={reaction}
          participants={encounter.participants}
          routines={encounter.routines}
          onChange={updated => patchReaction(index, updated)}
          onRemove={() => onChange({
            ...encounter,
            reactions: encounter.reactions.filter((_r, at) => at !== index),
          })}
        />
      ))}

      <Button
        startIcon={<Add/>}
        variant={'outlined'}
        sx={{ alignSelf: 'flex-start' }}
        onClick={() => onChange({ ...encounter, reactions: [ ...encounter.reactions, createBossReaction() ] })}
      >
        Add reaction
      </Button>
    </Stack>
  );
};

export default BossEncounterEditor;
