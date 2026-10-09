import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_USES_DOCUMENT,
  forgetPlacement,
  recordSpots,
  spotsOnMap,
  type PlacedSpot,
} from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { BlueprintUsesKeeper, moveThrough, partChangesOf } from '../../../../src/mapEditor/core/blueprints/blueprintUsesKeeper.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { operationFor } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { holdBlueprints, storedUses } from '../../support/blueprintFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { UsesServer } from '../../support/usesServer.ts';

/*
 * The record of where blueprints are placed describes the maps on disk, so its keeper owes the window these rules.
 *
 * A map's placements reach the disk only when that map's file does, merged into the record as the file holds it at that
 * moment, and never another map's: the placements as the saved file holds the map's tiles, so one made while the save
 * was on its way stays unsaved with the map, and one never saved never reaches the disk, whatever happens to the window.
 * Two windows saving two maps at once both land. A save made in another window is written by that window when it holds
 * the record, and here when it does not.
 *
 * Forgetting a placement takes that one placement off the disk at once, and nothing else of its map; taking it back puts
 * it back only while the map's file holds it.
 *
 * The record's file changing on disk is never a choice: a map whose placements here are what the file held follows the
 * file, one holding unsaved placements keeps them, and every undo step stays. Throwing a map's edits away takes its
 * placements back to what the file holds for it. A write that fails is said, and tried again with the next save. A record
 * written before placements said their part placed reads as every placement whole.
 */

/**
 * The record on disk at the start: the camp (aa22) hanging over map 3's left edge, and on map 16 the camp twice and the
 * roost (k3x9q2mf) once.
 */
const ON_DISK: readonly PlacedSpot[] = [
  { blueprintId: 'aa22', mapId: 3, x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } },
  { blueprintId: 'aa22', mapId: 16, x: 1, y: 3 },
  { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 },
  { blueprintId: 'k3x9q2mf', mapId: 16, x: 4, y: 7 },
];

/**
 * A store for maps' files that writes at once, or holds a write of map 16 until let go.
 * @returns {{ store: DocumentStore, files: Map<DocumentKey, JsonValue>, hold: () => () => void }} The store, the files it
 * wrote, and a way to make the next write of map 16 wait, which hands back what lets it go.
 */
const mapStore = () =>
{
  const files = new Map<DocumentKey, JsonValue>();
  let held: Promise<void> | null = null;
  const store: DocumentStore = {
    load: async () => null,
    save: async (key, content) =>
    {
      if (key === 'map:16' && held !== null)
      {
        const waiting = held;
        held = null;
        await waiting;
      }

      files.set(key, structuredClone(content));
    },
  };
  const hold = (): (() => void) =>
  {
    let release = (): void => undefined;
    held = new Promise<void>(resolve =>
    {
      release = resolve;
    });
    return release;
  };

  return { store, files, hold };
};

/**
 * Opens a window over a server: maps 3 and 16, or the maps given, and the blueprints held, and the record taken up as the
 * server's file holds it, kept by a keeper from the start.
 * @param {UsesServer} server The server.
 * @param {object} options The window's id, the other windows holding the record or any map, where its maps are written,
 * and which maps it holds.
 * @returns {{ hub: DocumentHub, keeper: BlueprintUsesKeeper, problems: string[] }} The window's documents, its keeper, and
 * what the author heard.
 */
const windowOver = (
  server: UsesServer,
  options: { clientId?: string; holders?: readonly string[]; store?: DocumentStore; maps?: readonly number[] } = {},
) =>
{
  const hub = new DocumentHub({ clientId: options.clientId ?? 'window-a', store: options.store ?? mapStore().store });
  (options.maps ?? [ 3, 16 ]).forEach(mapId => hub.adopt(`map:${mapId}`, buildMapJson() as unknown as JsonValue));
  holdBlueprints(hub);
  const problems: string[] = [];
  const keeper = new BlueprintUsesKeeper({
    hub,
    api: server.api,
    holders: () => options.holders ?? [],
    onProblem: message => problems.push(message),
  });
  hub.adopt(BLUEPRINT_USES_DOCUMENT, structuredClone(server.stored ?? storedUses()));
  return { hub, keeper, problems };
};

/**
 * Places the camp at a cell on a map, with a change to the map's tiles' neighbour, its note, in the same step, unsaved.
 * @param {DocumentHub} hub The window's documents.
 * @param {number} mapId The map.
 * @param {number} x The column.
 * @returns {HistoryStep} The step.
 */
const place = (hub: DocumentHub, mapId: number, x: number): HistoryStep => hub.edit('Place', [ mapHistoryKey(mapId) ], tx =>
{
  tx.set(`map:${mapId}`, [ 'note' ], `placed at ${x}`);
  recordSpots(tx, hub, mapId, [ { blueprintId: 'aa22', x, y: 0 } ]);
}) as HistoryStep;

