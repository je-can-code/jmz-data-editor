import React, { useSyncExternalStore } from 'react';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { LocationPickerDialog } from './LocationPickerDialog.tsx';

/**
 * Shows the window's location picker whenever an editor asks for a place on a map, such as the transfer editor's
 * "pick on the map", and settles that ask with however the picker ends. Every window has one, beside its content, so
 * whichever window an editor sits in answers it. A new ask starts a fresh picker even while one is showing, since the
 * ask before it was taken over.
 * @returns {React.JSX.Element | null} The picker, or nothing while no ask is open.
 */
const LocationPickerHost = () =>
{
  const { locationPicks } = useMapEditorServices();
  const request = useSyncExternalStore(locationPicks.subscribe, locationPicks.current);
  if (request === null)
  {
    return null;
  }

  return (
    <LocationPickerDialog
      key={request.id}
      start={request.start}
      onClose={location => locationPicks.settle(request.id, location)}
    />
  );
};

export { LocationPickerHost };
