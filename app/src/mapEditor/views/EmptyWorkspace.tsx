import React from 'react';
import { AppBar, Box, Button, Toolbar, Typography } from '@mui/material';
import { ListAlt, Storage } from '@mui/icons-material';
import { openDataEditor } from '../../core/infrastructure/shell/WindowShell.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { APP_TITLE, openCommonEventsWindow } from './mapEditorViews.ts';

/**
 * The map editor's workspace before any map is open. The panels, the map tree and the tabs arrive with the
 * workspace shell; until then the whole window is one quiet, empty workspace.
 * @returns {React.JSX.Element} The workspace.
 */
const EmptyWorkspace = () =>
{
  const { shell } = useMapEditorServices();

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position={'static'} elevation={0}>
        <Toolbar variant={'dense'} sx={{ gap: 1 }}>
          <Typography variant={'h6'} sx={{ flex: 1 }}>
            {APP_TITLE}
          </Typography>
          <Button
            color={'inherit'}
            onClick={() => openCommonEventsWindow(shell)}
            size={'small'}
            startIcon={<ListAlt/>}
            variant={'outlined'}
          >
            Common events
          </Button>
          <Button
            color={'inherit'}
            onClick={() => openDataEditor(shell)}
            size={'small'}
            startIcon={<Storage/>}
            variant={'outlined'}
          >
            Data editor
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        data-testid={'map-editor-workspace'}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          color: 'text.secondary',
        }}
      >
        <Typography variant={'h5'}>
          No map open
        </Typography>
        <Typography variant={'body2'}>
          Maps you open will appear here.
        </Typography>
      </Box>
    </Box>
  );
};

export { EmptyWorkspace };