/**
 * Lists the placements the window's record holds on one map, each as its blueprint and corner.
 * @param {DocumentHub} hub The window's documents.
 * @param {number} mapId The map.
 * @returns {string[]} The placements.
 */
const heldOn = (hub: DocumentHub, mapId: number): string[] =>
{
  return spotsOnMap(hub.document(BLUEPRINT_USES_DOCUMENT), mapId).map(spot => `${spot.blueprintId}@${spot.x},${spot.y}`);
};

/**
 * Repeats every operation one window makes in another, the way the sync peer does.
 * @param {DocumentHub} from The window making operations.
 * @param {DocumentHub} to The window repeating them.
 */
const mirror = (from: DocumentHub, to: DocumentHub): void =>
{
  from.subscribe(event =>
  {
    const operation = 'source' in event && event.source === 'local'
      ? operationFor(event, from.clientId)
      : null;
    if (operation !== null)
    {
      to.applyRemote(structuredClone(operation));
    }
  });
};

describe('BlueprintUsesKeeper', () =>
{
  describe('a map\'s save', () =>
  {
    it('writes the saved map\'s placements alone, every other map on disk staying as it was, unsaved placements and all', async () =>
    {
      // Arrange: a placement on each map since the window opened.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper, problems } = windowOver(server);
      place(hub, 16, 0);
      place(hub, 3, 5);

      // Act.
      await hub.save('map:16');
      await keeper.whenWritten();

      // Assert: one merge naming map 16 alone, and map 3 on disk without the placement no save took there.
      expect([ server.merges, server.entryOf(16), server.entryOf(3), problems ])
        .toStrictEqual([
          [ { schemaVersion: 2, maps: { 16: { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] } } } ],
          { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] },
          [],
        ]);
    });

    it('leaves out a placement made while the save was on its way, which stays unsaved with the map', async () =>
    {
      // Arrange: map 16's file write held until let go.
      const server = new UsesServer(storedUses(ON_DISK));
      const maps = mapStore();
      const { hub, keeper } = windowOver(server, { store: maps.store });
      place(hub, 16, 0);
      const release = maps.hold();
      const saving = hub.save('map:16');

      // Act: another placement while the save waits, then the save let go.
      place(hub, 16, 7);
      release();
      await saving;
      await keeper.whenWritten();

      // Assert: the file holds the first placement and not the second, which the map still holds unsaved.
      expect([ server.entryOf(16), heldOn(hub, 16), hub.isDirty('map:16') ])
        .toStrictEqual([
          { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          [ 'aa22@0,0', 'aa22@7,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ],
          true,
        ]);
    });

    it('sends the saved map\'s placements as they stand though the file holds them already, leaving the file as it was', async () =>
    {
      // Arrange: map 16 renamed, its placements untouched.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      const before = structuredClone(server.stored);
      hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));

      // Act.
      await hub.save('map:16');
      await keeper.whenWritten();

      // Assert: only the file can tell whether another window wrote map 16 since, so its placements went, changing nothing.
      expect([ server.merges, server.stored ])
        .toStrictEqual([
          [ { schemaVersion: 2, maps: { 16: { aa22: [ { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] } } } ],
          before,
        ]);
    });

    it('works out what a file another window saved holds from that save\'s own steps, one undone here since included', async () =>
    {
      // Arrange: a placement here, undone; then a window that does not hold the record, an event window, saves the map
      // as it stood with the placement in.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      const placed = place(hub, 16, 0);
      hub.undo(mapHistoryKey(16));

      // Act.
      hub.applyRemote({ type: 'saved', origin: 'window-e', document: 'map:16', marker: [ placed.id ] });
      await keeper.whenWritten();

      // Assert.
      expect(server.entryOf(16))
        .toStrictEqual({ aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] });
    });

    it('writes the placement a save on its way holds, though it was undone meanwhile and a later edit dropped its redo', async () =>
    {
      // Arrange: a placement, and the map's save held on its way.
      const server = new UsesServer(storedUses(ON_DISK));
      const maps = mapStore();
      const { hub, keeper } = windowOver(server, { store: maps.store });
      place(hub, 16, 0);
      const release = maps.hold();
      const saving = hub.save('map:16');

      // Act: the placement undone and the map renamed while the save waits, so no history holds the placement any more.
      hub.undo(mapHistoryKey(16));
      hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));
      release();
      await saving;
      await keeper.whenWritten();

      // Assert: the file the save wrote holds the placement, and so does the record on disk.
      expect([ (maps.files.get('map:16') as { note: string }).note, server.entryOf(16) ])
        .toStrictEqual([ 'placed at 0', { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] } ]);
    });

    it('replays a step a save holds from the history that lists it, in a map taken over from another window', async () =>
    {
      // Arrange: window b places on map 16 and undoes it, its redo kept; window c takes over map 16 and the record from it,
      // having heard nothing of the placement itself.
      const server = new UsesServer(storedUses(ON_DISK));
      const windowB = windowOver(server, { clientId: 'window-b' });
      const placed = place(windowB.hub, 16, 0);
      windowB.hub.undo(mapHistoryKey(16));
      const hub = new DocumentHub({ clientId: 'window-c', store: mapStore().store });
      const keeper = new BlueprintUsesKeeper({ hub, api: server.api, holders: () => [], onProblem: () => undefined });
      hub.adoptSnapshot(windowB.hub.snapshot('map:16'));
      hub.adoptSnapshot(windowB.hub.snapshot(BLUEPRINT_USES_DOCUMENT));
      await keeper.whenWritten();
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });

      // Act: an event window's save of the map as it stood with the placement in.
      hub.applyRemote({ type: 'saved', origin: 'window-e', document: 'map:16', marker: [ placed.id ] });
      await keeper.whenWritten();

      // Assert.
      expect(server.entryOf(16))
        .toStrictEqual({ aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] });
    });

    it('leaves a save made by another window holding the record to that window', async () =>
    {
      // Arrange: window b holds the record too.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server, { holders: [ 'window-b' ] });
      const placed = place(hub, 16, 0);

      // Act.
      hub.applyRemote({ type: 'saved', origin: 'window-b', document: 'map:16', marker: [ placed.id ] });
      await keeper.whenWritten();

      // Assert.
      expect(server.merges)
        .toStrictEqual([]);
    });

    it('writes nothing for a window holding no record it can read', async () =>
    {
      // Arrange: a record that is no record of placements.
      const server = new UsesServer({ schemaVersion: 2, data: { maps: [] } });
      const { hub, keeper } = windowOver(server);
      hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));

      // Act.
      await hub.save('map:16');
      await keeper.whenWritten();

      // Assert.
      expect(server.merges)
        .toStrictEqual([]);
    });
  });

  describe('the window closing without saving', () =>
  {
    it('never writes a placement no save took to disk', async () =>
    {
      // Arrange: a placement on map 3, and a rename of map 16, which is saved.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      place(hub, 3, 5);
      hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));
      await hub.save('map:16');

      // Act: the window closes with map 3 unsaved.
      keeper.stop();
      await keeper.whenWritten();

      // Assert: the one merge, map 16's save, named map 16 alone and never map 3, which the disk holds as it did.
      expect([ server.merges.map(merge => [ Object.keys(merge.maps ?? {}), merge.remove, merge.add ]), server.entryOf(3), hub.isDirty('map:3') ])
        .toStrictEqual([ [ [ [ '16' ], undefined, undefined ] ], { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] }, true ]);
    });
  });

  describe('two windows', () =>
  {
    it('lands both when two windows each save a different map at the same moment, neither carrying the other\'s', async () =>
    {
      // Arrange: two windows sharing their edits, each holding the record; window a places on map 16 and window b on map 3,
      // so each record holds both unsaved placements. The server holds every merge on its way.
      const server = new UsesServer(storedUses(ON_DISK));
      const windowA = windowOver(server, { clientId: 'window-a', holders: [ 'window-b' ] });
      const windowB = windowOver(server, { clientId: 'window-b', holders: [ 'window-a' ] });
      mirror(windowA.hub, windowB.hub);
      mirror(windowB.hub, windowA.hub);
      place(windowA.hub, 16, 0);
      place(windowB.hub, 3, 5);
      server.holding = true;

      // Act: both saves, at once, then both merges let go.
      await Promise.all([ windowA.hub.save('map:16'), windowB.hub.save('map:3') ]);
      const onTheirWay = server.held.length;
      server.releaseAll();
      await Promise.all([ windowA.keeper.whenWritten(), windowB.keeper.whenWritten() ]);

      // Assert: one merge from each, naming its own map alone, and both maps on disk.
      expect([ onTheirWay, server.merges.map(merge => Object.keys(merge.maps ?? {})), server.entryOf(16), server.entryOf(3) ])
        .toStrictEqual([
          2,
          [ [ '16' ], [ '3' ] ],
          { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } }, { x: 5, y: 0 } ] },
        ]);
    });

    it('writes a map\'s save though another window wrote that map\'s placements since this one last read the file', async () =>
    {
      // Arrange: two windows sharing their edits, each holding the record; window b places the camp on map 16 and saves
      // it, which writes the placement, and window a, which read the file before, undoes the placement.
      const server = new UsesServer(storedUses(ON_DISK));
      const windowA = windowOver(server, { clientId: 'window-a', holders: [ 'window-b' ] });
      const windowB = windowOver(server, { clientId: 'window-b', holders: [ 'window-a' ] });
      mirror(windowA.hub, windowB.hub);
      mirror(windowB.hub, windowA.hub);
      place(windowB.hub, 16, 0);
      await windowB.hub.save('map:16');
      await windowB.keeper.whenWritten();
      const afterB = server.entryOf(16);
      windowA.hub.undo(mapHistoryKey(16));

      // Act: window a saves map 16 without the placement.
      await windowA.hub.save('map:16');
      await Promise.all([ windowA.keeper.whenWritten(), windowB.keeper.whenWritten() ]);

      // Assert: the record on disk holds what map 16's file now holds, the placement gone again.
      expect([ afterB, server.entryOf(16) ])
        .toStrictEqual([
          { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          { aa22: [ { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
        ]);
    });

    it('takes a map the tree took away off the disk though another window wrote its placements since this one last read', async () =>
    {
      // Arrange: map 16 holds nothing on disk; window b places the camp on it and saves it, and window a, which read the
      // file before, has heard nothing of map 16's file since.
      const server = new UsesServer(storedUses(ON_DISK.filter(spot => spot.mapId !== 16)));
      const windowA = windowOver(server, { clientId: 'window-a', holders: [ 'window-b' ] });
      const windowB = windowOver(server, { clientId: 'window-b', holders: [ 'window-a' ] });
      place(windowB.hub, 16, 0);
      await windowB.hub.save('map:16');
      await windowB.keeper.whenWritten();
      const afterB = server.entryOf(16);

      // Act: window a's tree takes map 16's file away.
      windowA.keeper.writeMaps(new Map([ [ 16, [] ] ]));
      await windowA.keeper.whenWritten();

      // Assert: the record on disk no longer names the map whose file is gone.
      expect([ afterB, server.entryOf(16) ])
        .toStrictEqual([ { aa22: [ { x: 0, y: 0 } ] }, undefined ]);
    });
  });

  describe('forgetting a placement', () =>
  {
    it('takes the forgotten placement off the disk at once, and nothing else of its map, unsaved placements included', async () =>
    {
      // Arrange: an unsaved placement on map 16.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      place(hub, 16, 0);

      // Act.
      forgetPlacement(hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 });
      await keeper.whenWritten();

      // Assert.
      expect([ server.merges, server.entryOf(16) ])
        .toStrictEqual([
          [ { schemaVersion: 2, remove: [ { map: 16, blueprint: 'aa22', x: 12, y: 3 } ] } ],
          { aa22: [ { x: 1, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
        ]);
    });

    it('puts a forgotten placement back on disk when the forgetting is undone, its map\'s file holding it', async () =>
    {
      // Arrange.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      forgetPlacement(hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 3, x: -1, y: 0 });

      // Act.
      hub.undo(blueprintHistoryKey('aa22'));
      await keeper.whenWritten();

      // Assert: the placement back as it was, its part placed included.
      expect([ server.merges.slice(1), server.entryOf(3) ])
        .toStrictEqual([
          [ { schemaVersion: 2, add: [ { map: 3, blueprint: 'aa22', x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] } ],
          { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] },
        ]);
    });

    it('keeps a forgotten placement its map never saved off the disk when the forgetting is undone', async () =>
    {
      // Arrange: the camp placed on map 16 and forgotten before any save.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      place(hub, 16, 0);
      forgetPlacement(hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 0, y: 0 });

      // Act.
      hub.undo(blueprintHistoryKey('aa22'));
      await keeper.whenWritten();

      // Assert: only the forgetting reached the disk, which had nothing to take out; the placement is held here alone.
      expect([ server.merges, server.entryOf(16), heldOn(hub, 16) ])
        .toStrictEqual([
          [ { schemaVersion: 2, remove: [ { map: 16, blueprint: 'aa22', x: 0, y: 0 } ] } ],
          { aa22: [ { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          [ 'aa22@0,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ],
        ]);
    });

    it('keeps a placement only another window holds unsaved off the disk when a window not holding its map undoes forgetting it', async () =>
    {
      // Arrange: window a holds map 16 and places the camp on it, unsaved; window b holds the record but not map 16, and
      // forgets that placement from the where-used list.
      const server = new UsesServer(storedUses(ON_DISK));
      const windowA = windowOver(server, { clientId: 'window-a', holders: [ 'window-b' ] });
      const windowB = windowOver(server, { clientId: 'window-b', holders: [ 'window-a' ], maps: [ 3 ] });
      mirror(windowA.hub, windowB.hub);
      mirror(windowB.hub, windowA.hub);
      place(windowA.hub, 16, 0);
      forgetPlacement(windowB.hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 0, y: 0 });

      // Act: window b undoes the forgetting.
      windowB.hub.undo(blueprintHistoryKey('aa22'));
      await Promise.all([ windowA.keeper.whenWritten(), windowB.keeper.whenWritten() ]);

      // Assert: map 16's file never held the placement, and neither does the record on disk, though both windows do.
      expect([ server.entryOf(16), heldOn(windowA.hub, 16), heldOn(windowB.hub, 16) ])
        .toStrictEqual([
          { aa22: [ { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          [ 'aa22@0,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ],
          [ 'aa22@0,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ],
        ]);
    });

    it('puts a placement another window saved back on disk when a window not holding its map undoes forgetting it', async () =>
    {
      // Arrange: window a places the camp on map 16 and saves it; window b, which does not hold map 16, forgets it, which
      // takes it off the disk.
      const server = new UsesServer(storedUses(ON_DISK));
      const windowA = windowOver(server, { clientId: 'window-a', holders: [ 'window-b' ] });
      const windowB = windowOver(server, { clientId: 'window-b', holders: [ 'window-a' ], maps: [ 3 ] });
      mirror(windowA.hub, windowB.hub);
      mirror(windowB.hub, windowA.hub);
      place(windowA.hub, 16, 0);
      await windowA.hub.save('map:16');
      await windowA.keeper.whenWritten();
      forgetPlacement(windowB.hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 0, y: 0 });
      await windowB.keeper.whenWritten();
      const afterForgetting = server.entryOf(16);

      // Act: window b undoes the forgetting.
      windowB.hub.undo(blueprintHistoryKey('aa22'));
      await Promise.all([ windowA.keeper.whenWritten(), windowB.keeper.whenWritten() ]);

      // Assert: off the disk once forgotten, and back once window a, whose map 16 file holds it, heard the undo.
      expect([ afterForgetting, server.entryOf(16) ])
        .toStrictEqual([
          { aa22: [ { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
        ]);
    });

    it('puts a forgotten placement back on disk from a window not holding its map when no window holds it', async () =>
    {
      // Arrange: the only window holds the record but not map 16, and forgets a placement the disk holds there.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server, { maps: [ 3 ] });
      forgetPlacement(hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 });
      await keeper.whenWritten();
      const afterForgetting = server.entryOf(16);

      // Act.
      hub.undo(blueprintHistoryKey('aa22'));
      await keeper.whenWritten();

      // Assert.
      expect([ afterForgetting, server.entryOf(16) ])
        .toStrictEqual([
          { aa22: [ { x: 1, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          { aa22: [ { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
        ]);
    });

    it('leaves a forgetting made in another window for that window to write', async () =>
    {
      // Arrange: window b forgets, and window a hears it.
      const server = new UsesServer(storedUses(ON_DISK));
      const windowA = windowOver(server, { clientId: 'window-a' });
      const windowB = windowOver(server, { clientId: 'window-b' });
      mirror(windowB.hub, windowA.hub);

      // Act.
      forgetPlacement(windowB.hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 });
      await Promise.all([ windowA.keeper.whenWritten(), windowB.keeper.whenWritten() ]);

      // Assert: one merge, window b's, and window a's record forgot it too.
      expect([ server.merges.length, heldOn(windowA.hub, 16) ])
        .toStrictEqual([ 1, [ 'aa22@1,3', 'k3x9q2mf@4,7' ] ]);
    });
  });

  /*
   * What a reload of the version on disk used to do to the record, throwing away every step that touched it, is gone: the
   * record's file changing is merged a map at a time, and nothing anywhere is thrown away.
   */
  describe('the record changing on disk', () =>
  {
    /**
     * The record as another session leaves it: map 3's camp gone, map 16's roost moved, and map 7 placed.
     */
    const CHANGED = storedUses([
      { blueprintId: 'aa22', mapId: 7, x: 2, y: 2 },
      { blueprintId: 'aa22', mapId: 16, x: 1, y: 3 },
      { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 },
      { blueprintId: 'k3x9q2mf', mapId: 16, x: 5, y: 7 },
    ]);

    it('follows the file for a map holding nothing unsaved, and keeps a map\'s unsaved placements, flagging nothing', () =>
    {
      // Arrange: an unsaved placement on map 16.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);
      place(hub, 16, 0);

      // Act.
      const result = hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, CHANGED);

      // Assert: maps 3 and 7 as the file has them, map 16 as it stands here, and no conflict to choose over.
      expect([ result, heldOn(hub, 3), heldOn(hub, 7), heldOn(hub, 16), hub.isConflicted(BLUEPRINT_USES_DOCUMENT) ])
        .toStrictEqual([ 'kept', [], [ 'aa22@2,2' ], [ 'aa22@0,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ], false ]);
    });

    it('keeps every undo step: the placement the record held unsaved still undoes, tiles and record together', () =>
    {
      // Arrange: an unsaved placement on map 16, then the record's file changed on disk.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);
      place(hub, 16, 0);
      hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, CHANGED);
      const { rows } = hub.history(mapHistoryKey(16));

      // Act.
      const undone = hub.undo(mapHistoryKey(16));

      // Assert: the step still in the map's history after the change, and undone whole.
      expect([ rows.map(row => row.label), undone.ok, heldOn(hub, 16), (hub.document('map:16').toJson() as { note: string }).note ])
        .toStrictEqual([ [ 'Place' ], true, [ 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ], '' ]);
    });

    it('waits for an edit open when the file changed to finish before following it', () =>
    {
      // Arrange: a stroke of paint open on map 3.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);
      const stroke = hub.begin('Paint', [ mapHistoryKey(3) ]);
      stroke.set('map:3', [ 'note' ], 'painting');

      // Act.
      hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, CHANGED);
      const whileOpen = heldOn(hub, 7);
      stroke.commit();

      // Assert.
      expect([ whileOpen, heldOn(hub, 7) ])
        .toStrictEqual([ [], [ 'aa22@2,2' ] ]);
    });

    it('makes no change at all when the file changed only for maps holding unsaved placements', () =>
    {
      // Arrange: an unsaved placement on map 16, and the record's lineage before the change.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);
      place(hub, 16, 0);
      const lineage = [ ...hub.lineage(BLUEPRINT_USES_DOCUMENT) ];

      // Act: the file changed for map 16 alone, its roost moved.
      hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, storedUses(ON_DISK.map(spot => (spot.blueprintId === 'k3x9q2mf' ? { ...spot, x: 5 } : spot))));

      // Assert.
      expect([ hub.lineage(BLUEPRINT_USES_DOCUMENT), heldOn(hub, 16) ])
        .toStrictEqual([ lineage, [ 'aa22@0,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ] ]);
    });

    it('never takes a read of the file landing after a newer change was heard over that change', async () =>
    {
      // Arrange: window b's record holds the roost moved; window c takes it over, which sends its keeper to read the file,
      // which the read finds as it was before the move; before the read lands, the move is heard on disk.
      const moved = storedUses(ON_DISK.map(spot => (spot.blueprintId === 'k3x9q2mf' ? { ...spot, x: 5 } : spot)));
      const older = new UsesServer(storedUses(ON_DISK));
      const windowB = windowOver(new UsesServer(moved), { clientId: 'window-b' });
      const hub = new DocumentHub({ clientId: 'window-c', store: mapStore().store });
      hub.adopt('map:16', buildMapJson() as unknown as JsonValue);
      const keeper = new BlueprintUsesKeeper({ hub, api: older.api, holders: () => [], onProblem: () => undefined });
      hub.adoptSnapshot(windowB.hub.snapshot(BLUEPRINT_USES_DOCUMENT));
      hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, moved);
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });
      const file = hub.snapshot('map:16').content;
      await keeper.whenWritten();

      // Act: map 16's version on disk taken, which takes its placements back to what the record's file is known to hold.
      hub.reload('map:16', file);

      // Assert: judged against the newer file, the roost stays where the move put it.
      expect(heldOn(hub, 16))
        .toStrictEqual([ 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@5,7' ]);
    });

    it('follows nothing while the file holds no record of placements, and judges the next change from it', () =>
    {
      // Arrange.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);

      // Act: a file that is no record, then the changed record.
      hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, { schemaVersion: 2, data: { maps: [] } });
      const afterBroken = heldOn(hub, 3);
      hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, CHANGED);

      // Assert: nothing could be told clean against a broken file, so map 3 keeps its camp.
      expect([ afterBroken, heldOn(hub, 3), heldOn(hub, 7) ])
        .toStrictEqual([ [ 'aa22@-1,0' ], [ 'aa22@-1,0' ], [] ]);
    });
  });

  describe('throwing a map\'s edits away', () =>
  {
    it('takes the map\'s placements back to what the record\'s file holds for it, every other map\'s staying', async () =>
    {
      // Arrange: a placement on each map since the window opened.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      const file = hub.snapshot('map:16').content;
      place(hub, 16, 0);
      place(hub, 3, 5);

      // Act: map 16's version on disk taken over its edits.
      hub.reload('map:16', file);
      await keeper.whenWritten();

      // Assert: nothing written, since the disk already holds what map 16's file was written with.
      expect([ heldOn(hub, 16), heldOn(hub, 3), server.merges ])
        .toStrictEqual([ [ 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ], [ 'aa22@-1,0', 'aa22@5,0' ], [] ]);
    });

    it('brings back a placement saved with the map, though an undo took it out and a later edit dropped its redo', async () =>
    {
      // Arrange: a placement saved with map 16, undone, and the map renamed since.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper } = windowOver(server);
      place(hub, 16, 0);
      await hub.save('map:16');
      await keeper.whenWritten();
      const file = hub.snapshot('map:16').content;
      hub.undo(mapHistoryKey(16));
      hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));

      // Act.
      hub.reload('map:16', file);

      // Assert.
      expect(heldOn(hub, 16))
        .toStrictEqual([ 'aa22@0,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ]);
    });

    it('keeps a placement forgotten while the map held unsaved edits forgotten, and one whose forgetting was undone back', () =>
    {
      // Arrange: a placement on map 16 since it was opened; one placement forgotten, and another forgotten and put back.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);
      const file = hub.snapshot('map:16').content;
      place(hub, 16, 0);
      forgetPlacement(hub, { id: 'aa22', name: 'Goblin camp' }, { blueprintId: 'aa22', mapId: 16, x: 12, y: 3 });
      forgetPlacement(hub, { id: 'k3x9q2mf', name: 'Bat roost' }, { blueprintId: 'k3x9q2mf', mapId: 16, x: 4, y: 7 });
      hub.undo(blueprintHistoryKey('k3x9q2mf'));

      // Act.
      hub.reload('map:16', file);

      // Assert.
      expect(heldOn(hub, 16))
        .toStrictEqual([ 'aa22@1,3', 'k3x9q2mf@4,7' ]);
    });

    it('makes no change for a map whose placements are what the file holds, nor for a document that is no map', () =>
    {
      // Arrange: map 16 renamed alone, and the tilesets held.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);
      hub.adopt('tilesets', [ null ]);
      const file = hub.snapshot('map:16').content;
      hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));
      const lineage = [ ...hub.lineage(BLUEPRINT_USES_DOCUMENT) ];

      // Act.
      hub.reload('map:16', file);
      hub.reload('tilesets', [ null ]);

      // Assert.
      expect(hub.lineage(BLUEPRINT_USES_DOCUMENT))
        .toStrictEqual(lineage);
    });

    it('leaves the map\'s placements as they are while what the record\'s file holds is not known', () =>
    {
      // Arrange: the file turned into something that is no record, then a placement.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub } = windowOver(server);
      const file = hub.snapshot('map:16').content;
      hub.applyOutsideContent(BLUEPRINT_USES_DOCUMENT, 'broken');
      place(hub, 16, 0);

      // Act.
      hub.reload('map:16', file);

      // Assert.
      expect(heldOn(hub, 16))
        .toStrictEqual([ 'aa22@0,0', 'aa22@1,3', 'aa22@12,3', 'k3x9q2mf@4,7' ]);
    });
  });

  describe('writing', () =>
  {
    it('tells the author when the placements could not be saved, and tries them again with the next save', async () =>
    {
      // Arrange: the first merge fails.
      const server = new UsesServer(storedUses(ON_DISK));
      const { hub, keeper, problems } = windowOver(server);
      server.failNext = new Error('the disk is full');
      place(hub, 16, 0);
      await hub.save('map:16');
      await keeper.whenWritten();
      const afterFailing = server.entryOf(16);

      // Act: map 3 placed on and saved.
      place(hub, 3, 5);
      await hub.save('map:3');
      await keeper.whenWritten();

      // Assert: the failed map went with the next merge.
      expect([ problems, afterFailing, Object.keys(server.merges[1].maps ?? {}), server.entryOf(16) ])
        .toStrictEqual([
          [ 'The blueprint placements could not be saved: the disk is full. They are tried again with the next save.' ],
          { aa22: [ { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
          [ '3', '16' ],
          { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] },
        ]);
    });

    it('reads the record\'s file for itself when it takes the record up from another window, whose copy holds unsaved placements', async () =>
    {
      // Arrange: window b places on map 16; window c, keeping the record from the start, takes up b's copies of the map
      // and of the record, as opening them does, and the read of the file lands.
      const server = new UsesServer(storedUses(ON_DISK));
      const windowB = windowOver(server, { clientId: 'window-b' });
      place(windowB.hub, 16, 0);
      const hub = new DocumentHub({ clientId: 'window-c', store: mapStore().store });
      const keeper = new BlueprintUsesKeeper({ hub, api: server.api, holders: () => [], onProblem: () => undefined });
      hub.adoptSnapshot(windowB.hub.snapshot('map:16'));
      hub.adoptSnapshot(windowB.hub.snapshot(BLUEPRINT_USES_DOCUMENT));
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });

      // Act: window c saves the map, b's placement in it.
      await hub.save('map:16');
      await keeper.whenWritten();

      // Assert: the placement is written, the file having been read rather than taken from b's copy, which held it already.
      expect(server.entryOf(16))
        .toStrictEqual({ aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 }, { x: 12, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] });
    });
  });

  describe('a project with no record yet', () =>
  {
    it('starts no file for a save of a map with no placements, and the first placement saved starts it', async () =>
    {
      // Arrange: the record already held when the keeper starts, so it reads the file for itself, and there is none.
      const server = new UsesServer();
      const hub = new DocumentHub({ clientId: 'window-a', store: mapStore().store });
      hub.adopt('map:16', buildMapJson() as unknown as JsonValue);
      hub.adopt(BLUEPRINT_USES_DOCUMENT, storedUses());
      const keeper = new BlueprintUsesKeeper({ hub, api: server.api, holders: () => [], onProblem: () => undefined });
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });
      hub.edit('Rename', [ mapHistoryKey(16) ], tx => tx.set('map:16', [ 'displayName' ], 'Harbor'));
      await hub.save('map:16');
      await keeper.whenWritten();
      const afterRename = server.stored;

      // Act.
      place(hub, 16, 0);
      await hub.save('map:16');
      await keeper.whenWritten();

      // Assert: no file for the rename, which had nothing to record, and one for the placement.
      expect([ afterRename, server.stored ])
        .toStrictEqual([ null, { schemaVersion: 2, data: { maps: { 16: { aa22: [ { x: 0, y: 0 } ] } } } } ]);
    });
  });

  describe('records written before placements said their part placed', () =>
  {
    it('reads a record of version 1 as every placement whole, and the next save raises it, the other maps as they were', async () =>
    {
      // Arrange: a record exactly as the editor wrote it then.
      const server = new UsesServer({ schemaVersion: 1, data: { maps: { 1: { k3x9q2mf: [ { x: 22, y: 17 } ] }, 16: { aa22: [ { x: 1, y: 3 } ] } } } });
      const { hub, keeper } = windowOver(server);
      const read = spotsOnMap(hub.document(BLUEPRINT_USES_DOCUMENT), 1);
      place(hub, 16, 0);

      // Act.
      await hub.save('map:16');
      await keeper.whenWritten();

      // Assert.
      expect([ read, server.stored ])
        .toStrictEqual([
          [ { blueprintId: 'k3x9q2mf', x: 22, y: 17 } ],
          { schemaVersion: 2, data: { maps: { 1: { k3x9q2mf: [ { x: 22, y: 17 } ] }, 16: { aa22: [ { x: 0, y: 0 }, { x: 1, y: 3 } ] } } } },
        ]);
    });
  });
});

describe('partChangesOf and moveThrough', () =>
{
  it('reads how a step changed each map\'s placements, first value to last, and moves placements through it either way', () =>
  {
    // Arrange: a step setting map 16's entry twice and map 3's once, beside a patch to a map and one deeper in the record.
    const step = {
      id: 'window-a#1',
      label: 'Move',
      histories: [ mapHistoryKey(16) ],
      origin: 'window-a',
      at: 0,
      entries: [
        { document: 'map:16', patch: { kind: 'set', path: [ 'note' ], before: '', after: 'moved' } },
        { document: BLUEPRINT_USES_DOCUMENT, patch: { kind: 'set', path: [ 'data', 'maps', '16' ], before: { aa22: [ { x: 1, y: 3 } ] }, after: { aa22: [ { x: 2, y: 3 } ] } } },
        { document: BLUEPRINT_USES_DOCUMENT, patch: { kind: 'set', path: [ 'data', 'maps', '3' ], before: undefined, after: { bb11: [ { x: 0, y: 0 } ] } } },
        { document: BLUEPRINT_USES_DOCUMENT, patch: { kind: 'set', path: [ 'data', 'maps', '16' ], before: { aa22: [ { x: 2, y: 3 } ] }, after: { aa22: [ { x: 4, y: 3 } ] } } },
        { document: BLUEPRINT_USES_DOCUMENT, patch: { kind: 'set', path: [ 'data', 'maps', '16', 'aa22' ], before: [], after: [] } },
      ],
    } as HistoryStep;
    const standing = [ { blueprintId: 'aa22', x: 1, y: 3 }, { blueprintId: 'k3x9q2mf', x: 4, y: 7 } ];

    // Act.
    const changes = partChangesOf(step);
    const forward = moveThrough(standing, changes[0], 'forward');
    const back = moveThrough(forward, changes[0], 'backward');

    // Assert.
    expect([ changes, forward, back, moveThrough(standing, undefined, 'forward') ])
      .toStrictEqual([
        [
          { mapId: 16, before: [ { blueprintId: 'aa22', x: 1, y: 3 } ], after: [ { blueprintId: 'aa22', x: 4, y: 3 } ] },
          { mapId: 3, before: [], after: [ { blueprintId: 'bb11', x: 0, y: 0 } ] },
        ],
        [ { blueprintId: 'k3x9q2mf', x: 4, y: 7 }, { blueprintId: 'aa22', x: 4, y: 3 } ],
        [ { blueprintId: 'k3x9q2mf', x: 4, y: 7 }, { blueprintId: 'aa22', x: 1, y: 3 } ],
        standing,
      ]);
  });
});
