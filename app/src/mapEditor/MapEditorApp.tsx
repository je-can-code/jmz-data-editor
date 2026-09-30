import React from 'react';
import { Box } from '@mui/material';
import { MapView, mapIdFromQuery } from './render/MapView.tsx';
import { useMapEditorServices } from './services/MapEditorServicesContext.tsx';
import { CommonEventsView } from './views/commonEvents/CommonEventsView.tsx';
import { ConflictBanner } from './views/ConflictBanner.tsx';
import { EventWindowView } from './views/EventWindowView.tsx';
import type { MapEditorView } from './views/mapEditorViews.ts';
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
  // page, which is what the speed script and the parity check measure.
  const openedMap = view.kind === 'workspace'
    ? mapIdFromQuery(window.location.search)
    : null;
  if (openedMap !== null)
  {
    return <Box sx={{ height: '100vh' }}><MapView mapId={openedMap}/></Box>;
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
 * The map editor's root: shows whatever this window is for, with any document conflict above it.
 * @returns {React.JSX.Element} The window's content.
 */
const MapEditorApp = () =>
{
  const { view } = useMapEditorServices();

  return (
    <>
      <WindowContent view={view}/>
      <ConflictBanner/>
    </>
  );
};

export { MapEditorApp };
