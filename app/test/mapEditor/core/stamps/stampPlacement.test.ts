import { describe, expect, it } from 'vitest';
import { BLUEPRINT_EVENTS_ADDED, BLUEPRINT_EVENTS_REMOVED } from '../../../../src/mapEditor/core/blueprints/blueprintShape.ts';
import { BLUEPRINT_USES_DOCUMENT, usesOf, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { captureAreaStamp, captureEventsStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { cutStampSource, placeStamp, planStamp, type StampPlacement } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { shapedTileAt, TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { gridReader } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { autotileShape, makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { holdBlueprints, holdBlueprintUses, openedBlueprint, type BlueprintSeed } from '../../support/blueprintFixtures.ts';
import { hubWithMaps, mapFileOf, spotsOf } from '../../support/eventFixtures.ts';
import { command } from '../../support/eventKindFixtures.ts';
import { stampOf, tiledMap } from '../../support/stampFixtures.ts';
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
 * Events copied off copies of a blueprint carry their links along, so they are copies too; a stamp carrying any onto a
 * map that may hold no link, such as J-ABS's action map, is refused whole with the map's reason. A copy of a blueprint
 * the window's blueprints no longer hold goes down as a plain event instead, its dead link's line taken out and the rest
 * of its note byte for byte, and the author is told; on a map that may hold no link too, since it is no copy any more.
 * While the window does not hold the blueprints, no link can be told dead, and every link goes down as it is. A note
 * that could not lose its dead link cleanly refuses the stamp.
 *
 * A cut takes away what its stamp was captured from, as one step: the events it copied, and every layer it carries
 * emptied over the cells it came from, with the autotiles around the hole reshaped, and the placements of blueprints it
 * carries forgotten there, since they travel with the stamp now.
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
 * Builds a placement with its corner on a cell, reshaping autotiles, on an Area tileset, on a map that may hold links.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {Partial<StampPlacement>} fields Anything else to change.
 * @returns {StampPlacement} The placement.
 */
const at = (x: number, y: number, fields: Partial<StampPlacement> = {}): StampPlacement =>
{
  return { at: { x, y }, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null, ...fields };
};

/**
 * Reads every event's note on a map, by id, empty slots as null.
 * @param {RmmzMap} file The map.
 * @returns {(string | null)[]} The notes.
 */
const notesOn = (file: RmmzMap): (string | null)[] =>
{
  return file.events.map(event => (event === null ? null : (event as RmmzMapEvent).note));
};

/**
 * The block's placement as a blueprint on map 1, as the record holds it.
 */
const BLOCK_ON_SOURCE: PlacedSpot = { blueprintId: 'aa22', x: 2, y: 1, mapId: 1 };

/**
 * A sign's placement as a blueprint on map 1, outside the block, as the record holds it.
 */
const SIGN_ON_SOURCE: PlacedSpot = { blueprintId: 'bb33', x: 0, y: 0, mapId: 1 };

/**
 * Builds a window holding the three maps, a record of the block and the sign placed on map 1, and blueprints: the block
 * and the sign unless told otherwise, or none held at all.
 * @param {BlueprintSeed | null} blueprints The blueprints held, by id, or null for a window holding none.
 * @returns {ReturnType<typeof hubWithMaps>} The hub.
 */
const windowWithPlacements = (
  blueprints: BlueprintSeed | null = { aa22: { name: 'Block', stamp: stampOf() }, bb33: { name: 'Sign', stamp: stampOf() } },
) =>
{
  const hub = window3();
  holdBlueprintUses(hub, [ BLOCK_ON_SOURCE, SIGN_ON_SOURCE ]);
  if (blueprints !== null)
  {
    holdBlueprints(hub, blueprints);
  }

  return hub;
};

/**
 * Captures the source's whole block as a stamp, with the block's placement, which it holds whole, and not the sign's.
 * @param {ReturnType<typeof hubWithMaps>} hub The hub holding the source.
 * @returns {Stamp} The stamp.
 */
const blockStampWith = (hub: ReturnType<typeof hubWithMaps>): Stamp =>
{
  const spans = [
    { blueprintId: 'aa22', x: 2, y: 1, width: 3, height: 3, layers: [ 0, 1, 2, 3 ] },
    { blueprintId: 'bb33', x: 0, y: 0, width: 1, height: 1, layers: [ 3 ] },
  ];
  return captureAreaStamp(hub.map('map:1'), { x: 2, y: 1, width: 3, height: 3 }, 'auto', TilesetMode.area, 'window-a:3', spans) as Stamp;
};

/**
 * Lists every placement the window's record holds.
 * @param {ReturnType<typeof hubWithMaps>} hub The hub.
 * @returns {PlacedSpot[]} The placements.
 */
const recorded = (hub: ReturnType<typeof hubWithMaps>): PlacedSpot[] => usesOf(hub.document(BLUEPRINT_USES_DOCUMENT));

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

  it('carries the links of copies of a blueprint along, so the copies placed are copies of it too', () =>
  {
    // Arrange: event 1 of the source is a copy of event 7 of the camp, which the window's blueprints hold.
    const file = source();
    (file.events[1] as RmmzMapEvent).note = 'Guard\n<blueprint:[k3x9q2mf, 7]>';
    const hub = hubWithMaps({ 1: file, 2: target() });
    holdBlueprints(hub, { k3x9q2mf: { name: 'Goblin camp', stamp: stampOf() } });
    const stamp = captureEventsStamp(hub.map('map:1'), [ 1, 2 ], 'window-a:1') as Stamp;

    // Act.
    const outcome = placeStamp(hub, 2, stamp, at(0, 0), 'Paste');

    // Assert.
    expect([ notesOn(mapFileOf(hub, 2)), outcome.ok && outcome.notes ])
      .toStrictEqual([ [ null, 'event 1', 'Guard\n<blueprint:[k3x9q2mf, 7]>', 'event 2' ], [] ]);
  });

  it('places a copy of a blueprint no longer there as a plain event, the rest of its note byte for byte, and says so', () =>
  {
    // Arrange: event 1 is a copy of the camp, deleted since; event 2 a copy of the bat roost, still kept.
    const file = source();
    (file.events[1] as RmmzMapEvent).note = 'Guard\r\n  captain\r\n<blueprint:[k3x9q2mf, 7]>';
    (file.events[2] as RmmzMapEvent).note = '<blueprint:[aa22aa22, 1]>';
    const hub = hubWithMaps({ 1: file, 2: target() });
    holdBlueprints(hub, { aa22aa22: { name: 'Bat roost', stamp: stampOf() } });
    const stamp = captureEventsStamp(hub.map('map:1'), [ 1, 2 ], 'window-a:1') as Stamp;

    // Act.
    const outcome = placeStamp(hub, 2, stamp, at(0, 0), 'Paste');

    // Assert.
    expect([ notesOn(mapFileOf(hub, 2)), outcome.ok && outcome.notes ])
      .toStrictEqual([
        [ null, 'event 1', 'Guard\r\n  captain', '<blueprint:[aa22aa22, 1]>' ],
        [ 'One of the stamp\'s events was a copy of a blueprint that no longer exists, so it went down as a plain event.' ],
      ]);
  });

  it('places copies of blueprints no longer there even on a map that may hold no link, as the plain events they become', () =>
  {
    // Arrange: both events copies of blueprints the window's blueprints no longer hold, bound for J-ABS's action map.
    const file = source();
    (file.events[1] as RmmzMapEvent).note = '<blueprint:[k3x9q2mf, 7]>';
    (file.events[2] as RmmzMapEvent).note = 'Wolf\n<blueprint:[zz99zz99, 2]>';
    const hub = hubWithMaps({ 1: file, 2: target() });
    holdBlueprints(hub);
    const stamp = captureEventsStamp(hub.map('map:1'), [ 1, 2 ], 'window-a:1') as Stamp;
    const refusal = 'this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it';

    // Act.
    const outcome = placeStamp(hub, 2, stamp, at(0, 0, { linkRefusal: refusal }), 'Paste');

    // Assert.
    expect([ notesOn(mapFileOf(hub, 2)), outcome.ok && outcome.notes ])
      .toStrictEqual([
        [ null, 'event 1', '', 'Wolf' ],
        [ '2 of the stamp\'s events were copies of blueprints that no longer exist, so they went down as plain events.' ],
      ]);
  });

  it('keeps every link as it is while the window does not hold the blueprints, since none can be told dead', () =>
  {
    // Arrange: a copy of a blueprint, in a window that has not opened the blueprints.
    const file = source();
    (file.events[1] as RmmzMapEvent).note = '<blueprint:[k3x9q2mf, 7]>';
    const hub = hubWithMaps({ 1: file, 2: target() });
    const stamp = captureEventsStamp(hub.map('map:1'), [ 1 ], 'window-a:1') as Stamp;

    // Act.
    const outcome = placeStamp(hub, 2, stamp, at(0, 0), 'Paste');

    // Assert.
    expect([ notesOn(mapFileOf(hub, 2)), outcome.ok && outcome.notes ])
      .toStrictEqual([ [ null, 'event 1', '<blueprint:[k3x9q2mf, 7]>' ], [] ]);
  });

  it('refuses a stamp whose copy of a blueprint no longer there could not lose its link cleanly, changing nothing', () =>
  {
    // Arrange: a stray bracket before the dead link opens a tag of its own once the link is out.
    const file = source();
    (file.events[1] as RmmzMapEvent).note = 'z<<blueprint:[k3x9q2mf, 7]>w> <moveSpeed:6.0>';
    const hub = hubWithMaps({ 1: file, 2: target() });
    holdBlueprints(hub);
    const stamp = captureEventsStamp(hub.map('map:1'), [ 1 ], 'window-a:1') as Stamp;

    // Act.
    const outcome = placeStamp(hub, 2, stamp, at(0, 0), 'Paste');

    // Assert.
    expect([ outcome, mapFileOf(hub, 2) ])
      .toStrictEqual([
        { ok: false, message: 'This stamp can\'t be placed: in EV001\'s note, the game would read the rest of this note differently; look for a stray < in it.' },
        target(),
      ]);
  });

  it('refuses a stamp carrying copies of a blueprint onto a map that may hold no link, and places one carrying none there', () =>
  {
    // Arrange: one stamp of a copy, one of an event that is no copy, both bound for a map that may hold no link.
    const file = source();
    (file.events[1] as RmmzMapEvent).note = '<blueprint:[k3x9q2mf, 7]>';
    const hub = hubWithMaps({ 1: file, 2: target() });
    const linked = captureEventsStamp(hub.map('map:1'), [ 1 ], 'window-a:1') as Stamp;
    const plain = captureEventsStamp(hub.map('map:1'), [ 2 ], 'window-a:2') as Stamp;
    const refusal = 'this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it';

    // Act.
    const outcomes = [ placeStamp(hub, 2, linked, at(0, 0, { linkRefusal: refusal }), 'Paste'), placeStamp(hub, 2, plain, at(0, 0, { linkRefusal: refusal }), 'Paste') ];

    // Assert: the copy refused whole, the other event placed as 2.
    expect([ outcomes[0], outcomes[1].ok && outcomes[1].eventIds, spotsOf(mapFileOf(hub, 2)) ])
      .toStrictEqual([
        {
          ok: false,
          message: 'This stamp holds copies of blueprints, which can\'t go here: this map holds J-ABS\'s action templates, which the game reads, so '
            + 'blueprints stay off it.',
        },
        [ 2 ],
        [ null, [ 7, 4 ], [ 0, 0 ] ],
      ]);
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

describe('planStamp', () =>
{
  it('names the id each event to be placed had in the stamp, in order, leaving out those falling past the edge', () =>
  {
    // Arrange: the source's two events side by side, the second past the right edge with the first on 7, 0.
    const hub = window3();
    const pair = captureEventsStamp(hub.map('map:1'), [ 1, 2 ], 'window-a:1') as Stamp;

    // Act.
    const plans = [ planStamp(hub.map('map:2'), pair, at(0, 0), null), planStamp(hub.map('map:2'), pair, at(7, 0), null) ];

    // Assert.
    expect(plans.map(plan => plan.ok && [ plan.sourceIds, plan.events.map(event => event.id) ]))
      .toStrictEqual([ [ [ 1, 2 ], [ 2, 3 ] ], [ [ 1 ], [ 2 ] ] ]);
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

  it('forgets on the map the placements the cut stamp carries away, leaving the rest, which one undo puts back', () =>
  {
    // Arrange: the block placed as a blueprint at 2, 1 and a sign at 0, 0, the block's placement captured with it.
    const hub = windowWithPlacements();
    const stamp = blockStampWith(hub);

    // Act.
    cutStampSource(hub, 1, stamp, TilesetMode.area);
    const cut = recorded(hub);
    hub.undo(mapHistoryKey(1));

    // Assert: each map's placements by blueprint, as the record keeps them.
    expect([ cut, recorded(hub) ])
      .toStrictEqual([ [ SIGN_ON_SOURCE ], [ BLOCK_ON_SOURCE, SIGN_ON_SOURCE ] ]);
  });
});

/*
 * A stamp's tiles carry the placements of blueprints they hold whole, so a placement copied, or cut and pasted, is still
 * a copy of its blueprint, as a copy of its events is: each is recorded again where the stamp's tiles land, in the same
 * step, as long as some of it lands on the map. A placement of a blueprint no longer there goes down plain, and the author
 * is told; while the window does not hold the blueprints none can be told gone, and each is recorded as it is. Tiles that
 * do not go down, on a map of another tileset, record nothing; a map that may hold no link refuses the stamp whole; and a
 * window holding no record records nothing, and the author is told the copies went down plain.
 *
 * The block (aa22) is placed on map 1 at 2, 1, and the sign (bb33) at 0, 0.
 */
describe('placements a stamp carries', () =>
{
  /**
   * The block's placement on map 1, the source.
   */
  const BLOCK = { blueprintId: 'aa22', x: 2, y: 1, width: 3, height: 3, layers: [ 0, 1, 2, 3 ] };

  it('records each placement the stamp\'s tiles hold where they land, in the same step, which one undo takes back', () =>
  {
    // Arrange.
    const hub = windowWithPlacements();
    const stamp = blockStampWith(hub);

    // Act.
    const outcome = placeStamp(hub, 2, stamp, at(4, 1), 'Paste');
    const placed = recorded(hub);
    hub.undo(mapHistoryKey(2));

    // Assert: the stamp's own spot, counted from its corner, and the placement where it landed.
    expect([ stamp.spots, outcome.ok && outcome.notes, placed, recorded(hub) ])
      .toStrictEqual([
        [ { blueprintId: 'aa22', x: 0, y: 0, width: 3, height: 3 } ],
        [],
        [ BLOCK_ON_SOURCE, SIGN_ON_SOURCE, { blueprintId: 'aa22', x: 4, y: 1, mapId: 2 } ],
        [ BLOCK_ON_SOURCE, SIGN_ON_SOURCE ],
      ]);
  });

  it('records a placement hanging past the map\'s edge with the part of it that went down, and leaves out one landing wholly past it', () =>
  {
    // Arrange: a stamp of two placements, its tiles a row of three with the block's two thirds and the sign beyond them.
    const hub = windowWithPlacements();
    const values = [ 0, 0, 0 ];
    const stamp = stampOf({
      width: 3,
      height: 1,
      tiles: { layers: [ 0 ], values, calledFor: [ -1, -1, -1 ] },
      events: [],
      spots: [ { blueprintId: 'aa22', x: -1, y: 0, width: 3, height: 3 }, { blueprintId: 'bb33', x: 2, y: 0, width: 1, height: 1 } ],
    });

    // Act: placed with its corner on the map's last column, so the block's last column and the sign land past the right
    // edge.
    placeStamp(hub, 2, stamp, at(7, 0), 'Paste');

    // Assert.
    expect(recorded(hub).filter(spot => spot.mapId === 2))
      .toStrictEqual([ { blueprintId: 'aa22', x: 6, y: 0, placed: { x: 0, y: 0, width: 2, height: 3 }, mapId: 2 } ]);
  });

  it('keeps a carried placement\'s part where it lands, never giving it back cells cut off where it was copied', () =>
  {
    // Arrange: the block copied while hanging past the left edge, its first column left off, onto the middle of map 2.
    const hub = windowWithPlacements();
    const values = [ 0, 0 ];
    const stamp = stampOf({
      width: 2,
      height: 1,
      tiles: { layers: [ 0 ], values, calledFor: [ -1, -1 ] },
      events: [],
      spots: [ { blueprintId: 'aa22', x: -1, y: 0, width: 3, height: 3, placed: { x: 1, y: 0, width: 2, height: 3 } } ],
    });

    // Act.
    placeStamp(hub, 2, stamp, at(3, 0), 'Paste');

    // Assert: the part it carried, though the whole block would fit where it landed.
    expect(recorded(hub).filter(spot => spot.mapId === 2))
      .toStrictEqual([ { blueprintId: 'aa22', x: 2, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 }, mapId: 2 } ]);
  });

  it('puts a placement of a blueprint no longer there down plain, saying so, and records each as it is while none can be told gone', () =>
  {
    // Arrange: one window whose blueprints no longer hold the block, and one holding no blueprints at all.
    const gone = windowWithPlacements({});
    const unknown = windowWithPlacements(null);
    const stamp = { ...stampOf({ width: 3, height: 3, tiles: blockStamp(gone).tiles, events: [] }), spots: [ { blueprintId: 'aa22', x: 0, y: 0, width: 3, height: 3 } ] };

    // Act.
    const outcomes = [ placeStamp(gone, 2, stamp, at(4, 1), 'Paste'), placeStamp(unknown, 2, stamp, at(4, 1), 'Paste') ];

    // Assert.
    expect([ outcomes.map(outcome => outcome.ok && outcome.notes), [ gone, unknown ].map(hub => recorded(hub).filter(spot => spot.mapId === 2)) ])
      .toStrictEqual([
        [ [ 'The stamp\'s tiles held a placement of a blueprint that no longer exists, so they went down as plain tiles.' ], [] ],
        [ [], [ { blueprintId: 'aa22', x: 4, y: 1, mapId: 2 } ] ],
      ]);
  });

  it('records nothing where the tiles do not go down, on a map of another tileset, the events going down alone', () =>
  {
    // Arrange.
    const hub = windowWithPlacements();
    const stamp = blockStampWith(hub);

    // Act.
    const outcome = placeStamp(hub, 3, stamp, at(4, 1), 'Paste');

    // Assert.
    expect([ outcome.ok && outcome.eventIds.length, recorded(hub).filter(spot => spot.mapId === 3) ])
      .toStrictEqual([ 2, [] ]);
  });

  it('refuses a stamp carrying a placement on a map that may hold no link, as it refuses copies of events', () =>
  {
    // Arrange: the block's ground alone, with no event.
    const hub = windowWithPlacements();
    const ground = captureAreaStamp(hub.map('map:1'), { x: 2, y: 1, width: 3, height: 3 }, 0, TilesetMode.area, 'window-a:4', [ { ...BLOCK, layers: [ 0 ] } ]) as Stamp;

    // Act.
    const outcomes = [ ground, { ...ground, spots: undefined } ].map(stamp => placeStamp(hub, 2, stamp, at(4, 1, { linkRefusal: 'its events are patterns' }), 'Paste'));

    // Assert: the same tiles without the placement go down.
    expect([ outcomes[0], outcomes[1].ok ])
      .toStrictEqual([ { ok: false, message: 'This stamp holds copies of blueprints, which can\'t go here: its events are patterns.' }, true ]);
  });

  it('records nothing in a window holding no record, the tiles going down all the same, and says so', () =>
  {
    // Arrange.
    const hub = window3();
    holdBlueprints(hub, { aa22: { name: 'Block', stamp: stampOf() } });
    const stamp = captureAreaStamp(hub.map('map:1'), { x: 2, y: 1, width: 3, height: 3 }, 'auto', TilesetMode.area, 'window-a:5', [ BLOCK ]) as Stamp;

    // Act.
    const outcome = placeStamp(hub, 2, stamp, at(4, 1), 'Paste');

    // Assert.
    expect([ outcome.ok && outcome.step?.entries.every(entry => entry.document === 'map:2'), outcome.ok && outcome.notes, hub.has(BLUEPRINT_USES_DOCUMENT) ])
      .toStrictEqual([ true, [ 'The stamp\'s tiles held placements of blueprints, which went down as plain tiles, since where blueprints are placed can\'t be read.' ], false ]);
  });
});

/*
 * A blueprint opened as a map takes a stamp's tiles as any map does, but none of its events: its events are fixed, so a
 * stamp placing any there, or a cut taking any away, is refused whole, saying why, and the blueprint stays as it was. The
 * blueprint is 3 by 3, every layer carried, plain ground, with one event at its centre.
 */
describe('stamps in a blueprint opened as a map', () =>
{
  /**
   * Opens the blueprint fixture.
   * @returns {ReturnType<typeof openedBlueprint>} The window and the blueprint's map.
   */
  const openCamp = () => openedBlueprint('k3x9q2mf', stampOf({
    width: 3,
    height: 3,
    tiles: { layers: [ 0, 1, 2, 3, 4, 5 ], values: new Array(54).fill(0).fill(1536, 0, 9), calledFor: new Array(54).fill(-1) },
    events: [ createMapEvent(1, 1, 1) ],
  }));

  it('refuses a stamp placing any event there, whole, and places one of tiles alone as one step in the blueprint\'s history', () =>
  {
    // Arrange: a stamp of one event, and a stamp of one tree on layer 4 alone.
    const { hub, map, mapId } = openCamp();
    const before = map.toJson();
    const tree = stampOf({ events: [], tiles: { layers: [ 3 ], values: [ TREE ], calledFor: [ -1 ] } });

    // Act.
    const refused = placeStamp(hub, mapId, stampOf(), at(0, 0), 'Paste');
    const refusedFile = map.toJson();
    const placed = placeStamp(hub, mapId, tree, at(2, 2), 'Stamp');

    // Assert.
    expect([ refused, refusedFile, placed.ok && placed.step?.histories, map.cellAt(2, 2, 3) ])
      .toStrictEqual([ { ok: false, message: BLUEPRINT_EVENTS_ADDED }, before, [ 'blueprint:k3x9q2mf' ], TREE ]);
  });

  it('refuses a cut taking the event out, changing nothing, and cuts tiles alone', () =>
  {
    // Arrange: the whole blueprint, event and all, and its top row of ground alone.
    const { hub, map, mapId } = openCamp();
    const before = map.toJson();
    const whole = captureAreaStamp(map, { x: 0, y: 0, width: 3, height: 3 }, 'auto', TilesetMode.area, 'window-a:7') as Stamp;
    const topRow = captureAreaStamp(map, { x: 0, y: 0, width: 3, height: 1 }, 0, TilesetMode.area, 'window-a:8') as Stamp;

    // Act.
    const refused = cutStampSource(hub, mapId, whole, TilesetMode.area);
    const refusedFile = map.toJson();
    const cut = cutStampSource(hub, mapId, topRow, TilesetMode.area);

    // Assert.
    expect([ refused, refusedFile, cut.ok && cut.step?.label, [ 0, 1, 2 ].map(x => map.cellAt(x, 0, 0)), map.event(1) !== null ])
      .toStrictEqual([ { ok: false, message: BLUEPRINT_EVENTS_REMOVED }, before, 'Cut 3 by 1 tiles', [ 0, 0, 0 ], true ]);
  });
});
