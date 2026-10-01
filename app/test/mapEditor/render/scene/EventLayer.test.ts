import { TextureSource, type Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { TextureImage } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { EventLayer, type AlphaReader } from '../../../../src/mapEditor/render/scene/EventLayer.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Events draw in the engine's order: split by priority into the group below characters, the group with them (under
 * the star tiles) and the group above them, and inside each group lower on screen over higher, then later id over
 * earlier, as the engine's tilemap sorts its sprites. The pointer finds events by that same order, so a click lands on
 * the sprite drawn on top, and only on a pixel that sprite draws: a frame is mostly clear around its figure (a tree on
 * a big sheet is nearly two tiles by four), and a click on the clear part belongs to whatever shows through it. A sheet
 * whose pixels cannot be read counts as solid. Tile-image events build without loading anything, and character sheets
 * load from stand-ins, so none of this needs a GPU.
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

  it('finds the event drawn on top on the tile clicked: above characters first, then the later of two on one tile', () =>
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

    // Act: the middle of each of those cells, in world pixels, at the game's own scale.
    const found = [ [ 1, 1 ], [ 2, 2 ], [ 3, 3 ], [ 0, 3 ] ].map(([ x, y ]) => layer.eventAt(x * 48 + 24, y * 48 + 24, 1));

    // Assert.
    expect(found)
      .toStrictEqual([ 2, 4, 5, null ]);
  });

  describe('eventAt over character sheets', () =>
  {
    /*
     * As on Map301: a tree from a big sheet, 282 by 760 so its frame is 94 by 190, stands on 2, 4, and its frame reaches
     * up and right over an orc on 3, 3, whose 72 by 72 frame it draws over, standing lower on screen. The tree's frame
     * spans 73 to 167 across and 44 to 234 down; the orc's, 132 to 204 and 114 to 186. Where the tree draws only a
     * column 24 pixels wide down the middle of its frame, it covers 108 to 132 across; the orc draws every pixel of its
     * frame. A character counts as drawn small on screen below 32 CSS pixels on its longer side: at a quarter of the
     * game's scale the orc is 18 and the tree 47.5; at a twentieth both are small.
     */
    const TREE = { width: 282, height: 760 };
    const ORC = { width: 864, height: 576 };

    /**
     * Builds an event with a character image, priority with characters.
     * @param {number} id The event id.
     * @param {number} x The column.
     * @param {number} y The row.
     * @param {string} characterName The sheet.
     * @returns {RmmzMapEvent} The event.
     */
    const characterEvent = (id: number, x: number, y: number, characterName: string): RmmzMapEvent =>
    {
      const event = createMapEvent(id, x, y);
      event.pages[0].image = { ...event.pages[0].image, characterName, characterIndex: 0, tileId: 0 };
      event.pages[0].priorityType = 1;
      return event;
    };

    /**
     * Draws events on an empty 6x6 map whose tileset has a B sheet, their character sheets loaded from stand-ins and
     * their pixels read through a reader.
     * @param {AlphaReader} readAlpha How a sheet's pixels read.
     * @param {RmmzMapEvent[]} events The events, ids 1 up in order; left out, the tree and then the orc.
     * @returns {Promise<EventLayer>} The layer, once the sheets have loaded.
     */
    const drawCharacters = async (
      readAlpha: AlphaReader,
      events: RmmzMapEvent[] = [ characterEvent(1, 2, 4, '$tree'), characterEvent(2, 3, 3, 'orc') ]): Promise<EventLayer> =>
    {
      const json = buildMapJson();
      json.width = 6;
      json.height = 6;
      json.data = new Array<number>(6 * 6 * 6).fill(0);
      json.events = [ null, ...events ];
      const characters: Record<string, object> = { $tree: TREE, orc: ORC };
      const images = { image: async (_folder: string, name: string) => characters[name] as TextureImage };
      const sheets = [ null, null, null, null, null, new TextureSource({ width: 768, height: 768 }), null, null, null ];
      const layer = new EventLayer(() => undefined, readAlpha);
      layer.setContext({ document: MapDocument.fromJson('map:1', json), flags: [], sheets, images, tileSize: 48 });

      // the sheets load on a later turn, and the sprites are rebuilt with them.
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });
      return layer;
    };

    /**
     * Reads the tree's sheet as clear but for the column it draws, and every other sheet as solid.
     * @param {TextureSource} source The sheet.
     * @param {number} x The pixel's column in the sheet.
     * @returns {number} The pixel's alpha.
     */
    const treeColumn = (source: TextureSource, x: number): number =>
    {
      if (source.resource !== TREE)
      {
        return 255;
      }

      return x >= 35 && x < 59 ? 255 : 0;
    };

    /**
     * Reads every pixel of every sheet as solid, so each frame draws all of itself.
     * @returns {number} The pixel's alpha.
     */
    const solid = (): number => 255;

    it('passes a point on the clear part of a frame drawn on top to the sprite showing through it', async () =>
    {
      // Arrange: 150, 160 lies in both frames, on the tree's clear part and on the orc.
      const layer = await drawCharacters(treeColumn);

      // Act: at the game's own scale, where both are drawn big.
      const found = layer.eventAt(150, 160, 1);

      // Assert.
      expect(found)
        .toBe(2);
    });

    it('finds the sprite drawn on top on a pixel it draws, and nothing on a clear part with nothing showing through', async () =>
    {
      // Arrange: 120, 180 lies on the tree's column, over the orc's frame; 80, 60 on the tree's clear part, over
      // nothing.
      const layer = await drawCharacters(treeColumn);

      // Act.
      const found = [ layer.eventAt(120, 180, 1), layer.eventAt(80, 60, 1) ];

      // Assert.
      expect(found)
        .toStrictEqual([ 1, null ]);
    });

    it('counts a whole frame as solid where its sheet\'s pixels cannot be read', async () =>
    {
      // Arrange: a reader that can read nothing.
      const layer = await drawCharacters(() => null);

      // Act: the same point on the tree's clear part, over the orc.
      const found = layer.eventAt(150, 160, 1);

      // Assert.
      expect(found)
        .toBe(1);
    });

    it('finds a character drawn small by its tile, even where a big sprite draws over it, and the big one by its pixels', async () =>
    {
      // Arrange: the tree draws every pixel of its frame; 150, 160 lies on the orc's tile under the tree, 100, 60 on
      // the empty tile 2, 1 under the tree, and 230, 160 on the empty tile 4, 3 beside the orc, outside both frames.
      const layer = await drawCharacters(solid);

      // Act: the orc's tile at the game's own scale, where the orc is big too, then each point at a quarter of it.
      const found = [ layer.eventAt(150, 160, 1), layer.eventAt(150, 160, 0.25), layer.eventAt(100, 60, 0.25), layer.eventAt(230, 160, 0.25) ];

      // Assert.
      expect(found)
        .toStrictEqual([ 1, 2, 1, null ]);
    });

    it('finds every event by its tile zoomed far out, even a tree under another tree\'s frame, and nothing beside', async () =>
    {
      // Arrange: a second tree on 2, 2, under the first's frame, which draws over it; both draw every pixel. 120, 120
      // lies on the second tree's tile; 170, 120 on the empty tile 3, 2, outside both frames.
      const layer = await drawCharacters(solid, [ characterEvent(1, 2, 4, '$tree'), characterEvent(2, 2, 2, '$tree') ]);

      // Act: the second tree's tile at a quarter of the game's scale, where both trees are big, then at a twentieth.
      const found = [ layer.eventAt(120, 120, 0.25), layer.eventAt(120, 120, 0.05), layer.eventAt(170, 120, 0.05) ];

      // Assert.
      expect(found)
        .toStrictEqual([ 1, 2, null ]);
    });

    it('finds a tile image by its tile at any zoom, even on a clear pixel under a big sprite drawing over it', async () =>
    {
      // Arrange: a tile image on 2, 2, whose tile reads clear, under the tree, which draws every pixel. 120, 120 lies on
      // the tile image's tile; 150, 120 on the empty tile 3, 2 under the tree.
      const tileClear = (source: TextureSource): number => (source.resource === TREE ? 255 : 0);
      const layer = await drawCharacters(tileClear, [ characterEvent(1, 2, 4, '$tree'), tileEvent(2, 2, 2, 1) ]);

      // Act: at the game's own scale, where the tree is big.
      const found = [ layer.eventAt(120, 120, 1), layer.eventAt(150, 120, 1) ];

      // Assert.
      expect(found)
        .toStrictEqual([ 2, 1 ]);
    });
  });

  describe('markChanged and flushChanges', () =>
  {
    /**
     * Draws events on an empty 4x4 map, keeping the document so a test can change it.
     * @param {RmmzMapEvent[]} events The events, ids 1 up in order.
     * @returns {{ layer: EventLayer, document: MapDocument, redraws: () => number }} The layer, its map, and how often it
     * asked for a frame.
     */
    const drawnMap = (events: RmmzMapEvent[]) =>
    {
      const json = buildMapJson();
      json.width = 4;
      json.height = 4;
      json.data = new Array<number>(4 * 4 * 6).fill(0);
      json.events = [ null, ...events ];
      const document = MapDocument.fromJson('map:1', json);
      let redraws = 0;
      const layer = new EventLayer(() =>
      {
        redraws += 1;
      });
      const sheets = [ null, null, null, null, null, new TextureSource({ width: 768, height: 768 }), null, null, null ];
      layer.setContext({ document, flags: [], sheets, images: null, tileSize: 48 });
      return { layer, document, redraws: () => redraws };
    };

    it('redraws a changed event only once flushed, in its new place in the order, asking for a frame at once', () =>
    {
      // Arrange: with characters, 1 on row 2 and 2 on row 1; event 1 then moves up to row 0.
      const { layer, document, redraws } = drawnMap([ tileEvent(1, 0, 2, 1), tileEvent(2, 1, 1, 1) ]);
      const before = redraws();
      document.apply(document.setPatch([ 'events', 1, 'y' ], 0));

      // Act.
      layer.markChanged(1);
      const pending = idsOf(layer.same);
      const flushed = layer.flushChanges();

      // Assert: the frame was asked for as the change came, and the order changed only with the flush.
      expect([ redraws() - before, pending, flushed, idsOf(layer.same), layer.flushChanges() ])
        .toStrictEqual([ 1, [ 2, 1 ], true, [ 1, 2 ], false ]);
    });

    it('rebuilds every event when the list itself changed, dropping the ones gone', () =>
    {
      // Arrange: event 2 is removed; event 3 stays.
      const { layer, document } = drawnMap([ tileEvent(1, 0, 2, 1), tileEvent(2, 1, 1, 1), tileEvent(3, 2, 3, 1) ]);
      document.apply(document.removeEventPatch(2));

      // Act.
      layer.markChanged(3);
      layer.markChanged(null);
      layer.markChanged(1);
      const flushed = layer.flushChanges();

      // Assert.
      expect([ flushed, idsOf(layer.same) ])
        .toStrictEqual([ true, [ 1, 3 ] ]);
    });
  });

  describe('setGhosts', () =>
  {
    const brick = { tileId: 1, characterName: '', direction: 2, pattern: 0, characterIndex: 0 };
    const crate = { tileId: 2, characterName: '', direction: 2, pattern: 0, characterIndex: 0 };

    it('moves the ghost sprites already on show when the same ghosts move, rather than building new ones', () =>
    {
      // Arrange: two ghosts of the same picture, dragged one tile down.
      const layer = drawEvents([]);
      layer.setGhosts([ { x: 0, y: 0, image: brick, priorityType: 1 }, { x: 1, y: 0, image: brick, priorityType: 1 } ]);
      const shown = [ ...layer.ghosts.children ];

      // Act.
      layer.setGhosts([ { x: 0, y: 1, image: brick, priorityType: 1 }, { x: 1, y: 1, image: brick, priorityType: 1 } ]);

      // Assert: the same sprites, now one tile lower, standing at the bottom middle of their tiles.
      const [ first, second ] = layer.ghosts.children;
      expect([ first === shown[0], second === shown[1], [ first.x, first.y ], [ second.x, second.y ] ])
        .toStrictEqual([ true, true, [ 24, 96 ], [ 72, 96 ] ]);
    });

    it('builds the ghosts afresh when one looks different, and clears them when none are asked for', () =>
    {
      // Arrange.
      const layer = drawEvents([]);
      layer.setGhosts([ { x: 0, y: 0, image: brick, priorityType: 1 }, { x: 1, y: 0, image: brick, priorityType: 1 } ]);
      const shown = [ ...layer.ghosts.children ];

      // Act.
      layer.setGhosts([ { x: 0, y: 0, image: brick, priorityType: 1 }, { x: 1, y: 0, image: crate, priorityType: 1 } ]);
      const rebuilt = [ ...layer.ghosts.children ];
      layer.setGhosts([]);

      // Assert.
      expect([ rebuilt.length, rebuilt.some(child => shown.includes(child)), layer.ghosts.children.length ])
        .toStrictEqual([ 2, false, 0 ]);
    });
  });
});
