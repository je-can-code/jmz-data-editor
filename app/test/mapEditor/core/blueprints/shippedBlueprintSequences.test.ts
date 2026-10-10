import { describe, expect, it } from 'vitest';
import { MapEditorApiError, type BlueprintWrite } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BlueprintCopyCounter } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { saveBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { blueprintLinkOf } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { holdBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { blueprintsKeptGuard } from '../../../../src/mapEditor/core/blueprints/blueprintMoves.ts';
import { placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { blueprintPropagationCheck } from '../../../../src/mapEditor/core/blueprints/blueprintPropagation.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { blueprintShapeCheck } from '../../../../src/mapEditor/core/blueprints/blueprintShape.ts';
import { usedCopiesOf } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { BlueprintWriter } from '../../../../src/mapEditor/core/blueprints/blueprintWriter.ts';
import { copiesLeftWords } from '../../../../src/mapEditor/core/blueprints/copiesLeft.ts';
import { CopyMaps } from '../../../../src/mapEditor/core/blueprints/copyMaps.ts';
import { saveTargetMap } from '../../../../src/mapEditor/core/eventWindow/eventWindowSave.ts';
import { renameEvent } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { setPageMovement } from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, eventHistoryKey, homeDocumentOf, mapHistoryKey, type HistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { createDocument } from '../../../../src/mapEditor/core/model/createDocument.ts';
import { blueprintMapId, blueprintMapKey, mapDocumentKey, parseDocumentKey, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import { jsonEquals, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { HistoryRouter } from '../../../../src/mapEditor/core/workspace/HistoryRouter.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { drawsFor, holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { notesOn } from '../../support/propagationFixtures.ts';

/*
 * A map reads as saved exactly when what it holds is what its file holds, whatever moved it there: the author's own edits,
 * a save, a blueprint's change written at once, or the undo and redo of either. That one rule is what the badge, Save,
 * Save all, the close guard and throwing a map's edits away all lean on, so a map that reads as saved while its file holds
 * something else loses work silently: nothing saves it, and nothing warns before the window closes. And because a
 * blueprint's change is planned against a map's file whenever the map holds unsaved edits, and against the map itself
 * otherwise, the same mistake leaves a copy behind on disk, out of step with its blueprint, the next time the blueprint
 * changes.
 *
 * So this plays seeded random runs of what an author does, over mirrored copies of Chef Adventure's own maps held in memory
 * (nothing writes back to the game): a blueprint made from three of its events, placed twice on each of several maps, some
 * open and one not; then renames and speed changes to the blueprint's events, renames and speed changes to copies by hand,
 * undo and redo from every history that holds a step, the event window's save, Save all, throwing a map's edits away, and
 * maps opened and closed. After every step, once every write has landed:
 *
 * - every open map, and the blueprints, read as saved exactly when they hold what their files hold;
 * - no name typed by hand is on disk unless a save of that map carried it there;
 * - every copy's name on disk is what the blueprints on disk say it should be: a copy holding the blueprint's old name
 *   follows each change to it, and one holding anything else, a name typed by hand and saved, stays;
 * - nothing the writer tried was refused, and nothing threw.
 *
 * One way a copy can end up holding its blueprint's old name is the field model's own, and is named apart rather than
 * counted as broken: an undo or a redo moves the patches its step recorded when it was made, so a copy the step never
 * changed, its name then being the author's own, stays as it is when the author's rename is undone and the step redone
 * (see isReplayLimit). It never touches whether a map reads as saved: the map and its file hold the very same name.
 *
 * A run stops at its first broken step, and each run is seeded, so a failure replays exactly; JMZ_SEQUENCES runs more of
 * them, JMZ_SEQUENCES_REPORT prints what the failing ones, and those meeting the replay limit, came to, and
 * JMZ_SEQUENCES_TRACE prints every step of the run it names. It runs against the project JMZ_PROJECT_ROOT names, or the
 * sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * The maps the runs play on, the smaller of Chef Adventure's with room to spare, those the project still has.
 */
const PREFERRED_MAPS = [ 304, 305, 300, 303 ];

/**
 * The map the blueprint's events come from: three of its battlers, by name, where it still has them.
 */
const SOURCE_MAP = 303;

/**
 * The battlers the blueprint is made of, where the source map still has them; otherwise its first three events.
 */
const SOURCE_NAMES = [ 'mountain orc', 'driller', 'shrub (negapine)' ];

/**
 * The blueprint every run changes, by the id it is given.
 */
const BLUEPRINT = 'n33dl3rs';

/**
 * How many runs play by default, and how many steps each.
 */
const DEFAULT_RUNS = 300;
const STEPS_PER_RUN = 16;

/**
 * Where every name typed by hand starts, so the disk can be searched for one.
 */
const HAND = 'hand-';

/**
 * What the runs play on, as it stands once the blueprint is placed: every map's file, the blueprints' file, and which maps
 * a window holds from the start.
 */
type Setting = {
  readonly disk: ReadonlyMap<number, RmmzMap>;
  readonly blueprints: JsonValue;
  readonly held: readonly number[];
  readonly unheld: readonly number[];
  readonly blueprintEvents: readonly number[];
};

/**
 * One window over a mirror of the maps, wired as the map editor wires its own, and what the runs know about its disk.
 */
type World = {
  readonly hub: DocumentHub;
  readonly router: HistoryRouter;
  readonly writer: BlueprintWriter;
  readonly disk: Map<number, RmmzMap>;
  readonly onDisk: { blueprints: JsonValue };

  /**
   * The names typed by hand that a save of each map carried to disk.
   */
  readonly saved: Map<number, Set<string>>;

  /**
   * Each copy's name as its map's file should hold it, by map, then copy.
   */
  readonly expected: Map<number, Map<number, string>>;

  /**
   * Every copy of the blueprint, by map: its id there.
   */
  readonly copies: ReadonlyMap<number, readonly number[]>;
  readonly blueprintEvents: readonly number[];
  readonly problems: string[];

  /**
   * The step the last action undid or redid, whole, as the window knew it just before; null after any other action.
   */
  lastMoved: HistoryStep | null;

  /**
   * Each copy the replay limit left behind, in words (see isReplayLimit).
   */
  readonly limits: string[];
  next: number;
};

/**
 * A small seeded generator (mulberry32), so a run replays exactly from its seed.
 * @param {number} seed The seed.
 * @returns {() => number} Draws in [0, 1).
 */
const randomFrom = (seed: number): (() => number) =>
{
  let state = seed >>> 0;
  return () =>
  {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Picks one of some things.
 * @param {() => number} random The generator.
 * @param {readonly T[]} things The things, at least one.
 * @returns {T} The one picked.
 */
const pick = <T>(random: () => number, things: readonly T[]): T => things[Math.floor(random() * things.length)];

/**
 * Copies a value, so nothing the window holds is ever shared with the disk.
 * @param {T} value The value.
 * @returns {T} The copy.
 */
const copied = <T>(value: T): T => structuredClone(value);

/**
 * Names a map's file in the data folder.
 * @param {number} mapId The map.
 * @returns {string} Such as Map304.json.
 */
const mapFileName = (mapId: number): string => `Map${String(mapId).padStart(3, '0')}.json`;

/**
 * Lists the copies of the blueprint on a map, by id, with the name each holds.
 * @param {RmmzMap} map The map, or its file.
 * @returns {Map<number, string>} The names, by copy.
 */
const copyNamesOf = (map: RmmzMap): Map<number, string> =>
{
  const names = new Map<number, string>();
  map.events.forEach(event =>
  {
    if (event !== null && blueprintLinkOf(event.note)?.blueprintId === BLUEPRINT)
    {
      names.set(event.id, event.name);
    }
  });

  return names;
};

/**
 * Lists the names typed by hand a map holds.
 * @param {RmmzMap} map The map, or its file.
 * @returns {string[]} The names.
 */
const handNamesOf = (map: RmmzMap): string[] =>
{
  return map.events.flatMap(event => (event !== null && event.name.startsWith(HAND) ? [ event.name ] : []));
};

/**
 * Reads the name the blueprints give each of the blueprint's events.
 * @param {JsonValue} blueprints The blueprints, as their file holds them.
 * @returns {Map<number, string>} The names, by the blueprint's own event id.
 */
const blueprintNamesOf = (blueprints: JsonValue): Map<number, string> =>
{
  const blueprint = blueprintIn(createDocument(BLUEPRINTS_DOCUMENT, blueprints), BLUEPRINT);
  return new Map((blueprint?.stamp.events ?? []).map(event => [ event.id, event.name ]));
};

/**
 * Finds where the blueprint's row of three can go down on a map: the first cell, a row and a column in from the edge,
 * from which three cells across hold no event.
 * @param {MapDocument} map The map.
 * @returns {{ x: number, y: number }} The cell.
 */
const freeRowOn = (map: MapDocument): { x: number; y: number } =>
{
  const taken = new Set(map.events.flatMap(event => (event === null ? [] : [ `${event.x},${event.y}` ])));
  for (let y = 1; y < map.height - 1; y++)
  {
    for (let x = 1; x < map.width - 3; x++)
    {
      if ([ 0, 1, 2 ].every(offset => taken.has(`${x + offset},${y}`) === false))
      {
        return { x, y };
      }
    }
  }

  throw new Error(`Map ${map.mapId} has no free row of three`);
};

/**
 * Lays out what every run plays on: the maps read from the game, a blueprint saved from three of the source map's events
 * standing in a row, and placed twice on every map, each map saved; the first two maps, and every other but the last, held
 * from the start.
 * @returns {Setting} The setting.
 */
const layOut = (): Setting =>
{
  const files = new Set(listMapFiles(project as string));
  const mapIds = PREFERRED_MAPS.filter(mapId => files.has(mapFileName(mapId)));
  const disk = new Map(mapIds.map(mapId => [ mapId, readDataFile(project as string, mapFileName(mapId)) as RmmzMap ]));
  const hub = new DocumentHub({ clientId: 'setting' });
  holdBlueprints(hub, {});
  holdBlueprintUses(hub, []);
  mapIds.forEach(mapId => hub.adopt(mapDocumentKey(mapId), copied(disk.get(mapId)) as unknown as JsonValue));

  // three of the source map's battlers, unlinked, standing in a row.
  const source = readDataFile(project as string, mapFileName(SOURCE_MAP)) as RmmzMap;
  const usable = source.events.filter((event): event is RmmzMapEvent => event !== null && event.pages.length > 0 && blueprintLinkOf(event.note) === null);
  const named = SOURCE_NAMES.flatMap(name => usable.filter(event => event.name === name).slice(0, 1));
  const chosen = named.length === SOURCE_NAMES.length ? named : usable.slice(0, 3);
  const stamp: Stamp = {
    id: 'stamp-1',
    mapId: SOURCE_MAP,
    tilesetId: source.tilesetId,
    origin: { x: 0, y: 0 },
    width: 3,
    height: 1,
    tiles: null,
    events: chosen.map((event, index) => ({ ...copied(event), id: index + 1, x: index, y: 0 })),
  };
  saveBlueprint(hub, stamp, 'Needler nest', drawsFor([ BLUEPRINT ]));

  // two placements on every map, each where its row lands on no event, then the map saved.
  mapIds.forEach(mapId =>
  {
    const key = mapDocumentKey(mapId);
    [ 0, 1 ].forEach(() => placeBlueprint(hub, mapId, BLUEPRINT, { at: freeRowOn(hub.map(key)), shaping: 'auto', mode: 0, linkRefusal: null }));
    disk.set(mapId, hub.committedContent(key) as unknown as RmmzMap);
  });

  return {
    disk,
    blueprints: hub.committedContent(BLUEPRINTS_DOCUMENT),
    held: mapIds.slice(0, -1),
    unheld: mapIds.slice(-1),
    blueprintEvents: stamp.events.map(event => event.id),
  };
};

/**
 * Takes a change of the blueprints on disk into what every copy's file should hold: a copy holding the name the blueprint
 * gave its event before follows it to the new one, and a copy holding anything else stays.
 * @param {World} world The world.
 * @param {JsonValue} next The blueprints the disk now holds.
 */
const followOnDisk = (world: World, next: JsonValue): void =>
{
  const before = blueprintNamesOf(world.onDisk.blueprints);
  const after = blueprintNamesOf(next);
  world.expected.forEach((names, mapId) =>
  {
    const file = world.disk.get(mapId) as RmmzMap;
    names.forEach((name, copyId) =>
    {
      const eventId = blueprintLinkOf((file.events[copyId] as RmmzMapEvent).note)?.eventId ?? 0;
      const was = before.get(eventId);
      const now = after.get(eventId);
      if (was !== undefined && now !== undefined && name === was)
      {
        names.set(copyId, now);
      }
    });
  });

  world.onDisk.blueprints = copied(next);
};

/**
 * Builds a window over a fresh mirror of the setting: holding the maps the setting holds, the blueprints and the record,
 * with the blueprint open in its tab, every check, the copy maps, the writer and the history router a map editor window
 * has, over a disk that takes saves and each act the way the server does: every map's patches checked against its file
 * before anything is written.
 * @param {Setting} setting What the run plays on.
 * @returns {Promise<World>} The window, once every read has landed.
 */
const openWorld = async (setting: Setting): Promise<World> =>
{
  const disk = new Map([ ...setting.disk ].map(([ mapId, file ]) => [ mapId, copied(file) ]));
  const onDisk = { blueprints: copied(setting.blueprints) };
  const saved = new Map([ ...setting.disk.keys() ].map(mapId => [ mapId, new Set<string>() ]));
  const expected = new Map([ ...disk ].map(([ mapId, file ]) => [ mapId, copyNamesOf(file) ]));
  const copies = new Map([ ...expected ].map(([ mapId, names ]) => [ mapId, [ ...names.keys() ] ]));
  const problems: string[] = [];
  const worldRef: { current: World | null } = { current: null };

  const store: DocumentStore = {
    load: async key =>
    {
      const parsed = parseDocumentKey(key);
      if (parsed.kind === 'map')
      {
        return copied(disk.get(parsed.mapId)) as unknown as JsonValue;
      }

      if (key === BLUEPRINTS_DOCUMENT)
      {
        return copied(onDisk.blueprints);
      }

      throw new Error(`nothing on disk for ${key}`);
    },
    save: async (key, content) =>
    {
      const world = worldRef.current as World;
      const parsed = parseDocumentKey(key);
      if (parsed.kind === 'map')
      {
        // a save carries the map as it stands to disk, names typed by hand included, and every copy reads as saved.
        const file = copied(content) as unknown as RmmzMap;
        disk.set(parsed.mapId, file);
        handNamesOf(file).forEach(name => saved.get(parsed.mapId)?.add(name));
        expected.set(parsed.mapId, copyNamesOf(file));
        return;
      }

      if (key === BLUEPRINTS_DOCUMENT)
      {
        followOnDisk(world, content);
        return;
      }

      throw new Error(`nothing is saved to ${key}`);
    },
  };

  const hub = new DocumentHub({ clientId: 'main', store });
  hub.addCommitCheck(blueprintShapeCheck(hub));
  hub.adopt(BLUEPRINTS_DOCUMENT, copied(onDisk.blueprints));
  holdBlueprintUses(hub, []);
  setting.held.forEach(mapId => hub.adopt(mapDocumentKey(mapId), copied(disk.get(mapId)) as unknown as JsonValue));

  const counter = new BlueprintCopyCounter({ hub, readNotes: async () => notesOn(disk) });
  const maps = new CopyMaps({
    hub,
    copies: counter,
    holders: () => [],
    onHoldingChange: () => () => undefined,
    openDocument: (key: DocumentKey): Promise<EditorDocument> => (hub.has(key) ? Promise.resolve(hub.document(key)) : Promise.reject(new Error(`${key} is not to be opened here`))),
    readMap: async mapId => copied(disk.get(mapId) as RmmzMap),
    templates: { revision: 1, listProblem: null, templateMapOf: () => null },
  });
  maps.start();
  hub.addCommitCheck(blueprintPropagationCheck({ hub, maps, tags: () => [] }));
  hub.setFileFit((key, patch) => maps.fileTakes(key, patch));
  hub.setFileWay((key, step, direction) => maps.fileWayOf(key, step, direction));

  // the server's act: every map's patches tried against its file first, and nothing written unless all fit.
  const write = async (act: BlueprintWrite): Promise<void> =>
  {
    const staged = act.maps.map(({ map, patches }) =>
    {
      const file = MapDocument.fromJson(mapDocumentKey(map), copied(disk.get(map) as RmmzMap));
      try
      {
        patches.forEach(patch => file.apply(patch));
      }
      catch (error)
      {
        throw new MapEditorApiError('PUT /api/blueprint-changes answered 409', 409, `Map ${map} no longer holds what the change replaced: ${(error as Error).message}`);
      }

      return [ map, file.toJson() ] as const;
    });
    staged.forEach(([ map, file ]) => disk.set(map, file));
    if (act.blueprints !== undefined)
    {
      followOnDisk(worldRef.current as World, act.blueprints);
    }
  };
  const writer = new BlueprintWriter({ hub, maps, write, settleMs: 0, onProblem: message => problems.push(message) });
  const kept = blueprintsKeptGuard(hub, { start: () => counter.start(), countOf: blueprintId => usedCopiesOf(counter, hub, blueprintId) }, mapId => `Map ${mapId}`);
  const router = new HistoryRouter(hub, null, (step, direction) => kept(step, direction) ?? writer.guard(step, direction), copiesLeftWords({ hub, mapName: mapId => `Map ${mapId}` }));
  const world: World = { hub, router, writer, disk, onDisk, saved, expected, copies, blueprintEvents: setting.blueprintEvents, problems, lastMoved: null, limits: [], next: 0 };
  worldRef.current = world;

  holdBlueprintMap(hub, BLUEPRINT);
  await settle(world);
  return world;
};

/**
 * Waits for every write and read on its way to land, as many rounds as each leads to more.
 * @param {World} world The world.
 * @returns {Promise<void>} Settles then.
 */
const settle = async (world: World): Promise<void> =>
{
  for (let round = 0; round < 4; round++)
  {
    await world.writer.whenWritten();
    for (let tick = 0; tick < 20; tick++)
    {
      await Promise.resolve();
    }
  }
};

/**
 * Lists the maps the window holds, by id.
 * @param {World} world The world.
 * @returns {number[]} The ids.
 */
const heldMaps = (world: World): number[] =>
{
  return [ ...world.disk.keys() ].filter(mapId => world.hub.has(mapDocumentKey(mapId)));
};

/**
 * Lists every history a step can be undone or redone from: the blueprint's, each of its events', each held map's, and
 * each held copy's.
 * @param {World} world The world.
 * @returns {HistoryKey[]} The histories.
 */
const historiesOf = (world: World): HistoryKey[] =>
{
  const blueprintMap = blueprintMapId(BLUEPRINT);
  const held = heldMaps(world);
  return [
    blueprintHistoryKey(BLUEPRINT),
    ...world.blueprintEvents.map(eventId => eventHistoryKey(blueprintMap, eventId)),
    ...held.map(mapHistoryKey),
    ...held.flatMap(mapId => (world.copies.get(mapId) ?? []).map(copyId => eventHistoryKey(mapId, copyId))),
  ].filter(key => world.hub.has(homeDocumentOf(key)));
};

/**
 * Names a token nobody has used yet in this run.
 * @param {World} world The world.
 * @param {string} prefix What it starts with.
 * @returns {string} The token.
 */
const token = (world: World, prefix: string): string =>
{
  world.next += 1;
  return `${prefix}${world.next}`;
};

/**
 * One thing an author does, worded for the run's log.
 */
type Action = (world: World, random: () => number) => Promise<string>;

/**
 * Renames one of the blueprint's events in its own window.
 */
const renameBlueprintEvent: Action = async (world, random) =>
{
  const eventId = pick(random, world.blueprintEvents);
  const name = token(world, 'bp-');
  renameEvent(world.hub, { mapId: blueprintMapId(BLUEPRINT), eventId }, name);
  return `rename the blueprint's event ${eventId} to ${name}`;
};

/**
 * Changes the speed of one of the blueprint's events' first page in its own window.
 */
const speedBlueprintEvent: Action = async (world, random) =>
{
  const eventId = pick(random, world.blueprintEvents);
  const speed = 1 + Math.floor(random() * 6);
  const target = { mapId: blueprintMapId(BLUEPRINT), eventId };
  const [ page ] = (world.hub.map(blueprintMapKey(BLUEPRINT)).event(eventId) as RmmzMapEvent).pages;
  setPageMovement(world.hub, target, 0, { moveType: page.moveType, moveSpeed: speed, moveFrequency: page.moveFrequency, moveRoute: page.moveRoute });
  return `set the blueprint's event ${eventId} to speed ${speed}`;
};

/**
 * Picks a copy on a held map, or null when no map is held.
 * @param {World} world The world.
 * @param {() => number} random The generator.
 * @returns {[ number, number ] | null} The map and the copy.
 */
const pickCopy = (world: World, random: () => number): [ number, number ] | null =>
{
  const held = heldMaps(world);
  if (held.length === 0)
  {
    return null;
  }

  const mapId = pick(random, held);
  return [ mapId, pick(random, world.copies.get(mapId) as number[]) ];
};

/**
 * Renames a copy by hand in its own window.
 */
const renameCopy: Action = async (world, random) =>
{
  const picked = pickCopy(world, random);
  if (picked === null)
  {
    return 'rename a copy, with no map open';
  }

  const [ mapId, eventId ] = picked;
  const name = token(world, HAND);
  renameEvent(world.hub, { mapId, eventId }, name);
  return `rename copy ${eventId} on Map ${mapId} to ${name} by hand`;
};

/**
 * Changes a copy's speed by hand in its own window.
 */
const speedCopy: Action = async (world, random) =>
{
  const picked = pickCopy(world, random);
  if (picked === null)
  {
    return 'speed a copy, with no map open';
  }

  const [ mapId, eventId ] = picked;
  const speed = 1 + Math.floor(random() * 6);
  const [ page ] = (world.hub.map(mapDocumentKey(mapId)).event(eventId) as RmmzMapEvent).pages;
  setPageMovement(world.hub, { mapId, eventId }, 0, { moveType: page.moveType, moveSpeed: speed, moveFrequency: page.moveFrequency, moveRoute: page.moveRoute });
  return `set copy ${eventId} on Map ${mapId} to speed ${speed} by hand`;
};

/**
 * Undoes the newest step of a history that has one.
 */
const undo: Action = async (world, random) =>
{
  const histories = historiesOf(world).filter(key => world.hub.history(key).position > 0);
  if (histories.length === 0)
  {
    return 'undo, with nothing to undo';
  }

  const key = pick(random, histories);
  const check = world.hub.canUndo(key);
  world.lastMoved = check.ok ? world.hub.knownStep(check.step.id) : null;
  const outcome = await world.router.undo(key);
  return `undo ${key}${outcome.ok ? '' : ` (refused: ${outcome.message})`}`;
};

/**
 * Redoes the next step of a history that has one.
 */
const redo: Action = async (world, random) =>
{
  const histories = historiesOf(world).filter(key =>
  {
    const { rows, position } = world.hub.history(key);
    return rows.length > position;
  });
  if (histories.length === 0)
  {
    return 'redo, with nothing to redo';
  }

  const key = pick(random, histories);
  const check = world.hub.canRedo(key);
  world.lastMoved = check.ok ? world.hub.knownStep(check.step.id) : null;
  const outcome = await world.router.redo(key);
  return `redo ${key}${outcome.ok ? '' : ` (refused: ${outcome.message})`}`;
};

/**
 * Saves a held map from one of its copies' windows, as the event window's save does.
 */
const saveOne: Action = async (world, random) =>
{
  const picked = pickCopy(world, random);
  if (picked === null)
  {
    return 'save, with no map open';
  }

  const [ mapId, eventId ] = picked;
  const outcome = await saveTargetMap(world.hub, { mapId, eventId }, () => world.writer.whenWritten());
  return `save Map ${mapId}${outcome.ok ? '' : ` (refused: ${outcome.message})`}`;
};

/**
 * Saves everything unsaved, as the workspace's Save all does: whatever the writer has on its way first, then every
 * document with unsaved edits but a blueprint's tab, leaving any waiting for a choice.
 */
const saveAll: Action = async world =>
{
  const { hub, writer } = world;
  await writer.whenWritten();
  const ready = hub.dirtyKeys().filter(key => parseDocumentKey(key).kind !== 'blueprint-map' && hub.isConflicted(key) === false);
  for (const key of ready)
  {
    await hub.save(key);
  }

  return `save all (${ready.join(', ') || 'nothing'})`;
};

/**
 * Throws a held map's edits away, the map taking its file again, as choosing the version on disk does.
 */
const discard: Action = async (world, random) =>
{
  const held = heldMaps(world);
  if (held.length === 0)
  {
    return 'discard, with no map open';
  }

  const mapId = pick(random, held);
  world.hub.reload(mapDocumentKey(mapId), copied(world.disk.get(mapId)) as unknown as JsonValue);
  return `throw Map ${mapId}'s edits away`;
};

/**
 * Opens a map the window does not hold, as opening its tab does: once every change on its way to it has landed.
 */
const open: Action = async (world, random) =>
{
  const unheld = [ ...world.disk.keys() ].filter(mapId => world.hub.has(mapDocumentKey(mapId)) === false);
  if (unheld.length === 0)
  {
    return 'open, with every map open';
  }

  const mapId = pick(random, unheld);
  await world.writer.whenWritten();
  await world.hub.load(mapDocumentKey(mapId));
  return `open Map ${mapId}`;
};

/**
 * Closes a held map with nothing unsaved, as closing its tab does.
 */
const close: Action = async (world, random) =>
{
  const clean = heldMaps(world).filter(mapId => world.hub.isDirty(mapDocumentKey(mapId)) === false);
  if (clean.length === 0)
  {
    return 'close, with no clean map open';
  }

  const mapId = pick(random, clean);
  world.hub.release(mapDocumentKey(mapId));
  return `close Map ${mapId}`;
};

/**
 * What a run picks from, each as often as it is listed.
 */
const ACTIONS: readonly Action[] = [
  renameBlueprintEvent, renameBlueprintEvent, renameBlueprintEvent,
  speedBlueprintEvent, speedBlueprintEvent,
  renameCopy, renameCopy, renameCopy,
  speedCopy, speedCopy,
  undo, undo, undo, undo,
  redo, redo, redo,
  saveOne, saveOne,
  saveAll,
  discard,
  open,
  close,
];

/**
 * Lists what is wrong with the world once everything has landed, each kind once, in words.
 * @param {World} world The world.
 * @returns {string[]} The kinds; none when all is well.
 */
const wrongWith = (world: World): string[] =>
{
  const { hub, disk } = world;
  const wrong: string[] = [];

  heldMaps(world).forEach(mapId =>
  {
    const key = mapDocumentKey(mapId);
    const matches = jsonEquals(hub.committedContent(key), disk.get(mapId));
    if (hub.isDirty(key) === matches)
    {
      wrong.push(matches ? 'a map reads as unsaved while it matches its file' : 'a map reads as saved while it differs from its file');
    }
  });

  const blueprintsMatch = jsonEquals(hub.committedContent(BLUEPRINTS_DOCUMENT), world.onDisk.blueprints);
  if (hub.isDirty(BLUEPRINTS_DOCUMENT) === blueprintsMatch)
  {
    wrong.push(blueprintsMatch ? 'the blueprints read as unsaved while they match their file' : 'the blueprints read as saved while they differ from their file');
  }

  disk.forEach((file, mapId) =>
  {
    const saved = world.saved.get(mapId) as Set<string>;
    if (handNamesOf(file).some(name => saved.has(name) === false))
    {
      wrong.push('an unsaved edit reached disk');
    }

    // a copy left behind by a move whose step never reached it is the replay limit, named apart and followed from there.
    const expected = world.expected.get(mapId) as Map<number, string>;
    copyNamesOf(file).forEach((name, copyId) =>
    {
      if (expected.get(copyId) === name)
      {
        return;
      }

      if (isReplayLimit(world, mapId, copyId, name))
      {
        world.limits.push(`Map ${mapId}, copy ${copyId}`);
        expected.set(copyId, name);
        return;
      }

      wrong.push('a copy on disk parted from its blueprint');
    });
  });

  world.problems.splice(0).forEach(problem => wrong.push(`the writer: ${problem}`));
  return [ ...new Set(wrong) ];
};

/**
 * Reports whether a copy whose name on disk is not what the blueprints on disk say it should be was left there by the
 * replay limit, which the field model has by design: an undo or a redo moves the patches its step recorded when it was
 * made, so a copy the step never had a patch for, its own name then being the author's, stays as it is however that copy
 * came to hold the blueprint's old name since, as undoing the author's own rename of it does. It is that limit only when
 * the move was an undo or a redo, the step it moved holds no patch for the copy on its map, and the map, where the window
 * holds it, shows the copy with the very name its file holds; anything else is a copy parted from its blueprint.
 * @param {World} world The world.
 * @param {number} mapId The map.
 * @param {number} copyId The copy.
 * @param {string} name The copy's name on disk.
 * @returns {boolean} True for the replay limit.
 */
const isReplayLimit = (world: World, mapId: number, copyId: number, name: string): boolean =>
{
  const step = world.lastMoved;
  if (step === null)
  {
    return false;
  }

  const key = mapDocumentKey(mapId);
  const reached = step.entries.some(({ document, patch }) => document === key && 'path' in patch && patch.path[0] === 'events' && patch.path[1] === copyId);
  const shown = world.hub.has(key) ? copyNamesOf(world.hub.committedContent(key) as unknown as RmmzMap).get(copyId) : name;
  return reached === false && shown === name;
};

/**
 * Words every copy's name as the window holds it, as its file holds it, and as the file should, map by map, with the
 * blueprints' names and whether each map reads as unsaved: what JMZ_SEQUENCES_TRACE prints after each step of the run it
 * names.
 * @param {World} world The world.
 * @returns {string} The lines.
 */
const traceOf = (world: World): string =>
{
  const names = [ ...blueprintNamesOf(world.hub.committedContent(BLUEPRINTS_DOCUMENT)) ].map(([ id, name ]) => `${id}=${name}`).join(' ');
  const onDisk = [ ...blueprintNamesOf(world.onDisk.blueprints) ].map(([ id, name ]) => `${id}=${name}`).join(' ');
  const lines = [ `  blueprint here [${names}] on disk [${onDisk}]` ];
  world.disk.forEach((file, mapId) =>
  {
    const key = mapDocumentKey(mapId);
    const held = world.hub.has(key) ? copyNamesOf(world.hub.committedContent(key) as unknown as RmmzMap) : null;
    const expected = world.expected.get(mapId) as Map<number, string>;
    const copies = [ ...copyNamesOf(file) ].map(([ copyId, name ]) =>
    {
      const link = blueprintLinkOf((file.events[copyId] as RmmzMapEvent).note);
      return `${copyId}(of ${link?.eventId}) here ${held === null ? '-' : held.get(copyId)} disk ${name} expected ${expected.get(copyId)}`;
    });
    const state = held === null ? 'not held' : `${world.hub.isDirty(key) ? 'unsaved' : 'saved'}`;
    lines.push(`  Map ${mapId} ${state}: ${copies.join('; ')}`);
  });

  return `${lines.join('\n')}\n`;
};

/**
 * What one run came to: its seed, the step it broke at with what was wrong, or null for a run that never broke, every
 * step it played, and each copy the replay limit left behind on the way.
 */
type Run = {
  readonly seed: number;
  readonly broke: { readonly step: number; readonly wrong: readonly string[] } | null;
  readonly log: readonly string[];
  readonly limits: readonly string[];
};

/**
 * Plays one run from its seed, stopping at the first step that leaves something wrong.
 * @param {Setting} setting What it plays on.
 * @param {number} seed The seed.
 * @returns {Promise<Run>} What it came to.
 */
const play = async (setting: Setting, seed: number): Promise<Run> =>
{
  const random = randomFrom(seed);
  const world = await openWorld(setting);
  const log: string[] = [];
  const tracing = process.env['JMZ_SEQUENCES_TRACE'] === String(seed);
  for (let step = 0; step < STEPS_PER_RUN; step++)
  {
    let wrong: string[];
    try
    {
      world.lastMoved = null;
      log.push(await pick(random, ACTIONS)(world, random));
      await settle(world);
      if (tracing)
      {
        process.stdout.write(`${step}: ${log[log.length - 1]}\n${traceOf(world)}`);
      }

      wrong = wrongWith(world);
    }
    catch (error)
    {
      wrong = [ `threw: ${(error as Error).message}` ];
    }

    if (wrong.length > 0)
    {
      world.writer.stop();
      return { seed, broke: { step, wrong }, log, limits: world.limits };
    }
  }

  world.writer.stop();
  return { seed, broke: null, log, limits: world.limits };
};

/**
 * Prints what the runs came to, as JMZ_SEQUENCES_REPORT asks: how many broke, by kind, how many met the replay limit, and
 * the first few of each, step by step, so each replays from its seed.
 * @param {readonly Run[]} runs Every run.
 * @param {number} shown How many of each to print in full.
 */
const report = (runs: readonly Run[], shown: number): void =>
{
  const broken = runs.filter(run => run.broke !== null);
  const limited = runs.filter(run => run.limits.length > 0);
  const kinds = new Map<string, number>();
  broken.forEach(run => run.broke?.wrong.forEach(kind => kinds.set(kind, (kinds.get(kind) ?? 0) + 1)));
  const lines = [
    `${broken.length} of ${runs.length} runs failed`,
    ...[ ...kinds ].map(([ kind, count ]) => `  ${count} x ${kind}`),
    `${limited.length} of ${runs.length} runs met the replay limit`,
    ...broken.slice(0, shown).map(run => `seed ${run.seed}, step ${run.broke?.step}: ${run.broke?.wrong.join('; ')}\n${run.log.map(line => `    ${line}`).join('\n')}`),
    ...limited.slice(0, shown).map(run => `seed ${run.seed}, the replay limit at ${run.limits.join(', ')}\n${run.log.map(line => `    ${line}`).join('\n')}`),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
};

describe.skipIf(project === null)('random runs of blueprint changes, hand edits, undo, redo, saves and discards on shipped maps', () =>
{
  it('keeps every map saved exactly when it matches its file, every unsaved edit off disk, and every copy with its blueprint', async () =>
  {
    // Arrange: the maps laid out once, every run starting afresh from them.
    const setting = layOut();
    const runs = Number(process.env['JMZ_SEQUENCES'] ?? DEFAULT_RUNS);

    // Act.
    const played: Run[] = [];
    for (let seed = 1; seed <= runs; seed++)
    {
      played.push(await play(setting, seed));
    }

    if (process.env['JMZ_SEQUENCES_REPORT'] !== undefined)
    {
      report(played, Number(process.env['JMZ_SEQUENCES_REPORT'] || 3));
    }

    // Assert: no run broke; a failure names its seed, which replays it.
    expect(played.flatMap(run => (run.broke === null ? [] : [ { seed: run.seed, ...run.broke } ])))
      .toStrictEqual([]);
  }, 600_000);
});
