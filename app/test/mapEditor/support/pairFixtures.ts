import { MapEditorApiError, type MapChangesWrite } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub, type DocumentStore } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { freshSavePages, landingGroundOf } from '../../../src/mapEditor/core/locations/landingCheck.ts';
import { mapDocumentKey, parseDocumentKey, type DocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../src/mapEditor/core/model/EditorDocument.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent, RmmzTileset } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PlacementSources } from '../../../src/mapEditor/core/transferPairs/pairPlacement.ts';
import type { PairLooks, PairMap } from '../../../src/mapEditor/core/transferPairs/pairPlans.ts';
import { PairWriter } from '../../../src/mapEditor/core/transferPairs/PairWriter.ts';
import { buildMapJson } from './fixtures.ts';

/**
 * The tiles the pair fixtures paint with: ground lets every way through, a wall none.
 */
const PairTile = {
  ground: 1,
  wall: 2,
} as const;

/**
 * The outside map a door pair leaves from, 12 by 10, and the inside map it leads to, 10 by 8.
 */
const OUTSIDE = 20;
const INSIDE = 28;

/**
 * The maps' names, as the map tree holds them.
 */
const PAIR_NAMES: Readonly<Record<number, string>> = { [OUTSIDE]: 'Northeast Section', [INSIDE]: 'Entrance' };

/**
 * How the fixtures' transfers look and sound: the inn's door, its creak, and Move1.
 */
const PAIR_LOOKS: PairLooks = { door: { characterName: '!doors', characterIndex: 0, direction: 2, pattern: 1 }, sounds: { door: 'Open1', movement: 'Move1' } };

/**
 * A tileset over the fixture tiles.
 * @returns {RmmzTileset} The tileset.
 */
