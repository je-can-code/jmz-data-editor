import { describe, expect, it } from 'vitest';
import { apiDocumentStore } from '../../../../src/mapEditor/core/api/apiDocumentStore.ts';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapInfo, RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  isMarkableTile,
  marksOf,
  openTilesetMarks,
  seedTilesetMarks,
  TILESET_MARKS_DOCUMENT,
  toggleTileMark,
} from '../../../../src/mapEditor/core/palette/tilesetMarkEdits.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';

/*
 * Marking tiles to go on top, from the palette.
 *
 * A mark is remembered per tileset in the tileset-marks document, which the painter reads as it lays tiles, so a
 * toggle must change exactly one tile (or one autotile kind, all its shapes) on exactly one tileset, and leave every
 * other entry as it was. It is one step on the marks document, and a tileset left with nothing marked leaves the
 * document, as the marks service tidies it. Only A-sheet tiles can be marked; B to E always stack on layers 3 and 4.
 *
 * A project that has never saved marks starts from its own maps: every A-sheet tile mostly laid above its auto layer
 * by hand. That seed is worked out once, from every map the tree lists, saved, and from then on the saved document is
 * the only source, so a tile unmarked by hand stays unmarked.
 */
const CLIFF_CORNER = TileId.A5 + 122;
const ROCK = TileId.A5 + 123;

/**
 * Builds a map file as far as seeding reads it: its size, tileset and six layers.
 * @param {number} tilesetId The tileset.
 * @param {number} width The width.
 * @param {(readonly [ number, number, number, number ])[]} tiles Each tile to place: column, row, layer and tile id.
 * @returns {RmmzMap} The map.
 */
const mapFile = (tilesetId: number, width: number, tiles: readonly (readonly [ number, number, number, number ])[]): RmmzMap =>
{
  const data = new Array<number>(width * 6).fill(0);
  tiles.forEach(([ x, y, z, tileId ]) =>
  {
    data[(z * 1 + y) * width + x] = tileId;
  });
  return { width, height: 1, tilesetId, data } as unknown as RmmzMap;
};

/**
 * A stand-in server holding some maps, the tilesets and, maybe, saved marks.
 * @param {Record<number, RmmzMap>} maps The map files by id; a listed map missing here has no readable file.
 * @param {JsonValue | null} saved The saved marks, or null when none were ever saved.
 * @returns {{ api: MapEditorApi, calls: { mapsRead: number[], marksRead: number, saves: JsonValue[] } }} The server,
 * and what was asked of it.
 */
const standInServer = (maps: Record<number, RmmzMap>, saved: JsonValue | null) =>
{
  const infos: (RmmzMapInfo | null)[] = [ null, ...[ 1, 2, 3 ].map(id => ({ id, expanded: false, name: `Map ${id}`, order: id, parentId: 0, scrollX: 0, scrollY: 0 })) ];
  const tilesets = [ null, { id: 1, mode: 0 }, null, null, null, null, null, null, null, null, null, null, { id: 12, mode: 1 } ] as unknown as (RmmzTileset | null)[];
  const calls = { mapsRead: [] as number[], marksRead: 0, saves: [] as JsonValue[] };
  let stored = saved;
  const api = {
    clientId: 'window-a',
    loadMapInfos: async () => infos,
    loadTilesets: async () => tilesets,
    loadMap: async (mapId: number) =>
    {
      calls.mapsRead.push(mapId);
      const map = maps[mapId];
      if (map === undefined)
      {
        throw new Error(`GET /api/maps/${mapId} answered 404`);
      }

      return map;
    },
    loadEditorData: async () =>
    {
      calls.marksRead += 1;
      return stored;
    },
    saveEditorData: async (_key: string, document: JsonValue) =>
    {
      stored = document;
      calls.saves.push(document);
    },
  } as unknown as MapEditorApi;
  return { api, calls };
};

/**
 * The seed the stand-in server's maps come to: map 1 lays the cliff corner above the ground twice and on it once, and
 * the rock only on it; map 2, on tileset 7, which the tilesets no longer have, lays A2 kind 17 above the ground; map
 * 3 is listed without a file.
 */
