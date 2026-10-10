import { describe, expect, it, vi } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { freshSavePages } from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import { TransferLandings, type LandingSources } from '../../../../src/mapEditor/core/locations/TransferLandings.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent, RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PassabilityRule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { lookAtDocument } from '../../../../src/mapEditor/core/sync/lookAtDocument.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The landings are what every map view marks and every transfer's quick panel reads, so they owe the window answers that
 * follow the project as it stands. A map this window holds is judged as it stands, at once, and judged again as it
 * changes, with whoever listens told; any other is looked at once, never held, and judged once the look lands, whoever
 * listens told then. A map whose file the project lacks is a landing on a map that does not exist; one that cannot be
 * read for any other reason says nothing until a refresh asks again, as does a map on a tileset the project lacks. A
 * refresh judges every landing afresh by the rules and the pages as they now stand, keeping the maps read.
 *
 * The transfers listed on a map are the transfer kind's own reading of each event the window calls a transfer, every
 * one whose landing fails, in event and page order.
 */

/**
 * A tileset letting every tile through but tile 20, which blocks every way: the top layer's tile at 1, 0 on the
 * fixture's 3 by 2 map.
 * @returns {RmmzTileset} The tileset.
 */
const buildTileset = (): RmmzTileset =>
{
  const flags = new Array(40).fill(0);
  flags[20] = 0x0f;
  return { id: 4, flags, mode: 1, name: 'Walls', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
};

/**
 * Builds an event whose pages each transfer the player to a place, as the transfer kind reads them.
 * @param {number} id The event id.
 * @param {readonly (readonly [ number, number, number ])[]} places Each page's map, x and y.
 * @returns {RmmzMapEvent} The event.
 */
const transfer = (id: number, places: readonly (readonly [ number, number, number ])[]): RmmzMapEvent =>
{
  const pages = places.map(([ mapId, x, y ]) => ({
    ...createEventPage(),
    list: [ { code: 201, indent: 0, parameters: [ 0, mapId, x, y, 2, 0 ] }, { code: 0, indent: 0, parameters: [] } ],
  }));
  return { ...createMapEvent(id, 2, 1), name: `Door ${id}`, pages };
};

/**
 * Builds the fixture's 3 by 2 map holding events.
 * @param {RmmzMapEvent[]} events The events, by id.
 * @returns {JsonValue} The map file.
 */
const mapFile = (events: RmmzMapEvent[] = []): JsonValue =>
{
  const slots: (RmmzMapEvent | null)[] = [ null ];
  events.forEach(event =>
  {
    slots[event.id] = event;
  });
  return { ...buildMapJson(), events: slots } as RmmzMap as unknown as JsonValue;
};

/**
 * Builds a window's landings over files: map 5, the 3 by 2 fixture on tileset 4; map 9, on a tileset the project lacks;
 * map 7, which cannot be read for now; and no map 327 at all, the server answering 404. Reads can wait on a gate.
 * @param {object} options What to hold, the rules, which events count as transfers, and a gate for map 5's file.
 * @returns {object} The landings, the hub, how many looks were made at each file, and the rules as they stand.
 */
const buildLandings = (options: {
  readonly held?: ReadonlyMap<DocumentKey, JsonValue>;
  readonly claims?: LandingSources['claims'];
  readonly gate?: Promise<void>;
} = {}) =>
{
  const files = new Map<DocumentKey, JsonValue>([
    [ 'map:5', mapFile() ],
    [ 'map:9', { ...(mapFile() as object), tilesetId: 8 } as JsonValue ],
    [ 'tilesets', [ null, null, null, null, buildTileset() ] as unknown as JsonValue ],
  ]);
  const looks: DocumentKey[] = [];
  const hub = new DocumentHub({
    clientId: 'window-a',
    store: {
      load: async (key: DocumentKey) =>
      {
        looks.push(key);
        if (key === 'map:5')
        {
          await options.gate;
        }

        if (key === 'map:327')
        {
          throw new MapEditorApiError('GET /api/maps/327 answered 404', 404, 'data/Map327.json does not exist');
        }

        if (files.has(key) === false)
        {
          throw new MapEditorApiError(`GET ${key} answered 500`, 500);
        }

        return files.get(key) as JsonValue;
      },
      save: async () => undefined,
    },
  });
  (options.held ?? new Map()).forEach((content, key) => hub.adopt(key, content));
  const sync = { whenHeldOrDiscovered: async () => undefined, holders: () => [], requestSnapshot: async () => null };
  const state = { rules: [] as PassabilityRule[] };
  const landings = new TransferLandings({
    hub,
    look: key => lookAtDocument({ hub, sync }, key),
    rules: () => state.rules,
    pages: () => freshSavePages(null, 0, null),
    claims: options.claims ?? (() => true),
  });
  return { landings, hub, looks, state };
};

/**
 * Lets every read in flight land.
 * @returns {Promise<void>} Settles on the next macrotask.
 */
const landed = () => new Promise<void>(resolve =>
{
  setTimeout(resolve, 0);
});

describe('TransferLandings', () =>
{
  describe('problemOf', () =>
  {
    it('says nothing while a map is read, then judges it once the read lands, telling whoever listens', async () =>
    {
      // Arrange: map 5's file waits.
      let open = () => undefined as void;
      const gate = new Promise<void>(resolve =>
      {
        open = resolve;
      });
      const { landings } = buildLandings({ gate });
      const heard = vi.fn();
      landings.subscribe(heard);

      // Act: asked while it reads, then after.
      const early = landings.problemOf({ mapId: 5, x: 1, y: 0 });
      open();
      await landed();
      const late = [ landings.problemOf({ mapId: 5, x: 1, y: 0 }), landings.problemOf({ mapId: 5, x: 2, y: 1 }) ];

      // Assert: heard as the tilesets landed, and again as map 5 did.
      expect([ early, late, heard.mock.calls.length, landings.revision ])
        .toStrictEqual([ undefined, [ { kind: 'blocked' }, null ], 2, 2 ]);
    });

    it('judges a map this window holds as it stands, at once, without reading it', () =>
    {
      // Arrange: map 5 and the tilesets held here.
      const held = new Map<DocumentKey, JsonValue>([
        [ 'map:5', mapFile() ],
        [ 'tilesets', [ null, null, null, null, buildTileset() ] as unknown as JsonValue ],
      ]);
      const { landings, looks } = buildLandings({ held });

      // Act.
      const problem = landings.problemOf({ mapId: 5, x: 1, y: 0 });

      // Assert.
      expect([ problem, looks ])
        .toStrictEqual([ { kind: 'blocked' }, [] ]);
    });

    it('judges a held map again once it changes, telling whoever listens', () =>
    {
      // Arrange: map 5 held here, judged once with 2, 1 open.
      const held = new Map<DocumentKey, JsonValue>([
        [ 'map:5', mapFile() ],
        [ 'tilesets', [ null, null, null, null, buildTileset() ] as unknown as JsonValue ],
      ]);
      const { landings, hub } = buildLandings({ held });
      const before = landings.problemOf({ mapId: 5, x: 2, y: 1 });
      const heard = vi.fn();
      landings.subscribe(heard);

      // Act: a guard is placed on 2, 1.
      const map = hub.map('map:5');
      const guard = { ...createMapEvent(8, 2, 1), name: 'Guard', pages: [ { ...createEventPage(), priorityType: 1 } ] };
      map.apply(map.placeEventPatch(guard));

      // Assert.
      expect([ before, landings.problemOf({ mapId: 5, x: 2, y: 1 }), heard.mock.calls.length ])
        .toStrictEqual([ null, { kind: 'occupied', eventId: 8, name: 'Guard' }, 1 ]);
    });

    it('calls a map whose file the project lacks a map that does not exist', async () =>
    {
      // Arrange.
      const { landings } = buildLandings();
      landings.problemOf({ mapId: 327, x: 4, y: 5 });
      await landed();

      // Act.
      const problem = landings.problemOf({ mapId: 327, x: 4, y: 5 });

      // Assert.
      expect(problem)
        .toStrictEqual({ kind: 'no-map', mapId: 327 });
    });

    it('says nothing of a map that cannot be read, and reads it again once refreshed', async () =>
    {
      // Arrange: map 7 cannot be read.
      const { landings, looks } = buildLandings();
      landings.problemOf({ mapId: 7, x: 0, y: 0 });
      await landed();
      const failed = landings.problemOf({ mapId: 7, x: 0, y: 0 });
      const readsBefore = looks.filter(key => key === 'map:7').length;

      // Act.
      landings.refresh();
      landings.problemOf({ mapId: 7, x: 0, y: 0 });
      await landed();

      // Assert: asked once, then once more after the refresh.
      expect([ failed, readsBefore, looks.filter(key => key === 'map:7').length ])
        .toStrictEqual([ undefined, 1, 2 ]);
    });

    it('says nothing of a map on a tileset the project lacks, judging one on a tileset it has', async () =>
    {
      // Arrange: map 9 is drawn with tileset 8, which the project lacks, and map 5 with tileset 4.
      const { landings } = buildLandings();
      landings.problemOf({ mapId: 9, x: 1, y: 0 });
      landings.problemOf({ mapId: 5, x: 1, y: 0 });
      await landed();

      // Act.
      const problems = [ landings.problemOf({ mapId: 9, x: 1, y: 0 }), landings.problemOf({ mapId: 5, x: 1, y: 0 }) ];

      // Assert.
      expect(problems)
        .toStrictEqual([ undefined, { kind: 'blocked' } ]);
    });

    it('reads a map once however often it is asked about', async () =>
    {
      // Arrange.
      const { landings, looks } = buildLandings();

      // Act.
      landings.problemOf({ mapId: 5, x: 0, y: 0 });
      landings.problemOf({ mapId: 5, x: 1, y: 0 });
      await landed();
      landings.problemOf({ mapId: 5, x: 2, y: 0 });

      // Assert.
      expect(looks.filter(key => key === 'map:5').length)
        .toBe(1);
    });
  });

  describe('refresh', () =>
  {
    it('judges every landing afresh by the rules as they now stand, keeping the maps read', async () =>
    {
      // Arrange: map 5 read, with 2, 1 open; then a rule refusing every step.
      const { landings, looks, state } = buildLandings();
      landings.problemOf({ mapId: 5, x: 2, y: 1 });
      await landed();
      const before = landings.problemOf({ mapId: 5, x: 2, y: 1 });
      state.rules = [ { id: 'test.none', title: 'Nowhere', deny: () => 'Nowhere to go.' } ];
      const stale = landings.problemOf({ mapId: 5, x: 2, y: 1 });

      // Act.
      landings.refresh();

      // Assert: the rule counts only after the refresh, and map 5 was read once.
      expect([ before, stale, landings.problemOf({ mapId: 5, x: 2, y: 1 }), looks.filter(key => key === 'map:5').length ])
        .toStrictEqual([ null, null, { kind: 'denied', reasons: [ 'Nowhere to go.' ] }, 1 ]);
    });

    it('keeps one judge until it, and hands a fresh one after', () =>
    {
      // Arrange.
      const { landings } = buildLandings();
      const first = landings.judge;

      // Act.
      const again = landings.judge;
      landings.refresh();

      // Assert.
      expect([ again === first, landings.judge === first ])
        .toStrictEqual([ true, false ]);
    });
  });

  describe('failingOn', () =>
  {
    it('lists each transfer whose landing fails, in event and page order, once the maps it lands on are read', async () =>
    {
      // Arrange: door 2 lands on 1, 0 of map 5, blocked, then on 2, 1, open; door 3 on map 327, which does not exist.
      const events = [ transfer(2, [ [ 5, 1, 0 ], [ 5, 2, 1 ] ]), transfer(3, [ [ 327, 0, 0 ] ]) ];
      const held = new Map<DocumentKey, JsonValue>([ [ 'map:1', mapFile(events) ] ]);
      const { landings, hub } = buildLandings({ held });
      const map = hub.map('map:1');
      const early = landings.failingOn(map);
      await landed();

      // Act.
      const failing = landings.failingOn(map).map(each => [ each.eventId, each.x, each.y, each.spot.pageIndex, each.problem ]);

      // Assert: nothing while the maps were read; then each door where it stands, door 2's open landing left out.
      expect([ early, failing ])
        .toStrictEqual([ [], [ [ 2, 2, 1, 0, { kind: 'blocked' } ], [ 3, 2, 1, 0, { kind: 'no-map', mapId: 327 } ] ] ]);
    });

    it('lists nothing for an event the window does not call a transfer', async () =>
    {
      // Arrange: the same doors, but the window calls none of them a transfer.
      const events = [ transfer(2, [ [ 5, 1, 0 ] ]), transfer(3, [ [ 327, 0, 0 ] ]) ];
      const held = new Map<DocumentKey, JsonValue>([ [ 'map:1', mapFile(events) ] ]);
      const claims = vi.fn((_event: RmmzMapEvent, _mapId: number) => false);
      const { landings, hub, looks } = buildLandings({ held, claims });
      const map = hub.map('map:1');

      // Act.
      const failing = landings.failingOn(map);
      await landed();

      // Assert: asked about each event on map 1, and no map was looked at for them.
      expect([ failing, landings.failingOn(map), claims.mock.calls.map(([ event, mapId ]) => [ event.id, mapId ]), looks ])
        .toStrictEqual([ [], [], [ [ 2, 1 ], [ 3, 1 ] ], [] ]);
    });
  });

  describe('transfersOf', () =>
  {
    it('reads an event\'s transfers once for as long as it stays the same, and none for an event that is no transfer', () =>
    {
      // Arrange: a door with two transfers, and an event that only talks.
      const claims = vi.fn(() => true);
      const { landings } = buildLandings({ claims });
      const door = transfer(2, [ [ 5, 1, 0 ], [ 5, 2, 1 ] ]);
      const talker = { ...createMapEvent(3, 0, 0), pages: [ { ...createEventPage(), list: [ { code: 101, indent: 0, parameters: [ '', 0, 0, 2, '' ] }, { code: 0, indent: 0, parameters: [] } ] } ] };

      // Act.
      const first = landings.transfersOf(door, 1);
      const again = landings.transfersOf(door, 1);

      // Assert.
      expect([ first.map(spot => [ spot.pageIndex, spot.model.mapId, spot.model.x, spot.model.y ]), again === first, landings.transfersOf(talker, 1), claims.mock.calls.length ])
        .toStrictEqual([ [ [ 0, 5, 1, 0 ], [ 1, 5, 2, 1 ] ], true, [], 2 ]);
    });
  });

  describe('stop', () =>
  {
    it('stops hearing the maps held here', () =>
    {
      // Arrange: map 5 held and judged, so heard.
      const held = new Map<DocumentKey, JsonValue>([
        [ 'map:5', mapFile() ],
        [ 'tilesets', [ null, null, null, null, buildTileset() ] as unknown as JsonValue ],
      ]);
      const { landings, hub } = buildLandings({ held });
      landings.problemOf({ mapId: 5, x: 0, y: 0 });
      const heard = vi.fn();
      landings.subscribe(heard);

      // Act.
      landings.stop();
      const map = hub.map('map:5');
      map.apply(map.placeEventPatch(createMapEvent(8, 0, 0)));

      // Assert.
      expect(heard)
        .not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () =>
  {
    it('stops telling a listener once it stops listening', () =>
    {
      // Arrange.
      const { landings } = buildLandings();
      const heard = vi.fn();
      const stop = landings.subscribe(heard);

      // Act.
      stop();
      landings.refresh();

      // Assert.
      expect(heard)
        .not.toHaveBeenCalled();
    });
  });
});
