import React from 'react';
import { Alert, AppBar, Button, Snackbar, Toolbar, Typography } from '@mui/material';
import { ListAlt, Save, Storage } from '@mui/icons-material';
import { openDataEditor } from '../../core/infrastructure/shell/WindowShell.ts';
import { APP_TITLE, openCommonEventsWindow } from '../views/mapEditorViews.ts';
import type { NoticeSeverity } from './WorkspaceController.ts';
import { useHubVersion, useWorkspace, useWorkspaceState } from './workspaceHooks.tsx';

/**
 * The strip across the top of the workspace: the app's name, saving (with how many documents have unsaved edits),
 * the layout reset and the way to the common events and the data editor.
 * @param {{ onResetLayout: () => void }} props What resetting the layout does.
 * @returns {React.JSX.Element} The bar.
 */
const WorkspaceBar = (props: { onResetLayout: () => void }) =>
{
  const { onResetLayout } = props;
  const controller = useWorkspace();
  const { hub, shell } = controller.services;
  useHubVersion(hub);
  const unsaved = hub.dirtyKeys().length;

  return (
    <AppBar position={'static'} elevation={0}>
      <Toolbar variant={'dense'} sx={{ gap: 1 }}>
        <Typography variant={'h6'} sx={{ flex: 1 }}>
          {APP_TITLE}
        </Typography>
        <Button
          color={'inherit'}
          size={'small'}
          startIcon={<Save/>}
          disabled={unsaved === 0}
          onClick={() => controller.saveAll().catch(() => undefined)}
        >
          {unsaved === 0 ? 'Saved' : `Save (${unsaved})`}
        </Button>
        <Button color={'inherit'} size={'small'} onClick={onResetLayout}>
          Reset layout
        </Button>
        <Button color={'inherit'} onClick={() => openCommonEventsWindow(shell)} size={'small'} startIcon={<ListAlt/>} variant={'outlined'}>
          Common events
        </Button>
        <Button color={'inherit'} onClick={() => openDataEditor(shell)} size={'small'} startIcon={<Storage/>} variant={'outlined'}>
          Data editor
        </Button>
      </Toolbar>
    </AppBar>
  );
};

/**
 * How long each kind of notice stays up on its own, in milliseconds; an alarm stays until dismissed.
 */
const NOTICE_DURATIONS: Readonly<Record<NoticeSeverity, number | null>> = {
  info: 3000,
  error: 8000,
  alarm: null,
};

/**
 * How each kind of notice is coloured.
 */
const NOTICE_COLOURS: Readonly<Record<NoticeSeverity, 'info' | 'warning' | 'error'>> = {
  info: 'info',
  error: 'warning',
  alarm: 'error',
};

/**
 * The short message at the foot of the workspace: what a tree operation did, or why an undo could not happen. An
 * alarm (a failed write that could not be put back) stays, in red, until the author dismisses it.
 * @returns {React.JSX.Element} The message.
 */
const NoticeBar = () =>
{
  const controller = useWorkspace();
  const notice = useWorkspaceState(state => state.notice);
  const severity = notice?.severity ?? 'info';

  /**
   * Hides the message showing.
   */
  const close = () =>
  {
    if (notice !== null)
    {
      controller.dismissNotice(notice.id);
    }
  };

  return (
    <Snackbar
      key={notice?.id ?? 0}
      open={notice !== null}
      autoHideDuration={NOTICE_DURATIONS[severity]}
      onClose={(_, reason) =>
      {
        // an alarm goes only when dismissed, never with a click elsewhere.
        if (severity !== 'alarm' || reason !== 'clickaway')
        {
          close();
        }
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Alert severity={NOTICE_COLOURS[severity]} variant={'filled'} onClose={close} data-testid={'workspace-notice'}>
        {notice?.text ?? ''}
      </Alert>
    </Snackbar>
  );
};

export { NoticeBar, WorkspaceBar };
