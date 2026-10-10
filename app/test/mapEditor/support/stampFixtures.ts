import { createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMap } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../src/mapEditor/core/stamps/stamp.ts';
import { blankGrid, type TestGrid } from '../core/tiles/support/tileGridBuilder.ts';
import { mapWithEvents, type EventSpot } from './eventFixtures.ts';

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

/**
 * Builds a map file with tiles and events: a blank map of a size, its tiles set up as the caller likes, and events where
 * the list says, each named for its id with a note naming it (see mapWithEvents). It draws with tileset 4 unless told
 * otherwise.
 * @param {number} width The width in tiles.
 * @param {number} height The height in tiles.
 * @param {(grid: TestGrid) => void} setUp Writes the tiles the map starts with.
 * @param {readonly EventSpot[]} spots The events by id, from id 0.
 * @param {number} tilesetId The map's tileset.
 * @returns {RmmzMap} A fresh map file.
 */
const tiledMap = (
  width: number,
  height: number,
  setUp: (grid: TestGrid) => void,
  spots: readonly EventSpot[] = [ null ],
  tilesetId = 4,
): RmmzMap =>
{
  const grid = blankGrid(width, height);
  setUp(grid);
  return { ...mapWithEvents(width, height, spots), tilesetId, data: Array.from(grid.cells) };
};

export { stampOf, tiledMap };
