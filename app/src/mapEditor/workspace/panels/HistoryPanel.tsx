import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { TREE_HISTORY_KEY, type HistoryKey } from '../../core/history/historyKeys.ts';
import type { HistoryOutcome } from '../../core/workspace/HistoryRouter.ts';
import type { WorkspaceController } from '../WorkspaceController.ts';
import { useHubVersion, useWorkspace, useWorkspaceState } from '../workspaceHooks.tsx';

/**
 * Names a history the way the author thinks of it.
 * @param {WorkspaceController} controller The workspace, for map names.
 * @param {HistoryKey} key The history.
 * @returns {string} Its name.
 */
const historyTitle = (controller: WorkspaceController, key: HistoryKey): string =>
{
  if (key === TREE_HISTORY_KEY)
  {
    return 'Map tree';
  }

  const [ kind, first, second ] = key.split(':');
  switch (kind)
  {
    case 'map':
      return controller.mapName(Number.parseInt(first, 10));
    case 'event':
      return `Event ${second} on ${controller.mapName(Number.parseInt(first, 10))}`;
    case 'blueprint':
      return `Blueprint ${first}`;
    default:
      return key;
  }
};

/**
 * The history of whatever has focus, the way paint programs show it: every step by name, oldest first, the steps
 * undone greyed below the current point, and a click on any row jumps there, undoing or redoing as many steps as it
 * takes. A step that a later edit blocks is named, with the choice to forget it and go on past it. Focusing this
 * panel never changes whose history it shows.
 * @returns {React.JSX.Element} The panel.
 */
const HistoryPanel = () =>
{
  const controller = useWorkspace();
  const { hub } = controller.services;
  const key = useWorkspaceState(state => state.activeHistory);
  const [ failure, setFailure ] = useState<Extract<HistoryOutcome, { ok: false }> | null>(null);
  useHubVersion(hub);

  // a failure belongs to the history it happened in.
  useEffect(() =>
  {
    setFailure(null);
  }, [ key ]);

  if (key === null)
  {
    return (
      <Box sx={{ p: 2, color: 'text.secondary' }}>
        <Typography variant={'body2'}>
          Click in a map or the map tree to see its history here.
        </Typography>
      </Box>
    );
  }

  const view = hub.history(key);

  /**
   * Jumps to just after a step, or before the first, showing why when it stops short.
   * @param {string | null} stepId The step, or null for the start.
   */
  const jump = (stepId: string | null) =>
  {
    controller.jumpTo(key, stepId)
      .then(outcome => setFailure(outcome.ok ? null : outcome))
      .catch(() => undefined);
  };

  /**
   * Forgets the step a later edit blocks, and clears the message.
   * @param {string} stepId The step.
   */
  const forget = (stepId: string) =>
  {
    controller.router.forget(stepId);
    setFailure(null);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }} data-testid={'history-panel'}>
      <Typography variant={'subtitle2'} sx={{ px: 1.5, pt: 1, pb: 0.5 }} noWrap>
        {historyTitle(controller, key)}
      </Typography>
      {failure !== null && failure.nothing === false && (
        <Alert
          severity={'warning'}
          sx={{ mx: 1, mb: 1 }}
          action={failure.stuckStepId === null
            ? undefined
            : <Button color={'inherit'} size={'small'} onClick={() => forget(failure.stuckStepId as string)}>Forget it</Button>}
        >
          {failure.message}
        </Alert>
      )}
      <List dense disablePadding sx={{ flex: 1, overflowY: 'auto' }}>
        <ListItemButton selected={view.position === 0} onClick={() => jump(null)}>
          <ListItemText primary={'Start'} slotProps={{ primary: { variant: 'body2', color: 'text.secondary' } }}/>
        </ListItemButton>
        {view.rows.map((row, index) => (
          <ListItemButton key={row.id} selected={view.position === index + 1} onClick={() => jump(row.id)}>
            <ListItemText
              primary={row.label}
              slotProps={{ primary: { variant: 'body2', sx: { opacity: row.done ? 1 : 0.45 } } }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
};

export { HistoryPanel };
