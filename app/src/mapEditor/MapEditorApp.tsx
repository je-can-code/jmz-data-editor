import React from 'react';
import { Box } from '@mui/material';
import { useMapEditorServices } from './services/MapEditorServicesContext.tsx';
import { CommonEventsView } from './views/commonEvents/CommonEventsView.tsx';
import { ConflictBanner } from './views/ConflictBanner.tsx';
import { EmptyWorkspace } from './views/EmptyWorkspace.tsx';
import { EventWindowView } from './views/EventWindowView.tsx';
import type { MapEditorView } from './views/mapEditorViews.ts';

/**
 * Shows what a window is for.
 * @param {{ view: MapEditorView }} props The window's view.
 * @returns {React.JSX.Element} The window's content.
 */
const WindowContent = (props: { readonly view: MapEditorView }) =>
{
  const { view } = props;
  switch (view.kind)
  {
    case 'event':
      return <EventWindowView mapId={view.mapId} eventId={view.eventId}/>;
    case 'common-events':
      return <Box sx={{ height: '100vh' }}><CommonEventsView/></Box>;
    case 'workspace':
      return <EmptyWorkspace/>;
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