const SEEDING_MAPS: Record<number, RmmzMap> = {
  1: mapFile(12, 4, [ [ 0, 0, 1, CLIFF_CORNER ], [ 1, 0, 2, CLIFF_CORNER ], [ 2, 0, 0, CLIFF_CORNER ], [ 3, 0, 0, ROCK ] ]),
  2: mapFile(7, 1, [ [ 0, 0, 1, makeAutotileId(17, 0) ] ]),
};

/**
 * A hub holding the marks document with tileset 13's rock marked.
 * @returns {DocumentHub} The hub.
 */
const hubWithMarks = (): DocumentHub =>
{
  const hub = new DocumentHub({ clientId: 'window-a' });
  hub.adopt(TILESET_MARKS_DOCUMENT, { schemaVersion: 1, data: { tilesets: { '13': { tiles: [ ROCK ], kinds: [] } } } });
  return hub;
};

describe('toggleTileMark', () =>
{
  it('marks one A5 tile on one tileset as one step, leaving its neighbour and other tilesets alone', () =>
  {
    // Arrange.
    const hub = hubWithMarks();

    // Act.
    const step = toggleTileMark(hub, 12, CLIFF_CORNER);

    // Assert: the rock beside it stays unmarked on 12, and 13's entry is as it was.
    expect([ step?.label, step?.histories, hub.document(TILESET_MARKS_DOCUMENT).toJson() ])
      .toStrictEqual([ 'A5 tile 123: goes on top', [ TILESET_MARKS_DOCUMENT ], {
        schemaVersion: 1,
        data: { tilesets: { '13': { tiles: [ ROCK ], kinds: [] }, '12': { tiles: [ CLIFF_CORNER ], kinds: [] } } },
      } ]);
  });

  it('marks an autotile by its kind, whatever shape it is clicked in, and not the kind beside it', () =>
  {
    // Arrange.
    const hub = hubWithMarks();

    // Act.
    toggleTileMark(hub, 12, makeAutotileId(36, 20));

    // Assert.
    expect(marksOf(hub.document(TILESET_MARKS_DOCUMENT)).tilesets['12'])
      .toStrictEqual({ tiles: [], kinds: [ 36 ] });
  });

  it('unmarks a marked tile, and a tileset left with nothing marked leaves the document', () =>
  {
    // Arrange: tileset 13 has only the rock marked.
    const hub = hubWithMarks();

    // Act.
    const step = toggleTileMark(hub, 13, ROCK);

    // Assert.
    expect([ step?.label, hub.document(TILESET_MARKS_DOCUMENT).toJson() ])
      .toStrictEqual([ 'A5 tile 124: no longer goes on top', { schemaVersion: 1, data: { tilesets: {} } } ]);
  });

  it('records nothing for a B to E tile, which always stacks on layers 3 and 4', () =>
  {
    // Arrange.
    const hub = hubWithMarks();

    // Act.
    const step = toggleTileMark(hub, 12, 5);

    // Assert.
    expect([ step, hub.history(TILESET_MARKS_DOCUMENT).rows ])
      .toStrictEqual([ null, [] ]);
  });

  it('undoes back to the document as it was', () =>
  {
    // Arrange.
    const hub = hubWithMarks();
    const before = hub.document(TILESET_MARKS_DOCUMENT).toJson();
    toggleTileMark(hub, 13, ROCK);

    // Act.
    hub.undo(TILESET_MARKS_DOCUMENT);

    // Assert.
    expect(hub.document(TILESET_MARKS_DOCUMENT).toJson())
      .toStrictEqual(before);
  });
});

describe('isMarkableTile', () =>
{
  it('takes A-sheet tiles and refuses B to E and the empty tile', () =>
  {
    // Arrange: an A5 tile, an autotile, a B tile, an E tile and the empty tile.
    const tiles = [ CLIFF_CORNER, makeAutotileId(90, 4), 5, TileId.E + 3, 0 ];

    // Act.
    const markable = tiles.map(isMarkableTile);

    // Assert.
    expect(markable)
      .toStrictEqual([ true, true, false, false, false ]);
  });
});

