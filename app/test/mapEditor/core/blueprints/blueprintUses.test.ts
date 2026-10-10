import { describe, expect, it } from 'vitest';
import type { BlueprintCopyCounts } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import type { Blueprint } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import {
  BLUEPRINT_USES_DOCUMENT,
  changeMapSpots,
  forgetPlacement,
  forgetSpots,
  mapEntryOf,
  placementKey,
  placementsByMap,
  readableUses,
  readUses,
  recordSpots,
  samePlacement,
  sameSpot,
  sameSpots,
  spotsOfBlueprint,
  spotsOfEntry,
  spotsOnMap,
  usageWords,
  usedCopiesOf,
  usesOf,
  type PlacedSpot,
} from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { holdBlueprints, holdBlueprintUses, storedUses } from '../../support/blueprintFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The record of where blueprints are placed is the only way back to a placement of a blueprint's tiles, since tiles carry
 * no link of their own. It owes its callers these rules.
 *
 * Reading: per map, by id, and per blueprint on it, every cell a placement's corner was put down at, which may lie past
 * the map's top or left edge, and for a placement the map's edge cut off, the part of the blueprint that went down. A
 * record written before placements said their part reads as every placement whole. Anything that is not such a record is
 * refused loudly rather than read as no placements, since writing over it would lose it; a window holding no record it
 * can read changes nothing in it.
 *
 * Writing: each map's placements are written whole, in one order (blueprints by id, then row by row), each placement
 * once, its part placed only when it has one, and a map with none has no entry, so the file reads the same whoever wrote
 * it, and an edit to one map's placements never touches another's. A change is part of whatever step made it, and a
 * change that changes nothing adds nothing to the step. A placement put down at a cell already recorded takes the place of
 * the one there.
 *
 * Counting: a placement of a blueprint's tiles is one more use of it on its map, as each event linked to it is, and the
 * count says how many of its uses are placements; with no record to read, the count cannot be told. A blueprint's card
 * never calls its placements and its linked events by one name: one with tiles says how many times it is placed and on
 * how many maps, then its linked events; one of events alone, which no placement is recorded for, says its linked events
 * and the maps they stand on. Forgetting a placement is a step in the blueprint's own history.
 *
 * Saving is the keeper's (see blueprintUsesKeeper.test.ts): the record is kept alongside the maps and never saved whole.
 */

/**
 * Placements of the camp (aa22) and the roost (k3x9q2mf) on maps 3 and 16.
 */
const SPOTS: readonly PlacedSpot[] = [
  { blueprintId: 'k3x9q2mf', mapId: 16, x: 4, y: 7 },
  { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 },
  { blueprintId: 'aa22', mapId: 16, x: 1, y: 3 },
  { blueprintId: 'aa22', mapId: 3, x: -1, y: 0 },
];

/**
 * Builds a window holding the record of the placements given, map 16, and the blueprints.
 * @param {readonly PlacedSpot[]} spots The placements.
 * @param {DocumentStore} store Where the window's documents are written; none, left out.
 * @returns {DocumentHub} The window's documents.
 */
const windowWith = (spots: readonly PlacedSpot[] = SPOTS, store?: DocumentStore): DocumentHub =>
{
  const hub = new DocumentHub({ clientId: 'window-a', store });
  holdBlueprintUses(hub, spots);
  holdBlueprints(hub);
  hub.adopt('map:16', buildMapJson() as unknown as JsonValue);
  return hub;
};

/**
 * Reads the record a window holds, every placement in it.
 * @param {DocumentHub} hub The window's documents.
 * @returns {PlacedSpot[]} The placements.
 */
const recorded = (hub: DocumentHub): PlacedSpot[] => usesOf(hub.document(BLUEPRINT_USES_DOCUMENT));

