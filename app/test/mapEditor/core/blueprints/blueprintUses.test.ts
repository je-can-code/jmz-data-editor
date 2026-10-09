import { describe, expect, it, vi } from 'vitest';
import type { BlueprintCopyCounts } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import {
  BLUEPRINT_USES_DOCUMENT,
  changeMapSpots,
  countsWithPlacements,
  forgetPlacement,
  forgetSpots,
  keepUsesWithMaps,
  mapEntryOf,
  readableUses,
  readUses,
  recordSpots,
  sameSpot,
  saveBlueprintUses,
  spotsOfBlueprint,
  spotsOnMap,
  usedCopiesOf,
  usesOf,
  type PlacedSpot,
} from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { MAP_INFOS_KEY, TILESETS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { holdBlueprints, holdBlueprintUses, storedUses } from '../../support/blueprintFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The record of where blueprints are placed is the only way back to a placement of a blueprint's tiles, since tiles carry
 * no link of their own. It owes its callers these rules.
 *
 * Reading: per map, by id, and per blueprint on it, every cell a placement's corner was put down at, which may lie past
 * the map's top or left edge. Anything that is not such a record is refused loudly rather than read as no placements,
 * since writing over it would lose it; a window holding no record it can read changes nothing in it.
 *
 * Writing: each map's placements are written whole, in one order (blueprints by id, then row by row), each placement
 * once, and a map with none has no entry, so the file reads the same whoever wrote it, and an edit to one map's
 * placements never touches another's. A change is part of whatever step made it, and a change that changes nothing adds
 * nothing to the step.
 *
 * Counting: a placement of a blueprint's tiles is one copy of it on its map, as each copy of one of its events is; with
 * no record to read, the count cannot be told. Forgetting a placement is a step in the blueprint's own history.
 *
 * Saving: the record goes to disk whenever a map's file or the map tree's is written, from this window or another, so it
 * describes the maps on disk; never over a file that changed elsewhere while it held unsaved edits, which the author hears.
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
    // blueprint's id no blueprint could have, placements that are not a list, and a cell with a fraction in it.
    const broken: JsonValue[] = [
      'nothing',
      { maps: [] },
      { maps: { 0: {} } },
      { maps: { 16: [] } },
      { maps: { 16: { 'No-Id': [] } } },
      { maps: { 16: { aa22: { x: 1, y: 2 } } } },
      { maps: { 16: { aa22: [ { x: 1.5, y: 2 } ] } } },
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

describe('countsWithPlacements', () =>
{
  /**
   * Counts of event copies: two of the camp's on map 16 and one on map 20, and one of the bats' on map 9.
   */
  const COUNTS: BlueprintCopyCounts = {
    state: 'counted',
    byBlueprint: new Map([
      [ 'aa22', { total: 3, maps: [ { mapId: 16, copies: 2 }, { mapId: 20, copies: 1 } ] } ],
      [ 'bb33', { total: 1, maps: [ { mapId: 9, copies: 1 } ] } ],
    ]),
  };

  it('counts each placement as one copy on its map, beside the copies of the events, a blueprint placed alone included', () =>
  {
    // Arrange: nothing beyond the counts and the placements.

    // Act.
    const counts = countsWithPlacements(COUNTS, SPOTS);

    // Assert.
    expect([ counts.state, Object.fromEntries(counts.byBlueprint) ])
      .toStrictEqual([
        'counted',
        {
          aa22: { total: 6, maps: [ { mapId: 3, copies: 1 }, { mapId: 16, copies: 4 }, { mapId: 20, copies: 1 } ] },
          bb33: { total: 1, maps: [ { mapId: 9, copies: 1 } ] },
          k3x9q2mf: { total: 1, maps: [ { mapId: 16, copies: 1 } ] },
        },
      ]);
  });

  it('says the count is still being made while no record can be read, and leaves one that cannot be had as it is', () =>
  {
    // Arrange.
    const unavailable: BlueprintCopyCounts = { state: 'unavailable', byBlueprint: new Map() };

    // Act.
    const states = [ countsWithPlacements(COUNTS, null).state, countsWithPlacements(unavailable, null).state ];

    // Assert.
    expect(states)
      .toStrictEqual([ 'counting', 'unavailable' ]);
  });
});

describe('usedCopiesOf', () =>
{
  it('counts a blueprint\'s placements with the copies of its events, and none for a blueprint used nowhere', () =>
  {
    // Arrange: the camp has one copy of its events on map 20.
    const hub = windowWith();
    const copies = { countOf: (blueprintId: string) => (blueprintId === 'aa22' ? { total: 1, maps: [ { mapId: 20, copies: 1 } ] } : { total: 0, maps: [] }) };

    // Act.
    const counts = [ usedCopiesOf(copies, hub, 'aa22'), usedCopiesOf(copies, hub, 'zz99') ];

    // Assert.
    expect(counts)
      .toStrictEqual([
        { total: 4, maps: [ { mapId: 3, copies: 1 }, { mapId: 16, copies: 2 }, { mapId: 20, copies: 1 } ] },
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
        'Forget a copy of "Goblin camp"',
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
 * Writing the record: what saveBlueprintUses writes by itself, and keepUsesWithMaps writing it whenever the maps or the
 * tree are written.
 */
describe('saving the record', () =>
{
  /**
   * A store keeping every write, which fails when told to.
   * @returns {{ store: DocumentStore, writes: DocumentKey[], fail: { now: boolean } }} The store, its writes, and the switch.
   */
  const recordingStore = () =>
  {
    const writes: DocumentKey[] = [];
    const fail = { now: false };
    const store: DocumentStore = {
      load: async () => null,
      save: async key =>
      {
        if (fail.now && key === BLUEPRINT_USES_DOCUMENT)
        {
          throw new Error('the disk is full');
        }

        writes.push(key);
      },
    };
    return { store, writes, fail };
  };

  /**
   * Places the camp at a cell on map 16, unsaved.
   * @param {DocumentHub} hub The window's documents.
   * @param {number} x The column.
   */
  const place = (hub: DocumentHub, x: number): void =>
  {
    hub.edit('Place', [ mapHistoryKey(16) ], tx =>
    {
      tx.set('map:16', [ 'displayName' ], `placed at ${x}`);
      recordSpots(tx, hub, 16, [ { blueprintId: 'aa22', x, y: 0 } ]);
    });
  };

  /**
   * Waits for every write on its way to land.
   * @returns {Promise<void>} Settles once they have.
   */
  const writesLand = async (): Promise<void> =>
  {
    await new Promise(resolve =>
    {
      setTimeout(resolve, 0);
    });
  };

  it('writes the record when it holds anything unsaved, and nothing when it does not', async () =>
  {
    // Arrange.
    const { store, writes } = recordingStore();
    const hub = windowWith(SPOTS, store);
    const clean = await saveBlueprintUses(hub);
    place(hub, 0);

    // Act.
    const dirty = await saveBlueprintUses(hub);

    // Assert.
    expect([ clean, dirty, writes, hub.isDirty(BLUEPRINT_USES_DOCUMENT) ])
      .toStrictEqual([ { ok: true, saved: false }, { ok: true, saved: true }, [ BLUEPRINT_USES_DOCUMENT ], false ]);
  });

  it('holds back a record waiting for a choice about changes made elsewhere, saying so', async () =>
  {
    // Arrange.
    const { store, writes } = recordingStore();
    const hub = windowWith(SPOTS, store);
    place(hub, 0);
    hub.flagConflict(BLUEPRINT_USES_DOCUMENT, { kind: 'disk', content: null });

    // Act.
    const outcome = await saveBlueprintUses(hub);

    // Assert.
    expect([ outcome, writes ])
      .toStrictEqual([ { ok: false, message: 'The blueprint placements were not saved: they are waiting for a choice about changes made elsewhere.' }, [] ]);
  });

  it('writes the record whenever a map or the tree is written, here or in another window, and for nothing else', async () =>
  {
    // Arrange: the tree and the tilesets held too.
    const { store, writes } = recordingStore();
    const hub = windowWith(SPOTS, store);
    hub.adopt(MAP_INFOS_KEY, [ null ]);
    hub.adopt(TILESETS_KEY, [ null ]);
    const problems: string[] = [];
    keepUsesWithMaps(hub, message => problems.push(message));
    const written = (): number => writes.filter(key => key === BLUEPRINT_USES_DOCUMENT).length;

    // Act: the tilesets saved with the record unsaved, then map 16, then the tree, then another window's save of map 16.
    place(hub, 0);
    await hub.save(TILESETS_KEY);
    await writesLand();
    const afterTilesets = written();
    await hub.save('map:16');
    await writesLand();
    const afterMap = written();
    place(hub, 2);
    hub.edit('Rename', [ 'tree' ], tx => tx.set(MAP_INFOS_KEY, [ 0 ], 'tree'));
    await hub.save(MAP_INFOS_KEY);
    await writesLand();
    const afterTree = written();
    place(hub, 4);
    hub.applyRemote({ type: 'saved', origin: 'window-b', document: 'map:16', marker: hub.snapshot('map:16').applied });
    await writesLand();

    // Assert.
    expect([ afterTilesets, afterMap, afterTree, written(), hub.isDirty(BLUEPRINT_USES_DOCUMENT), problems ])
      .toStrictEqual([ 0, 1, 2, 3, false, [] ]);
  });

  it('writes once more after a write on its way when another map is saved meanwhile', async () =>
  {
    // Arrange: a store whose first write of the record waits until let go.
    const writes: DocumentKey[] = [];
    let release = (): void => undefined;
    const store: DocumentStore = {
      load: async () => null,
      save: key =>
      {
        writes.push(key);
        return key === BLUEPRINT_USES_DOCUMENT && writes.filter(each => each === key).length === 1
          ? new Promise<void>(resolve =>
          {
            release = resolve;
          })
          : Promise.resolve();
      },
    };
    const hub = windowWith(SPOTS, store);
    keepUsesWithMaps(hub, () => undefined);
    place(hub, 0);
    await hub.save('map:16');

    // Act: another placement saved while the first write waits, then the first write let go.
    place(hub, 2);
    await hub.save('map:16');
    const whileWaiting = writes.filter(key => key === BLUEPRINT_USES_DOCUMENT).length;
    release();
    await writesLand();

    // Assert.
    expect([ whileWaiting, writes.filter(key => key === BLUEPRINT_USES_DOCUMENT).length, hub.isDirty(BLUEPRINT_USES_DOCUMENT) ])
      .toStrictEqual([ 1, 2, false ]);
  });

  it('tells the author when the record is held back, or cannot be written, and stops when asked', async () =>
  {
    // Arrange.
    const { store, fail } = recordingStore();
    const hub = windowWith(SPOTS, store);
    const problems: string[] = [];
    const stop = keepUsesWithMaps(hub, message => problems.push(message));

    // Act: a write that fails, then one held back, then nothing heard once stopped.
    fail.now = true;
    place(hub, 0);
    await hub.save('map:16');
    await writesLand();
    fail.now = false;
    hub.flagConflict(BLUEPRINT_USES_DOCUMENT, { kind: 'disk', content: null });
    place(hub, 2);
    await hub.save('map:16');
    await writesLand();
    stop();
    place(hub, 4);
    await hub.save('map:16');
    await writesLand();

    // Assert.
    expect(problems)
      .toStrictEqual([
        'The blueprint placements could not be saved: the disk is full',
        'The blueprint placements were not saved: they are waiting for a choice about changes made elsewhere.',
      ]);
  });

  it('writes nothing for a window holding no record', async () =>
  {
    // Arrange: a window holding map 16 alone.
    const save = vi.fn(async () => undefined);
    const hub = new DocumentHub({ clientId: 'window-a', store: { load: async () => null, save } });
    hub.adopt('map:16', buildMapJson() as unknown as JsonValue);
    keepUsesWithMaps(hub, () => undefined);
    hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));

    // Act.
    await hub.save('map:16');
    await writesLand();

    // Assert.
    expect(save.mock.calls.map(([ key ]) => key))
      .toStrictEqual([ 'map:16' ]);
  });
});
