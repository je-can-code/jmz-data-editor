import { describe, expect, it } from 'vitest';
import { apiDocumentStore } from '../../../../src/mapEditor/core/api/apiDocumentStore.ts';
import { MapEditorApiError, type MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { saveBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import {
  BLUEPRINT_USES_DOCUMENT,
  readUses,
  usesOf,
  type PlacedSpot,
} from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { BlueprintUsesKeeper } from '../../../../src/mapEditor/core/blueprints/blueprintUsesKeeper.ts';
import { checkPlacement } from '../../../../src/mapEditor/core/blueprints/placementMatch.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapInfo } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { resizeMap } from '../../../../src/mapEditor/core/properties/mapPropertyEdits.ts';
import { RESIZE_ANCHORS, type ResizeAnchor } from '../../../../src/mapEditor/core/properties/resizeMap.ts';
import type { CellRect } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { captureAreaStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { planStamp } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { MapTreeService } from '../../../../src/mapEditor/core/tree/MapTreeService.ts';
import { locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { drawsFor } from '../../support/blueprintFixtures.ts';
import { UsesServer } from '../../support/usesServer.ts';

/*
 * The record of where blueprints are placed, held against the maps the game ships: every file read once from the game
 * into a mirror held in memory, which is all anything here ever writes to.
 *
 * A blueprint saved off the piece of Map016 thickest with objects, its tiles and its events, placed on three other maps
 * drawn with the same tileset, records exactly three placements, one per map, and undo and redo take each out and put it
 * back. A resize, kept
 * at each of the nine anchors, moves the placement on the map with the tiles under it, where the match check still finds
 * it. Deleting a map through the tree drops its placements, and undoing the delete brings them back; duplicating one
 * gives the copy its own. The record, written to disk a map at a time with the maps and never before, reads back the same
 * in a window opening it afresh. And a placement whose map is shifted a column on disk fails the match check, where it
 * passed before.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * The map the blueprint is saved off, and the three it is placed on, all drawn with the Outside tileset.
 */
const SOURCE = 16;
const TARGETS = [ 17, 18, 21 ] as const;

/**
 * The blueprint's id.
 */
const CAMP = 'k3x9q2mf';

/**
 * How far a placement moves when its map is grown by 4 by 2, kept at each anchor.
 */
const SHIFTS: Readonly<Record<ResizeAnchor, readonly [ number, number ]>> = {
  'top-left': [ 0, 0 ],
  'top': [ 2, 0 ],
  'top-right': [ 4, 0 ],
  'left': [ 0, 1 ],
  'center': [ 2, 1 ],
  'right': [ 4, 1 ],
  'bottom-left': [ 0, 2 ],
  'bottom': [ 2, 2 ],
  'bottom-right': [ 4, 2 ],
};

/**
 * A copy of the game's files held in memory: the map tree, every map named, the editor-only documents, which start out as
 * none, and the record of where blueprints are placed, which starts out as none and is only ever merged into.
 */
type Mirror = {
  readonly maps: Map<number, RmmzMap>;
  readonly editorData: Map<string, JsonValue>;
  readonly uses: UsesServer;
  infos: (RmmzMapInfo | null)[];
};

/**
 * Reads one of the game's maps.
 * @param {number} mapId The map.
 * @returns {RmmzMap} Its file.
 */
const readMap = (mapId: number): RmmzMap =>
{
  return readDataFile(project as string, `Map${String(mapId).padStart(3, '0')}.json`) as RmmzMap;
};

/**
 * Builds a mirror of the map tree and of the source and the targets.
 * @returns {Mirror} The mirror.
 */
const mirrorOfGame = (): Mirror =>
{
  return {
    maps: new Map([ SOURCE, ...TARGETS ].map(mapId => [ mapId, readMap(mapId) ])),
    editorData: new Map(),
    uses: new UsesServer(),
    infos: readDataFile(project as string, 'MapInfos.json') as (RmmzMapInfo | null)[],
  };
};

/**
 * Stands the server up over a mirror: maps, the map tree and editor-only documents read from it and written to it, the
 * record of where blueprints are placed merged into a map at a time, and nothing else.
 * @param {Mirror} mirror The mirror.
 * @returns {MapEditorApi} The server.
 */
const serverOver = (mirror: Mirror): MapEditorApi =>
{
  return {
    clientId: 'window-a',
    loadMap: async (mapId: number) =>
    {
      const map = mirror.maps.get(mapId);
      if (map === undefined)
      {
        throw new MapEditorApiError(`GET /api/maps/${mapId} answered 404`, 404);
      }

      return structuredClone(map);
    },
    loadMapFile: async (mapId: number) => (mirror.maps.has(mapId) ? JSON.stringify(mirror.maps.get(mapId)) : null),
    saveMap: async (mapId: number, map: RmmzMap) =>
    {
      mirror.maps.set(mapId, structuredClone(map));
    },
    createMap: async (mapId: number, map: RmmzMap) =>
    {
      mirror.maps.set(mapId, structuredClone(map));
    },
    restoreMapFile: async (mapId: number, text: string) =>
    {
      mirror.maps.set(mapId, JSON.parse(text) as RmmzMap);
    },
    deleteMap: async (mapId: number) =>
    {
      mirror.maps.delete(mapId);
    },
    loadMapInfos: async () => structuredClone(mirror.infos),
    saveMapInfos: async (infos: readonly (RmmzMapInfo | null)[]) =>
    {
      mirror.infos = structuredClone([ ...infos ]);
    },
    loadEditorData: async (name: string) => (name === 'blueprint-uses'
      ? mirror.uses.api.loadEditorData(name)
      : structuredClone(mirror.editorData.get(name) ?? null)),
    saveEditorData: async (name: string, document: JsonValue) =>
    {
      mirror.editorData.set(name, structuredClone(document));
    },
    mergeBlueprintUses: mirror.uses.api.mergeBlueprintUses,
  } as unknown as MapEditorApi;
};

/**
 * Opens a window over a mirror holding the source, the targets, the blueprints and the record, as the workspace does,
 * the record kept with the maps from the start.
 * @param {Mirror} mirror The mirror.
 * @returns {Promise<{ hub: DocumentHub, keeper: BlueprintUsesKeeper, problems: string[] }>} The window's documents, the
 * record's keeper, and anything writing the record had to say.
 */
const windowOver = async (mirror: Mirror): Promise<{ hub: DocumentHub; keeper: BlueprintUsesKeeper; problems: string[] }> =>
{
  const api = serverOver(mirror);
  const hub = new DocumentHub({ clientId: 'window-a', store: apiDocumentStore(api) });
  const problems: string[] = [];
  const keeper = new BlueprintUsesKeeper({ hub, api, holders: () => [], onProblem: message => problems.push(message) });
  await Promise.all([ SOURCE, ...TARGETS ].map(mapId => hub.load(mapDocumentKey(mapId))));
  await hub.load(BLUEPRINTS_DOCUMENT);
  await hub.load(BLUEPRINT_USES_DOCUMENT);
  return { hub, keeper, problems };
};

/**
 * Reads a map afresh from a mirror, as a window opening it would.
 * @param {Mirror} mirror The mirror.
 * @param {number} mapId The map.
 * @returns {Promise<MapDocument>} The map.
 */
const freshMap = async (mirror: Mirror, mapId: number): Promise<MapDocument> =>
{
  const hub = new DocumentHub({ clientId: 'window-c', store: apiDocumentStore(serverOver(mirror)) });
  await hub.load(mapDocumentKey(mapId));
  return hub.map(mapDocumentKey(mapId));
};

/**
 * Moves every layer of a map's tiles a column right, the first column left empty, as MZ's shift does.
 * @param {RmmzMap} file The map.
 * @returns {number[]} The tiles.
 */
const shiftedRight = (file: RmmzMap): number[] =>
{
  const { width, data } = file;
  return data.map((_, index) => (index % width === 0 ? 0 : data[index - 1]));
};

/**
 * Finds the piece of a map, six by five, holding the most objects (tiles on its upper two layers), the first of any
 * tied: the kind of piece a blueprint is made of, a camp or a house, rather than a field of one ground, which nothing
 * could tell from itself a column over.
 * @param {MapDocument} map The map.
 * @returns {CellRect} The piece.
 */
const pieceOf = (map: MapDocument): CellRect =>
{
  let best = { rect: { x: 0, y: 0, width: 6, height: 5 }, objects: -1 };
  for (let y = 0; y + 5 <= map.height; y++)
  {
    for (let x = 0; x + 6 <= map.width; x++)
    {
      let objects = 0;
      for (let dy = 0; dy < 5; dy++)
      {
        for (let dx = 0; dx < 6; dx++)
        {
          objects += [ 2, 3 ].filter(z => map.cellAt(x + dx, y + dy, z) !== 0).length;
        }
      }

      if (objects > best.objects)
      {
        best = { rect: { x, y, width: 6, height: 5 }, objects };
      }
    }
  }

  return best.rect;
};

/**
 * Saves the camp: the piece of the source thickest with objects, tiles and events, as a blueprint.
 * @param {DocumentHub} hub The window's documents.
 * @returns {Stamp} The blueprint's stamp.
 */
const saveCamp = (hub: DocumentHub): Stamp =>
{
  const source = hub.map(mapDocumentKey(SOURCE));
  const stamp = captureAreaStamp(source, pieceOf(source), 'auto', TilesetMode.area, 'window-a:1') as Stamp;
  saveBlueprint(hub, stamp, 'Camp', drawsFor([ CAMP ]));
  return (blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), CAMP) as { stamp: Stamp }).stamp;
};

/**
 * Finds a cell on a map where the camp goes down whole, its tiles inside the map and every event landing clear.
 * @param {MapDocument} map The map.
 * @param {Stamp} stamp The camp's stamp.
 * @returns {{ x: number, y: number }} The cell for its corner.
 */
const roomFor = (map: MapDocument, stamp: Stamp): { x: number; y: number } =>
{
  for (let y = 1; y + stamp.height < map.height; y++)
  {
    for (let x = 1; x + stamp.width < map.width; x++)
    {
      const plan = planStamp(map, stamp, { at: { x, y }, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null }, null);
      if (plan.ok && plan.eventsLeftOut === 0)
      {
        return { x, y };
      }
    }
  }

  throw new Error(`no room for the camp on map ${map.mapId}`);
};

/**
 * Places the camp on each target, where it has room.
 * @param {DocumentHub} hub The window's documents.
 * @param {Stamp} stamp The camp's stamp.
 * @returns {PlacedSpot[]} Where each went, by map.
 */
const placeOnTargets = (hub: DocumentHub, stamp: Stamp): PlacedSpot[] =>
{
  return TARGETS.map(mapId =>
  {
    const at = roomFor(hub.map(mapDocumentKey(mapId)), stamp);
    const outcome = placeBlueprint(hub, mapId, CAMP, { at, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null });
    if (outcome.ok === false)
    {
      throw new Error(outcome.message);
    }

    return { blueprintId: CAMP, ...at, mapId };
  });
};

/**
 * Reads every placement the window's record holds.
 * @param {DocumentHub} hub The window's documents.
 * @returns {PlacedSpot[]} The placements.
 */
const recorded = (hub: DocumentHub): PlacedSpot[] => usesOf(hub.document(BLUEPRINT_USES_DOCUMENT));

/**
 * Reads every placement the record a mirror's disk holds.
 * @param {Mirror} mirror The mirror.
 * @returns {PlacedSpot[]} The placements.
 */
const onDisk = (mirror: Mirror): PlacedSpot[] => readUses((mirror.uses.stored as { data: JsonValue }).data);

describe.skipIf(project === null)('blueprint placements on the shipped maps', () =>
{
  it('records exactly one placement per map the camp is placed on, which undo takes out and redo puts back', async () =>
  {
    // Arrange.
    const { hub } = await windowOver(mirrorOfGame());
    const stamp = saveCamp(hub);

    // Act: placed on all three, then the second's undone and redone.
    const placed = placeOnTargets(hub, stamp);
    const afterPlacing = recorded(hub);
    hub.undo(mapHistoryKey(TARGETS[1]));
    const afterUndo = recorded(hub);
    hub.redo(mapHistoryKey(TARGETS[1]));

    // Assert: a blueprint of tiles and events, so the placements are its tiles'.
    expect([ stamp.tiles !== null && stamp.events.length > 0, afterPlacing, afterUndo, recorded(hub) ])
      .toStrictEqual([ true, placed, [ placed[0], placed[2] ], placed ]);
  });

  it.each(RESIZE_ANCHORS.map(anchor => [ anchor ]))('moves the placement with the tiles under it when its map is grown kept %s, where the match check finds it', async anchor =>
  {
    // Arrange: the camp on the first target, which is then grown by 4 by 2.
    const { hub } = await windowOver(mirrorOfGame());
    const stamp = saveCamp(hub);
    const [ placed ] = placeOnTargets(hub, stamp);
    const key = mapDocumentKey(TARGETS[0]);
    const { width, height } = hub.map(key);

    // Act.
    resizeMap(hub, TARGETS[0], width + 4, height + 2, anchor);
    const [ moved ] = recorded(hub).filter(spot => spot.mapId === TARGETS[0]);
    const { kind } = checkPlacement(hub.map(key), moved, stamp);
    hub.undo(mapHistoryKey(TARGETS[0]));

    // Assert.
    expect([ [ moved.x - placed.x, moved.y - placed.y ], kind, recorded(hub).filter(spot => spot.mapId === TARGETS[0]) ])
      .toStrictEqual([ SHIFTS[anchor], 'in-place', [ placed ] ]);
  });

  it('drops a deleted map\'s placements and gives a duplicate its own through the tree, undo bringing the deleted back', async () =>
  {
    // Arrange: the camp on all three targets, the maps saved.
    const mirror = mirrorOfGame();
    const { hub, keeper, problems } = await windowOver(mirror);
    const placed = placeOnTargets(hub, saveCamp(hub));
    await Promise.all(TARGETS.map(mapId => hub.save(mapDocumentKey(mapId))));
    const tree = new MapTreeService({ hub, api: serverOver(mirror), openDocument: key => hub.load(key), placements: keeper });

    // Act: the second target deleted, then undone; then the third duplicated.
    const removed = await tree.remove([ TARGETS[1] ]);
    await keeper.whenWritten();
    const afterDelete = [ recorded(hub), onDisk(mirror) ];
    await tree.undo();
    await keeper.whenWritten();
    const afterUndo = [ recorded(hub), onDisk(mirror) ];
    const duplicated = await tree.duplicate([ TARGETS[2] ]);
    const copyId = duplicated.ok ? duplicated.selection[0] : 0;
    await keeper.whenWritten();

    // Assert: the duplicate's placement is the third's, on the copy; and the record on the mirror's disk followed the tree.
    expect([ removed.ok, afterDelete, afterUndo, recorded(hub).filter(spot => spot.mapId === copyId), onDisk(mirror), problems ])
      .toStrictEqual([
        true,
        [ [ placed[0], placed[2] ], [ placed[0], placed[2] ] ],
        [ placed, placed ],
        [ { ...placed[2], mapId: copyId } ],
        recorded(hub),
        [],
      ]);
  });

  it('reads the same record back from disk in a window opening it afresh, written with the maps and never before', async () =>
  {
    // Arrange.
    const mirror = mirrorOfGame();
    const { hub, keeper, problems } = await windowOver(mirror);
    placeOnTargets(hub, saveCamp(hub));
    const beforeSaving = mirror.uses.stored;

    // Act: the maps saved, which writes each one's placements with it; then a fresh window opens the record.
    await Promise.all(TARGETS.map(mapId => hub.save(mapDocumentKey(mapId))));
    await keeper.whenWritten();
    const fresh = new DocumentHub({ clientId: 'window-b', store: apiDocumentStore(serverOver(mirror)) });
    await fresh.load(BLUEPRINT_USES_DOCUMENT);

    // Assert: each map named once across the merges, and no other.
    const named = mirror.uses.merges.flatMap(merge => Object.keys(merge.maps ?? {})).map(Number).sort((left, right) => left - right);
    expect([ beforeSaving, recorded(fresh), recorded(fresh).length, named, problems ])
      .toStrictEqual([ null, recorded(hub), 3, [ ...TARGETS ], [] ]);
  });

  it('fails the match check once the placement\'s map is shifted a column on disk, as MZ shifts it, having passed before', async () =>
  {
    // Arrange: the camp placed and saved on the first target.
    const mirror = mirrorOfGame();
    const { hub } = await windowOver(mirror);
    const stamp = saveCamp(hub);
    const [ placed ] = placeOnTargets(hub, stamp);
    await hub.save(mapDocumentKey(TARGETS[0]));
    const file = mirror.maps.get(TARGETS[0]) as RmmzMap;

    // Act: checked as a window opening the map reads it, then again once every layer moved a column right on disk.
    const before = checkPlacement(await freshMap(mirror, TARGETS[0]), placed, stamp).kind;
    mirror.maps.set(TARGETS[0], { ...file, data: shiftedRight(file) });
    const after = checkPlacement(await freshMap(mirror, TARGETS[0]), placed, stamp);

    // Assert.
    expect([ before, after.kind, after.kind === 'shifted' && after.by ])
      .toStrictEqual([ 'in-place', 'shifted', { x: 1, y: 0 } ]);
  });
});
