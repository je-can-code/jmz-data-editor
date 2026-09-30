import { TextureSource, type Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { EventLayer } from '../../../../src/mapEditor/render/scene/EventLayer.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Events draw in the engine's order: split by priority into the group below characters, the group with them (under
 * the star tiles) and the group above them, and inside each group lower on screen over higher, then later id over
 * earlier, as the engine's tilemap sorts its sprites. The pointer finds events by that same order, so a click lands on
 * the sprite drawn on top. Tile-image events build without loading anything, so none of this needs a GPU.
 */

/**
 * Builds a tile-image event: B tile 1, standing at a cell with a priority.
 * @param {number} id The event id.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} priorityType 0 below characters, 1 with them, 2 above them.
 * @returns {RmmzMapEvent} The event.
 */
const tileEvent = (id: number, x: number, y: number, priorityType: number): RmmzMapEvent =>
{
  const event = createMapEvent(id, x, y);
  event.pages[0].image = { ...event.pages[0].image, tileId: 1, characterName: '' };
  event.pages[0].priorityType = priorityType;
  return event;
};

/**
 * Draws events on an empty 4x4 map whose tileset has a B sheet.
 * @param {RmmzMapEvent[]} events The events, ids 1 up in order.
 * @returns {EventLayer} The layer, built.
 */
const drawEvents = (events: RmmzMapEvent[]): EventLayer =>
{
  const json = buildMapJson();
  json.width = 4;
  json.height = 4;
  json.data = new Array<number>(4 * 4 * 6).fill(0);
  json.events = [ null, ...events ];
  const layer = new EventLayer(() => undefined);
  const sheets = [ null, null, null, null, null, new TextureSource({ width: 768, height: 768 }), null, null, null ];
  layer.setContext({ document: MapDocument.fromJson('map:1', json), flags: [], sheets, images: null, tileSize: 48 });
  return layer;
};

/**
 * Lists the event ids a group draws, first drawn first.
 * @param {Container} group The group.
 * @returns {(number | undefined)[]} The ids.
 */
const idsOf = (group: Container): (number | undefined)[] =>
{
  return group.children.map(child => (child as Container & { eventId?: number }).eventId);
};

describe('EventLayer', () =>
{
  it('groups events by priority, and orders each group by the row it stands on, then by id', () =>
  {
    // Arrange: with characters, 1 on row 2, then 2 and 3 side by side on row 1; 4 below characters; 5 above them.
    const events = [ tileEvent(1, 0, 2, 1), tileEvent(2, 1, 1, 1), tileEvent(3, 2, 1, 1), tileEvent(4, 0, 0, 0), tileEvent(5, 1, 0, 2) ];

    // Act.
    const layer = drawEvents(events);

    // Assert: row 1 draws before row 2, and on one row the earlier id draws first.
    expect([ idsOf(layer.below), idsOf(layer.same), idsOf(layer.above) ])
      .toStrictEqual([ [ 4 ], [ 2, 3, 1 ], [ 5 ] ]);
  });

  it('finds the event drawn on top under a point: above characters first, then the later of two on one cell', () =>
  {
    // Arrange: on (1, 1) one event with characters and one above them; on (2, 2) two with characters; on (3, 3) one
    // below characters; nothing on (0, 3).
    const layer = drawEvents([
      tileEvent(1, 1, 1, 1),
      tileEvent(2, 1, 1, 2),
      tileEvent(3, 2, 2, 1),
      tileEvent(4, 2, 2, 1),
      tileEvent(5, 3, 3, 0),
    ]);

    // Act: the middle of each of those cells, in world pixels.
    const found = [ [ 1, 1 ], [ 2, 2 ], [ 3, 3 ], [ 0, 3 ] ].map(([ x, y ]) => layer.eventAt(x * 48 + 24, y * 48 + 24));

    // Assert.
    expect(found)
      .toStrictEqual([ 2, 4, 5, null ]);
  });
});
