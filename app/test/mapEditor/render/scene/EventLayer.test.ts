import { TextureSource, type Container, type Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PageShown, ShownPageReader } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import type { TextureImage } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { EventLayer, FADED_ALPHA, type AlphaReader } from '../../../../src/mapEditor/render/scene/EventLayer.ts';
import { GHOST_ALPHA } from '../../../../src/mapEditor/render/scene/GhostTiles.ts';
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

  describe('markers', () =>
  {
    /*
     * An event whose page draws no picture would be invisible, so it draws a marker: a sprite cut from the marker atlas,
     * standing on its tile's middle in a group of its own over every sprite, its symbol picked by the classifier handed
     * over. A sheet still loading shows nothing yet; a sheet that turns out missing shows the marker. Markers keep their
     * size from 50% zoom in and grow past it to stay readable, and zoomed far out a click on the part spilling onto a
     * tile no event stands on picks the marker's event, while markers show.
     */
    const ATLAS = new TextureSource({ width: 512, height: 512 });

    /**
     * The scale a marker sprite draws at, at its own size: 40 world pixels for the atlas's 112-pixel square.
     */
    const OWN_SIZE = 40 / 112;

    /**
     * Builds an event with no picture, on a cell, starting on a trigger.
     * @param {number} id The event id.
     * @param {number} x The column.
     * @param {number} y The row.
     * @param {number} trigger The page's trigger.
     * @returns {RmmzMapEvent} The event.
     */
    const blankEvent = (id: number, x: number, y: number, trigger = 0): RmmzMapEvent =>
    {
      const event = createMapEvent(id, x, y);
      event.pages[0].trigger = trigger;
      return event;
    };

    /**
     * Draws events on an empty 4x4 map whose tileset has a B sheet, with a marker atlas to cut markers from.
     * @param {RmmzMapEvent[]} events The events, ids 1 up in order.
     * @param {(folder: string, name: string) => Promise<TextureImage | null>} image Loads character sheets; left out,
     * none can load.
     * @returns {EventLayer} The layer, built.
     */
    const drawMarked = (events: RmmzMapEvent[], image?: (folder: string, name: string) => Promise<TextureImage | null>): EventLayer =>
    {
      const json = buildMapJson();
      json.width = 4;
      json.height = 4;
      json.data = new Array<number>(4 * 4 * 6).fill(0);
      json.events = [ null, ...events ];
      const layer = new EventLayer(() => undefined);
      const sheets = [ null, null, null, null, null, new TextureSource({ width: 768, height: 768 }), null, null, null ];
      const images = image === undefined ? null : { image };
      layer.setContext({ document: MapDocument.fromJson('map:1', json), flags: [], sheets, images, tileSize: 48, markerAtlas: () => ATLAS });
      return layer;
    };

    /**
     * Reads what each marker shows: its event, where it stands, the frame of the atlas it is cut from, and its scale.
     * @param {Container} group The markers or the ghosts.
     * @returns {(number | undefined | number[])[][]} One row per marker.
     */
    const markersIn = (group: Container) =>
    {
      return group.children.map(child =>
      {
        const { frame } = (child as Sprite).texture;
        return [ (child as Container & { eventId?: number }).eventId, [ child.x, child.y ], [ frame.x, frame.y ], Number(child.scale.x.toFixed(4)) ];
      });
    };

    it('draws a marker for each event that draws no picture, lower rows on top, and none for one that does', () =>
    {
      // Arrange: on parallel at 3, 2; a tile image at 0, 0; on the action button at 1, 1; on autorun at 2, 1.
      const events = [ blankEvent(1, 3, 2, 4), tileEvent(2, 0, 0, 1), blankEvent(3, 1, 1, 0), blankEvent(4, 2, 1, 3) ];

      // Act.
      const layer = drawMarked(events);

      // Assert: row 1's two by id, then row 2's; each on its tile's middle, cut from its trigger's frame, at its own size.
      const own = Number(OWN_SIZE.toFixed(4));
      expect([ markersIn(layer.markers), layer.markerCount, layer.spriteCount ])
        .toStrictEqual([
          [
            [ 3, [ 72, 72 ], [ 256, 128 ], own ],
            [ 4, [ 120, 72 ], [ 128, 256 ], own ],
            [ 1, [ 168, 120 ], [ 256, 256 ], own ],
          ],
          3,
          1,
        ]);
    });

    it('draws no marker without a marker atlas to cut one from', () =>
    {
      // Arrange: the layer as the other tests here draw it, with no atlas handed over.

      // Act.
      const layer = drawEvents([ blankEvent(1, 0, 0) ]);

      // Assert.
      expect(layer.markerCount)
        .toBe(0);
    });

    it('shows nothing while a character sheet loads, and the marker once the sheet turns out missing', async () =>
    {
      // Arrange: an event drawing with a sheet the project does not have, which loads on a later turn.
      const event = createMapEvent(1, 2, 2);
      event.pages[0].image = { ...event.pages[0].image, characterName: 'missing', characterIndex: 0 };
      const layer = drawMarked([ event ], async () => null);
      const whileLoading = layer.markerCount;

      // Act.
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });

      // Assert.
      expect([ whileLoading, markersIn(layer.markers).map(row => row[0]), layer.spriteCount ])
        .toStrictEqual([ 0, [ 1 ], 0 ]);
    });

    it('shows an event with no pages at all by the action button\'s marker', () =>
    {
      // Arrange.
      const event = { ...createMapEvent(1, 0, 3), pages: [] };

      // Act.
      const layer = drawMarked([ event ]);

      // Assert.
      expect(markersIn(layer.markers).map(row => row.slice(0, 3)))
        .toStrictEqual([ [ 1, [ 24, 168 ], [ 256, 128 ] ] ]);
    });

    it('picks each marker\'s symbol through the classifier handed over, redrawing them with a new one once flushed', () =>
    {
      // Arrange: an event on the action button, then a classifier calling every event on map 1 a battler.
      const layer = drawMarked([ blankEvent(1, 0, 0) ]);
      const asked: number[] = [];
      layer.setMarkerClassifier((_event, mapId) =>
      {
        asked.push(mapId);
        return 'battler';
      });
      const pending = markersIn(layer.markers).map(row => row[2]);

      // Act.
      const flushed = layer.flushChanges();

      // Assert: the action button's frame until the flush, then the battler's, asked about map 1.
      expect([ pending, flushed, markersIn(layer.markers).map(row => row[2]), asked ])
        .toStrictEqual([ [ [ 256, 128 ] ], true, [ [ 0, 128 ] ], [ 1 ] ]);
    });

    it('keeps markers their own size from 50% zoom in, and grows them further out, ghosts included', () =>
    {
      // Arrange: a marked event, and its ghost being dragged.
      const layer = drawMarked([ blankEvent(1, 0, 0) ]);
      const blank = createMapEvent(1, 0, 0).pages[0].image;
      layer.setGhosts([ { x: 1, y: 1, image: blank, priorityType: 0, eventId: 1 } ]);

      // Act: half the game's scale, then a quarter of it.
      layer.setZoom(0.5);
      const half = [ layer.markers.children[0].scale.x, layer.ghosts.children[0].scale.x ];
      layer.setZoom(0.25);

      // Assert: their own size at half, twice it at a quarter.
      const scales = [ ...half, layer.markers.children[0].scale.x, layer.ghosts.children[0].scale.x ];
      expect(scales.map(scale => Number((scale / OWN_SIZE).toFixed(4))))
        .toStrictEqual([ 1, 1, 2, 2 ]);
    });

    it('finds a marker by its tile, and zoomed far out by the part spilling onto a tile no event stands on, while shown', () =>
    {
      // Arrange: a marked event on 1, 1 and a tile image on 2, 1. At a tenth of the game's scale a marker draws five
      // times its size, 200 world pixels across, so from 1, 1 it spills over both 0, 1 and 2, 1.
      const layer = drawMarked([ blankEvent(1, 1, 1), tileEvent(2, 2, 1, 1) ]);
      layer.setZoom(0.1);
      const points = [ [ 72, 72 ], [ 24, 72 ], [ 120, 72 ] ];

      // Act: the marker's own tile, the empty tile beside it, and the tile image's tile; then the empty tile with the
      // markers hidden.
      const shown = points.map(([ x, y ]) => layer.eventAt(x, y, 0.1));
      layer.markers.visible = false;
      const hidden = layer.eventAt(24, 72, 0.1);

      // Assert: the tile image keeps its own tile under the spill.
      expect([ shown, hidden ])
        .toStrictEqual([ [ 1, 1, 2 ], null ]);
    });

    it('keeps the spill to the zoom: at the game\'s own scale the tile beside a marker picks nothing', () =>
    {
      // Arrange: a marked event on 1, 1.
      const layer = drawMarked([ blankEvent(1, 1, 1) ]);
      layer.setZoom(1);

      // Act: the marker's own tile, and the empty tile beside it.
      const found = [ layer.eventAt(72, 72, 1), layer.eventAt(24, 72, 1) ];

      // Assert.
      expect(found)
        .toStrictEqual([ 1, null ]);
    });

    it('shows a dragged event that draws no picture by its marker, see-through, moved rather than rebuilt', () =>
    {
      // Arrange: an autorun event on 0, 0, dragged; and a ghost naming no event on the map.
      const layer = drawMarked([ blankEvent(1, 0, 0, 3) ]);
      const blank = createMapEvent(1, 0, 0).pages[0].image;
      layer.setGhosts([ { x: 1, y: 1, image: blank, priorityType: 0, eventId: 1 }, { x: 2, y: 2, image: blank, priorityType: 0 } ]);
      const [ built ] = layer.ghosts.children;

      // Act: dragged a tile further.
      layer.setGhosts([ { x: 2, y: 1, image: blank, priorityType: 0, eventId: 1 }, { x: 3, y: 2, image: blank, priorityType: 0 } ]);

      // Assert: one ghost marker, the same sprite, on 2, 1's middle, cut from autorun's frame, at the ghosts' opacity;
      // the ghost of no event draws nothing.
      const [ ghost ] = layer.ghosts.children;
      expect([ layer.ghosts.children.length, ghost === built, [ ghost.x, ghost.y ], [ (ghost as Sprite).texture.frame.x, (ghost as Sprite).texture.frame.y ], ghost.alpha ])
        .toStrictEqual([ 1, true, [ 120, 72 ], [ 128, 256 ], GHOST_ALPHA ]);
    });
  });

  describe('pages', () =>
  {
    /*
     * Each event draws the page the page rule shows at the clock's time: its picture, its priority and, for a page
     * drawing no picture, the marker of that page's trigger. An event no page holds for draws its first page faded,
     * picture and marker alike, and a click still finds it, until faded events are hidden, when it draws nothing and no
     * click finds it. A ghost of an event on the map draws as that event draws, and a sheet that loads redraws every
     * event and ghost drawing with it on the page it shows.
     */
    const ATLAS = new TextureSource({ width: 512, height: 512 });

    /**
     * Reads pages as given by id: a page to draw, faded or not; events not named draw their first page.
     * @param {Record<number, PageShown>} byId The page each event shows.
     * @returns {ShownPageReader} The reader.
     */
    const pagesOf = (byId: Record<number, PageShown>): ShownPageReader => ({ shownPage: shown => byId[shown.id] ?? { index: 0, faded: false } });

    /**
     * Draws events on an empty 4x4 map whose tileset has a B sheet, with a marker atlas, the pages given, and character
     * sheets loaded by a loader when one is given.
     * @param {RmmzMapEvent[]} events The events, ids 1 up in order.
     * @param {ShownPageReader} pages The page each event shows.
     * @param {(folder: string, name: string) => Promise<TextureImage | null>} image Loads character sheets; left out,
     * none can load.
     * @returns {EventLayer} The layer, built.
     */
    const drawPaged = (events: RmmzMapEvent[], pages: ShownPageReader, image?: (folder: string, name: string) => Promise<TextureImage | null>): EventLayer =>
    {
      const json = buildMapJson();
      json.width = 4;
      json.height = 4;
      json.data = new Array<number>(4 * 4 * 6).fill(0);
      json.events = [ null, ...events ];
      const layer = new EventLayer(() => undefined, () => 255);
      const sheets = [ null, null, null, null, null, new TextureSource({ width: 768, height: 768 }), null, null, null ];
      const images = image === undefined ? null : { image };
      layer.setContext({ document: MapDocument.fromJson('map:1', json), flags: [], sheets, images, tileSize: 48, markerAtlas: () => ATLAS, pages });
      return layer;
    };

    /**
     * An event whose first page draws no picture on the action button, and whose second draws B tile 2 above characters.
     * @param {number} id The event id.
     * @param {number} x The column.
     * @param {number} y The row.
     * @returns {RmmzMapEvent} The event.
     */
    const lampAt = (id: number, x: number, y: number): RmmzMapEvent =>
    {
      const lamp = createMapEvent(id, x, y);
      const lit = { ...createEventPage(), priorityType: 2, image: { ...createEventPage().image, tileId: 2 } };
      return { ...lamp, pages: [ lamp.pages[0], lit ] };
    };

    it('draws each event\'s picture and priority from the page it shows, and its first page without a page rule', () =>
    {
      // Arrange: a lamp at 1, 1 showing its lit second page, and one at 2, 2 drawn with no page rule.
      const shown = drawPaged([ lampAt(1, 1, 1) ], pagesOf({ 1: { index: 1, faded: false } }));
      const plain = drawEvents([ lampAt(1, 2, 2) ]);

      // Act.
      const drawn = [ [ idsOf(shown.above), shown.markerCount, shown.spriteCount ], [ idsOf(plain.above), plain.markerCount, plain.spriteCount ] ];

      // Assert: the lit lamp a tile above characters; the plain one its first page, a marker drawn nowhere without an
      // atlas.
      expect(drawn)
        .toStrictEqual([ [ [ 1 ], 0, 1 ], [ [], 0, 0 ] ]);
    });

    it('marks an event drawing no picture by the trigger of the page it shows', () =>
    {
      // Arrange: an event on the action button on its first page, and on autorun on its second, which it shows.
      const story = createMapEvent(1, 0, 0);
      const autorun = { ...createEventPage(), trigger: 3 };
      const layer = drawPaged([ { ...story, pages: [ story.pages[0], autorun ] } ], pagesOf({ 1: { index: 1, faded: false } }));

      // Act.
      const [ marker ] = layer.markers.children as Sprite[];

      // Assert: autorun's frame of the atlas.
      expect([ marker.texture.frame.x, marker.texture.frame.y ])
        .toStrictEqual([ 128, 256 ]);
    });

    it('draws an event no page holds for faded, picture and marker alike, where a click still finds it', () =>
    {
      // Arrange: a lamp at 1, 1 and an event drawing no picture at 3, 3, neither held for by any page.
      const faded = { index: 0, faded: true };
      const layer = drawPaged([ lampAt(1, 1, 1), createMapEvent(2, 3, 3) ], pagesOf({ 1: { index: 1, faded: false }, 2: faded }));
      const [ marker ] = layer.markers.children;

      // Act.
      const found = [ layer.eventAt(72, 72, 1), layer.eventAt(168, 168, 1) ];

      // Assert: the lamp drawn plainly, the other faded, both found.
      expect([ layer.above.children[0].alpha, marker.alpha, marker.visible, layer.fadedCount, found ])
        .toStrictEqual([ 1, FADED_ALPHA, true, 1, [ 1, 2 ] ]);
    });

    it('hides an event no page holds for while faded events are hidden, where no click finds it, and shows it again', () =>
    {
      // Arrange: a lamp held for by no page, drawing its first page's tile; and a lamp at 2, 2 showing its lit page.
      const tileFirst = { ...lampAt(1, 1, 1), pages: [ { ...createEventPage(), image: { ...createEventPage().image, tileId: 1 } } ] };
      const layer = drawPaged([ tileFirst, lampAt(2, 2, 2) ], pagesOf({ 1: { index: 0, faded: true }, 2: { index: 1, faded: false } }));
      const [ fadedRoot ] = layer.below.children;

      // Act: hidden, asked twice, then shown again.
      layer.setFadedShown(false);
      layer.setFadedShown(false);
      const hidden = [ fadedRoot.visible, layer.eventAt(72, 72, 1), layer.eventAt(120, 120, 1) ];
      layer.setFadedShown(true);

      // Assert: hidden and found by nothing, the lit lamp still found; then drawn faded again.
      expect([ hidden, fadedRoot.visible, fadedRoot.alpha, layer.eventAt(72, 72, 1) ])
        .toStrictEqual([ [ false, null, 2 ], true, FADED_ALPHA, 1 ]);
    });

    it('builds an event no page holds for hidden while faded events are hidden', () =>
    {
      // Arrange: faded events hidden before an event no page holds for is drawn.
      const layer = drawPaged([], pagesOf({}));
      layer.setFadedShown(false);
      const json = buildMapJson();
      json.width = 4;
      json.height = 4;
      json.data = new Array<number>(4 * 4 * 6).fill(0);
      json.events = [ null, createMapEvent(1, 0, 0) ];
      const sheets = [ null, null, null, null, null, new TextureSource({ width: 768, height: 768 }), null, null, null ];

      // Act.
      layer.setContext({ document: MapDocument.fromJson('map:1', json), flags: [], sheets, images: null, tileSize: 48, markerAtlas: () => ATLAS, pages: pagesOf({ 1: { index: 0, faded: true } }) });

      // Assert.
      expect([ layer.markers.children[0].visible, layer.eventAt(24, 24, 1) ])
        .toStrictEqual([ false, null ]);
    });

    it('drags a ghost of an event as the page it shows draws, and any other ghost as handed over', () =>
    {
      // Arrange: a lamp at 0, 0 showing its lit tile page, dragged with its first page's blank picture as the drag hands
      // it over; and a ghost of no event with that blank picture.
      const layer = drawPaged([ lampAt(1, 0, 0) ], pagesOf({ 1: { index: 1, faded: false } }));
      const blank = createEventPage().image;

      // Act: dragged to 1, 1, then a tile further.
      layer.setGhosts([ { x: 1, y: 1, image: blank, priorityType: 0, eventId: 1 }, { x: 3, y: 3, image: blank, priorityType: 0 } ]);
      layer.setGhosts([ { x: 2, y: 1, image: blank, priorityType: 0, eventId: 1 }, { x: 3, y: 3, image: blank, priorityType: 0 } ]);

      // Assert: one ghost, a picture rather than a marker, standing at the tile's foot.
      const [ ghost ] = layer.ghosts.children;
      expect([ layer.ghosts.children.length, ghost.children.length, [ ghost.x, ghost.y ] ])
        .toStrictEqual([ 1, 1, [ 120, 96 ] ]);
    });

    it('draws an event and its ghost from the page it shows once that page\'s sheet loads', async () =>
    {
      // Arrange: an event blank on its first page and an orc on its second, which it shows, dragged as its blank page.
      const orc = createMapEvent(1, 1, 1);
      const orcPage = { ...createEventPage(), priorityType: 1, image: { ...createEventPage().image, characterName: 'orc' } };
      const layer = drawPaged([ { ...orc, pages: [ orc.pages[0], orcPage ] } ], pagesOf({ 1: { index: 1, faded: false } }), async () => ({ width: 576, height: 384 }) as unknown as TextureImage);
      layer.setGhosts([ { x: 2, y: 2, image: createEventPage().image, priorityType: 0, eventId: 1 } ]);
      const loading = [ layer.spriteCount, layer.ghosts.children.length ];

      // Act.
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });

      // Assert: nothing while the sheet loads; then the orc and its ghost drawn from it.
      expect([ loading, layer.spriteCount, layer.ghosts.children.length, layer.markerCount ])
        .toStrictEqual([ [ 0, 0 ], 1, 1, 0 ]);
    });
  });
});
