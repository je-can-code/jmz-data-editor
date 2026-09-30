import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapDocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMapJson } from './fixtures.ts';

/**
 * Where one event stands, as [ x, y ], or null for an empty slot.
 */
type EventSpot = readonly [ number, number ] | null;

/**
 * Builds a map file of a size with events where the list says: the list's index is the event id, so index 0 is
 * always empty, and a null leaves that slot empty. Every event is named for its id and carries a note naming it, so a
 * copy that lost track of which event it came from shows.
 * @param {number} width The map's width in tiles.
 * @param {number} height The map's height in tiles.
 * @param {readonly EventSpot[]} spots The events by id, from id 0.
 * @returns {RmmzMap} A fresh map file.
 */
const mapWithEvents = (width: number, height: number, spots: readonly EventSpot[]): RmmzMap =>
{
  const events: (RmmzMapEvent | null)[] = spots.map((spot, id) =>
  {
    if (spot === null || id === 0)
    {
      return null;
    }

    const [ x, y ] = spot;
    return { ...createMapEvent(id, x, y), note: `event ${id}` };
  });

  return { ...buildMapJson(), width, height, data: new Array<number>(width * height * 6).fill(0), events };
};

/**
 * Builds a hub holding maps, by id.
 * @param {Readonly<Record<number, RmmzMap>>} maps The maps' files.
 * @returns {DocumentHub} The hub, clean, with empty histories.
 */
const hubWithMaps = (maps: Readonly<Record<number, RmmzMap>>): DocumentHub =>
{
  const hub = new DocumentHub({ clientId: 'window-a' });
  Object.entries(maps).forEach(([ mapId, file ]) => hub.adopt(mapDocumentKey(Number(mapId)), file as unknown as JsonValue));
  return hub;
};

/**
 * Reads a held map's file.
 * @param {DocumentHub} hub The hub.
 * @param {number} mapId The map.
 * @returns {RmmzMap} The file as it stands.
 */
const mapFileOf = (hub: DocumentHub, mapId: number): RmmzMap =>
{
  return hub.document(mapDocumentKey(mapId)).toJson() as unknown as RmmzMap;
};

/**
 * Lists where each event on a map stands, by id, empty slots as null.
 * @param {RmmzMap} file The map file.
 * @returns {EventSpot[]} The spots, from id 0.
 */
const spotsOf = (file: RmmzMap): EventSpot[] =>
{
  return file.events.map(event => (event === null ? null : [ event.x, event.y ] as const));
};

export { hubWithMaps, mapFileOf, mapWithEvents, spotsOf };
export type { EventSpot };