describe('readUses', () =>
{
  it('reads every placement map by map, a corner past the map\'s edge included', () =>
  {
    // Arrange.
    const { data } = storedUses(SPOTS);

    // Act.
    const spots = readUses(data);

    // Assert: maps in id order, each map's blueprints by id and their placements row by row.
    expect(spots)
      .toStrictEqual([
        { blueprintId: 'aa22', x: -1, y: 0, mapId: 3 },
        { blueprintId: 'aa22', x: 1, y: 3, mapId: 16 },
        { blueprintId: 'aa22', x: 12, y: 3, mapId: 16 },
        { blueprintId: 'k3x9q2mf', x: 4, y: 7, mapId: 16 },
      ]);
  });

  it('refuses anything that is not a record of placements, naming where', () =>
  {
    // Arrange: no record at all, a list of maps, a map key that is no map's id, a map's entry that is a list, a
    // blueprint's id no blueprint could have, placements that are not a list, a cell with a fraction in it, and a cell
    // that is no cell at all.
    const broken: JsonValue[] = [
      'nothing',
      { maps: [] },
      { maps: { 0: {} } },
      { maps: { 16: [] } },
      { maps: { 16: { 'No-Id': [] } } },
      { maps: { 16: { aa22: { x: 1, y: 2 } } } },
      { maps: { 16: { aa22: [ { x: 1.5, y: 2 } ] } } },
      { maps: { 16: { aa22: [ 7 ] } } },
    ];

    // Act.
    const messages = broken.map(data =>
    {
      try
      {
        readUses(data);
        return 'read';
      }
      catch (error)
      {
        return (error as Error).message;
      }
    });

    // Assert.
    expect(messages)
      .toStrictEqual([
        'the saved blueprint placements are not a record of placements',
        'the saved blueprint placements are not a record of placements',
        'the saved blueprint placements hold something under "0" that is not a placement',
        'the saved blueprint placements hold something under map 16 that is not a placement',
        'the saved blueprint placements hold something under map 16 that is not a placement',
        'the saved blueprint placements hold something under map 16 that is not a placement',
        'the saved blueprint placements hold something under map 16 that is not a placement',
        'the saved blueprint placements hold something under map 16 that is not a placement',
      ]);
  });

  it('reads a map\'s entry holding nothing as no placements', () =>
  {
    // Arrange: an entry a hand left empty, beside one holding a placement.
    const data = { maps: { 3: {}, 16: { aa22: [ { x: 1, y: 3 } ] } } };

    // Act.
    const spots = readUses(data);

    // Assert.
    expect(spots)
      .toStrictEqual([ { blueprintId: 'aa22', x: 1, y: 3, mapId: 16 } ]);
  });
});

describe('readableUses', () =>
{
  it('hands over the record a window holds and can read, and nothing for one it does not hold or cannot read', () =>
  {
    // Arrange.
    const held = windowWith();
    const missing = new DocumentHub({ clientId: 'window-a' });
    const broken = new DocumentHub({ clientId: 'window-a' });
    broken.adopt(BLUEPRINT_USES_DOCUMENT, { schemaVersion: 1, data: { maps: [] } });

    // Act.
    const found = [ held, missing, broken ].map(readableUses);

    // Assert.
    expect(found)
      .toStrictEqual([ held.document(BLUEPRINT_USES_DOCUMENT), null, null ]);
  });
});

describe('spotsOnMap and spotsOfBlueprint', () =>
{
  it('lists one map\'s placements, and none for a map with no entry', () =>
  {
    // Arrange.
    const document = windowWith().document(BLUEPRINT_USES_DOCUMENT);

    // Act.
    const maps = [ spotsOnMap(document, 3), spotsOnMap(document, 7) ];

    // Assert.
    expect(maps)
      .toStrictEqual([ [ { blueprintId: 'aa22', x: -1, y: 0 } ], [] ]);
  });

  it('lists one blueprint\'s placements across every map, by map and then row by row, and none of another\'s', () =>
  {
    // Arrange.
    const document = windowWith().document(BLUEPRINT_USES_DOCUMENT);

    // Act.
    const camp = spotsOfBlueprint(document, 'aa22');

    // Assert.
    expect(camp)
      .toStrictEqual([
        { blueprintId: 'aa22', x: -1, y: 0, mapId: 3 },
        { blueprintId: 'aa22', x: 1, y: 3, mapId: 16 },
        { blueprintId: 'aa22', x: 12, y: 3, mapId: 16 },
      ]);
  });
});

