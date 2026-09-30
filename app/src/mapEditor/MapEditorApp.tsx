import React from 'react';
import { useMapEditorServices } from './services/MapEditorServicesContext.tsx';
import { EmptyWorkspace } from './views/EmptyWorkspace.tsx';
import { EventWindowView } from './views/EventWindowView.tsx';

/**
 * The map editor's root: shows whatever this window is for.
 * @returns {React.JSX.Element} The window's content.
 */
const MapEditorApp = () =>
{
  const { view } = useMapEditorServices();

  if (view.kind === 'event')
  {
    return <EventWindowView mapId={view.mapId} eventId={view.eventId}/>;
  }

  return <EmptyWorkspace/>;
};

export { MapEditorApp };
