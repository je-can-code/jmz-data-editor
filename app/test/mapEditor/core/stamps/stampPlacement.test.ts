import { describe, expect, it } from 'vitest';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { captureAreaStamp, captureEventsStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { cutStampSource, placeStamp, type StampPlacement } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { shapedTileAt, TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { gridReader } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { autotileShape, makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { hubWithMaps, mapFileOf, spotsOf } from '../../support/eventFixtures.ts';
import { command } from '../../support/eventKindFixtures.ts';
import { tiledMap } from '../../support/stampFixtures.ts';
import { fill, put, type TestGrid } from '../tiles/support/tileGridBuilder.ts';

/*
 * Placing a stamp, and cutting what one was captured from.
 *
 * Every placement is an independent copy, as one step of the map's history that one undo takes back to the very file it
 * found, named for what went down. Tiles go down on the layers they were copied from, past the map's edge dropped, with
 * the autotiles along the stamp's edge and around it reshaped to their new neighbours while a shape drawn by hand
 * inside keeps itself; with Shift, everything goes down exactly as copied. Events go down where they stood inside the
 * stamp, with fresh ids past the end of the map's list, as a paste has always given them, their commands naming one
 * another following the copies; an event that would land past the map's edge is left out and the author told how many.
 * Tiles copied from a map with another tileset are left out, the events going down alone and the author told; a stamp
 * of such tiles alone is refused. A stamp landing any event on another, or nothing at all on the map, is refused whole.
 *
 * A cut takes away what its stamp was captured from, as one step: the events it copied, and every layer it carries
 * emptied over the cells it came from, with the autotiles around the hole reshaped.
 *
 * Map 1, the source, is 8x5: a 3 by 3 block of grass at 2, 1 to 4, 3, each tile in the shape its neighbours call for,
 * as MZ stores them, but for its centre, drawn by hand in shape 5; a tree over the centre on layer 4 with a shadow and
 * region 4; and events 1 on the block's centre and 2 beside it, at 4, 2, slot 3 empty. Map 2, the target, is 8x5 too,
 * with a column of grass down x 1, shaped as MZ stores it, and event 1 at 7, 4. Map 3 is map 2 drawn with tileset 9.
 */
const GRASS = 16;
const TREE = 10;

/**
 * Shapes every autotile in a grid as MZ's editor stores it, from its neighbours, the way painting it would have.
 * @param {TestGrid} grid The grid.
 */
const shapeAll = (grid: TestGrid): void =>
{
  const reader = gridReader(grid);
  for (let z = 0; z < 4; z++)
  {
    for (let y = 0; y < grid.height; y++)
    {
      for (let x = 0; x < grid.width; x++)
      {
        // shapes read only their neighbours' kinds, so shaping in place reads the same as shaping a copy.
        put(grid, x, y, z, shapedTileAt(reader, x, y, z, TilesetMode.area));
      }
    }
  }
};

/**
 * Builds the source map's file.
 * @returns {RmmzMap} The file.
 */
const source = (): RmmzMap => tiledMap(8, 5, grid =>
{
  fill(grid, 2, 1, 4, 3, 0, makeAutotileId(GRASS, 0));
  shapeAll(grid);
  put(grid, 3, 2, 0, makeAutotileId(GRASS, 5));
  put(grid, 3, 2, 3, TREE);
  put(grid, 3, 2, 4, 0b1001);
  put(grid, 3, 2, 5, 4);
}, [ null, [ 3, 2 ], [ 4, 2 ] ]);

/**
 * Builds the target map's file, drawn with a tileset of choice.
 * @param {number} tilesetId The tileset.
 * @returns {RmmzMap} The file.
 */
const target = (tilesetId = 4): RmmzMap => tiledMap(8, 5, grid =>
{
  fill(grid, 1, 0, 1, 4, 0, makeAutotileId(GRASS, 0));
  shapeAll(grid);
}, [ null, [ 7, 4 ] ], tilesetId);

/**
 * Builds a window holding the three maps.
 * @returns {ReturnType<typeof hubWithMaps>} The hub.
 */
const window3 = () => hubWithMaps({ 1: source(), 2: target(), 3: target(9) });

/**
 * Captures the source's whole block, every layer and both events on it, as a stamp.
 * @param {ReturnType<typeof hubWithMaps>} hub The hub holding the source.
 * @returns {Stamp} The stamp.
 */
const blockStamp = (hub: ReturnType<typeof hubWithMaps>): Stamp =>
{
  return captureAreaStamp(hub.map('map:1'), { x: 2, y: 1, width: 3, height: 3 }, 'auto', TilesetMode.area, 'window-a:1') as Stamp;
};

/**
 * Builds a placement with its corner on a cell, reshaping autotiles, on an Area tileset.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {Partial<StampPlacement>} fields Anything else to change.
 * @returns {StampPlacement} The placement.
 */
const at = (x: number, y: number, fields: Partial<StampPlacement> = {}): StampPlacement =>
{
  return { at: { x, y }, shaping: 'auto', mode: TilesetMode.area, ...fields };
};

/**
 * Reads the shapes of the grass across one row of a map, from column 0, or null where a cell holds no grass.
 * @param {RmmzMap} file The map.
 * @param {number} y The row.
 * @returns {(number | null)[]} The shapes.
 */
const grassRow = (file: RmmzMap, y: number): (number | null)[] =>
{
  return Array.from({ length: file.width }, (_, x) =>
  {
    const tileId = file.data[y * file.width + x];
    return tileId === 0 ? null : autotileShape(tileId);
  });
};

describe('placeStamp', () =>
{
  it('places tiles on their layers and events with fresh ids past the end as one named step, which one undo takes back exactly', () =>
  {
    // Arrange: the block captured off map 1; map 2's list ends after event 1.
    const hub = window3();
    const stamp = blockStamp(hub);

    // Act: its corner on 4, 1 of map 2, then undone.
    const outcome = placeStamp(hub, 2, stamp, at(4, 1), 'Stamp');
    const placed = mapFileOf(hub, 2);
    hub.undo(mapHistoryKey(2));

    // Assert: the tree, shadow and region on the centre, now at 5, 2; the events as 2 and 3, standing where they stood.
    const layer = (z: number) => placed.data[(z * 5 + 2) * 8 + 5];
    expect([
      outcome.ok && outcome.step?.label,
      outcome.ok && outcome.eventIds,
      [ 3, 4, 5 ].map(layer),
      spotsOf(placed),
      mapFileOf(hub, 2),
    ])
      .toStrictEqual([ 'Stamp 3 by 3 tiles and 2 events', [ 2, 3 ], [ TREE, 0b1001, 4 ], [ null, [ 7, 4 ], [ 5, 2 ], [ 6, 2 ] ], target() ]);
  });

  it('copies each event whole, pointing the copies\' commands naming one another at the copies and leaving the rest', () =>
  {
    // Arrange: event 1 moves event 2 and balloons over event 9, which the stamp never held.
    const file = source();
    const [ , first ] = file.events as RmmzMapEvent[];
    first.pages[0].list.unshift(command(205, [ 2, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: true } ]), command(213, [ 9, 1, false ]));
    const hub = hubWithMaps({ 1: file, 2: target() });
    const stamp = captureEventsStamp(hub.map('map:1'), [ 1, 2 ], 'window-a:1') as Stamp;

    // Act.
    placeStamp(hub, 2, stamp, at(0, 0), 'Paste');

    // Assert: the copy of event 1, now 2, moves the copy of event 2, now 3, and still balloons over 9; its note came along.
    const copy = mapFileOf(hub, 2).events[2] as RmmzMapEvent;
    expect([ copy.note, copy.pages[0].list.slice(0, 2).map(each => each.parameters[0]) ])
      .toStrictEqual([ 'event 1', [ 3, 9 ] ]);
  });

  it('reshapes the autotiles along the stamp\'s edge and beside it to their new neighbours, keeping a shape drawn by hand inside', () =>
  {
    // Arrange: the block placed against map 2's column of grass, which it now joins.
    const hub = window3();
    const before = grassRow(mapFileOf(hub, 2), 2);

    // Act.
    placeStamp(hub, 2, blockStamp(hub), at(2, 1), 'Stamp');

    // Assert: the column's cell now joins the block, the block's left edge joins the column, the hand-drawn centre keeps
    // shape 5, and the block's right edge still meets nothing.
    expect([ before, grassRow(mapFileOf(hub, 2), 2) ])
      .toStrictEqual([ [ null, 32, null, null, null, null, null, null ], [ null, 16, 0, 5, 24, null, null, null ] ]);
  });

  it('lays every tile exactly as copied with Shift held, touching nothing around it', () =>
  {
    // Arrange.
    const hub = window3();

    // Act.
    placeStamp(hub, 2, blockStamp(hub), at(2, 1, { shaping: 'exact' }), 'Stamp');

    // Assert: the block as copied, its left edge still the edge; the column as it was.
    expect(grassRow(mapFileOf(hub, 2), 2))
      .toStrictEqual([ null, 32, 16, 5, 24, null, null, null ]);
  });

  it('drops the tiles past the map\'s edge and leaves out the events landing there, saying how many', () =>
  {
    // Arrange: the block with its corner on 6, 4, so only its top row's first two cells land and both its events,
    // a row down, fall past the bottom; and the source's two events side by side, the second past the right edge.
    const hub = window3();
    const one = hubWithMaps({ 1: source(), 2: target() });
    const pair = captureEventsStamp(one.map('map:1'), [ 1, 2 ], 'window-a:2') as Stamp;

    // Act.
    const outcome = placeStamp(hub, 2, blockStamp(hub), at(6, 4), 'Stamp');
    const single = placeStamp(one, 2, pair, at(7, 0), 'Paste');

    // Assert: the block's top-left corner and top edge at 6, 4 and 7, 4, the map's edge below them counting as joined so
    // both keep their shapes, and nothing above them; the pair's first event placed.
    const placed = mapFileOf(hub, 2);
    expect([
      outcome,
      grassRow(placed, 3).slice(5),
      grassRow(placed, 4).slice(5),
      single.ok && [ single.eventIds, single.notes, spotsOf(mapFileOf(one, 2))[2] ],
    ])
      .toStrictEqual([
        { ok: true, step: expect.objectContaining({ label: 'Stamp 3 by 3 tiles' }), eventIds: [], notes: [ '2 of the stamp\'s events fell past the map\'s edge and were left out.' ] },
        [ null, null, null ],
        [ null, 34, 20 ],
        [ [ 2 ], [ 'One of the stamp\'s events fell past the map\'s edge and was left out.' ], [ 7, 0 ] ],
      ]);
  });

  it('places only the events on a map with another tileset, saying so, and refuses a stamp of such tiles alone', () =>
  {
    // Arrange: the block, and the block's tiles alone under manual layering, both onto map 3.
    const hub = window3();
    const tilesAlone = captureAreaStamp(hub.map('map:1'), { x: 2, y: 1, width: 3, height: 3 }, 0, TilesetMode.area, 'window-a:2') as Stamp;

    // Act.
    const events = placeStamp(hub, 3, blockStamp(hub), at(2, 1), 'Stamp');
    const tiles = placeStamp(hub, 3, tilesAlone, at(2, 1), 'Stamp');

    // Assert: no tile of map 3 changed; the events went down as 2 and 3, the step named for them alone.
    const placed = mapFileOf(hub, 3);
    expect([ events, placed.data, spotsOf(placed), tiles ])
      .toStrictEqual([
        { ok: true, step: expect.objectContaining({ label: 'Stamp 2 events' }), eventIds: [ 2, 3 ], notes: [ 'This map uses another tileset, so only the stamp\'s events went down.' ] },
        target(9).data,
        [ null, [ 7, 4 ], [ 3, 2 ], [ 4, 2 ] ],
        { ok: false, message: 'This stamp was copied from a map with another tileset, so its tiles cannot go on this one.' },
      ]);
  });

  it('refuses a stamp landing any event on another, whole, counting them for a stamp of several', () =>
  {
    // Arrange: map 2's event 1 stands at 7, 4.
    const hub = window3();
    const stamp = blockStamp(hub);
    const lone = captureEventsStamp(hub.map('map:1'), [ 1 ], 'window-a:2') as Stamp;
    const before = mapFileOf(hub, 2);

    // Act: the block with its second event on 7, 4, and then the lone event onto 7, 4.
    const several = placeStamp(hub, 2, stamp, at(5, 3), 'Stamp');
    const single = placeStamp(hub, 2, lone, at(7, 4), 'Paste');

    // Assert.
    expect([ several, single, mapFileOf(hub, 2), hub.history(mapHistoryKey(2)).rows.length ])
      .toStrictEqual([
        { ok: false, message: '1 of the stamp\'s 2 events would land on other events.' },
        { ok: false, message: 'The stamp\'s event would land on another event.' },
        before,
        0,
      ]);
  });

  it('refuses a stamp of which nothing lands on the map', () =>
  {
    // Arrange.
    const hub = window3();

    // Act.
    const outcome = placeStamp(hub, 2, blockStamp(hub), at(8, 0), 'Stamp');

    // Assert.
    expect(outcome)
      .toStrictEqual({ ok: false, message: 'Nothing in the stamp lands on the map there.' });
  });

  it('records nothing for tiles landing on exactly what is there already', () =>
  {
    // Arrange: the block's ground alone, put back where it was copied from.
    const hub = window3();
    const ground = captureAreaStamp(hub.map('map:1'), { x: 2, y: 1, width: 3, height: 3 }, 0, TilesetMode.area, 'window-a:2') as Stamp;

    // Act.
    const outcome = placeStamp(hub, 1, ground, at(2, 1), 'Paste');

    // Assert.
    expect([ outcome, hub.history(mapHistoryKey(1)).rows.length ])
      .toStrictEqual([ { ok: true, step: null, eventIds: [], notes: [] }, 0 ]);
  });
});

describe('cutStampSource', () =>
{
  it('takes away a piece\'s events and empties its layers where it came from, reshaping the hole\'s edges, as one step', () =>
  {
    // Arrange: the block's left two columns, with event 1 on the centre.
    const hub = window3();
    const stamp = captureAreaStamp(hub.map('map:1'), { x: 2, y: 1, width: 2, height: 3 }, 'auto', TilesetMode.area, 'window-a:2') as Stamp;

    // Act: cut, then undone.
    const outcome = cutStampSource(hub, 1, stamp, TilesetMode.area);
    const cut = mapFileOf(hub, 1);
    hub.undo(mapHistoryKey(1));

    // Assert: the row's left two cells and the tree gone, the block's last column now an island of its own; event 2
    // stays; and the undo brings the file back exactly.
    expect([ outcome, grassRow(cut, 2), cut.data[(3 * 5 + 2) * 8 + 3], spotsOf(cut), mapFileOf(hub, 1) ])
      .toStrictEqual([
        { ok: true, step: expect.objectContaining({ label: 'Cut 2 by 3 tiles and 1 event' }), eventIds: [], notes: [] },
        [ null, null, null, null, 32, null, null, null ],
        0,
        [ null, null, [ 4, 2 ] ],
        source(),
      ]);
  });

  it('takes away the events alone for a stamp of events, naming one as the rest of the editor does', () =>
  {
    // Arrange.
    const hub = window3();
    const stamp = captureEventsStamp(hub.map('map:1'), [ 2 ], 'window-a:2') as Stamp;

    // Act.
    const outcome = cutStampSource(hub, 1, stamp, TilesetMode.area);

    // Assert: every tile as it was.
    const cut = mapFileOf(hub, 1);
    expect([ outcome.ok && outcome.step?.label, spotsOf(cut), cut.data ])
      .toStrictEqual([ 'Cut event', [ null, [ 3, 2 ], null ], source().data ]);
  });
});
