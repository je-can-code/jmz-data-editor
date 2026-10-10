import React, { useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { canFollowAgain } from '../../core/blueprints/copyActions.ts';
import { followCopy, type CopyEditOutcome } from '../../core/blueprints/copyEdits.ts';
import { copyTitle, summaryWords } from '../../core/blueprints/copyWords.ts';
import { mapHistoryKey } from '../../core/history/historyKeys.ts';
import { blueprintMapId, isMappableBlueprintId } from '../../core/model/documentKeys.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { openEventWindow } from '../mapEditorViews.ts';
import { useCopyView } from './copyView.ts';

/**
 * A copy of a blueprint, as the quick panel shows it above the copy's own settings: what it is a copy of, how far it
 * stands apart from the blueprint, or why no change to the blueprint reaches it, with a way to follow the blueprint again
 * in everything, as one step in the map's history, and a way to open the blueprint's event in its own window. Field by
 * field, pinning and unlinking are the event window's.
 * @param {{ mapId: number, copy: RmmzMapEvent }} props The map, and the copy, as the map holds it.
 * @returns {React.JSX.Element | null} The section, or nothing for an event that is no copy.
 */
const CopyQuickSection = (props: { readonly mapId: number; readonly copy: RmmzMapEvent }) =>
{
  const { mapId, copy } = props;
  const { hub, shell } = useMapEditorServices();
  const view = useCopyView(mapId, copy);
  const [ problem, setProblem ] = useState<string | null>(null);
  if (view.kind !== 'ready')
  {
    return (
      <Typography variant={'body2'} color={view.kind === 'failed' ? 'error' : 'text.secondary'}>
        {view.message}
      </Typography>
    );
  }

  const { reading, context } = view;
  if (reading.kind === 'plain')
  {
    return null;
  }

  /**
   * Takes an outcome, keeping why it was refused in view.
   * @param {CopyEditOutcome} outcome The outcome.
   */
  const take = (outcome: CopyEditOutcome) =>
  {
    setProblem(outcome.ok ? null : outcome.message);
  };

  /**
   * Opens the blueprint's event the copy was made from in its own window, saying so when the window was blocked.
   */
  const openBlueprint = () =>
  {
    if (openEventWindow(shell, blueprintMapId(reading.link.blueprintId), reading.link.eventId) === 'blocked')
    {
      setProblem('The blueprint\'s window was blocked; allow pop-ups for the editor to open it.');
    }
  };

  return (
    <Box data-testid={'copy-quick-section'}>
      <Typography variant={'subtitle2'} noWrap title={copyTitle(reading, copy.id)}>
        {copyTitle(reading, copy.id)}
      </Typography>
      <Typography variant={'caption'} color={reading.kind === 'read' ? 'text.secondary' : 'warning.main'} sx={{ display: 'block' }} data-testid={'copy-summary'}>
        {summaryWords(reading)}
      </Typography>
      <Stack direction={'row'} spacing={1} sx={{ mt: 0.5 }}>
        {reading.kind !== 'lost' && (
          <Button size={'small'} variant={'outlined'} disabled={canFollowAgain(reading) === false} onClick={() => take(followCopy(hub, { mapId, eventId: copy.id, history: mapHistoryKey(mapId) }, context))}>
            Follow the blueprint again
          </Button>
        )}
        {reading.blueprint !== null && isMappableBlueprintId(reading.link.blueprintId) && (
          <Button size={'small'} onClick={openBlueprint}>
            Open blueprint
          </Button>
        )}
      </Stack>
      {problem !== null && (
        <Alert severity={'error'} sx={{ py: 0, mt: 0.5 }} onClose={() => setProblem(null)}>
          {problem}
        </Alert>
      )}
    </Box>
  );
};

export { CopyQuickSection };
