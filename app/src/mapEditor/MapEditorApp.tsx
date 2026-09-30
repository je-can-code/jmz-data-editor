import React from 'react';
import { useMapEditorServices } from './services/MapEditorServicesContext.tsx';
import { ConflictBanner } from './views/ConflictBanner.tsx';
import { EmptyWorkspace } from './views/EmptyWorkspace.tsx';
import { EventWindowView } from './views/EventWindowView.tsx';

/**
 * The map editor's root: shows whatever this window is for, with any document conflict above it.
 * @returns {React.JSX.Element} The window's content.
 */
const MapEditorApp = () =>
{
  const { view } = useMapEditorServices();

  return (
    <>
      {view.kind === 'event'
        ? <EventWindowView mapId={view.mapId} eventId={view.eventId}/>
        : <EmptyWorkspace/>}
      <ConflictBanner/>
    </>
  );
};

export { MapEditorApp };
