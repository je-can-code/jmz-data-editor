import React, { useState } from 'react';
import { AppBar, Box, Button, Divider, Toolbar, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Save } from '@mui/icons-material';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { useBoardActionsContext } from '@presentation/context/board-actions.context.tsx';

const ProjectPathAppBar = () =>
{
  const { projectRoot, reloadProjectFromDisk } = useProjectPath();
  const { boardActions } = useBoardActionsContext();
  const [ busy, setBusy ] = useState(false);

  const onReloadProject = async () =>
  {
    setBusy(true);
    try
    {
      await reloadProjectFromDisk();
    }
    finally
    {
      setBusy(false);
    }
  };

  return (
    <AppBar position={'static'}>
      <Toolbar variant={'dense'} sx={{ gap: 1 }}>
        <Typography variant="h6" sx={{ flexShrink: 0 }}>
          JMZ Data Editor
        </Typography>

        {boardActions && (
          <>
            <Divider orientation={'vertical'} flexItem sx={{ mx: 0.5 }}/>
            <Button
              size={'small'}
              color={'primary'}
              onClick={boardActions.onSave}
              disabled={!boardActions.canSave || boardActions.isSaving}
              loading={boardActions.isSaving}
              loadingPosition={'start'}
              startIcon={<Save/>}
              variant={'contained'}
            >
              Save
            </Button>
            <Button
              size={'small'}
              color={'inherit'}
              onClick={boardActions.onReload}
              loading={!boardActions.canReload}
              loadingPosition={'start'}
              startIcon={<RefreshIcon/>}
              variant={'outlined'}
            >
              Reload
            </Button>
          </>
        )}

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 2,
            minWidth: 0,
          }}
        >
          <Typography
            component="span"
            fontFamily={'monospace'}
            sx={{
              minWidth: 0,
              maxWidth: 'min(65vw, 960px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {projectRoot === ''
              ? 'project root unset — set it in the app (stored in localStorage) and ensure JMZ_PROJECT_ROOT is set for the Go API.'
              : projectRoot}
          </Typography>
          <Button
            color="inherit"
            disabled={busy}
            onClick={onReloadProject}
            size="small"
            startIcon={<RefreshIcon/>}
            sx={{ flexShrink: 0 }}
            variant="outlined"
          >
            Reload project
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default ProjectPathAppBar;
