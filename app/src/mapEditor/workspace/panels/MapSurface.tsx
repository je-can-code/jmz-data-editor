import React from 'react';
import { Box } from '@mui/material';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import { MapView } from '../../render/MapView.tsx';
import { usePanelWindow } from '../windowScope.tsx';

/**
 * What a map panel hands whatever draws its map.
 */
type MapSurfaceProps = {
  /**
   * The map, held for as long as the panel shows it.
   */
  readonly document: MapDocument;

  /**
   * The event to pick out, such as the one the data editor asked to see, or null.
   */
  readonly focusEventId: number | null;
};

/**
 * Counts the windows and documents given keys so far.
 */
let keyCount = 0;

/**
 * The key of every window and map document a surface has shown, by identity, forgotten with the object.
 */
const identityKeys = new WeakMap<object, number>();

/**
 * Finds the key standing for one object: the same for as long as the object lives, and never another object's.
 * @param {object} value The window or the document.
 * @returns {number} Its key.
 */
const identityKey = (value: object): number =>
{
  const known = identityKeys.get(value);
  if (known !== undefined)
  {
    return known;
  }

  keyCount += 1;
  identityKeys.set(value, keyCount);
  return keyCount;
};

/**
 * Draws one map inside a map panel with the real renderer, the map view: tiles, events and overlays as the game draws
 * them, its switches and status line, panning while the right mouse button is held and zooming on the wheel. This is
 * the single place the renderer plugs into the workspace, and it draws on its own loop, never through React. The event
 * the panel picks out, such as the battler the data editor asked to see, shows selected with the view centred on it.
 *
 * A map view belongs to one window: its canvas, its GPU context, the size it follows and the frames it draws on all
 * come from the document it was mounted in. Tearing the panel out or putting it back moves it to another window, so
 * the view starts afresh there instead of drawing on for a window it has left. It starts afresh too when the panel's
 * map comes back as a new document, so it never draws a copy the window has let go of.
 * @param {MapSurfaceProps} props The map and the event to pick out.
 * @returns {React.JSX.Element} The surface.
 */
const MapSurface = (props: MapSurfaceProps) =>
{
  const { document, focusEventId } = props;
  const panelWindow = usePanelWindow();

  // a new window or a new document is a new key, which mounts a new view in place of the old one.
  const viewKey = `${identityKey(panelWindow)}:${identityKey(document)}`;

  return (
    <Box data-testid={'map-surface'} sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <MapView key={viewKey} mapId={document.mapId} pickedEventId={focusEventId}/>
    </Box>
  );
};

export { MapSurface };
export type { MapSurfaceProps };
