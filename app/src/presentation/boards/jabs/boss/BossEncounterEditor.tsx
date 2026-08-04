import { useEffect, useState } from 'react';
import { Alert, Button, Grid, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { useEnemies } from '@presentation/context/resources/enemies.context.tsx';
import { loadMapJson } from '@services/DataService.ts';
import BossRoutineCard from './BossRoutineCard.tsx';
import {
  AI_CONTROL_MODES,
  type BossEncounter,
  type BossParticipant,
  type BossRoutine,
  createBossParticipant,
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

/**
 * One row from the chosen map's event list, used to pick which event hosts a participant.
 */
type MapEventOption = {
  id: number;
  name: string;
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
  const { rmmzDataPath } = useProjectPath();
  const { data: enemies, byId: enemiesById } = useEnemies();
  const [ mapEvents, setMapEvents ] = useState<MapEventOption[]>([]);
  const [ mapError, setMapError ] = useState<string>('');

  // whenever the chosen map changes, pull its event list so participants can be picked by name
  // instead of by an id an author would otherwise have to go look up in the RMMZ editor.
  useEffect(() =>
  {
    let cancelled = false;

    const loadEvents = async () =>
    {
      setMapError('');
      setMapEvents([]);

      if (!rmmzDataPath || encounter.map <= 0)
      {
        return;
      }

      try
      {
        const map = await loadMapJson(rmmzDataPath, encounter.map);
        if (cancelled)
        {
          return;
        }

        // RMMZ leaves holes in the event list where events were deleted, and index zero is never a
        // real event, so both get dropped before any of this reaches a dropdown.
        const options = (map.events ?? [])
          .filter((event): event is NonNullable<typeof event> => event !== null && event !== undefined)
          .map(event => ({ id: event.id ?? 0, name: event.name ?? '' }))
          .filter(option => option.id > 0);

        setMapEvents(options);
      }
      catch
      {
        if (cancelled === false)
        {
          setMapError(`Could not read map ${encounter.map}.`);
        }
      }
    };

    loadEvents();

    return () =>
    {
      cancelled = true;
    };
  }, [ rmmzDataPath, encounter.map ]);

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
                helperText={'The map this fight happens on.'}
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
          </Grid>

          {mapError !== '' && (
            <Alert severity={'warning'}>{mapError}</Alert>
          )}

          <Typography variant={'subtitle2'} color={'text.secondary'}>
            Bodies in this fight
          </Typography>

          {encounter.participants.map((participant, index) => (
            <Grid container spacing={2} key={index} alignItems={'flex-start'}>
              <Grid size={3}>
                <TextField
                  label={'Name'}
                  size={'small'}
                  fullWidth
                  value={participant.key}
                  onChange={event => patchParticipant(index, { ...participant, key: event.target.value })}
                />
              </Grid>
              <Grid size={4}>
                <TextField
                  select
                  label={'Event'}
                  size={'small'}
                  fullWidth
                  value={mapEvents.length === 0 || participant.eventId === 0
                    ? ''
                    : participant.eventId}
                  helperText={mapEvents.length === 0
                    ? 'Choose a map first.'
                    : 'The event that becomes this body.'}
                  onChange={event => patchParticipant(index, {
                    ...participant,
                    eventId: Number(event.target.value),
                  })}
                >
                  {mapEvents.map(option => (
                    <MenuItem key={option.id} value={option.id}>
                      {`${option.name} (${option.id})`}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={4}>
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
    </Stack>
  );
};

export default BossEncounterEditor;
