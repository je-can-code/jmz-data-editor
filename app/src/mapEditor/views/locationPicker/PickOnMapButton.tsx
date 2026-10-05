import React, { useState } from 'react';
import { Button } from '@mui/material';
import type { MapLocation } from '../../core/locations/LocationPicks.ts';
import { LocationPickerDialog } from './LocationPickerDialog.tsx';

/**
 * What the button picks from, and who hears the place picked.
 */
type PickOnMapButtonProps = {
  /**
   * Where the picker starts: the map and tile the setting holds now, or null when there is no one place to start
   * from, such as several transfers going to different places, which leaves the button unavailable.
   */
  readonly start: MapLocation | null;

  /**
   * Hears the place picked; giving up says nothing.
   * @param {MapLocation} location The map and the tile.
   */
  readonly onPick: (location: MapLocation) => void;
};

/**
 * "Pick on the map": opens the location picker on the place a setting holds now, and hands back the place picked. The
 * picker is drawn where the button is, in the button's own window, so a button in a panel torn out of the workspace
 * opens its picker in that window rather than behind it in the main one.
 *
 * The transfer editor reaches the same picker another way, through its environment's {@code pickLocation}, since the
 * hand-built editors are bound to the window outside React; anything else rendered in place uses this button.
 * @param {PickOnMapButtonProps} props Where to start, and who hears the place picked.
 * @returns {React.JSX.Element} The button, and the picker while it is open.
 */
const PickOnMapButton = (props: PickOnMapButtonProps) =>
{
  const { start, onPick } = props;
  const [ picking, setPicking ] = useState<MapLocation | null>(null);

  return (
    <>
      <Button size={'small'} disabled={start === null} onClick={() => setPicking(start)}>
        Pick on the map
      </Button>
      {picking === null
        ? null
        : (
          <LocationPickerDialog
            start={picking}
            onClose={location =>
            {
              setPicking(null);
              if (location !== null)
              {
                onPick(location);
              }
            }}
          />
        )}
    </>
  );
};

export { PickOnMapButton };
export type { PickOnMapButtonProps };
