import { describe, expect, it, vi } from 'vitest';
import {
  diskOperationId,
  DocumentHub,
  type DocumentStore,
  type HubEvent,
  type RemoteOperation,
} from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { operationFor } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The history core is what makes the editor safe to experiment in, so it owes these things above all.
 *
 * Every step reverses exactly: undo puts every touched document back the way it was, down to array lengths,
 * absent keys and tile cells, and redo puts the step back again.
 *
 * A transaction is one step wherever it lives. A door pair lands in both maps' histories; a blueprint change
 * lands in the blueprint's and in every map with a copy. It undoes from any of them whenever each of its patches
 * still applies, however many unrelated steps came after it on any of those maps, and is refused, naming the
 * later edit, only when that edit changed the same target. The maps' own histories stay coherent around a step
 * undone out of order, and a refused step never leaves a history stuck: it can be forgotten.
 *
 * Saving never touches history. Jeremy: "saving is just saving data, not resetting the undo history." Neither a
 * save nor another window ever sees an edit that is still open, since it may yet be cancelled.
 *
 * And every operation from another window is checked against this window's lineage before it is repeated, so a
 * copy that went elsewhere is announced, never quietly written over.
 *
 * Fixtures carry near-miss siblings (two maps, two events, cells that all differ), so "changed this one" and
 * "changed everything" are different outcomes.
 */
