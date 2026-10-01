import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  applyCellFix,
  eventTilesAt,
  planClearLayer,
  planMoveLayer,
  planPutOnLayer,
  readCellStack,
} from '../../../../src/mapEditor/core/palette/cellStack.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { blankGrid, put } from '../tiles/support/tileGridBuilder.ts';

/*
 * The stack view's reading of a cell, and the fixes it offers.
 *
 * Hovering a cell shows all four layers, the shadow and the region, and which tile's flags apply, read exactly as the
 * engine reads them: passage from the first tile without a star, event tiles before layer 4 and then down to layer 1,
 * so a star or an empty layer is looked past and whatever lies below the deciding tile is never read; ladders, bushes,
 * counters and damage floors from every layer (never an event's tile); the terrain tag from the first layer that has
 * one. Getting any of these wrong would point the author at the wrong tile to fix.
 *
 * A fix changes one layer of one cell and nothing else: clearing it or putting a tile there reshapes the autotiles
 * around it as painting would, and moving a tile a layer up or down trades it with its neighbour without reshaping
 * anything, since the cell holds the same tiles. Each fix is one step in the map's history.
 */
const GRASS = 16;
const STAR = 0x10;

/**
 * Builds a tileset's flags with the empty tile starred, as MZ keeps it, and some tiles set.
 * @param {Record<number, number>} set The tiles to set, by id.
 * @returns {number[]} The flags.
 */
const flagsWith = (set: Record<number, number>): number[] =>
{
  const flags = new Array<number>(TileId.MAX).fill(0);
  flags[0] = STAR;
  Object.entries(set).forEach(([ id, flag ]) =>
  {
    flags[Number(id)] = flag;
  });
  return flags;
};

/**
 * Builds an event standing on a cell with a tile for its picture.
 * @param {number} id The event id.
 * @param {number} x The column.
 * @param {number} tileId The tile it shows.
 * @param {Partial<RmmzMapEvent['pages'][number]>} page Anything else about its first page.
 * @returns {RmmzMapEvent} The event.
 */
const tileEvent = (id: number, x: number, tileId: number, page: Partial<RmmzMapEvent['pages'][number]> = {}): RmmzMapEvent =>
{
  const event = createMapEvent(id, x, 0);
  const [ first ] = event.pages;
  return { ...event, pages: [ { ...first, image: { ...first.image, tileId }, ...page } ] };
};

describe('eventTilesAt', () =>
{
  it('picks the events on the cell showing a tile below characters without Through, in id order', () =>
  {
    // Arrange: on cell 1, events 3 and 1 qualify; event 2 shows a character, event 4 stands with the player, event 5
    // has Through on; event 6 qualifies but stands on cell 2.
    const events = [
      null,
      tileEvent(1, 1, 7),
      { ...tileEvent(2, 1, 0), pages: [ { ...tileEvent(2, 1, 0).pages[0], image: { ...tileEvent(2, 1, 0).pages[0].image, characterName: 'Actor1' } } ] },
      tileEvent(3, 1, 9),
      tileEvent(4, 1, 8, { priorityType: 1 }),
      tileEvent(5, 1, 8, { through: true }),
      tileEvent(6, 2, 8),
    ];

    // Act.
    const tiles = eventTilesAt(events, 1, 0);

    // Assert.
    expect(tiles)
      .toStrictEqual([ { eventId: 1, tileId: 7 }, { eventId: 3, tileId: 9 } ]);
  });
});

