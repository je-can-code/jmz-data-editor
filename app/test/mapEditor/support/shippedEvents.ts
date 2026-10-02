import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapDocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';

/**
 * Reads a map's id from its file name.
 * @param {string} file Such as {@code Map004.json}.
 * @returns {number} The id.
 */
const mapIdOf = (file: string): number => Number.parseInt(file.slice('Map'.length), 10);

/**
 * Lists the events of a map file.
 * @param {RmmzMap} map The map.
 * @returns {RmmzMapEvent[]} Its events, in id order.
 */
const eventsOf = (map: RmmzMap): RmmzMapEvent[] => map.events.filter((event): event is RmmzMapEvent => event !== null);

/**
 * Builds a hub holding one map file, with a store that keeps what a save writes.
 * @param {number} mapId The map's id.
 * @param {RmmzMap} file The map's file.
 * @returns {{ hub: DocumentHub, saved: () => JsonValue | null }} The hub, and what was last saved.
 */
const hubHolding = (mapId: number, file: RmmzMap): { hub: DocumentHub; saved: () => JsonValue | null } =>
{
  let written: JsonValue | null = null;
  const hub = new DocumentHub({
    clientId: 'round-trip',
    store: {
      load: async () => file as unknown as JsonValue,
      save: async (_key, content) =>
      {
        written = content;
      },
    },
  });
  hub.adopt(mapDocumentKey(mapId), file as unknown as JsonValue);
  return { hub, saved: () => written };
};

export { eventsOf, hubHolding, mapIdOf };