describe('mapEntryOf', () =>
{
  it('writes a map\'s placements in one order, each blueprint by id and its placements row by row, each once', () =>
  {
    // Arrange: out of order, one placement given twice.
    const spots = [
      { blueprintId: 'k3x9q2mf', x: 4, y: 7 },
      { blueprintId: 'aa22', x: 12, y: 3 },
      { blueprintId: 'aa22', x: 5, y: 1 },
      { blueprintId: 'aa22', x: 12, y: 3 },
      { blueprintId: 'aa22', x: 1, y: 3 },
    ];

    // Act.
    const entry = mapEntryOf(spots);

    // Assert.
    expect(JSON.stringify(entry))
      .toBe('{"aa22":[{"x":5,"y":1},{"x":1,"y":3},{"x":12,"y":3}],"k3x9q2mf":[{"x":4,"y":7}]}');
  });

  it('writes no entry for a map with no placements', () =>
  {
    // Arrange: nothing.

    // Act.
    const entry = mapEntryOf([]);

    // Assert.
    expect(entry)
      .toBeUndefined();
  });
});

describe('sameSpot', () =>
{
  it('tells one placement from another by its blueprint and its cell', () =>
  {
    // Arrange: the camp at 1, 3, beside itself and three near misses.
    const spot = { blueprintId: 'aa22', x: 1, y: 3 };
    const others = [ { ...spot }, { ...spot, blueprintId: 'aa23' }, { ...spot, x: 2 }, { ...spot, y: 4 } ];

    // Act.
    const same = others.map(other => sameSpot(spot, other));

    // Assert.
    expect(same)
      .toStrictEqual([ true, false, false, false ]);
  });
});

describe('changeMapSpots', () =>
{
  it('writes one map\'s placements whole as part of the step making the change, which one undo takes back', () =>
  {
    // Arrange.
    const hub = windowWith();
    const before = recorded(hub);

    // Act: the camp's placements on map 16 moved two to the right.
    const step = hub.edit('Move', [ mapHistoryKey(16) ], tx =>
    {
      changeMapSpots(tx, hub, 16, spots => spots.map(spot => (spot.blueprintId === 'aa22' ? { ...spot, x: spot.x + 2 } : spot)));
    });
    const moved = recorded(hub);
    hub.undo(mapHistoryKey(16));

    // Assert: one patch, on map 16's entry alone.
    expect([ step?.entries.map(entry => entry.patch.kind === 'set' && entry.patch.path), moved.filter(spot => spot.mapId === 16), recorded(hub) ])
      .toStrictEqual([
        [ [ 'data', 'maps', '16' ] ],
        [
          { blueprintId: 'aa22', x: 3, y: 3, mapId: 16 },
          { blueprintId: 'aa22', x: 14, y: 3, mapId: 16 },
          { blueprintId: 'k3x9q2mf', x: 4, y: 7, mapId: 16 },
        ],
        before,
      ]);
  });

  it('takes a map\'s entry away with its last placement, leaving every other map\'s as it was', () =>
  {
    // Arrange.
    const hub = windowWith();

    // Act.
    hub.edit('Clear', [ mapHistoryKey(16) ], tx => changeMapSpots(tx, hub, 16, () => []));

    // Assert.
    expect([ hub.document(BLUEPRINT_USES_DOCUMENT).valueAt([ 'data', 'maps', '16' ]), recorded(hub) ])
      .toStrictEqual([ undefined, [ { blueprintId: 'aa22', x: -1, y: 0, mapId: 3 } ] ]);
  });

  it('adds nothing to the step when the placements come back as they were', () =>
  {
    // Arrange.
    const hub = windowWith();

    // Act.
    const step = hub.edit('Nothing', [ mapHistoryKey(16) ], tx => changeMapSpots(tx, hub, 16, spots => [ ...spots ].reverse()));

    // Assert.
    expect(step)
      .toBeNull();
  });

  it('changes nothing in a window holding no record it can read', () =>
  {
    // Arrange: a window with no record, and one with something else in its place.
    const missing = new DocumentHub({ clientId: 'window-a' });
    missing.adopt('map:16', buildMapJson() as unknown as JsonValue);
    const broken = new DocumentHub({ clientId: 'window-a' });
    broken.adopt('map:16', buildMapJson() as unknown as JsonValue);
    broken.adopt(BLUEPRINT_USES_DOCUMENT, { schemaVersion: 1, data: { maps: [] } });

    // Act.
    const steps = [ missing, broken ].map(hub => hub.edit('Add', [ mapHistoryKey(16) ], tx =>
    {
      changeMapSpots(tx, hub, 16, () => [ { blueprintId: 'aa22', x: 0, y: 0 } ]);
    }));

    // Assert.
    expect([ steps, broken.document(BLUEPRINT_USES_DOCUMENT).valueAt([ 'data' ]) ])
      .toStrictEqual([ [ null, null ], { maps: [] } ]);
  });
});

