import { createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { Stamp } from '../../../src/mapEditor/core/stamps/stamp.ts';

/**
 * Builds a stamp by hand: by default one event, standing in the stamp's only cell, copied from map 1 on tileset 4 (the
 * tileset every map fixture draws with), with whatever fields the test changes.
 * @param {Partial<Stamp>} fields The fields to change.
 * @returns {Stamp} The stamp.
 */
const stampOf = (fields: Partial<Stamp> = {}): Stamp =>
{
  return {
    id: 'test:1',
    mapId: 1,
    tilesetId: 4,
    origin: { x: 0, y: 0 },
    width: 1,
    height: 1,
    tiles: null,
    events: [ { ...createMapEvent(1, 0, 0), note: 'event 1' } ],
    ...fields,
  };
};

export { stampOf };
