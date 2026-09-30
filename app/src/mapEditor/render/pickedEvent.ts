import type { MapDocument } from '../core/model/MapDocument.ts';
import type { MapCell } from '../core/renderer/camera.ts';
import { NO_OVERLAY_STATE, type OverlayState } from '../core/renderer/MapRenderer.ts';

/**
 * How a map view picks out one event: the overlay state that shows it selected, and the cell to bring into view, or
 * null when there is nothing to look at.
 */
type PickedEvent = {
  readonly overlay: OverlayState;
  readonly cell: MapCell | null;
};

/**
 * Works out how a map view picks out an event, as when the data editor opens a map at one of its battlers: the event
 * shows selected and the view centres on its tile. With no event picked, or one the map does not hold, nothing is
 * selected and the view stays where it is.
 * @param {Pick<MapDocument, 'event'>} map The map on show.
 * @param {number | null} eventId The event to pick out, or null for none.
 * @returns {PickedEvent} The overlay state and the cell to look at.
 */
const pickEvent = (map: Pick<MapDocument, 'event'>, eventId: number | null): PickedEvent =>
{
  const event = eventId === null ? null : map.event(eventId);
  if (eventId === null || event === null)
  {
    return { overlay: NO_OVERLAY_STATE, cell: null };
  }

  return {
    overlay: { ...NO_OVERLAY_STATE, selectedEvents: [ eventId ] },
    cell: { x: event.x, y: event.y },
  };
};

export { pickEvent };
export type { PickedEvent };