describe('recordSpots and forgetSpots', () =>
{
  it('records placements on a map, one already there once', () =>
  {
    // Arrange.
    const hub = windowWith();

    // Act.
    hub.edit('Place', [ mapHistoryKey(16) ], tx => recordSpots(tx, hub, 16, [ { blueprintId: 'aa22', x: 1, y: 3 }, { blueprintId: 'aa22', x: 0, y: 0 } ]));

    // Assert.
    expect(spotsOnMap(hub.document(BLUEPRINT_USES_DOCUMENT), 16))
      .toStrictEqual([
        { blueprintId: 'aa22', x: 0, y: 0 },
        { blueprintId: 'aa22', x: 1, y: 3 },
        { blueprintId: 'aa22', x: 12, y: 3 },
        { blueprintId: 'k3x9q2mf', x: 4, y: 7 },
      ]);
  });

  it('forgets the placements named, every other on the map staying, and touches nothing when none are named', () =>
  {
    // Arrange.
    const hub = windowWith();

    // Act.
    const forgot = hub.edit('Forget', [ mapHistoryKey(16) ], tx => forgetSpots(tx, hub, 16, [ { blueprintId: 'aa22', x: 1, y: 3 } ]));
    const none = hub.edit('Nothing', [ mapHistoryKey(16) ], tx =>
    {
      forgetSpots(tx, hub, 16, []);
      recordSpots(tx, hub, 16, []);
    });

    // Assert.
    expect([ forgot === null, none, spotsOnMap(hub.document(BLUEPRINT_USES_DOCUMENT), 16) ])
      .toStrictEqual([ false, null, [ { blueprintId: 'aa22', x: 12, y: 3 }, { blueprintId: 'k3x9q2mf', x: 4, y: 7 } ] ]);
  });
});

