import React, { useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { startingCell, type MapLocation } from '../../core/locations/LocationPicks.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import { isTextEntry } from '../../core/workspace/shortcuts.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { EditorEnvironmentProvider, type HandBuiltEditorEnvironment } from '../commandEditors/editorEnvironment.tsx';
import { MapPicker } from '../commandEditors/MapPicker.tsx';
import { LocationPickerMap } from './LocationPickerMap.tsx';

/**
 * What a location picker holds while it is open: the map it shows, and the tile picked there.
 */
type ShownPick = {
  readonly mapId: number;
  readonly cell: MapCell | null;
};

/**
 * What a location picker starts from, and who hears how it ends.
 */
type LocationPickerDialogProps = {
  /**
   * Where the picker starts: where the transfer goes now.
   */
  readonly start: MapLocation;

  /**
   * Hears how it ends.
   * @param {MapLocation | null} location The place picked, or null when the author gave up.
   */
  readonly onClose: (location: MapLocation | null) => void;
};

/**
 * Reports whether a key press should finish the picker: Enter, anywhere but the map field, where it chooses the map
 * typed, and a button, which Enter presses itself.
 * @param {React.KeyboardEvent} event The key press.
 * @returns {boolean} True when it finishes.
 */
const finishesPicker = (event: React.KeyboardEvent): boolean =>
{
  const target = event.target as HTMLElement;
  return event.key === 'Enter' && isTextEntry(target) === false && target.tagName !== 'BUTTON';
};

/**
 * Picks a place on a map, as MZ's own location picker does: choose the map, then click the tile. It opens on the map
 * the transfer goes to now, with its landing tile picked and centred. Choosing another map shows that one whole with
 * nothing picked, since the same numbers name an unrelated spot there, and coming back to the first brings its tile
 * back.
 *
 * A double-click picks and finishes, and OK or Enter finish with the tile picked; Cancel or Escape give up. A click
 * outside the picker does nothing, so a careful pick is never lost to a stray click.
 * @param {LocationPickerDialogProps} props Where to start, and who hears how it ends.
 * @returns {React.JSX.Element} The picker.
 */
const LocationPickerDialog = (props: LocationPickerDialogProps) =>
{
  const { start, onClose } = props;
  const { api, pluginHeaders } = useMapEditorServices();
  const [ shown, setShown ] = useState<ShownPick>(() => ({ mapId: start.mapId, cell: startingCell(start, start.mapId) }));

  // the map field reads the map tree through the editors' environment, as it does in the transfer editor.
  const environment = useMemo<HandBuiltEditorEnvironment>(() => ({ api, headers: pluginHeaders }), [ api, pluginHeaders ]);
  const { mapId, cell } = shown;
  const picked: MapLocation | null = cell === null ? null : { mapId, x: cell.x, y: cell.y };

  /**
   * Finishes with the tile picked; with none picked on the map shown, there is nothing to finish with.
   */
  const confirm = () =>
  {
    if (picked !== null)
    {
      onClose(picked);
    }
  };

  return (
    <Dialog
      open
      maxWidth={false}
      aria-labelledby={'location-picker-title'}
      onClose={(_event, reason) => reason !== 'backdropClick' && onClose(null)}
      onKeyDown={event =>
      {
        if (finishesPicker(event))
        {
          confirm();
        }
      }}
      sx={{ '& .MuiDialog-paper': { width: 'min(1200px, 94vw)', height: 'min(860px, 90vh)' } }}
    >
      <DialogTitle id={'location-picker-title'}>
        Choose the destination
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1 }}>
          <EditorEnvironmentProvider environment={environment}>
            <MapPicker label={'Map'} value={mapId} onChange={next => setShown({ mapId: next, cell: startingCell(start, next) })}/>
          </EditorEnvironmentProvider>
          <Typography variant={'body2'} color={'text.secondary'}>
            Click the tile to land on, or double-click it to land there and close. The wheel zooms and the right button
            pans.
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative', border: 1, borderColor: 'divider' }}>
          <LocationPickerMap
            mapId={mapId}
            picked={cell}
            focus={startingCell(start, mapId)}
            onPick={next => setShown({ mapId, cell: next })}
            onConfirm={next => onClose({ mapId, x: next.x, y: next.y })}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ flex: 1, pl: 2 }} data-testid={'location-picker-readout'}>
          {picked === null ? 'No tile picked on this map yet.' : `Lands on ${picked.x}, ${picked.y}`}
        </Typography>
        <Button onClick={() => onClose(null)}>
          Cancel
        </Button>
        <Button variant={'contained'} disabled={picked === null} onClick={confirm}>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export { LocationPickerDialog };
export type { LocationPickerDialogProps };