describe('readCellStack', () =>
{
  it('lists the layers top first, looking past stars and empty layers to the tile that decides passage', () =>
  {
    // Arrange: grass on layer 1, a starred B tile on layer 3, layers 2 and 4 empty.
    const grid = put(put(blankGrid(3, 3), 1, 1, 0, makeAutotileId(GRASS, 0)), 1, 1, 2, 5);
    const flags = flagsWith({ 5: STAR });

    // Act.
    const stack = readCellStack({ ...grid, flags }, 1, 1, []);

    // Assert.
    expect([ stack.layers.map(layer => [ layer.z, layer.tileId, layer.passage ]), stack.blocked ])
      .toStrictEqual([ [ [ 3, 0, 'lookedPast' ], [ 2, 5, 'lookedPast' ], [ 1, 0, 'lookedPast' ], [ 0, makeAutotileId(GRASS, 0), 'decides' ] ], 0 ]);
  });

  it('never reads below the tile that decides', () =>
  {
    // Arrange: a blocked B tile on layer 4 over open grass.
    const grid = put(put(blankGrid(3, 3), 1, 1, 0, makeAutotileId(GRASS, 0)), 1, 1, 3, 6);
    const flags = flagsWith({ 6: 0x0f });

    // Act.
    const stack = readCellStack({ ...grid, flags }, 1, 1, []);

    // Assert.
    expect([ stack.layers.map(layer => layer.passage), stack.blocked ])
      .toStrictEqual([ [ 'decides', 'unread', 'unread', 'unread' ], 0x0f ]);
  });

  it('reads an event\'s tile before every layer', () =>
  {
    // Arrange: open grass under an event showing a tile blocked left and up.
    const grid = put(blankGrid(3, 3), 1, 1, 0, makeAutotileId(GRASS, 0));
    const flags = flagsWith({ 7: 0x0a });

    // Act.
    const stack = readCellStack({ ...grid, flags }, 1, 1, [ { eventId: 4, tileId: 7 } ]);

    // Assert.
    expect([ stack.eventTiles, stack.layers.map(layer => layer.passage), stack.blocked ])
      .toStrictEqual([ [ { eventId: 4, tileId: 7, flags: 0x0a, passage: 'decides' } ], [ 'unread', 'unread', 'unread', 'unread' ], 0x0a ]);
  });

  it('looks past an event\'s starred tile to the layers', () =>
  {
    // Arrange: grass blocked down, under an event showing a starred tile.
    const grid = put(blankGrid(3, 3), 1, 1, 0, makeAutotileId(GRASS, 0));
    const flags = flagsWith({ 7: STAR, [makeAutotileId(GRASS, 0)]: 0x01 });

    // Act.
    const stack = readCellStack({ ...grid, flags }, 1, 1, [ { eventId: 4, tileId: 7 } ]);

    // Assert.
    expect([ stack.eventTiles[0].passage, stack.layers[3].passage, stack.blocked ])
      .toStrictEqual([ 'lookedPast', 'decides', 0x01 ]);
  });

  it('blocks every way out when every tile is a star, with nothing deciding', () =>
  {
    // Arrange: an empty cell; the empty tile is starred.
    const grid = blankGrid(3, 3);

    // Act.
    const stack = readCellStack({ ...grid, flags: flagsWith({}) }, 1, 1, []);

    // Assert.
    expect([ stack.layers.every(layer => layer.passage === 'lookedPast'), stack.blocked ])
      .toStrictEqual([ true, 0x0f ]);
  });

  it('counts a ladder, bush, counter or damage floor from any layer, starred or not, but never from an event\'s tile', () =>
  {
    // Arrange: a bush on layer 1, a starred ladder on layer 3, and an event's tile that is a counter.
    const grid = put(put(blankGrid(3, 3), 1, 1, 0, 8), 1, 1, 2, 9);
    const flags = flagsWith({ 8: 0x40, 9: STAR | 0x20, 10: 0x80 });

    // Act.
    const stack = readCellStack({ ...grid, flags }, 1, 1, [ { eventId: 2, tileId: 10 } ]);

    // Assert.
    expect([ stack.bush, stack.ladder, stack.counter, stack.damage ])
      .toStrictEqual([ true, true, false, false ]);
  });

  it('takes the terrain tag from the first layer that has one, from the top', () =>
  {
    // Arrange: tag 3 on layer 2 over tag 5 on layer 1.
    const grid = put(put(blankGrid(3, 3), 1, 1, 0, 8), 1, 1, 1, 9);
    const flags = flagsWith({ 8: 0x5000, 9: 0x3000 });

    // Act.
    const stack = readCellStack({ ...grid, flags }, 1, 1, []);

    // Assert.
    expect([ stack.terrainTag, stack.layers.map(layer => [ layer.terrainTag, layer.decidesTerrain ]) ])
      .toStrictEqual([ 3, [ [ 0, false ], [ 0, false ], [ 3, true ], [ 5, false ] ] ]);
  });

  it('reads the cell\'s own shadow and region, not its neighbours\'', () =>
  {
    // Arrange: shadow 5 and region 12 on the cell; shadow 15 and region 40 beside it.
    const grid = put(put(put(put(blankGrid(3, 3), 1, 1, 4, 5), 1, 1, 5, 12), 2, 1, 4, 15), 2, 1, 5, 40);

    // Act.
    const stack = readCellStack({ ...grid, flags: flagsWith({}) }, 1, 1, []);

    // Assert: and no terrain tag anywhere.
    expect([ stack.shadow, stack.region, stack.terrainTag ])
      .toStrictEqual([ 5, 12, 0 ]);
  });
});

describe('planClearLayer', () =>
{
  it('empties one layer and reshapes the autotiles either side as painting would', () =>
  {
    // Arrange: a row of three grass tiles, joined, with a B tile on layer 3 of the middle one.
    const grid = put(blankGrid(3, 1), 1, 0, 2, 5);
    [ 0, 1, 2 ].forEach(x => put(grid, x, 0, 0, makeAutotileId(GRASS, 0)));

    // Act.
    const fix = planClearLayer(grid, 1, 0, 0, TilesetMode.area);

    // Assert: the left tile now ends on its east side and the right one on its west; the B tile stays.
    expect(fix)
      .toStrictEqual({ label: 'Clear layer 1 at 1, 0', changes: [ [ 0, makeAutotileId(GRASS, 24) ], [ 1, 0 ], [ 2, makeAutotileId(GRASS, 16) ] ] });
  });

  it('changes nothing on a layer already empty', () =>
  {
    // Arrange.
    const grid = put(blankGrid(3, 1), 1, 0, 0, makeAutotileId(GRASS, 0));

    // Act.
    const fix = planClearLayer(grid, 1, 0, 3, TilesetMode.area);

    // Assert.
    expect(fix.changes)
      .toStrictEqual([]);
  });
});