describe('DocumentHub', () =>
{
  const MAP_A: DocumentKey = 'map:1';
  const MAP_B: DocumentKey = 'map:2';
  const BLUEPRINTS: DocumentKey = 'editor-data:blueprints';

  /**
   * A store over in-memory files, recording every save.
   * @returns {{ store: DocumentStore, files: Map<DocumentKey, JsonValue>, saves: [ DocumentKey, JsonValue ][] }} The store and its state.
   */
  const buildStore = () =>
  {
    const files = new Map<DocumentKey, JsonValue>([
      [ MAP_A, buildMapJson() as unknown as JsonValue ],
      [ MAP_B, buildMapJson() as unknown as JsonValue ],
    ]);
    const saves: [ DocumentKey, JsonValue ][] = [];
    const store: DocumentStore = {
      load: async (key) => structuredClone(files.get(key) as JsonValue),
      save: async (key, content) =>
      {
        saves.push([ key, content ]);
        files.set(key, structuredClone(content));
      },
    };

    return { store, files, saves };
  };

  /**
   * A hub holding both fixture maps and an empty blueprints document.
   * @param {DocumentStore} store Optional store.
   * @param {string} clientId The window's id; every window has its own.
   * @returns {DocumentHub} The hub.
   */
  const buildHub = (store?: DocumentStore, clientId = 'window-a'): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId, store, now: () => 1000 });
    hub.adopt(MAP_A, buildMapJson() as unknown as JsonValue);
    hub.adopt(MAP_B, buildMapJson() as unknown as JsonValue);
    hub.adopt(BLUEPRINTS, { schemaVersion: 1, data: { blueprints: [ { id: 'guard', sight: 4 } ] } });
    return hub;
  };

  /**
   * Reads a map's file shape.
   * @param {DocumentHub} hub The hub.
   * @param {DocumentKey} key The map.
   * @returns {RmmzMap} The map file.
   */
  const fileOf = (hub: DocumentHub, key: DocumentKey): RmmzMap => hub.document(key).toJson() as unknown as RmmzMap;

  /**
   * Repeats every operation one hub makes in another, the way the sync peer does.
   * @param {DocumentHub} from The hub making operations.
   * @param {DocumentHub} to The hub repeating them.
   * @returns {() => void} Stops repeating.
   */
  const mirror = (from: DocumentHub, to: DocumentHub) => from.subscribe(event =>
  {
    const operation = 'source' in event && event.source === 'local'
      ? operationFor(event, from.clientId)
      : null;
    if (operation !== null)
    {
      to.applyRemote(structuredClone(operation));
    }
  });

  /**
   * Records the same change to a blueprint's copies on both maps as one step in all three histories, the way a
   * blueprint change propagates.
   * @param {DocumentHub} hub The hub.
   * @returns {HistoryStep} The step.
   */
  const propagateBlueprint = (hub: DocumentHub): HistoryStep => hub.edit(
    'Raise guard sight',
    [ blueprintHistoryKey('guard'), mapHistoryKey(1), mapHistoryKey(2) ],
    tx =>
    {
      tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 5);
      tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)');
      tx.set(MAP_B, [ 'events', 3, 'name' ], 'Guard (sight 5)');
    },
  ) as HistoryStep;

  describe('editing', () =>
  {
    it('records an edit as one named step in the history it names', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ step?.id, step?.label, step?.histories, step?.origin, step?.at, hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ 'window-a#1', 'Rename map', [ 'map:1' ], 'window-a', 1000, [ { id: 'window-a#1', label: 'Rename map', done: true } ] ]);
    });

    it('changes only the document the edit addressed', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ fileOf(hub, MAP_A).displayName, fileOf(hub, MAP_B).displayName, hub.isDirty(MAP_A), hub.isDirty(MAP_B) ])
        .toStrictEqual([ 'Harbor', 'Test Town', true, false ]);
    });

    it('records nothing for an edit that changes nothing', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = hub.edit('Rename map', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Test Town'));

      // Assert.
      expect([ step, hub.history(mapHistoryKey(1)).rows.length, hub.isDirty(MAP_A) ])
        .toStrictEqual([ null, 0, false ]);
    });

    it('puts everything back when the edit throws partway', () =>
    {
      // Arrange.
      const hub = buildHub();
      const before = fileOf(hub, MAP_A);

      // Act.
      const run = () => hub.edit('Broken', [ mapHistoryKey(1) ], tx =>
      {
        tx.set(MAP_A, [ 'displayName' ], 'Half done');
        throw new Error('the builder failed');
      });

      // Assert.
      expect(run)
        .toThrow('the builder failed');
      expect([ fileOf(hub, MAP_A), hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ before, 0 ]);
    });

    it('shows a transaction live and takes it all back on cancel', () =>
    {
      // Arrange.
      const hub = buildHub();
      const before = fileOf(hub, MAP_A);
      const transaction = hub.begin('Paint', [ mapHistoryKey(1) ]);

      // Act.
      transaction.tiles(MAP_A, [ [ 0, 900 ], [ 1, 901 ] ]);
      const [ midStroke ] = hub.map('map:1').cells;
      transaction.cancel();

      // Assert.
      expect([ midStroke, fileOf(hub, MAP_A), hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ 900, before, 0 ]);
    });

    it('refuses an edit that names no history, or one on a document the window does not hold', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const attempts = [ () => hub.begin('Orphan', []), () => hub.begin('Elsewhere', [ mapHistoryKey(9) ]) ];

      // Assert.
      expect(attempts[0])
        .toThrow(/names no history/u);
      expect(attempts[1])
        .toThrow(/open map:9/u);
    });

    it('refuses a second edit while one is open', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.begin('First', [ mapHistoryKey(1) ]);

      // Act.
      const second = () => hub.begin('Second', [ mapHistoryKey(1) ]);

      // Assert.
      expect(second)
        .toThrow(/finish "First" first/u);
    });

    it('refuses to change a transaction after it is committed', () =>
    {
      // Arrange.
      const hub = buildHub();
      const transaction = hub.begin('Rename', [ mapHistoryKey(1) ]);
      transaction.set(MAP_A, [ 'displayName' ], 'X');
      transaction.commit();

      // Act.
      const late = () => transaction.set(MAP_A, [ 'displayName' ], 'Y');

      // Assert.
      expect(late)
        .toThrow(/already finished/u);
    });

    it('refuses a tile edit on a document without tiles', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.adopt('mapinfos', [ null ]);

      // Act.
      const run = () => hub.edit('Paint the tree', [ 'tree' ], tx => tx.tiles('mapinfos', [ [ 0, 1 ] ]));

      // Assert.
      expect(run)
        .toThrow(/has no tiles/u);
    });
  });

  describe('file effects', () =>
  {
    /**
     * A hub holding the map tree, whose steps create and remove whole map files.
     * @param {DocumentStore} store The store, to prove nothing is written through it.
     * @returns {DocumentHub} The hub.
     */
    const buildTreeHub = (store?: DocumentStore): DocumentHub =>
    {
      const hub = new DocumentHub({ clientId: 'window-a', store, now: () => 1000 });
      hub.adopt('mapinfos', [ null, { id: 1, expanded: false, name: 'Harbor', order: 1, parentId: 0, scrollX: 0, scrollY: 0 } ]);
      return hub;
    };

    const ROW = { id: 2, expanded: false, name: 'MAP002', order: 2, parentId: 0, scrollX: 0, scrollY: 0 };

    it('carries the files a step records, copied, beside its patches, and writes none of them', () =>
    {
      // Arrange.
      const { store, saves } = buildStore();
      const hub = buildTreeHub(store);
      const created = buildMapJson() as unknown as JsonValue;

      // Act.
      const step = hub.edit('Create map', [ 'tree' ], tx =>
      {
        tx.set('mapinfos', [ 2 ], ROW);
        tx.file('map:2', null, created);
      }) as HistoryStep;
      (created as { displayName: string }).displayName = 'changed after the step';

      // Assert: the step holds the file as it was recorded, and the store heard nothing.
      const [ file ] = step.files ?? [];
      expect([ step.files?.length, file.document, file.before, (file.after as { displayName: string }).displayName ])
        .toStrictEqual([ 1, 'map:2', null, 'Test Town' ]);
      expect(saves)
        .toStrictEqual([]);
    });

    it('leaves a step without files exactly its old shape', () =>
    {
      // Arrange.
      const hub = buildTreeHub();

      // Act.
      const step = hub.edit('Rename map', [ 'tree' ], tx => tx.set('mapinfos', [ 1, 'name' ], 'Port')) as HistoryStep;

      // Assert.
      expect(Object.keys(step))
        .toStrictEqual([ 'id', 'label', 'histories', 'entries', 'origin', 'at' ]);
    });

    it('undoes and redoes a step with files without holding the documents the files back', () =>
    {
      // Arrange: the map the file backs is not held here, and never will be.
      const hub = buildTreeHub();
      hub.edit('Create map', [ 'tree' ], tx =>
      {
        tx.set('mapinfos', [ 2 ], ROW);
        tx.file('map:2', null, buildMapJson() as unknown as JsonValue);
      });

      // Act.
      const undone = hub.undo('tree');
      const afterUndo = hub.document('mapinfos').toJson();
      const redone = hub.redo('tree');

      // Assert.
      expect([ undone.ok, redone.ok, hub.has('map:2') ])
        .toStrictEqual([ true, true, false ]);
      expect([ afterUndo, (hub.document('mapinfos').toJson() as JsonValue[]).length ])
        .toStrictEqual([ [ null, { id: 1, expanded: false, name: 'Harbor', order: 1, parentId: 0, scrollX: 0, scrollY: 0 } ], 3 ]);
    });

    it('hands a step\'s files to another window with the step', () =>
    {
      // Arrange.
      const mine = buildTreeHub();
      const theirs = buildTreeHub();
      const stop = mirror(mine, theirs);

      // Act.
      mine.edit('Delete map', [ 'tree' ], tx =>
      {
        tx.set('mapinfos', [ 1 ], null);
        tx.file('map:1', buildMapJson() as unknown as JsonValue, null);
      });
      stop();

      // Assert.
      const [ row ] = theirs.history('tree').rows;
      const canUndo = theirs.canUndo('tree');
      expect([ row.label, canUndo.ok && canUndo.step.files?.[0].document, canUndo.ok && canUndo.step.files?.[0].after ])
        .toStrictEqual([ 'Delete map', 'map:1', null ]);
    });

    it('refuses a file on a finished transaction', () =>
    {
      // Arrange.
      const hub = buildTreeHub();
      const transaction = hub.begin('Rename', [ 'tree' ]);
      transaction.set('mapinfos', [ 1, 'name' ], 'Port');
      transaction.commit();

      // Act.
      const late = () => transaction.file('map:1', null, null);

      // Assert.
      expect(late)
        .toThrow(/already finished/u);
    });
  });

  describe('undo and redo', () =>
  {
    it('reverses every kind of patch exactly, then puts each back', () =>
    {
      // Arrange.
      const hub = buildHub();
      const original = fileOf(hub, MAP_A);
      const history = mapHistoryKey(1);
      hub.edit('Paint', [ history ], tx => tx.tiles(MAP_A, [ [ 3, 400 ], [ 30, 401 ] ]));
      hub.edit('Place event', [ history ], tx => tx.apply(MAP_A, hub.map('map:1').placeEventPatch(createMapEvent(8, 1, 1))));
      hub.edit('Add a command', [ history ], tx => tx.splice(MAP_A, [ 'events', 1, 'pages', 0, 'list' ], 0, 0, [ { code: 101, indent: 0, parameters: [ '', 0, 0, 2, '' ] } ]));
      hub.edit('Tag the map', [ history ], tx => tx.set(MAP_A, [ 'meta' ], {}));
      hub.edit('Resize', [ history ], tx => tx.resize(MAP_A, { width: 1, height: 1, data: [ 7, 7, 7, 7, 7, 7 ] }));
      const edited = fileOf(hub, MAP_A);

      // Act.
      const undone = [ 1, 2, 3, 4, 5 ].map(() => hub.undo(history).ok);
      const afterUndo = fileOf(hub, MAP_A);
      const redone = [ 1, 2, 3, 4, 5 ].map(() => hub.redo(history).ok);

      // Assert.
      expect([ undone, afterUndo, redone, fileOf(hub, MAP_A) ])
        .toStrictEqual([ [ true, true, true, true, true ], original, [ true, true, true, true, true ], edited ]);
    });

    it('says there is nothing to undo or redo on an empty history', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const results = [ hub.undo(mapHistoryKey(1)), hub.redo(mapHistoryKey(1)) ];

      // Assert.
      expect(results)
        .toStrictEqual([
          { ok: false, reason: 'nothing', historyKey: 'map:1' },
          { ok: false, reason: 'nothing', historyKey: 'map:1' },
        ]);
    });

    it('undoes a door pair as one step from either map', () =>
    {
      // Arrange: the same pair, placed in two hubs, to be undone from a different side in each.
      const hubs = [ buildHub(), buildHub() ];
      const original = [ fileOf(hubs[0], MAP_A), fileOf(hubs[0], MAP_B) ];
      hubs.forEach(hub => hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      }));

      // Act.
      const undone = [ hubs[0].undo(mapHistoryKey(1)).ok, hubs[1].undo(mapHistoryKey(2)).ok ];

      // Assert: both maps restored in both hubs, and both histories agree the pair is undone.
      expect([
        undone,
        hubs.map(hub => [ fileOf(hub, MAP_A), fileOf(hub, MAP_B) ]),
        hubs.map(hub => [ hub.history(mapHistoryKey(1)).position, hub.history(mapHistoryKey(2)).position ]),
      ])
        .toStrictEqual([ [ true, true ], [ original, original ], [ [ 0, 0 ], [ 0, 0 ] ] ]);
    });

    it('undoes a door pair even after an unrelated edit on the other map', () =>
    {
      // Arrange: painting on map 2 after the pair touches none of the pair's targets.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      });
      hub.edit('Paint cave', [ mapHistoryKey(2) ], tx => tx.tiles(MAP_B, [ [ 0, 800 ] ]));

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert: the pair is gone from both maps, the painting stays.
      expect([ result.ok, fileOf(hub, MAP_A).events[1]?.name, fileOf(hub, MAP_B).events[3]?.name, fileOf(hub, MAP_B).data[0] ])
        .toStrictEqual([ true, 'Door', 'Chest', 800 ]);
    });

    it('rolls a blueprint change back on every map from the blueprint, however much each map moved on', () =>
    {
      // Arrange: after the change, both maps get unrelated edits of their own.
      const hub = buildHub();
      propagateBlueprint(hub);
      hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 5, 600 ] ]));
      hub.edit('Retitle cave', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Cave'));

      // Act.
      const result = hub.undo(blueprintHistoryKey('guard'));

      // Assert.
      expect([
        result.ok,
        hub.document(BLUEPRINTS).valueAt([ 'data', 'blueprints', 0, 'sight' ]),
        fileOf(hub, MAP_A).events[1]?.name,
        fileOf(hub, MAP_B).events[3]?.name,
        fileOf(hub, MAP_A).data[5],
        fileOf(hub, MAP_B).displayName,
      ])
        .toStrictEqual([ true, 4, 'Door', 'Chest', 600, 'Cave' ]);
    });

    it('keeps each map\'s own history coherent around the change undone out of order', () =>
    {
      // Arrange.
      const hub = buildHub();
      propagateBlueprint(hub);
      hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 5, 600 ] ]));
      hub.undo(blueprintHistoryKey('guard'));

      // Act: map 1's own undo takes its own newest step, then its redo brings both back in order.
      const rowsAfterBlueprintUndo = hub.history(mapHistoryKey(1)).rows.map(row => `${row.label}:${row.done}`);
      const undone = hub.undo(mapHistoryKey(1));
      const redone = [ hub.redo(mapHistoryKey(1)), hub.redo(mapHistoryKey(1)) ].map(result => result.ok && result.step.label);

      // Assert.
      expect([
        rowsAfterBlueprintUndo,
        undone.ok && undone.step.label,
        redone,
        fileOf(hub, MAP_A).events[1]?.name,
        fileOf(hub, MAP_A).data[5],
        hub.history(blueprintHistoryKey('guard')).position,
      ])
        .toStrictEqual([
          [ 'Paint town:true', 'Raise guard sight:false' ],
          'Paint town',
          [ 'Paint town', 'Raise guard sight' ],
          'Guard (sight 5)',
          600,
          1,
        ]);
    });

    it('keeps a change redoable from the blueprint after a map it touched records something new', () =>
    {
      // Arrange.
      const hub = buildHub();
      propagateBlueprint(hub);
      hub.undo(blueprintHistoryKey('guard'));

      // Act: map 1 moves on, which drops the change from map 1's redo list only.
      hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 5, 600 ] ]));
      const mapRedo = hub.redo(mapHistoryKey(1)).ok;
      const blueprintRedo = hub.redo(blueprintHistoryKey('guard'));

      // Assert: redone from the blueprint, on both maps, and newest in map 1's history.
      expect([
        mapRedo,
        blueprintRedo.ok,
        fileOf(hub, MAP_A).events[1]?.name,
        fileOf(hub, MAP_B).events[3]?.name,
        hub.history(mapHistoryKey(1)).rows.map(row => `${row.label}:${row.done}`),
      ])
        .toStrictEqual([ false, true, 'Guard (sight 5)', 'Guard (sight 5)', [ 'Paint town:true', 'Raise guard sight:true' ] ]);
    });

    it('refuses, naming the later edit, when that edit changed the same target, and changes nothing', () =>
    {
      // Arrange: the change's patch on map 1 reverses last, so the refusal must put the others back too.
      const hub = buildHub();
      propagateBlueprint(hub);
      hub.edit('Rename guard', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Captain'));
      hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 5, 600 ] ]));
      const before = [ fileOf(hub, MAP_A), fileOf(hub, MAP_B), hub.document(BLUEPRINTS).toJson() ];

      // Act.
      const result = hub.undo(blueprintHistoryKey('guard'));

      // Assert.
      expect([
        result.ok,
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        [ fileOf(hub, MAP_A), fileOf(hub, MAP_B), hub.document(BLUEPRINTS).toJson() ],
        hub.history(blueprintHistoryKey('guard')).position,
      ])
        .toStrictEqual([ false, 'conflict', 'Rename guard', before, 1 ]);
    });

    it('names no blocker when nothing recorded explains the change underneath', () =>
    {
      // Arrange: the target changed behind the hub's back.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      hub.document(MAP_A).apply({ kind: 'set', path: [ 'displayName' ], before: 'Harbor', after: 'Elsewhere' });

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ result.ok, result.ok === false && 'blockedBy' in result && result.blockedBy ])
        .toStrictEqual([ false, null ]);
    });

    it('names the later edit that blocks a redo', () =>
    {
      // Arrange: after the rename is undone, another history renames the same event.
      const hub = buildHub();
      hub.edit('Rename in map', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard'));
      hub.undo(mapHistoryKey(1));
      hub.edit('Rename in event', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Sentry'));

      // Act.
      const result = hub.redo(mapHistoryKey(1));

      // Assert.
      expect([ result.ok, result.ok === false && 'blockedBy' in result && result.blockedBy?.label, fileOf(hub, MAP_A).events[1]?.name ])
        .toStrictEqual([ false, 'Rename in event', 'Sentry' ]);
    });

    it('lets a blocked history go on past the step once it is forgotten', () =>
    {
      // Arrange: the event window's rename is blocked by the map's delete, which the author wants to keep.
      const hub = buildHub();
      hub.edit('Retitle', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const blocked = hub.edit('Rename event', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard')) as HistoryStep;
      hub.edit('Delete event', [ mapHistoryKey(1) ], tx => tx.apply(MAP_A, hub.map('map:1').removeEventPatch(1)));
      const stuck = hub.undo(eventHistoryKey(1, 1)).ok;

      // Act.
      const forgotten = hub.forgetStep(blocked.id);
      const next = hub.undo(eventHistoryKey(1, 1));

      // Assert: the older step undoes; the forgotten one leaves the history and the deleted event stays deleted.
      expect([ stuck, forgotten, next.ok && next.step.label, fileOf(hub, MAP_A).displayName, fileOf(hub, MAP_A).events[1], hub.history(eventHistoryKey(1, 1)).rows.length ])
        .toStrictEqual([ false, true, 'Retitle', 'Test Town', null, 1 ]);
    });

    it('forgets nothing it does not know', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const forgotten = hub.forgetStep('window-z#9');

      // Assert.
      expect(forgotten)
        .toBe(false);
    });

    it('lets two histories on one map undo independently when they touched different data', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Rename event', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard'));
      hub.edit('Move event', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'events', 1, 'x' ], 2));

      // Act.
      const result = hub.undo(eventHistoryKey(1, 1));

      // Assert.
      expect([ result.ok, fileOf(hub, MAP_A).events[1]?.name, fileOf(hub, MAP_A).events[1]?.x ])
        .toStrictEqual([ true, 'Door', 2 ]);
    });

    it('refuses to undo a transaction while one of its maps is not held', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      });
      hub.release(MAP_B);

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ result.ok, result.ok === false && result.reason, result.ok === false && 'documents' in result && result.documents ])
        .toStrictEqual([ false, 'missing-documents', [ 'map:2' ] ]);
    });

    it('drops a step nobody can redo any more, and keeps one that some history still can', () =>
    {
      // Arrange: one single-history step and one pair, both undone.
      const hub = buildHub();
      const single = hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 0, 5 ] ])) as HistoryStep;
      hub.undo(mapHistoryKey(1));
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'note' ], 'paired');
        tx.set(MAP_B, [ 'note' ], 'paired');
      });
      hub.undo(mapHistoryKey(1));
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.edit('Retitle town', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'X'));

      // Assert: the pair is still redoable from map 2; nothing was dropped entirely.
      expect([ events.map(event => event.type), hub.redo(mapHistoryKey(2)).ok, single.label ])
        .toStrictEqual([ [ 'committed' ], true, 'Paint town' ]);
    });

    it('drops a step entirely once its only history records something new', () =>
    {
      // Arrange.
      const hub = buildHub();
      const single = hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 0, 5 ] ])) as HistoryStep;
      hub.undo(mapHistoryKey(1));
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.edit('Retitle town', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'X'));

      // Assert.
      expect([ events[0], events[1].type, hub.forgetStep(single.id) ])
        .toStrictEqual([ { type: 'discarded', stepIds: [ single.id ] }, 'committed', false ]);
    });

    it('refuses to undo while an edit is open', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'X'));
      hub.begin('Paint', [ mapHistoryKey(1) ]);

      // Act.
      const undo = () => hub.undo(mapHistoryKey(1));

      // Assert.
      expect(undo)
        .toThrow(/finish "Paint" first/u);
    });
  });

  describe('jumpTo', () =>
  {
    /**
     * A hub with three steps on map A.
     * @returns {{ hub: DocumentHub, ids: string[] }} The hub and the step ids, oldest first.
     */
    const buildThreeSteps = () =>
    {
      const hub = buildHub();
      const ids = [ 'One', 'Two', 'Three' ].map(name =>
        hub.edit(name, [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], name))?.id as string);
      return { hub, ids };
    };

    it('jumps back to just after an earlier step', () =>
    {
      // Arrange.
      const { hub, ids } = buildThreeSteps();

      // Act.
      const result = hub.jumpTo(mapHistoryKey(1), ids[0]);

      // Assert.
      expect([ result.ok, fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).position ])
        .toStrictEqual([ true, 'One', 1 ]);
    });

    it('jumps back to before the first step', () =>
    {
      // Arrange.
      const { hub } = buildThreeSteps();

      // Act.
      const result = hub.jumpTo(mapHistoryKey(1), null);

      // Assert.
      expect([ result.ok, fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).position ])
        .toStrictEqual([ true, 'Test Town', 0 ]);
    });

    it('jumps forward to an undone step', () =>
    {
      // Arrange.
      const { hub, ids } = buildThreeSteps();
      hub.jumpTo(mapHistoryKey(1), null);

      // Act.
      const result = hub.jumpTo(mapHistoryKey(1), ids[1]);

      // Assert.
      expect([ result.ok, fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).position ])
        .toStrictEqual([ true, 'Two', 2 ]);
    });

    it('says nothing is there for a step the history does not hold', () =>
    {
      // Arrange.
      const { hub } = buildThreeSteps();

      // Act.
      const results = [ hub.jumpTo(mapHistoryKey(1), 'window-z#1').ok, hub.jumpTo(mapHistoryKey(2), null).ok ];

      // Assert.
      expect(results)
        .toStrictEqual([ false, false ]);
    });

    it('stops at the first step that cannot move', () =>
    {
      // Arrange: the newest step is blocked by a later edit in another history.
      const hub = buildHub();
      const first = hub.edit('Retitle', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'one'));
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'One'));
      hub.edit('Rename again', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Two'));

      // Act.
      const result = hub.jumpTo(mapHistoryKey(1), first?.id as string);

      // Assert.
      expect([ result.ok, result.ok === false && result.reason, hub.history(mapHistoryKey(1)).position ])
        .toStrictEqual([ false, 'conflict', 2 ]);
    });
  });

  describe('history view', () =>
  {
    it('lists done steps oldest first, then undone steps in redo order', () =>
    {
      // Arrange.
      const hub = buildHub();
      [ 'One', 'Two', 'Three' ].forEach(name => hub.edit(name, [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], name)));

      // Act.
      hub.undo(mapHistoryKey(1));
      hub.undo(mapHistoryKey(1));
      const view = hub.history(mapHistoryKey(1));

      // Assert.
      expect([ view.rows.map(row => `${row.label}:${row.done}`), view.position ])
        .toStrictEqual([ [ 'One:true', 'Two:false', 'Three:false' ], 1 ]);
    });
  });

  describe('saving', () =>
  {
    it('writes the exact file and comes back clean', async () =>
    {
      // Arrange.
      const { store, saves } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Act.
      await hub.save(MAP_A);

      // Assert.
      expect([ saves, hub.isDirty(MAP_A) ])
        .toStrictEqual([ [ [ MAP_A, fileOf(hub, MAP_A) ] ], false ]);
    });

    it('never writes an edit that is still open', async () =>
    {
      // Arrange: a stroke in progress when the save starts.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const transaction = hub.begin('Paint', [ mapHistoryKey(1) ]);
      transaction.tiles(MAP_A, [ [ 0, 999 ] ]);
      transaction.set(MAP_A, [ 'note' ], 'draft');

      // Act.
      await hub.save(MAP_A);
      transaction.cancel();

      // Assert: the file holds the committed rename and none of the cancelled draft, and the map is clean.
      const saved = files.get(MAP_A) as unknown as RmmzMap;
      expect([ saved.displayName, saved.data[0], saved.note, hub.isDirty(MAP_A), fileOf(hub, MAP_A) ])
        .toStrictEqual([ 'Harbor', 1, '', false, saved ]);
    });

    it('never touches history', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      const hub = buildHub(store);
      hub.edit('One', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'One'));
      hub.edit('Two', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Two'));
      hub.undo(mapHistoryKey(1));
      const before = hub.history(mapHistoryKey(1));

      // Act.
      await hub.save(MAP_A);

      // Assert.
      expect(hub.history(mapHistoryKey(1)))
        .toStrictEqual(before);
    });

    it('still undoes after a save, dirty again, and clean again on redoing to the saved point', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      await hub.save(MAP_A);

      // Act.
      const undone = hub.undo(mapHistoryKey(1)).ok;
      const dirtyAfterUndo = hub.isDirty(MAP_A);
      hub.redo(mapHistoryKey(1));

      // Assert.
      expect([ undone, dirtyAfterUndo, fileOf(hub, MAP_A).displayName, hub.isDirty(MAP_A) ])
        .toStrictEqual([ true, true, 'Harbor', false ]);
    });

    it('keeps edits made while a save was in flight unsaved', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      let release: () => void = () => undefined;
      const slowStore: DocumentStore = {
        load: store.load,
        save: (key, content) => new Promise<void>(resolve =>
        {
          release = () => store.save(key, content).then(resolve);
        }),
      };
      const hub = buildHub(slowStore);
      hub.edit('One', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'One'));

      // Act.
      const saving = hub.save(MAP_A);
      hub.edit('Two', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Two'));
      release();
      await saving;

      // Assert.
      expect(hub.isDirty(MAP_A))
        .toBe(true);
    });

    it('stays dirty when the write fails, and refuses without a store', async () =>
    {
      // Arrange.
      const failing: DocumentStore = { load: async () => null, save: async () => Promise.reject(new Error('disk full')) };
      const hub = buildHub(failing);
      const storeless = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Act.
      const saving = hub.save(MAP_A);
      const storelessSaving = storeless.save(MAP_A);

      // Assert.
      await expect(saving)
        .rejects.toThrow('disk full');
      await expect(storelessSaving)
        .rejects.toThrow(/no store/u);
      expect([ hub.isDirty(MAP_A), hub.dirtyKeys() ])
        .toStrictEqual([ true, [ MAP_A ] ]);
    });
  });

  describe('external changes', () =>
  {
    /**
     * Changes a map's file behind the hub's back.
     * @param {Map<DocumentKey, JsonValue>} files The files.
     * @param {string} displayName The new name.
     * @returns {RmmzMap} The new file.
     */
    const changeOnDisk = (files: Map<DocumentKey, JsonValue>, displayName: string): RmmzMap =>
    {
      const changed = structuredClone(files.get(MAP_A)) as unknown as RmmzMap;
      changed.displayName = displayName;
      files.set(MAP_A, changed as unknown as JsonValue);
      return changed;
    };

    it('takes the file when the document is clean, and starts its history afresh', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      await hub.save(MAP_A);
      const changed = changeOnDisk(files, 'Changed in MZ');

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).rows, hub.isDirty(MAP_A), hub.lineage(MAP_A) ])
        .toStrictEqual([ 'reloaded', 'Changed in MZ', [], false, [ diskOperationId(changed as unknown as JsonValue) ] ]);
    });

    it('keeps unsaved edits and flags the document with the file\'s content beside them', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const changed = changeOnDisk(files, 'Changed in MZ');
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      const conflict = { kind: 'disk', content: changed };
      expect([ result, fileOf(hub, MAP_A).displayName, hub.conflict(MAP_A), events ])
        .toStrictEqual([ 'conflicted', 'Harbor', conflict, [ { type: 'conflicted', document: MAP_A, conflict } ] ]);
    });

    it('flags a document mid-edit rather than reloading under the open edit', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      changeOnDisk(files, 'Changed in MZ');
      const transaction = hub.begin('Paint', [ mapHistoryKey(1) ]);
      transaction.tiles(MAP_A, [ [ 0, 5 ] ]);

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, hub.isConflicted(MAP_A), fileOf(hub, MAP_A).displayName ])
        .toStrictEqual([ 'conflicted', true, 'Test Town' ]);
    });

    it('does nothing when the file matches what the window holds, and ignores documents it does not hold', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      const hub = buildHub(store);

      // Act.
      const results = [ await hub.handleExternalChange(MAP_A), await hub.handleExternalChange('map:40') ];

      // Assert.
      expect([ results, hub.version(MAP_A) ])
        .toStrictEqual([ [ 'unchanged', 'ignored' ], 1 ]);
    });

    it('clears a conflict on request and keeps the edits', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      changeOnDisk(files, 'x');
      await hub.handleExternalChange(MAP_A);
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.clearConflict(MAP_A);
      hub.clearConflict(MAP_A);

      // Assert.
      expect([ hub.isConflicted(MAP_A), fileOf(hub, MAP_A).displayName, events ])
        .toStrictEqual([ false, 'Harbor', [ { type: 'conflict-cleared', document: MAP_A } ] ]);
    });

    it('drops a transaction from the other map too when one of its maps is reloaded', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'note' ], 'paired');
        tx.set(MAP_B, [ 'note' ], 'paired');
      });
      hub.edit('Paint cave', [ mapHistoryKey(2) ], tx => tx.tiles(MAP_B, [ [ 0, 800 ] ]));

      // Act.
      hub.reload(MAP_A, buildMapJson() as unknown as JsonValue);

      // Assert.
      expect(hub.history(mapHistoryKey(2)).rows.map(row => row.label))
        .toStrictEqual([ 'Paint cave' ]);
    });

    it('never flags a document it does not hold', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      hub.flagConflict('map:40', { kind: 'disk', content: null });

      // Assert.
      expect(hub.conflict('map:40'))
        .toBeNull();
    });
  });

  describe('documents', () =>
  {
    it('loads a document from the store once, then hands back the same one', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      const load = vi.spyOn(store, 'load');
      const hub = new DocumentHub({ clientId: 'window-a', store });

      // Act.
      const first = await hub.load(MAP_B);
      const second = await hub.load(MAP_B);

      // Assert.
      expect([ first === second, load.mock.calls.length, hub.documentKeys() ])
        .toStrictEqual([ true, 1, [ MAP_B ] ]);
    });

    it('starts two windows that load the same file from the same lineage, and a different file from another', () =>
    {
      // Arrange.
      const changed = buildMapJson();
      changed.note = 'changed';
      const hubs = [ new DocumentHub({ clientId: 'a' }), new DocumentHub({ clientId: 'b' }), new DocumentHub({ clientId: 'c' }) ];

      // Act.
      hubs[0].adopt(MAP_A, buildMapJson() as unknown as JsonValue);
      hubs[1].adopt(MAP_A, buildMapJson() as unknown as JsonValue);
      hubs[2].adopt(MAP_A, changed as unknown as JsonValue);

      // Assert.
      expect([ hubs[0].head(MAP_A) === hubs[1].head(MAP_A), hubs[0].head(MAP_A) === hubs[2].head(MAP_A), hubs[0].head('map:9') ])
        .toStrictEqual([ true, false, null ]);
    });

    it('refuses to hand back a document it does not hold, or a non-map as a map', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.adopt('tilesets', [ null ]);

      // Act.
      const attempts = [ () => hub.document('map:9'), () => hub.map('tilesets' as never) ];

      // Assert.
      expect(attempts[0])
        .toThrow(/not open/u);
      expect(attempts[1])
        .toThrow(/not a map/u);
    });

    it('forgets a released document and every history on it', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Rename event', [ eventHistoryKey(2, 3) ], tx => tx.set(MAP_B, [ 'events', 3, 'name' ], 'Crate'));

      // Act.
      hub.release(MAP_B);

      // Assert.
      expect([ hub.has(MAP_B), hub.version(MAP_B), hub.history(eventHistoryKey(2, 3)).rows ])
        .toStrictEqual([ false, -1, [] ]);
    });

    it('hands a document with its histories, lineage and unsaved state to another window intact', () =>
    {
      // Arrange.
      const source = buildHub();
      source.edit('One', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'One'));
      source.edit('Two', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Two'));
      source.undo(mapHistoryKey(1));
      const target = new DocumentHub({ clientId: 'window-b' });

      // Act.
      target.adoptSnapshot(structuredClone(source.snapshot(MAP_A)));
      const lineage = [ ...target.lineage(MAP_A) ];
      const redone = target.redo(mapHistoryKey(1)).ok;

      // Assert.
      expect([ lineage, redone, fileOf(target, MAP_A).displayName, target.isDirty(MAP_A) ])
        .toStrictEqual([ [ ...source.lineage(MAP_A) ], true, 'Two', true ]);
    });

    it('never hands another window an edit that is still open', () =>
    {
      // Arrange: a stroke in progress on the map another window asks for.
      const source = buildHub();
      source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const committed = fileOf(source, MAP_A);
      const transaction = source.begin('Paint', [ mapHistoryKey(1) ]);
      transaction.tiles(MAP_A, [ [ 0, 999 ] ]);
      transaction.resize(MAP_A, { width: 1, height: 1, data: [ 5, 5, 5, 5, 5, 5 ] });
      transaction.set(MAP_A, [ 'note' ], 'draft');

      // Act.
      const snapshot = source.snapshot(MAP_A);
      transaction.cancel();

      // Assert: the copy handed over is the committed map, whatever the stroke did.
      expect([ snapshot.content, fileOf(source, MAP_A) ])
        .toStrictEqual([ committed, committed ]);
    });

    it('never hands over an open edit to a tree or editor-only document either', () =>
    {
      // Arrange.
      const source = buildHub();
      const transaction = source.begin('Raise sight', [ blueprintHistoryKey('guard') ]);
      transaction.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 9);
      transaction.splice(BLUEPRINTS, [ 'data', 'blueprints' ], 1, 0, [ { id: 'draft' } ]);

      // Act.
      const snapshot = source.snapshot(BLUEPRINTS);

      // Assert.
      expect(snapshot.content)
        .toStrictEqual({ schemaVersion: 1, data: { blueprints: [ { id: 'guard', sight: 4 } ] } });
    });
  });

  describe('applyRemote', () =>
  {
    it('repeats another window\'s steps, undos, redos, forgets and saves', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      mirror(source, target);

      // Act.
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      source.undo(mapHistoryKey(1));
      const afterUndo = fileOf(target, MAP_A).displayName;
      source.redo(mapHistoryKey(1));
      target.applyRemote({ type: 'saved', origin: 'window-a', document: MAP_A, marker: [ step.id ] });
      source.forgetStep(step.id);

      // Assert.
      expect([ afterUndo, fileOf(target, MAP_A).displayName, target.isDirty(MAP_A), target.history(mapHistoryKey(1)).rows, target.lineage(MAP_A) ])
        .toStrictEqual([ 'Test Town', 'Harbor', false, [], [ ...source.lineage(MAP_A) ] ]);
    });

    it('announces a step made against a head this copy does not have, and changes nothing', () =>
    {
      // Arrange: the target's copy moved on by itself.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      target.edit('Local', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'mine'));
      const operations: RemoteOperation[] = [];
      source.subscribe(event => operations.push(operationFor(event, 'window-a') as RemoteOperation));
      source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const events: HubEvent[] = [];
      target.subscribe(event => events.push(event));

      // Act.
      target.applyRemote(structuredClone(operations[0]));

      // Assert.
      expect([ fileOf(target, MAP_A).displayName, events ])
        .toStrictEqual([ 'Test Town', [ { type: 'out-of-sync', documents: [ MAP_A ], origin: 'window-a' } ] ]);
    });

    it('announces an undo of a step this window has never seen, when it names a document held here', () =>
    {
      // Arrange.
      const target = buildHub(undefined, 'window-b');
      const events: HubEvent[] = [];
      target.subscribe(event => events.push(event));

      // Act.
      target.applyRemote({ type: 'undo', origin: 'window-a', opId: 'window-a#9', stepId: 'window-a#5', bases: { [MAP_A]: 'x', 'map:40': 'y' } });
      target.applyRemote({ type: 'redo', origin: 'window-a', opId: 'window-a#10', stepId: 'window-a#6', bases: { 'map:40': 'y' } });

      // Assert: the first names a held map; the second names only a map this window does not hold.
      expect(events)
        .toStrictEqual([ { type: 'out-of-sync', documents: [ MAP_A ], origin: 'window-a' } ]);
    });

    it('refuses a stray undo of a step already undone here, even when its patches would fit, and changes nothing', () =>
    {
      // Arrange: the rename is undone, then another history writes the very same name back; a stray undo of the
      // rename arrives at matching heads. Its patch would fit, and applying it would erase the later edit.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      mirror(source, target);
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      source.undo(mapHistoryKey(1));
      source.edit('Rename again', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const before = [ fileOf(target, MAP_A), target.history(mapHistoryKey(1)), [ ...target.lineage(MAP_A) ] ];
      const events: HubEvent[] = [];
      target.subscribe(event => events.push(event));

      // Act.
      target.applyRemote({ type: 'undo', origin: 'window-a', opId: 'window-a#99', stepId: step.id, bases: { [MAP_A]: target.head(MAP_A) as string } });

      // Assert.
      expect([ [ fileOf(target, MAP_A), target.history(mapHistoryKey(1)), [ ...target.lineage(MAP_A) ] ], events.map(event => event.type) ])
        .toStrictEqual([ before, [ 'out-of-sync' ] ]);
    });

    it('refuses a stray redo of a step already applied here, even when its patches would fit', () =>
    {
      // Arrange: after the rename, another history puts the old name back; a stray redo of the rename arrives.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      mirror(source, target);
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      source.edit('Rename back', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Test Town'));
      const events: HubEvent[] = [];
      target.subscribe(event => events.push(event));

      // Act.
      target.applyRemote({ type: 'redo', origin: 'window-a', opId: 'window-a#50', stepId: step.id, bases: { [MAP_A]: target.head(MAP_A) as string } });

      // Assert.
      expect([ events.map(event => event.type), fileOf(target, MAP_A).displayName ])
        .toStrictEqual([ [ 'out-of-sync' ], 'Test Town' ]);
    });

    it('announces a forget made against another head, and forgets nothing', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      mirror(source, target);
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      const events: HubEvent[] = [];
      target.subscribe(event => events.push(event));

      // Act.
      target.applyRemote({ type: 'forget', origin: 'window-a', opId: 'window-a#51', stepId: step.id, bases: { [MAP_A]: 'elsewhere' } });

      // Assert.
      expect([ events.map(event => event.type), target.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ [ 'out-of-sync' ], 1 ]);
    });

    it('holds another window\'s step until the local edit finishes', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      const operations: RemoteOperation[] = [];
      source.subscribe(event => operations.push(operationFor(event, 'window-a') as RemoteOperation));
      source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const transaction = target.begin('Paint', [ mapHistoryKey(2) ]);
      transaction.tiles(MAP_B, [ [ 0, 3 ] ]);

      // Act.
      target.applyRemote(structuredClone(operations[0]));
      const whileOpen = fileOf(target, MAP_A).displayName;
      transaction.commit();

      // Assert.
      expect([ whileOpen, fileOf(target, MAP_A).displayName ])
        .toStrictEqual([ 'Test Town', 'Harbor' ]);
    });

    it('ignores a step it already has, and one touching nothing it holds', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = new DocumentHub({ clientId: 'window-b' });
      target.adopt(MAP_A, buildMapJson() as unknown as JsonValue);
      const operations: RemoteOperation[] = [];
      source.subscribe(event => operations.push(operationFor(event, 'window-a') as RemoteOperation));
      source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      source.edit('Rename B', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Cave'));

      // Act.
      target.applyRemote(structuredClone(operations[0]));
      target.applyRemote(structuredClone(operations[0]));
      target.applyRemote(structuredClone(operations[1]));

      // Assert.
      expect([ target.version(MAP_A), target.history(mapHistoryKey(1)).rows.length, target.has(MAP_B) ])
        .toStrictEqual([ 2, 1, false ]);
    });
  });
});