describe('usageWords', () =>
{
  /**
   * Counts of linked events: three of the camp's, two on map 16 and one on map 20, and one of the bats' on map 9.
   */
  const COUNTS: BlueprintCopyCounts = {
    state: 'counted',
    byBlueprint: new Map([
      [ 'aa22', { total: 3, maps: [ { mapId: 16, copies: 2 }, { mapId: 20, copies: 1 } ] } ],
      [ 'bb33', { total: 1, maps: [ { mapId: 9, copies: 1 } ] } ],
    ]),
  };

  /**
   * A blueprint by its id: with a tile and an event, with a tile alone, or with an event alone.
   * @param {string} id The blueprint's id.
   * @param {'both' | 'tiles' | 'events'} holds What it holds.
   * @returns {Blueprint} The blueprint.
   */
  const blueprintOf = (id: string, holds: 'both' | 'tiles' | 'events'): Blueprint =>
  {
    const tiles = holds === 'events' ? null : { layers: [ 0 ], values: [ 1 ], calledFor: [ -1 ] };
    return { id, name: id, stamp: stampOf(holds === 'tiles' ? { tiles, events: [] } : { tiles }) };
  };

  it('says how many times a blueprint with tiles is placed and on how many maps, then how many events are linked to it', () =>
  {
    // Arrange: the camp placed three times on two maps; the roost once; the bats never, though one event is linked.
    const blueprints = [ blueprintOf('aa22', 'both'), blueprintOf('k3x9q2mf', 'both'), blueprintOf('bb33', 'both') ];

    // Act.
    const words = blueprints.map(blueprint => usageWords(COUNTS, SPOTS, blueprint));

    // Assert.
    expect(words)
      .toStrictEqual([ 'Placed 3 times on 2 maps, 3 linked events', 'Placed once on 1 map, no linked events', 'Not placed yet, 1 linked event' ]);
  });

  it('says only where a blueprint of tiles alone is placed', () =>
  {
    // Arrange: nothing beyond the counts and the placements.

    // Act.
    const words = usageWords(COUNTS, SPOTS, blueprintOf('aa22', 'tiles'));

    // Assert.
    expect(words)
      .toBe('Placed 3 times on 2 maps');
  });

  it('says how many events are linked to a blueprint of events alone and on how many maps, never its placements', () =>
  {
    // Arrange: the camp, as a blueprint of events alone, though the record names it; the bats; and one used nowhere.
    const blueprints = [ blueprintOf('aa22', 'events'), blueprintOf('bb33', 'events'), blueprintOf('zz99', 'events') ];

    // Act.
    const words = blueprints.map(blueprint => usageWords(COUNTS, SPOTS, blueprint));

    // Assert.
    expect(words)
      .toStrictEqual([ '3 linked events on 2 maps', '1 linked event on 1 map', 'No linked events yet' ]);
  });

  it('says the linked events are still being counted, or cannot be, whatever the count would say', () =>
  {
    // Arrange.
    const counting: BlueprintCopyCounts = { ...COUNTS, state: 'counting' };
    const unavailable: BlueprintCopyCounts = { ...COUNTS, state: 'unavailable' };

    // Act.
    const words = [ counting, unavailable ].flatMap(counts => [ usageWords(counts, SPOTS, blueprintOf('aa22', 'both')), usageWords(counts, SPOTS, blueprintOf('bb33', 'events')) ]);

    // Assert.
    expect(words)
      .toStrictEqual([
        'Placed 3 times on 2 maps, counting linked events',
        'Counting linked events',
        'Placed 3 times on 2 maps, linked events can\'t be counted',
        'Linked events can\'t be counted',
      ]);
  });
});

describe('usedCopiesOf', () =>
{
  it('counts a blueprint\'s placements with its linked events, saying how many are placements, and none for a blueprint used nowhere', () =>
  {
    // Arrange: the camp has one linked event on map 20.
    const hub = windowWith();
    const copies = { countOf: (blueprintId: string) => (blueprintId === 'aa22' ? { total: 1, maps: [ { mapId: 20, copies: 1 } ] } : { total: 0, maps: [] }) };

    // Act.
    const counts = [ usedCopiesOf(copies, hub, 'aa22'), usedCopiesOf(copies, hub, 'zz99') ];

    // Assert.
    expect(counts)
      .toStrictEqual([
        { total: 4, maps: [ { mapId: 3, copies: 1 }, { mapId: 16, copies: 2 }, { mapId: 20, copies: 1 } ], placements: 3 },
        { total: 0, maps: [] },
      ]);
  });

  it('cannot tell while the copies of the events are still being counted, or while no record can be read', () =>
  {
    // Arrange.
    const counting = { countOf: () => null };
    const counted = { countOf: () => ({ total: 0, maps: [] }) };
    const missing = new DocumentHub({ clientId: 'window-a' });

    // Act.
    const counts = [ usedCopiesOf(counting, windowWith(), 'aa22'), usedCopiesOf(counted, missing, 'aa22') ];

    // Assert.
    expect(counts)
      .toStrictEqual([ null, null ]);
  });
});

