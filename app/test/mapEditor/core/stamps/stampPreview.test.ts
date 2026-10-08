import { describe, expect, it } from 'vitest';
import { NO_IMAGE } from '../../../../src/mapEditor/core/events/eventDragPreview.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { previewStamp } from '../../../../src/mapEditor/core/stamps/stampPreview.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { stampOf, tiledMap } from '../../support/stampFixtures.ts';

/*
 * What the map shows under the pointer while the stamp is in hand, before a click: the stamp's footprint with its
 * corner on the cell under the pointer, hanging past the map's edge where it does; its tiles on the tile layers as they
 * were copied, empty cells and the shadow and region layers showing nothing, and nothing of tiles from another tileset;
 * its events as they look on their first page, keeping the page's own picture so a ghost moved a tile is moved rather
 * than drawn afresh, and none for an event past the edge; in red, every tile where another event already stands; and
 * a few words saying what a click would do.
 *
 * The map is 4x3, drawn with tileset 4, with event 1 at 3, 2. The stamp is 2 by 2: grass in its top row and a tree on
 * layer 4 of its bottom-right cell, a shadow and a region under its top-left, and events at its top-right (a character)
 * and bottom-left (with no pages at all).
 */
describe('previewStamp', () =>
{
  const GRASS = makeAutotileId(16, 0);
  const TREE = 10;

  /**
   * Builds the map.
   * @returns {MapDocument} The map.
   */
  const map = (): MapDocument => MapDocument.fromJson(mapDocumentKey(2), tiledMap(4, 3, () => undefined, [ null, [ 3, 2 ] ]));

  /**
   * Builds the stamp, from the tileset asked for.
   * @param {number} tilesetId The tileset its tiles belong to.
   * @returns {Stamp} The stamp.
   */
  const stamp = (tilesetId = 4): Stamp =>
  {
    const hero = { ...createEventPage(), image: { tileId: 0, characterName: 'Actor1', direction: 2, pattern: 1, characterIndex: 0 }, priorityType: 1 };
    return stampOf({
      tilesetId,
      width: 2,
      height: 2,
      tiles: {
        layers: [ 0, 3, 4, 5 ],
        values: [ GRASS, GRASS, 0, 0, 0, 0, 0, TREE, 0b0011, 0, 0, 0, 7, 0, 0, 0 ],
        calledFor: [ 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1 ],
      },
      events: [ { ...createMapEvent(4, 1, 0), pages: [ hero ] }, { ...createMapEvent(5, 0, 1), pages: [] } ],
    });
  };

  it('shows the footprint, the tiles on the tile layers, and the events as their first pages look, keeping the page\'s picture', () =>
  {
    // Arrange.
    const held = stamp();

    // Act: the corner on 1, 0.
    const preview = previewStamp(map(), held, { x: 1, y: 0 }, 'auto');

    // Assert.
    expect([ preview.hover, preview.ghostTiles, preview.ghostEvents, preview.ghostEvents[0].image === held.events[0].pages[0].image, preview.blockedCells, preview.label ])
      .toStrictEqual([
        { x: 1, y: 0, width: 2, height: 2 },
        [ { x: 1, y: 0, layer: 0, tileId: GRASS }, { x: 2, y: 0, layer: 0, tileId: GRASS }, { x: 2, y: 1, layer: 3, tileId: TREE } ],
        [ { x: 2, y: 0, image: held.events[0].pages[0].image, priorityType: 1 }, { x: 1, y: 1, image: NO_IMAGE, priorityType: 0 } ],
        true,
        [],
        'Stamp',
      ]);
  });

  it('leaves out what falls past the map\'s edge, and marks in red where another event stands, saying so', () =>
  {
    // Arrange.
    const held = stamp();

    // Act: the corner on the map's last cell, and then one left of it.
    const edge = previewStamp(map(), held, { x: 3, y: 2 }, 'auto');
    const blocked = previewStamp(map(), held, { x: 2, y: 2 }, 'exact');

    // Assert: at 3, 2 only the grass at the corner lands, on event 1's tile, which no event of the stamp reaches; at 2, 2
    // the top-right event lands on event 1.
    expect([ edge.ghostTiles, edge.ghostEvents, edge.blockedCells, edge.label, blocked.blockedCells, blocked.label ])
      .toStrictEqual([
        [ { x: 3, y: 2, layer: 0, tileId: GRASS } ],
        [],
        [],
        'Stamp',
        [ { x: 3, y: 2 } ],
        'Another event is in the way',
      ]);
  });

  it('shows no tiles of another tileset, saying the events alone would go down, or that nothing would', () =>
  {
    // Arrange: the stamp from tileset 9, and its tiles alone.
    const elsewhere = stamp(9);
    const tilesAlone = { ...elsewhere, events: [] };

    // Act.
    const events = previewStamp(map(), elsewhere, { x: 0, y: 0 }, 'auto');
    const nothing = previewStamp(map(), tilesAlone, { x: 0, y: 0 }, 'auto');

    // Assert.
    expect([ events.ghostTiles, events.ghostEvents.length, events.label, nothing.label ])
      .toStrictEqual([ [], 2, 'Another tileset: events only', 'Another tileset: nothing to place' ]);
  });

  it('says the tiles would go down exactly as copied with Shift held', () =>
  {
    // Arrange.
    const held = stamp();

    // Act.
    const preview = previewStamp(map(), held, { x: 0, y: 0 }, 'exact');

    // Assert.
    expect(preview.label)
      .toBe('Stamp (exact)');
  });
});
