import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { CellRect } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { captureAreaStamp, captureEventsStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { placeStamp, planStamp } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * Stamps round-trip on the game's own maps.
 *
 * A placement is one step, and undoing it must give back the very map it found, field for field and in the file's own
 * order, whatever the map holds: walls and waterfalls whose shapes read whole runs, tables, hand-layered tiles, the
 * 600 events of Map361. So stamps are captured off real maps (a cluster of events, a 20 by 15 piece of every layer, and
 * a piece with the events standing on it), placed on the map they came from and on another map of the same tileset,
 * Map361's onto a map of another tileset too, and each placement undone: the map must then turn back into exactly the
 * text it was read from. The maps are read from the game and only ever held in memory; nothing is written.
 *
 * It skips when the game is not present.
 */
const project = locateGameProject();

/**
 * The maps placed on: pairs drawn with one tileset (16 and 17 on tileset 12, 94 and 102 on tileset 4), a map with
 * tables (31), and Map361, a 10 by 60 map with an event on every tile, drawn with the Overworld tileset.
 */
const MAP_IDS = [ 16, 17, 31, 94, 102, 361 ];

/**
 * Reads one of the game's maps.
 * @param {number} mapId The map.
 * @returns {RmmzMap} Its file.
 */
const readMap = (mapId: number): RmmzMap =>
{
  return readDataFile(project as string, `Map${String(mapId).padStart(3, '0')}.json`) as RmmzMap;
};

/**
 * Builds a window holding the maps, as their files stand in the game.
 * @returns {DocumentHub} The hub.
 */
const window = (): DocumentHub =>
{
  const hub = new DocumentHub({ clientId: 'window-a' });
  MAP_IDS.forEach(mapId => hub.adopt(mapDocumentKey(mapId), readMap(mapId) as unknown as JsonValue));
  return hub;
};

/**
 * Writes a held map as its file's text, in the file's own order of fields.
 * @param {DocumentHub} hub The hub.
 * @param {number} mapId The map.
 * @returns {string} The text.
 */
const textOf = (hub: DocumentHub, mapId: number): string =>
{
  return JSON.stringify(hub.document(mapDocumentKey(mapId)).toJson());
};

/**
 * Lists a map's events in id order.
 * @param {MapDocument} map The map.
 * @returns {RmmzMapEvent[]} The events.
 */
const eventsOf = (map: MapDocument): RmmzMapEvent[] =>
{
  return map.eventIds().map(id => map.event(id) as RmmzMapEvent);
};

/**
 * Finds a cluster of events: the first event and every other within the 8 by 8 tiles from it, ten at most.
 * @param {MapDocument} map The map.
 * @returns {number[]} The events' ids.
 */
const clusterOf = (map: MapDocument): number[] =>
{
  const [ first ] = eventsOf(map);
  return eventsOf(map)
    .filter(event => event.x >= first.x && event.y >= first.y && event.x < first.x + 8 && event.y < first.y + 8)
    .slice(0, 10)
    .map(event => event.id);
};

/**
 * Finds the 20 by 15 piece in the middle of a map, cut to the map.
 * @param {MapDocument} map The map.
 * @returns {CellRect} The piece.
 */
const middleOf = (map: MapDocument): CellRect =>
{
  return { x: Math.max(0, Math.floor((map.width - 20) / 2)), y: Math.max(0, Math.floor((map.height - 15) / 2)), width: 20, height: 15 };
};

/**
 * Finds the piece holding a cluster of events with two tiles around it, cut to the map.
 * @param {MapDocument} map The map.
 * @param {readonly number[]} eventIds The cluster.
 * @returns {CellRect} The piece.
 */
const aroundOf = (map: MapDocument, eventIds: readonly number[]): CellRect =>
{
  const events = eventIds.map(id => map.event(id) as RmmzMapEvent);
  const left = Math.max(0, Math.min(...events.map(event => event.x)) - 2);
  const top = Math.max(0, Math.min(...events.map(event => event.y)) - 2);
  const right = Math.min(map.width - 1, Math.max(...events.map(event => event.x)) + 2);
  const bottom = Math.min(map.height - 1, Math.max(...events.map(event => event.y)) + 2);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
};

/**
 * Finds where a stamp can go on a map with every one of its events landing: the first cell, row by row, where nothing
 * stands in their way.
 * @param {MapDocument} map The map.
 * @param {Stamp} stamp The stamp.
 * @returns {{ x: number, y: number } | null} The cell for the stamp's corner, or null when there is none.
 */
const roomFor = (map: MapDocument, stamp: Stamp): { x: number; y: number } | null =>
{
  for (let y = 0; y + stamp.height <= map.height; y++)
  {
    for (let x = 0; x + stamp.width <= map.width; x++)
    {
      const plan = planStamp(map, stamp, { at: { x, y }, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null }, null);
      if (plan.ok && plan.eventsLeftOut === 0 && (x !== stamp.origin.x || y !== stamp.origin.y || stamp.mapId !== map.mapId))
      {
        return { x, y };
      }
    }
  }

  return null;
};

/**
 * Places a stamp on a map where it has room, undoes it, and reports what came of it: how much it changed, and whether
 * the map came back to the very text it had.
 * @param {DocumentHub} hub The hub.
 * @param {number} mapId The map placed on.
 * @param {Stamp} stamp The stamp.
 * @returns {{ placed: boolean, changed: number, back: boolean }} Whether it went down, how many patches it made, and
 * whether the undo brought the map back exactly.
 */
const placeAndUndo = (hub: DocumentHub, mapId: number, stamp: Stamp): { placed: boolean; changed: number; back: boolean } =>
{
  const map = hub.map(mapDocumentKey(mapId));
  const before = textOf(hub, mapId);
  const at = roomFor(map, stamp);
  if (at === null)
  {
    return { placed: false, changed: 0, back: textOf(hub, mapId) === before };
  }

  const outcome = placeStamp(hub, mapId, stamp, { at, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null }, 'Stamp');
  const changed = outcome.ok && outcome.step !== null ? outcome.step.entries.length : 0;
  const changedText = textOf(hub, mapId) !== before;
  hub.undo(mapHistoryKey(mapId));
  return { placed: changedText, changed, back: textOf(hub, mapId) === before };
};

describe.skipIf(project === null)('stamps on the shipped maps', () =>
{
  it('reads every map back as the very text the game holds before anything is placed', () =>
  {
    // Arrange.
    const hub = window();

    // Act.
    const same = MAP_IDS.map(mapId => textOf(hub, mapId) === JSON.stringify(readMap(mapId)));

    // Assert.
    expect(same)
      .toStrictEqual(MAP_IDS.map(() => true));
  });

  it.each([
    [ 16, 17 ],
    [ 94, 102 ],
    [ 102, 94 ],
  ])('places stamps of Map%i on it and on Map%i, each undone back to the very text it found', (sourceId, otherId) =>
  {
    // Arrange: a cluster of events, the middle 20 by 15 on every layer, and the piece around the cluster with its events.
    const hub = window();
    const source = hub.map(mapDocumentKey(sourceId));
    const cluster = clusterOf(source);
    const stamps = [
      captureEventsStamp(source, cluster, 'window-a:1') as Stamp,
      captureAreaStamp(source, middleOf(source), 'auto', TilesetMode.area, 'window-a:2') as Stamp,
      captureAreaStamp(source, aroundOf(source, cluster), 'auto', TilesetMode.area, 'window-a:3') as Stamp,
    ];

    // Act.
    const results = stamps.flatMap(stamp => [ placeAndUndo(hub, sourceId, stamp), placeAndUndo(hub, otherId, stamp) ]);

    // Assert: every stamp went down on both maps, and every undo gave back the very text.
    expect([ cluster.length > 1, stamps[2].events.length > 1, results.map(result => [ result.placed, result.back ]) ])
      .toStrictEqual([ true, true, results.map(() => [ true, true ]) ]);
  });

  it('places a piece of tables on every layer back on its own map, undone back to the very text', () =>
  {
    // Arrange.
    const hub = window();
    const map = hub.map(mapDocumentKey(31));
    const stamp = captureAreaStamp(map, middleOf(map), 'auto', TilesetMode.area, 'window-a:1') as Stamp;

    // Act.
    const result = placeAndUndo(hub, 31, stamp);

    // Assert.
    expect(result)
      .toStrictEqual({ placed: true, changed: result.changed, back: true });
  });

  it('places Map361\'s events, which have no room on their own map, on a map of another tileset, undone back to the very text', () =>
  {
    // Arrange: a 10 by 15 piece of Map361 holds 150 events; on Map102, of another tileset, only they go down.
    const hub = window();
    const crowded = hub.map(mapDocumentKey(361));
    const piece = captureAreaStamp(crowded, { x: 0, y: 0, width: 10, height: 15 }, 'auto', TilesetMode.area, 'window-a:1') as Stamp;

    // Act.
    const home = placeAndUndo(hub, 361, piece);
    const elsewhere = placeAndUndo(hub, 102, piece);

    // Assert: no room at home for the events; on Map102 they go down, 150 events, and the undo gives the map back.
    expect([ piece.events.length, home, elsewhere ])
      .toStrictEqual([ 150, { placed: false, changed: 0, back: true }, { placed: true, changed: 150, back: true } ]);
  });
});
