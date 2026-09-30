import React from 'react';
import { Box } from '@mui/material';
import { MapView, mapIdFromQuery } from './render/MapView.tsx';
import { useMapEditorServices } from './services/MapEditorServicesContext.tsx';
import { ConflictBanner } from './views/ConflictBanner.tsx';
import { EventWindowView } from './views/EventWindowView.tsx';
import { Workspace } from './workspace/Workspace.tsx';

/**
 * The map editor's root: shows whatever this window is for, with any document conflict above it.
 * @returns {React.JSX.Element} The window's content.
 */
const MapEditorApp = () =>
{
  const { view } = useMapEditorServices();

  // ?map=102 opens that map alone across the whole window instead of the workspace: one map and one canvas on the
  // page, which is what the speed script and the parity check measure.
  const openedMap = view.kind === 'workspace'
    ? mapIdFromQuery(window.location.search)
    : null;

  return (
    <>
      {view.kind === 'event' && <EventWindowView mapId={view.mapId} eventId={view.eventId}/>}
      {view.kind === 'workspace' && openedMap === null && <Workspace/>}
      {openedMap !== null && (
        <Box sx={{ height: '100vh' }}>
          <MapView mapId={openedMap}/>
        </Box>
      )}
      <ConflictBanner/>
    </>
  );
};

export { MapEditorApp };