const pairTileset = (): RmmzTileset =>
{
  const flags = new Array(16).fill(0);
  flags[0] = 0x10;
  flags[PairTile.ground] = 0;
  flags[PairTile.wall] = 0x0f;
  return { id: 1, flags, mode: 1, name: 'Fixture', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
};

/**
 * Builds a map file: ground everywhere but the walls given, and the events given, by id, with an empty slot at 0.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {readonly string[]} walls The tiles walled, as {@code "x,y"}.
 * @param {readonly RmmzMapEvent[]} events The events.
 * @returns {RmmzMap} The file.
 */
const pairMapFile = (width: number, height: number, walls: readonly string[] = [], events: readonly RmmzMapEvent[] = []): RmmzMap =>
{
  const data = new Array(width * height * 6).fill(0);
  for (let y = 0; y < height; y++)
  {
    for (let x = 0; x < width; x++)
    {
      data[y * width + x] = walls.includes(`${x},${y}`) ? PairTile.wall : PairTile.ground;
    }
  }

  const slots: (RmmzMapEvent | null)[] = [ null ];
  events.forEach(event =>
  {
    slots[event.id] = event;
  });
  return { ...buildMapJson(), width, height, data, tilesetId: 1, events: slots };
};

/**
 * Names the fixture maps as the map tree does.
 * @param {number} mapId The map.
 * @returns {string} Its name.
 */
const pairMapName = (mapId: number): string =>
{
  return PAIR_NAMES[mapId] ?? `Map ${mapId}`;
};

/**
 * One of the fixture maps as a plan reads it: its id, its name and its size on disk.
 * @param {Map<number, RmmzMap>} disk The disk.
 * @param {number} mapId The map.
 * @returns {PairMap} The map.
 */
const pairMapOf = (disk: ReadonlyMap<number, RmmzMap>, mapId: number): PairMap =>
{
  const file = disk.get(mapId) as RmmzMap;
  return { mapId, name: pairMapName(mapId), size: { width: file.width, height: file.height } };
};

/**
 * Applies one act to a disk the way the server does: every map's patches checked against its file as it stands, each
 * splice reaching the end of its list, and nothing written unless every one fits.
 * @param {Map<number, RmmzMap>} disk The disk.
 * @param {MapChangesWrite} act The act.
 */
const applyAct = (disk: Map<number, RmmzMap>, act: MapChangesWrite): void =>
{
  const staged = act.maps.map(({ map, patches }) =>
  {
    const held = disk.get(map);
    if (held === undefined)
    {
      throw new MapEditorApiError('PUT /api/map-changes answered 404', 404, `data/Map${String(map).padStart(3, '0')}.json does not exist`);
    }

    const file = MapDocument.fromJson(mapDocumentKey(map), structuredClone(held));
    patches.forEach(patch =>
    {
      const list = patch.kind === 'splice' ? file.valueAt(patch.path) : null;
      if (patch.kind === 'splice' && (Array.isArray(list) === false || patch.index + patch.removed.length !== list.length))
      {
        throw new MapEditorApiError('PUT /api/map-changes answered 409', 409, `Map ${String(map).padStart(3, '0')} no longer holds what the change replaced: its events changed`);
      }

      try
      {
        file.apply(patch);
      }
      catch (error)
      {
        throw new MapEditorApiError('PUT /api/map-changes answered 409', 409, `Map ${String(map).padStart(3, '0')} no longer holds what the change replaced: ${(error as Error).message}`);
      }
    });
    return [ map, file.toJson() ] as const;
  });
  staged.forEach(([ map, file ]) => disk.set(map, file));
};

/**
 * One window placing transfers over a disk of map files, with a stand-in for the server applying each act as the real one
 * does, and another window that may hold some maps.
 */
type PairWindow = {
  readonly hub: DocumentHub;
  readonly disk: Map<number, RmmzMap>;
  readonly writer: PairWriter;
  readonly acts: MapChangesWrite[];
  readonly problems: { readonly message: string; readonly alarm: boolean }[];
  readonly sources: PlacementSources;

  /**
   * The documents brought in from the other window, in order.
   */
  readonly brought: DocumentKey[];

  /**
   * Fails the next act with an error, as a refused write does.
   */
  readonly failNextWrite: (error: Error) => void;

  /**
   * Holds the next act on its way until the function handed back is called, as a slow disk would.
   */
  readonly holdNextWrite: () => () => void;
};

/**
 * What a pair window is built with.
 */
type PairWindowSetUp = {
  /**
   * The maps on disk, by id; the outside and inside maps unless said.
   */
  readonly disk?: ReadonlyMap<number, RmmzMap>;

  /**
   * The maps this window holds; the outside map unless said.
   */
  readonly held?: readonly number[];

  /**
   * The maps another window holds, which come here as the file stands when brought.
   */
  readonly heldElsewhere?: readonly number[];
};

/**
 * The disk the fixtures start from: the outside map, 12 by 10, and the inside map, 10 by 8, each walled along its top row
 * and open ground everywhere else.
 * @returns {Map<number, RmmzMap>} The disk.
 */
const pairDisk = (): Map<number, RmmzMap> =>
{
  const outsideWalls = Array.from({ length: 12 }, (_, x) => `${x},0`);
  const insideWalls = Array.from({ length: 10 }, (_, x) => `${x},0`);
  return new Map([ [ OUTSIDE, pairMapFile(12, 10, outsideWalls) ], [ INSIDE, pairMapFile(10, 8, insideWalls) ] ]);
};

/**
 * Builds a window placing transfers: a hub over the disk holding the maps asked for, a pair writer whose acts go to the
 * disk as soon as the task making them is over, and the sources a placement reads, judging landings by the fixture
 * tileset and every event's first page.
 * @param {PairWindowSetUp} setUp The disk and which maps the windows hold.
 * @returns {PairWindow} The window.
 */
const pairWindow = (setUp: PairWindowSetUp = {}): PairWindow =>
{
  const disk = new Map(setUp.disk ?? pairDisk());
  const { held = [ OUTSIDE ], heldElsewhere = [] } = setUp;
  const store: DocumentStore = {
    load: async key =>
    {
      const parsed = parseDocumentKey(key);
      const file = parsed.kind === 'map' ? disk.get(parsed.mapId) : undefined;
      if (file === undefined)
      {
        throw new MapEditorApiError(`GET ${key} answered 404`, 404);
      }

      return structuredClone(file) as unknown as JsonValue;
    },
    save: async (key, content) =>
    {
      const parsed = parseDocumentKey(key);
      if (parsed.kind === 'map')
      {
        disk.set(parsed.mapId, structuredClone(content) as unknown as RmmzMap);
      }
    },
  };
  const hub = new DocumentHub({ clientId: 'window-a', store });
  held.forEach(mapId => hub.adopt(mapDocumentKey(mapId), structuredClone(disk.get(mapId)) as unknown as JsonValue));

  const acts: MapChangesWrite[] = [];
  const problems: { message: string; alarm: boolean }[] = [];
  const brought: DocumentKey[] = [];
  let failure: Error | null = null;
  let holding: Promise<void> | null = null;
  const write = async (act: MapChangesWrite): Promise<void> =>
  {
    acts.push(structuredClone(act) as MapChangesWrite);

    // a held act waits for its release before reaching the disk, as one on a slow disk does, and may fail once there.
    if (holding !== null)
    {
      const waiting = holding;
      holding = null;
      await waiting;
    }

    if (failure !== null)
    {
      const error = failure;
      failure = null;
      throw error;
    }

    applyAct(disk, act);
  };
  const writer = new PairWriter({ hub, write, onProblem: (message, alarm) => problems.push({ message, alarm }) });

  const tileset = pairTileset();
  const sources: PlacementSources = {
    hub,
    holders: key => (heldElsewhere.some(mapId => mapDocumentKey(mapId) === key) && hub.has(key) === false ? [ 'window-b' ] : []),
    bring: async (key: DocumentKey): Promise<EditorDocument> =>
    {
      brought.push(key);
      const parsed = parseDocumentKey(key);
      return hub.adopt(key, structuredClone(disk.get(parsed.kind === 'map' ? parsed.mapId : 0)) as unknown as JsonValue);
    },
    readMap: async mapId =>
    {
      const file = disk.get(mapId);
      if (file === undefined)
      {
        throw new MapEditorApiError(`GET /api/maps/${mapId} answered 404`, 404);
      }

      return structuredClone(file);
    },
    look: async mapId =>
    {
      const key = mapDocumentKey(mapId);
      return hub.has(key) ? hub.map(key) : MapDocument.fromJson(key, structuredClone(disk.get(mapId) as RmmzMap));
    },
    groundOf: map => (map.tilesetId === tileset.id ? landingGroundOf(map, tileset, [], freshSavePages(null, 0, null)) : null),
    mapName: pairMapName,
  };

  return {
    hub,
    disk,
    writer,
    acts,
    problems,
    sources,
    brought,
    failNextWrite: (error: Error) =>
    {
      failure = error;
    },
    holdNextWrite: () =>
    {
      let release = () => undefined as void;
      holding = new Promise<void>(resolve =>
      {
        release = resolve;
      });
      return () => release();
    },
  };
};

/**
 * Waits for every act and read on its way to land, as many rounds as one leads to the next.
 * @returns {Promise<void>} Settles then.
 */
const settlePairs = async (): Promise<void> =>
{
  for (let round = 0; round < 8; round++)
  {
    await new Promise(resolve =>
    {
      setTimeout(resolve, 0);
    });
  }
};

export { INSIDE, OUTSIDE, PAIR_LOOKS, pairDisk, pairMapFile, pairMapName, pairMapOf, pairTileset, PairTile, pairWindow, settlePairs };
export type { PairWindow, PairWindowSetUp };
