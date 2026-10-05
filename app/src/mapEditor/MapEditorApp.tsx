import React from 'react';
import { Box } from '@mui/material';
import { MapView, mapIdFromQuery } from './render/MapView.tsx';
import { useMapEditorServices } from './services/MapEditorServicesContext.tsx';
import { CommonEventsView } from './views/commonEvents/CommonEventsView.tsx';
import { ConflictBanner } from './views/ConflictBanner.tsx';
import { EventWindowView } from './views/EventWindowView.tsx';
import { LocationPickerHost } from './views/locationPicker/LocationPickerHost.tsx';
import type { MapEditorView } from './views/mapEditorViews.ts';
import { MapWithQuickPanel, wantsQuickPanel } from './views/quickPanel/MapWithQuickPanel.tsx';
import { Workspace } from './workspace/Workspace.tsx';

/**
 * Shows what a window is for.
 * @param {{ view: MapEditorView }} props The window's view.
 * @returns {React.JSX.Element} The window's content.
 */
const WindowContent = (props: { readonly view: MapEditorView }) =>
{
  const { view } = props;

  // ?map=102 opens that map alone across the whole window instead of the workspace: one map and one canvas on the
  // page, which is what the parity check measures. &quick=1 stands the map's quick panel beside it, sharing its
  // selection, which is what the speed script measures.
  const openedMap = view.kind === 'workspace'
    ? mapIdFromQuery(window.location.search)
    : null;
  if (openedMap !== null)
  {
    return (
      <Box sx={{ height: '100vh' }}>
        {wantsQuickPanel(window.location.search) ? <MapWithQuickPanel mapId={openedMap}/> : <MapView mapId={openedMap}/>}
      </Box>
    );
  }

  switch (view.kind)
  {
    case 'event':
      return <EventWindowView mapId={view.mapId} eventId={view.eventId}/>;
    case 'common-events':
      return <Box sx={{ height: '100vh' }}><CommonEventsView/></Box>;
    case 'workspace':
      return <Workspace/>;
  }
};

/**
 * The map editor's root: shows whatever this window is for, with any document conflict above it, and the location
 * picker whenever an editor in the window asks for a place on a map.
 * @returns {React.JSX.Element} The window's content.
 */
const MapEditorApp = () =>
{
  const { view } = useMapEditorServices();

  return (
    <>
      <WindowContent view={view}/>
      <ConflictBanner/>
      <LocationPickerHost/>
    </>
  );
};

export { MapEditorApp };
