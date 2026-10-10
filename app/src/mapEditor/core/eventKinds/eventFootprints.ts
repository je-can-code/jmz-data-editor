import type { EventArea } from '../events/eventAreas.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { EventKindDefinition } from '../modules/PluginModule.ts';
import type { ExitWay, FootprintReader } from '../renderer/MapRenderer.ts';
import { MARKER_STYLES, markerSymbolFor } from './eventMarkers.ts';
import { readTransfers, TRANSFER_KIND_ID } from './transferKind.ts';

/**
 * What an event's footprint is read from: the area a page covers, and the kind an event on a map is, as the window's
 * plugin modules read both.
 */
type FootprintSource = {
  areaOf(page: RmmzEventPage): EventArea | null;
  kindOf(event: RmmzMapEvent, mapId: number): EventKindDefinition | null;
};

/**
 * The ways an exit can send the player that point somewhere: down, left, right and up.
 */
const POINTED_WAYS: readonly ExitWay[] = [ 2, 4, 6, 8 ];

/**
 * Reads a marker's colour, as its style names it in CSS, as the number a renderer draws with.
 * @param {string} colour Such as {@code #2e7d32}.
 * @returns {number} Such as {@code 0x2e7d32}.
 */
const colourNumber = (colour: string): number =>
{
  return Number.parseInt(colour.slice(1), 16);
};

/**
 * Finds the way a transfer's page sends the player, when the page is one of its transfer pages: the way the player faces
 * on arrival, which on a map-edge exit is the way through it, or 0 for a transfer keeping the way the player faced.
 * @param {RmmzMapEvent} event The transfer.
 * @param {RmmzEventPage} page The page it is shown with.
 * @returns {ExitWay | null} The way, or null for a page that sends the player nowhere, such as a locked door's message.
 */
const exitWayOf = (event: RmmzMapEvent, page: RmmzEventPage): ExitWay | null =>
{
  const spot = (readTransfers(event) ?? []).find(each => event.pages[each.pageIndex] === page);
  if (spot === undefined)
  {
    return null;
  }

  const way = POINTED_WAYS.find(each => each === spot.model.direction);
  return way ?? 0;
};

/**
 * Builds how a map's events show the areas their pages cover, from the window's plugin modules: an area a module reads
 * for the page an event is shown with, drawn in the colour of the event's marker, and, when the event is a transfer whose
 * page sends the player on, drawn as an exit strip pointing the way it sends them. A page covering only its own tile, by
 * declaring an area of one tile by one or none at all, shows no footprint. The modules are read as they stand whenever
 * an event is drawn, so the reader is built once for a map view and follows them switching on.
 * @param {FootprintSource} modules The window's plugin modules.
 * @returns {FootprintReader} The reader.
 */
const footprintReaderFor = (modules: FootprintSource): FootprintReader =>
{
  return (event: RmmzMapEvent, mapId: number, page: RmmzEventPage) =>
  {
    const area = modules.areaOf(page);
    if (area === null || (area.width === 1 && area.height === 1))
    {
      return null;
    }

    // the footprint takes its marker's colour, so the two read as one.
    const kind = modules.kindOf(event, mapId);
    const colour = colourNumber(MARKER_STYLES[markerSymbolFor(event, kind, page)].colour);
    const exit = kind !== null && kind.id === TRANSFER_KIND_ID
      ? exitWayOf(event, page)
      : null;
    return { area, colour, exit };
  };
};

export { colourNumber, exitWayOf, footprintReaderFor };
export type { FootprintSource };
