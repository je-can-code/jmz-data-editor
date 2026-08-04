import { useState } from 'react';
import { Box, Button, Divider, List, ListItemButton, ListItemText, Paper, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { useBossConfig } from '@presentation/context/resources/boss.context.tsx';
import BossEncounterEditor from './BossEncounterEditor.tsx';
import { type BossConfigRoot, type BossEncounter, createBossEncounter } from '@core/domain/valueObjects/boss-config.ts';

/**
 * The Bosses tab of the JABS board — the boss fights J-ABS-Boss runs, out of `config.boss.json`.
 *
 * A fight authored here is data rather than a chain of event commands, which is what makes retiming a
 * routine or swapping a skill a one-field change instead of an afternoon.
 *
 * Saving and reloading belong to the parent board rather than to this tab, matching how the other JABS
 * tabs behave: one save persists everything the board is holding, so switching tabs can never strand
 * an edit the author thought they had written.
 */
const JabsBossesTab = () =>
{
  const {
    bossConfig,
    setConfig,
  } = useBossConfig();

  const [ selectedIndex, setSelectedIndex ] = useState(0);

  if (bossConfig === null)
  {
    return null;
  }

  const patch = (partial: Partial<BossConfigRoot>) =>
  {
    setConfig(prev => (prev === null
      ? prev
      : { ...prev, ...partial }) as BossConfigRoot);
  };

  const patchEncounter = (index: number, updated: BossEncounter) =>
  {
    const encounters = bossConfig.encounters.map((encounter, at) => (at === index
      ? updated
      : encounter));

    patch({ encounters });
  };

  const addEncounter = () =>
  {
    const encounters = [ ...bossConfig.encounters, createBossEncounter() ];

    patch({ encounters });

    // drop the author straight into the thing they just made.
    setSelectedIndex(encounters.length - 1);
  };

  const removeEncounter = (index: number) =>
  {
    const encounters = bossConfig.encounters.filter((_encounter, at) => at !== index);

    patch({ encounters });

    // keep the selection inside the list after whatever it pointed at goes away.
    const lastIndex = Math.max(0, encounters.length - 1);
    setSelectedIndex(Math.min(selectedIndex, lastIndex));
  };

  const selected = bossConfig.encounters[ selectedIndex ];

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 2, p: 2 }}>
      <Paper variant={'outlined'} sx={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography variant={'subtitle2'} sx={{ p: 1.5, pb: 1 }}>
          Boss Fights
        </Typography>
        <Divider/>
        <List dense sx={{ flex: 1, overflow: 'auto' }}>
          {bossConfig.encounters.map((encounter, index) => (
            <ListItemButton
              key={index}
              selected={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
            >
              <ListItemText
                primary={encounter.key.trim() === ''
                  ? 'Untitled fight'
                  : encounter.key}
                secondary={encounter.map > 0
                  ? `Map ${encounter.map}`
                  : 'No map chosen'}
              />
            </ListItemButton>
          ))}
        </List>
        <Divider/>
        <Button startIcon={<Add/>} onClick={addEncounter} sx={{ m: 1 }}>
          New fight
        </Button>
      </Paper>

      <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {selected === undefined
          ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              <Typography variant={'h6'}>No boss fights yet</Typography>
              <Typography variant={'body2'} color={'text.secondary'}>
                Create one to describe what a boss does while the player fights it.
              </Typography>
            </Stack>
          )
          : (
            <Stack spacing={2}>
              <BossEncounterEditor
                encounter={selected}
                onChange={updated => patchEncounter(selectedIndex, updated)}
              />
              <Button
                color={'error'}
                variant={'outlined'}
                sx={{ alignSelf: 'flex-start' }}
                onClick={() => removeEncounter(selectedIndex)}
              >
                Delete this fight
              </Button>
            </Stack>
          )}
      </Box>
    </Box>
  );
};

export default JabsBossesTab;
