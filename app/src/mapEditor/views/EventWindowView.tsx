import React from 'react';
import { AppBar, Box, Toolbar, Typography } from '@mui/material';

/**
 * What an event window is showing.
 */
type EventWindowViewProps = {
  readonly mapId: number;
  readonly eventId: number;
};

/**
 * An event's own window, opened by double-clicking the event. The full event editor fills it later; for now it
 * names the event it belongs to.
 * @param {EventWindowViewProps} props The map and event.
 * @returns {React.JSX.Element} The window's content.
 */
const EventWindowView = (props: EventWindowViewProps) =>
{
  const { mapId, eventId } = props;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position={'static'} elevation={0}>
        <Toolbar variant={'dense'}>
          <Typography variant={'h6'}>
            {`Event ${eventId}`}
          </Typography>
          <Typography variant={'body2'} sx={{ ml: 2, opacity: 0.7 }}>
            {`Map ${mapId}`}
          </Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
        <Typography variant={'body2'}>
          Nothing to edit here yet.
        </Typography>
      </Box>
    </Box>
  );
};

export { EventWindowView };
