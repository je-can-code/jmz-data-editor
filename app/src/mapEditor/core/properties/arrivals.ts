import { parseTransferPlayer, TRANSFER_DESIGNATION } from '../commands/editors/transferPlayer.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { ResizePlan } from './resizeMap.ts';

/**
 * One transfer that names outright a tile of some map as where it lands: the map it is on, its event and page, and
 * the tile. The server finds these on every map on disk; a map open in this window is read from its live copy
 * instead, so a transfer placed and not yet saved counts too.
 */
type MapArrival = {
  readonly mapId: number;
  readonly mapName: string;
  readonly eventId: number;
  readonly eventName: string;
  readonly pageIndex: number;
  readonly x: number;
  readonly y: number;
};

/**
 * A transfer a resize would leave pointing at the wrong tile: where it lands, and where the tile it lands on goes,
 * or null when the resize cuts that tile off.
 */
type StrandedArrival = MapArrival & {
  readonly movedTo: { readonly x: number; readonly y: number } | null;
};

/**
 * A map read for the transfers on it: its id and name, and its events as they stand.
 */
type ArrivalSource = {
  readonly mapId: number;
  readonly mapName: string;
  readonly events: readonly (RmmzMapEvent | null)[];
};

/**
 * Finds the transfers on one map that land on a given map, itself included, the way the server finds them on disk:
 * in event, page and command order, a landing repeated on one page listed once, and a transfer by variables left out,
 * since it names no map until the game runs.
 * @param {ArrivalSource} source The map the transfers are on.
 * @param {number} targetMapId The map they land on.
 * @returns {MapArrival[]} The transfers.
 */
const arrivalsFrom = (source: ArrivalSource, targetMapId: number): MapArrival[] =>
{
  const found: MapArrival[] = [];
  source.events.forEach(event =>
  {
    // the events are indexed by id, so every deleted event leaves a null behind.
    if (event === null)
    {
      return;
    }

    event.pages.forEach((page, pageIndex) => page.list.forEach(command =>
    {
      const transfer = parseTransferPlayer(command);
      if (transfer === null || transfer.designation !== TRANSFER_DESIGNATION.direct || transfer.mapId !== targetMapId)
      {
        return;
      }

      const repeated = found.some(each => each.eventId === event.id && each.pageIndex === pageIndex && each.x === transfer.x && each.y === transfer.y);
      if (repeated === false)
      {
        found.push({ mapId: source.mapId, mapName: source.mapName, eventId: event.id, eventName: event.name, pageIndex, x: transfer.x, y: transfer.y });
      }
    }));
  });

  return found;
};

/**
 * Puts the live reading of the maps open in this window in place of what the disk says of them, keeping everything
 * else, ordered by map, then event, then page, with each page's own order kept.
 * @param {readonly MapArrival[]} disk The transfers the server found on disk.
 * @param {readonly MapArrival[]} live The transfers found on the maps open here.
 * @param {ReadonlySet<number>} liveMapIds The maps open here, whose disk answer is set aside.
 * @returns {MapArrival[]} The transfers.
 */
const withLiveArrivals = (disk: readonly MapArrival[], live: readonly MapArrival[], liveMapIds: ReadonlySet<number>): MapArrival[] =>
{
  const kept = disk.filter(arrival => liveMapIds.has(arrival.mapId) === false);
  return [ ...kept, ...live ].sort((left, right) => left.mapId - right.mapId || left.eventId - right.eventId || left.pageIndex - right.pageIndex);
};

/**
 * Lists the transfers a resize would leave pointing at the wrong tile. A transfer keeps the tile numbers it names,
 * so every one whose tile the anchor moves now lands somewhere else, and one whose tile falls outside the new size
 * lands off the map. Transfers whose tile stays where it was are left out.
 * @param {readonly MapArrival[]} arrivals The transfers landing on the map.
 * @param {Pick<ResizePlan, 'offsetX' | 'offsetY' | 'tiles'>} plan The resize.
 * @returns {StrandedArrival[]} The transfers, each with where its tile goes.
 */
const strandedByResize = (arrivals: readonly MapArrival[], plan: Pick<ResizePlan, 'offsetX' | 'offsetY' | 'tiles'>): StrandedArrival[] =>
{
  const { offsetX, offsetY, tiles } = plan;
  return arrivals.flatMap((arrival): StrandedArrival[] =>
  {
    const x = arrival.x + offsetX;
    const y = arrival.y + offsetY;
    if (x < 0 || y < 0 || x >= tiles.width || y >= tiles.height)
    {
      return [ { ...arrival, movedTo: null } ];
    }

    return offsetX === 0 && offsetY === 0
      ? []
      : [ { ...arrival, movedTo: { x, y } } ];
  });
};

/**
 * Words one stranded transfer for the resize form: which transfer, the tile it lands on, and what the resize does to
 * that tile.
 * @param {StrandedArrival} arrival The transfer.
 * @returns {string} The words.
 */
const describeStranded = (arrival: StrandedArrival): string =>
{
  const { mapId, mapName, eventName, pageIndex, x, y, movedTo } = arrival;
  const where = mapName === '' ? `Map ${mapId}` : mapName;
  const fate = movedTo === null
    ? 'that spot is cut off'
    : `that spot moves to ${movedTo.x}, ${movedTo.y}`;
  return `${where}, "${eventName}" (page ${pageIndex + 1}) lands on ${x}, ${y}; ${fate}.`;
};

export { arrivalsFrom, describeStranded, strandedByResize, withLiveArrivals };
export type { ArrivalSource, MapArrival, StrandedArrival };
