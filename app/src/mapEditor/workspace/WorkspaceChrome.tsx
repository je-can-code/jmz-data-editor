import React from 'react';
import { Alert, AppBar, Button, Snackbar, Toolbar, Typography } from '@mui/material';
import { Save, Storage } from '@mui/icons-material';
import { openDataEditor } from '../../core/infrastructure/shell/WindowShell.ts';
import { APP_TITLE } from '../views/mapEditorViews.ts';
import { useHubVersion, useWorkspace, useWorkspaceState } from './workspaceHooks.tsx';

/**
 * The strip across the top of the workspace: the app's name, saving (with how many documents have unsaved edits),
 * the layout reset and the way to the data editor.
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
        <Button color={'inherit'} onClick={() => openDataEditor(shell)} size={'small'} startIcon={<Storage/>} variant={'outlined'}>
          Data editor
        </Button>
      </Toolbar>
    </AppBar>
  );
};

/**
 * The short message at the foot of the workspace: what a tree operation did, or why an undo could not happen.
 * @returns {React.JSX.Element} The message.
 */
const NoticeBar = () =>
{
  const controller = useWorkspace();
  const notice = useWorkspaceState(state => state.notice);

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
      autoHideDuration={notice?.severity === 'error' ? 8000 : 3000}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Alert severity={notice?.severity === 'error' ? 'warning' : 'info'} variant={'filled'} onClose={close} data-testid={'workspace-notice'}>
        {notice?.text ?? ''}
      </Alert>
    </Snackbar>
  );
};

export { NoticeBar, WorkspaceBar };