describe('planPutOnLayer', () =>
{
  it('puts an autotile on one layer, shaped to its neighbours, and joins them to it', () =>
  {
    // Arrange: grass either side of an empty middle, each showing its open side.
    const grid = put(put(blankGrid(3, 1), 0, 0, 0, makeAutotileId(GRASS, 24)), 2, 0, 0, makeAutotileId(GRASS, 16));

    // Act.
    const fix = planPutOnLayer(grid, 1, 0, 0, makeAutotileId(GRASS, 47), TilesetMode.area);

    // Assert.
    expect(fix)
      .toStrictEqual({ label: 'Put A2 ground 1 on layer 1 at 1, 0', changes: [ 0, 1, 2 ].map(index => [ index, makeAutotileId(GRASS, 0) ]) });
  });

  it('writes a B tile on the chosen layer alone, reshaping nothing', () =>
  {
    // Arrange: the same grass either side.
    const grid = put(put(blankGrid(3, 1), 0, 0, 0, makeAutotileId(GRASS, 24)), 2, 0, 0, makeAutotileId(GRASS, 16));

    // Act.
    const fix = planPutOnLayer(grid, 1, 0, 2, 5, TilesetMode.area);

    // Assert.
    expect(fix.changes)
      .toStrictEqual([ [ cellIndex(3, 1, 1, 0, 2), 5 ] ]);
  });
});

describe('planMoveLayer', () =>
{
  it('trades a tile with the layer below it, touching nothing else', () =>
  {
    // Arrange: an A5 tile on layer 2 and a B tile on layer 3.
    const grid = put(put(put(blankGrid(3, 1), 1, 0, 1, TileId.A5 + 4), 1, 0, 2, 5), 1, 0, 0, makeAutotileId(GRASS, 0));

    // Act.
    const fix = planMoveLayer(grid, 1, 0, 2, 'down');

    // Assert.
    expect(fix)
      .toStrictEqual({ label: 'Move layer 3 down at 1, 0', changes: [ [ cellIndex(3, 1, 1, 0, 1), 5 ], [ cellIndex(3, 1, 1, 0, 2), TileId.A5 + 4 ] ] });
  });

  it('keeps an autotile\'s own shape when it moves', () =>
  {
    // Arrange: grass in a shape its neighbours would not give it, on layer 1.
    const grid = put(blankGrid(3, 1), 1, 0, 0, makeAutotileId(GRASS, 7));

    // Act.
    const fix = planMoveLayer(grid, 1, 0, 0, 'up');

    // Assert.
    expect(fix.changes)
      .toStrictEqual([ [ cellIndex(3, 1, 1, 0, 0), 0 ], [ cellIndex(3, 1, 1, 0, 1), makeAutotileId(GRASS, 7) ] ]);
  });

  it('changes nothing above layer 4, below layer 1, or between two layers holding the same', () =>
  {
    // Arrange: a B tile on layers 1 and 2 alike, and on layer 4.
    const grid = put(put(put(blankGrid(3, 1), 1, 0, 0, 5), 1, 0, 1, 5), 1, 0, 3, 6);

    // Act.
    const fixes = [ planMoveLayer(grid, 1, 0, 3, 'up'), planMoveLayer(grid, 1, 0, 0, 'down'), planMoveLayer(grid, 1, 0, 0, 'up') ];

    // Assert.
    expect(fixes.map(fix => fix.changes))
      .toStrictEqual([ [], [], [] ]);
  });
});

describe('applyCellFix', () =>
{
  it('makes a fix one step in the map\'s history, which undo takes back', () =>
  {
    // Arrange: the fixture map, whose first cell holds 1.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);

    // Act.
    const step = applyCellFix(hub, 1, { label: 'Clear layer 1 at 0, 0', changes: [ [ 0, 0 ] ] });
    const cleared = hub.map('map:1').cellAt(0, 0, 0);
    hub.undo(mapHistoryKey(1));

    // Assert.
    expect([ step?.label, step?.histories, cleared, hub.map('map:1').cellAt(0, 0, 0) ])
      .toStrictEqual([ 'Clear layer 1 at 0, 0', [ 'map:1' ], 0, 1 ]);
  });

  it('records nothing for a fix with no changes', () =>
  {
    // Arrange.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);

    // Act.
    const step = applyCellFix(hub, 1, { label: 'Move layer 4 up at 0, 0', changes: [] });

    // Assert.
    expect([ step, hub.history(mapHistoryKey(1)).rows ])
      .toStrictEqual([ null, [] ]);
  });
});