describe('forgetPlacement', () =>
{
  it('forgets one placement as a step in its blueprint\'s history, which one undo takes back', () =>
  {
    // Arrange.
    const hub = windowWith();

    // Act.
    const step = forgetPlacement(hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 });
    const forgotten = spotsOfBlueprint(hub.document(BLUEPRINT_USES_DOCUMENT), 'aa22');
    hub.undo(blueprintHistoryKey('aa22'));

    // Assert.
    expect([ step?.label, step?.histories, forgotten, recorded(hub) ])
      .toStrictEqual([
        'Forget a placement of "Goblin camp"',
        [ blueprintHistoryKey('aa22') ],
        [ { blueprintId: 'aa22', x: -1, y: 0, mapId: 3 }, { blueprintId: 'aa22', x: 1, y: 3, mapId: 16 } ],
        usesOf(windowWith().document(BLUEPRINT_USES_DOCUMENT)),
      ]);
  });

  it('records nothing for a placement the record no longer holds', () =>
  {
    // Arrange.
    const hub = windowWith();

    // Act.
    const step = forgetPlacement(hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 30, y: 3 });

    // Assert.
    expect([ step, hub.history(blueprintHistoryKey('aa22')).rows ])
      .toStrictEqual([ null, [] ]);
  });
});

/*
 * A placement cut off by the map's edge keeps the part of its blueprint that went down, and the record reads and writes
 * it; two placements are told apart by their corners, and written alike only when their parts are alike too.
 */
