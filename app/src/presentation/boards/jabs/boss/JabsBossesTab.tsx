import { useState } from 'react';
import { Box, Button, Divider, List, ListItemButton, ListItemText, Paper, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { useJabs } from '@presentation/context/resources/jabs.context.tsx';
import BossEncounterEditor from './BossEncounterEditor.tsx';
import { type BossEncounter, createBossEncounter } from '@core/domain/valueObjects/boss-config.ts';
import type { JabsConfigRoot } from '@core/domain/valueObjects/jabs-config.ts';

/**
 * The Bosses tab of the JABS board — the boss fights J-ABS-Boss runs.
 *
 * Encounters live in the `bosses` block of `config.jabs.json`, sharing the file with `teams` and
 * `juice`, so this tab reads and writes the same config root as its sibling tabs.
 *
 * A fight authored here is data rather than a chain of event commands, which is what makes retiming a
 * routine or swapping a skill a one-field change instead of an afternoon.
 *
 * Saving and reloading belong to the parent board rather than to this tab, matching how the other JABS
 * tabs behave: one save persists the whole config root regardless of which tab was touched.
 */
const JabsBossesTab = () =>
{
  const {
    jabsConfig,
    setConfig,
  } = useJabs();

  const [ selectedIndex, setSelectedIndex ] = useState(0);

  if (jabsConfig === null)
  {
    return null;
  }

  const patchBosses = (bosses: BossEncounter[]) =>
  {
    setConfig(prev => (prev === null
      ? prev
      : { ...prev, bosses }) as JabsConfigRoot);
  };

  const patchEncounter = (index: number, updated: BossEncounter) =>
  {
    const bosses = jabsConfig.bosses.map((encounter, at) => (at === index
      ? updated
      : encounter));

    patchBosses(bosses);
  };

  const addEncounter = () =>
  {
    const bosses = [ ...jabsConfig.bosses, createBossEncounter() ];

    patchBosses(bosses);

    // drop the author straight into the thing they just made.
    setSelectedIndex(bosses.length - 1);
  };

  const removeEncounter = (index: number) =>
  {
    const bosses = jabsConfig.bosses.filter((_encounter, at) => at !== index);

    patchBosses(bosses);

    // keep the selection inside the list after whatever it pointed at goes away.
    const lastIndex = Math.max(0, bosses.length - 1);
    setSelectedIndex(Math.min(selectedIndex, lastIndex));
  };

  const selected = jabsConfig.bosses[ selectedIndex ];

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 2, p: 2 }}>
      <Paper variant={'outlined'} sx={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography variant={'subtitle2'} sx={{ p: 1.5, pb: 1 }}>
          Boss Fights
        </Typography>
        <Divider/>
        <List dense sx={{ flex: 1, overflow: 'auto' }}>
          {jabsConfig.bosses.map((encounter, index) => (
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