describe('marksOf', () =>
{
  it('reads the marks from the stored document', () =>
  {
    // Arrange.
    const hub = hubWithMarks();

    // Act.
    const marks = marksOf(hub.document(TILESET_MARKS_DOCUMENT));

    // Assert.
    expect(marks)
      .toStrictEqual({ tilesets: { '13': { tiles: [ ROCK ], kinds: [] } } });
  });

  it('refuses a document that holds no marks', () =>
  {
    // Arrange.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt(TILESET_MARKS_DOCUMENT, { schemaVersion: 1, data: { layouts: {} } });

    // Act.
    const read = () => marksOf(hub.document(TILESET_MARKS_DOCUMENT));

    // Assert.
    expect(read)
      .toThrow('not a marks document');
  });
});

describe('seedTilesetMarks', () =>
{
  it('marks what every listed map mostly lays by hand, skipping a map without a file and reading a lost tileset as Area', async () =>
  {
    // Arrange.
    const { api, calls } = standInServer(SEEDING_MAPS, null);

    // Act.
    const seed = await seedTilesetMarks(api);

    // Assert: the rock, laid only on the ground, stays out; kind 17 is ground on an Area tileset, so found above it
    // is marked.
    expect([ seed, [ ...calls.mapsRead ].sort() ])
      .toStrictEqual([ { tilesets: { '7': { tiles: [], kinds: [ 17 ] }, '12': { tiles: [ CLIFF_CORNER ], kinds: [] } } }, [ 1, 2, 3 ] ]);
  });
});

describe('openTilesetMarks', () =>
{
  /**
   * A window on the stand-in server.
   * @param {MapEditorApi} api The server.
   * @returns {{ hub: DocumentHub, opener: Parameters<typeof openTilesetMarks>[0] }} The window's hub and opener.
   */
  const windowOn = (api: MapEditorApi) =>
  {
    const hub = new DocumentHub({ clientId: 'window-a', store: apiDocumentStore(api) });
    return { hub, opener: { api, hub, openDocument: (key: Parameters<DocumentHub['load']>[0]) => hub.load(key) } };
  };

  it('seeds a project that never saved marks from its maps, saves the seed, and holds it', async () =>
  {
    // Arrange.
    const { api, calls } = standInServer(SEEDING_MAPS, null);
    const { opener } = windowOn(api);

    // Act.
    const document = await openTilesetMarks(opener);

    // Assert.
    const seeded = { tilesets: { '7': { tiles: [], kinds: [ 17 ] }, '12': { tiles: [ CLIFF_CORNER ], kinds: [] } } };
    expect([ calls.saves, marksOf(document) ])
      .toStrictEqual([ [ { schemaVersion: 1, data: seeded } ], seeded ]);
  });

  it('holds the saved marks as they are, reading no map, once a project has saved them', async () =>
  {
    // Arrange: marks saved with nothing marked, which must not be taken for "never saved".
    const { api, calls } = standInServer(SEEDING_MAPS, { schemaVersion: 1, data: { tilesets: {} } });
    const { opener } = windowOn(api);

    // Act.
    const document = await openTilesetMarks(opener);

    // Assert.
    expect([ calls.mapsRead, calls.saves, marksOf(document) ])
      .toStrictEqual([ [], [], { tilesets: {} } ]);
  });

  it('asks the server nothing when the window already holds the marks', async () =>
  {
    // Arrange.
    const { api, calls } = standInServer(SEEDING_MAPS, null);
    const { hub, opener } = windowOn(api);
    hub.adopt(TILESET_MARKS_DOCUMENT, { schemaVersion: 1, data: { tilesets: {} } });

    // Act.
    const document = await openTilesetMarks(opener);

    // Assert.
    expect([ calls.marksRead, document === hub.document(TILESET_MARKS_DOCUMENT) ])
      .toStrictEqual([ 0, true ]);
  });

  it('opens straight away in a window with no server', async () =>
  {
    // Arrange: a window with no server, handed the document some other way.
    const hub = new DocumentHub({ clientId: 'window-a' });
    const held = hub.adopt(TILESET_MARKS_DOCUMENT, { schemaVersion: 1, data: { tilesets: {} } });
    const asked: string[] = [];
    const opener = { api: null, hub: new DocumentHub({ clientId: 'window-b' }), openDocument: async (key: string) =>
    {
      asked.push(key);
      return held;
    } };

    // Act.
    const document = await openTilesetMarks(opener as unknown as Parameters<typeof openTilesetMarks>[0]);

    // Assert.
    expect([ asked, document === held ])
      .toStrictEqual([ [ TILESET_MARKS_DOCUMENT ], true ]);
  });
});