describe('the part placed', () =>
{
  /**
   * The camp cut off at map 3's left edge: its corner a column past the edge, its first column left off.
   */
  const CUT: PlacedSpot = { blueprintId: 'aa22', mapId: 3, x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } };

  it('reads the part a placement cut off by the edge put down, and every older placement as whole', () =>
  {
    // Arrange: one placement cut off, beside one written before placements said their part.
    const data = { maps: { 3: { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] }, 16: { aa22: [ { x: 1, y: 3 } ] } } };

    // Act.
    const spots = readUses(data);

    // Assert.
    expect(spots)
      .toStrictEqual([ CUT, { blueprintId: 'aa22', x: 1, y: 3, mapId: 16 } ]);
  });

  it('refuses a part placed that is no rectangle inside the blueprint', () =>
  {
    // Arrange: a part with a side missing, one of nothing, one starting before the blueprint, and one that is no part.
    const parts: JsonValue[] = [ { x: 0, y: 0, width: 2 }, { x: 0, y: 0, width: 0, height: 2 }, { x: -1, y: 0, width: 1, height: 1 }, 'all of it' ];

    // Act.
    const messages = parts.map(placed =>
    {
      try
      {
        readUses({ maps: { 3: { aa22: [ { x: 0, y: 0, placed } ] } } });
        return 'read';
      }
      catch (error)
      {
        return (error as Error).message;
      }
    });

    // Assert.
    expect(messages)
      .toStrictEqual(parts.map(() => 'the saved blueprint placements hold something under map 3 that is not a placement'));
  });

  it('writes the part placed after the corner, and nothing for a placement that went down whole', () =>
  {
    // Arrange: nothing beyond the cut placement and a whole one.

    // Act.
    const entry = mapEntryOf([ CUT, { blueprintId: 'aa22', x: 4, y: 4 } ]);

    // Assert.
    expect(JSON.stringify(entry))
      .toBe('{"aa22":[{"x":-1,"y":0,"placed":{"x":1,"y":0,"width":2,"height":3}},{"x":4,"y":4}]}');
  });

  it('tells placements apart by corner, and their writing by corner and part alike', () =>
  {
    // Arrange: the cut placement beside itself whole, and beside itself cut further.
    const whole = { blueprintId: 'aa22', x: -1, y: 0 };
    const cutFurther = { ...whole, placed: { x: 1, y: 0, width: 1, height: 3 } };

    // Act.
    const compared = [ sameSpot(CUT, whole), samePlacement(CUT, whole), samePlacement(CUT, cutFurther), samePlacement(CUT, { ...CUT }) ];

    // Assert.
    expect([ compared, placementKey(CUT), placementKey(whole) ])
      .toStrictEqual([ [ true, false, false, true ], 'aa22@-1,0:1,0,2x3', 'aa22@-1,0' ]);
  });

  it('reads two lists of a map\'s placements as alike whatever their order, and apart when one part differs', () =>
  {
    // Arrange.
    const listed = [ CUT, { blueprintId: 'k3x9q2mf', x: 4, y: 7 } ];

    // Act.
    const alike = [
      sameSpots(listed, [ ...listed ].reverse()),
      sameSpots(listed, [ { ...CUT, placed: { x: 1, y: 0, width: 2, height: 2 } }, listed[1] ]),
      sameSpots([], []),
    ];

    // Assert.
    expect(alike)
      .toStrictEqual([ true, false, true ]);
  });

  it('lets a placement put down at a recorded corner take the place of the one there, part and all', () =>
  {
    // Arrange: the cut camp recorded on map 3.
    const hub = windowWith([ CUT ]);

    // Act: the camp put down whole at the same corner, as it is once the map has grown.
    hub.edit('Place', [ mapHistoryKey(16) ], tx => recordSpots(tx, hub, 3, [ { blueprintId: 'aa22', x: -1, y: 0 } ]));

    // Assert.
    expect(spotsOnMap(hub.document(BLUEPRINT_USES_DOCUMENT), 3))
      .toStrictEqual([ { blueprintId: 'aa22', x: -1, y: 0 } ]);
  });
});

describe('placementsByMap and spotsOfEntry', () =>
{
  it('reads a stored record into each map\'s placements, by map id, a map with none left out', () =>
  {
    // Arrange.
    const stored = storedUses(SPOTS, 1);

    // Act.
    const byMap = placementsByMap(stored);

    // Assert.
    expect([ ...byMap ])
      .toStrictEqual([
        [ 3, [ { blueprintId: 'aa22', x: -1, y: 0 } ] ],
        [ 16, [ { blueprintId: 'aa22', x: 1, y: 3 }, { blueprintId: 'aa22', x: 12, y: 3 }, { blueprintId: 'k3x9q2mf', x: 4, y: 7 } ] ],
      ]);
  });

  it('refuses a stored record that is not a record of placements', () =>
  {
    // Arrange: a record with no data, and something that is no record at all.

    // Act.
    const reads = [ () => placementsByMap({ schemaVersion: 2 }), () => placementsByMap('broken') ];

    // Assert.
    reads.forEach(read => expect(read)
      .toThrow('the saved blueprint placements are not a record of placements'));
  });

  it('reads one map\'s entry, and none for a map with no entry', () =>
  {
    // Arrange.
    const entry = { aa22: [ { x: 1, y: 3 } ] };

    // Act.
    const read = [ spotsOfEntry(16, entry), spotsOfEntry(16, undefined) ];

    // Assert.
    expect(read)
      .toStrictEqual([ [ { blueprintId: 'aa22', x: 1, y: 3 } ], [] ]);
  });
});
