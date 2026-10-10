import React from 'react';
import { Box } from '@mui/material';
import type { EventSelection } from '../../core/events/EventSelection.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import type { WindowPaint } from '../../core/tools/WindowPaint.ts';
import type { EventNoticeSeverity } from '../../events/MapEventTools.ts';
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

  /**
   * The number of the ask that named that event; a new number asks for the same event to be picked out again. Left
   * out, each event is picked out once.
   */
  readonly focusRequest?: number;

  /**
   * The cell to centre on, such as the middle of a blueprint's placement the Blueprints section asked to see, or null.
   * Left out, nothing.
   */
  readonly focusCell?: MapCell | null;

  /**
   * The number of the ask that named that cell; a new number centres on it again. Left out, each cell is centred on once.
   */
  readonly focusCellRequest?: number;

  /**
   * Whether the panel is on screen; false while it is a tab behind another.
   */
  readonly visible: boolean;

  /**
   * The window's event selection, shared by every map panel and the quick panel.
   */
  readonly selection?: EventSelection;

  /**
   * Tells the author something about the map's events, such as why a drop was refused.
   */
  readonly onNotice?: (text: string, severity: EventNoticeSeverity) => void;

  /**
   * What the map paints with: its window's paint. Left out, the page's own.
   */
  readonly paint?: WindowPaint;

  /**
   * The number of the ask to hand the map the keyboard, as bringing its tab forward asks; a new number hands it over
   * again. Left out, the map takes the keys only when clicked.
   */
  readonly keysRequest?: number;
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
 *
 * A panel behind another tab keeps its view, and tells it it is off screen, so the view lets its GPU context go (a
 * window keeps only so many) and draws again, as it was, when the panel is shown.
 * @param {MapSurfaceProps} props The map, the event to pick out and the ask that named it, whether the panel is on
 * screen, and what the map paints with.
 * @returns {React.JSX.Element} The surface.
 */
const MapSurface = (props: MapSurfaceProps) =>
{
  const { document, focusEventId, focusRequest = 0, focusCell = null, focusCellRequest = 0, visible, selection, onNotice, paint, keysRequest = 0 } = props;
  const panelWindow = usePanelWindow();

  // a new window or a new document is a new key, which mounts a new view in place of the old one.
  const viewKey = `${identityKey(panelWindow)}:${identityKey(document)}`;

  return (
    <Box data-testid={'map-surface'} sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <MapView
        key={viewKey}
        mapId={document.mapId}
        pickedEventId={focusEventId}
        pickRequest={focusRequest}
        lookAtCell={focusCell}
        lookRequest={focusCellRequest}
        visible={visible}
        selection={selection}
        onNotice={onNotice}
        paint={paint}
        keysRequest={keysRequest}
      />
    </Box>
  );
};

export { MapSurface };
export type { MapSurfaceProps };
