import { describe, expect, it, vi } from 'vitest';
import { DocumentHub, type DocumentStore, type HubEvent } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The history core is what makes the editor safe to experiment in, so it owes three things above all.
 *
 * Every step reverses exactly: undo puts every touched document back the way it was, down to array lengths,
 * absent keys and tile cells, and redo puts the step back again.
 *
 * A transaction is one step wherever it lives. A door pair touches two maps and lands in both maps' histories;
 * undoing it from either one undoes both halves, and the other history agrees afterwards. It only moves while
 * it is the newest step in every history it belongs to, so no history is ever left out of order, and a step
 * whose patches no longer fit (because another history changed the same data) refuses instead of guessing.
 *
 * Saving never touches history. Jeremy: "saving is just saving data, not resetting the undo history." A save
 * records which steps the file reflects, so undoing back to that point is clean again.
 *
 * Fixtures carry near-miss siblings (two maps, two events, cells that all differ), so "changed this one" and
 * "changed everything" are different outcomes.
 */
describe('DocumentHub', () =>
{
  const MAP_A: DocumentKey = 'map:1';
  const MAP_B: DocumentKey = 'map:2';

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
   * A hub holding both fixture maps.
   * @param {DocumentStore} store Optional store.
   * @param {string} clientId The window's id; every window has its own.
   * @returns {DocumentHub} The hub.
   */
  const buildHub = (store?: DocumentStore, clientId = 'window-a'): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId, store, now: () => 1000 });
    hub.adopt(MAP_A, buildMapJson() as unknown as JsonValue);
    hub.adopt(MAP_B, buildMapJson() as unknown as JsonValue);
    return hub;
  };

  /**
   * Reads a map's file shape.
   * @param {DocumentHub} hub The hub.
   * @param {DocumentKey} key The map.
   * @returns {RmmzMap} The map file.
   */
  const fileOf = (hub: DocumentHub, key: DocumentKey): RmmzMap => hub.document(key).toJson() as unknown as RmmzMap;

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

    it('refuses an edit that names no history', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const begin = () => hub.begin('Orphan', []);

      // Assert.
      expect(begin)
        .toThrow(/names no history/u);
    });

    it('refuses an edit recorded on a document the window does not hold', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const begin = () => hub.begin('Elsewhere', [ mapHistoryKey(9) ]);

      // Assert.
      expect(begin)
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

    it('undoes a transaction across two maps as one step from the first map', () =>
    {
      // Arrange.
      const hub = buildHub();
      const originals = [ fileOf(hub, MAP_A), fileOf(hub, MAP_B) ];
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      });

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ result.ok, fileOf(hub, MAP_A), fileOf(hub, MAP_B), hub.history(mapHistoryKey(2)).position ])
        .toStrictEqual([ true, originals[0], originals[1], 0 ]);
    });

    it('undoes the same transaction as one step from the second map', () =>
    {
      // Arrange.
      const hub = buildHub();
      const originals = [ fileOf(hub, MAP_A), fileOf(hub, MAP_B) ];
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      });

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert.
      expect([ result.ok, fileOf(hub, MAP_A), fileOf(hub, MAP_B), hub.history(mapHistoryKey(1)).position ])
        .toStrictEqual([ true, originals[0], originals[1], 0 ]);
    });

    it('redoes a transaction from the other side than it was undone from', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      });
      hub.undo(mapHistoryKey(1));

      // Act.
      const result = hub.redo(mapHistoryKey(2));

      // Assert.
      expect([ result.ok, fileOf(hub, MAP_A).events[1]?.name, fileOf(hub, MAP_B).events[3]?.name, hub.history(mapHistoryKey(1)).position ])
        .toStrictEqual([ true, 'Door to cave', 'Door to town', 1 ]);
    });

    it('blocks a transaction while another of its histories has a newer step, then lets it go', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      });
      hub.edit('Paint cave', [ mapHistoryKey(2) ], tx => tx.tiles(MAP_B, [ [ 0, 800 ] ]));

      // Act.
      const blocked = hub.undo(mapHistoryKey(1));
      hub.undo(mapHistoryKey(2));
      const freed = hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ blocked.ok, blocked.ok === false && blocked.reason, blocked.ok === false && 'by' in blocked && blocked.by, freed.ok ])
        .toStrictEqual([ false, 'blocked', 'map:2', true ]);
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

    it('refuses, and changes nothing, when another history changed the same data since', () =>
    {
      // Arrange: the second patch reverses first and fits, so the conflict on the first must put it back.
      const hub = buildHub();
      hub.edit('Rename event', [ eventHistoryKey(1, 1) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard');
        tx.set(MAP_A, [ 'displayName' ], 'Guard post');
      });
      hub.edit('Delete event', [ mapHistoryKey(1) ], tx => tx.apply(MAP_A, hub.map('map:1').removeEventPatch(1)));
      const before = fileOf(hub, MAP_A);

      // Act.
      const result = hub.undo(eventHistoryKey(1, 1));

      // Assert.
      expect([ result.ok, result.ok === false && result.reason, fileOf(hub, MAP_A), hub.history(eventHistoryKey(1, 1)).position ])
        .toStrictEqual([ false, 'conflict', before, 1 ]);
    });

    it('drops redo steps once a new step is recorded, from every history they were in', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.set(MAP_B, [ 'events', 3, 'name' ], 'Door to town');
      });
      hub.undo(mapHistoryKey(1));
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 0, 5 ] ]));

      // Assert.
      expect([ hub.redo(mapHistoryKey(2)).ok, hub.history(mapHistoryKey(2)).rows, events.map(event => event.type) ])
        .toStrictEqual([ false, [], [ 'discarded', 'committed' ] ]);
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
      // Arrange.
      const hub = buildHub();
      const first = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'One'));
      hub.edit('Pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'note' ], 'paired');
        tx.set(MAP_B, [ 'note' ], 'paired');
      });
      hub.edit('Paint cave', [ mapHistoryKey(2) ], tx => tx.tiles(MAP_B, [ [ 0, 800 ] ]));

      // Act.
      const result = hub.jumpTo(mapHistoryKey(1), first?.id as string);

      // Assert.
      expect([ result.ok, result.ok === false && result.reason, hub.history(mapHistoryKey(1)).position ])
        .toStrictEqual([ false, 'blocked', 2 ]);
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

    it('stays dirty when the write fails', async () =>
    {
      // Arrange.
      const failing: DocumentStore = { load: async () => null, save: async () => Promise.reject(new Error('disk full')) };
      const hub = buildHub(failing);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Act.
      const saving = hub.save(MAP_A);

      // Assert.
      await expect(saving)
        .rejects.toThrow('disk full');
      expect([ hub.isDirty(MAP_A), hub.dirtyKeys() ])
        .toStrictEqual([ true, [ MAP_A ] ]);
    });

    it('refuses to save without a store', async () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const saving = hub.save(MAP_A);

      // Assert.
      await expect(saving)
        .rejects.toThrow(/no store/u);
    });
  });

  describe('external changes', () =>
  {
    it('takes the file when the document is clean, and starts its history afresh', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      await hub.save(MAP_A);
      const changed = structuredClone(files.get(MAP_A)) as unknown as RmmzMap;
      changed.displayName = 'Changed in MZ';
      files.set(MAP_A, changed as unknown as JsonValue);

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).rows, hub.isDirty(MAP_A) ])
        .toStrictEqual([ 'reloaded', 'Changed in MZ', [], false ]);
    });

    it('keeps unsaved edits and flags the document instead of taking the file', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const changed = structuredClone(files.get(MAP_A)) as unknown as RmmzMap;
      changed.displayName = 'Changed in MZ';
      files.set(MAP_A, changed as unknown as JsonValue);
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, fileOf(hub, MAP_A).displayName, hub.isConflicted(MAP_A), events ])
        .toStrictEqual([ 'conflicted', 'Harbor', true, [ { type: 'conflicted', document: MAP_A } ] ]);
    });

    it('does nothing when the file matches what the window holds', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      const hub = buildHub(store);

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, hub.version(MAP_A) ])
        .toStrictEqual([ 'unchanged', 0 ]);
    });

    it('ignores a change to a document the window does not hold', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      const hub = buildHub(store);

      // Act.
      const result = await hub.handleExternalChange('map:40');

      // Assert.
      expect(result)
        .toBe('ignored');
    });

    it('clears a conflict flag on request and keeps the edits', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      files.set(MAP_A, { ...(files.get(MAP_A) as object), note: 'x' } as JsonValue);
      await hub.handleExternalChange(MAP_A);

      // Act.
      hub.dismissConflict(MAP_A);

      // Assert.
      expect([ hub.isConflicted(MAP_A), fileOf(hub, MAP_A).displayName ])
        .toStrictEqual([ false, 'Harbor' ]);
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

    it('hands a document with its histories and unsaved state to another window intact', () =>
    {
      // Arrange.
      const source = buildHub();
      source.edit('One', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'One'));
      source.edit('Two', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Two'));
      source.undo(mapHistoryKey(1));
      const target = new DocumentHub({ clientId: 'window-b' });

      // Act.
      target.adoptSnapshot(structuredClone(source.snapshot(MAP_A)));
      const redone = target.redo(mapHistoryKey(1)).ok;

      // Assert.
      expect([ redone, fileOf(target, MAP_A).displayName, target.isDirty(MAP_A), target.version(MAP_A) ])
        .toStrictEqual([ true, 'Two', true, 4 ]);
    });
  });

  describe('applyRemote', () =>
  {
    it('repeats another window\'s step and records it', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Act.
      target.applyRemote({ type: 'commit', origin: 'window-a', step: structuredClone(step)!, bases: { [MAP_A]: 0 } });

      // Assert.
      expect([ fileOf(target, MAP_A).displayName, target.history(mapHistoryKey(1)).rows.length, target.version(MAP_A) ])
        .toStrictEqual([ 'Harbor', 1, 1 ]);
    });

    it('announces drift instead of applying a step made against another version', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = new DocumentHub({ clientId: 'window-b' });
      target.adopt(MAP_A, buildMapJson() as unknown as JsonValue);
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const events: HubEvent[] = [];
      target.subscribe(event => events.push(event));

      // Act.
      target.applyRemote({ type: 'commit', origin: 'window-a', step: structuredClone(step)!, bases: { [MAP_A]: 5 } });

      // Assert: the other window's copy now stands one past the version its step was made against.
      expect([ fileOf(target, MAP_A).displayName, events ])
        .toStrictEqual([ 'Test Town', [ { type: 'out-of-sync', documents: [ MAP_A ], origin: 'window-a', originVersions: { [MAP_A]: 6 } } ] ]);
    });

    it('holds another window\'s step until the local edit finishes', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const transaction = target.begin('Paint', [ mapHistoryKey(2) ]);
      transaction.tiles(MAP_B, [ [ 0, 3 ] ]);

      // Act.
      target.applyRemote({ type: 'commit', origin: 'window-a', step: structuredClone(step)!, bases: { [MAP_A]: 0 } });
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
      const onA = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'))!;
      const onB = source.edit('Rename B', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Cave'))!;

      // Act.
      target.applyRemote({ type: 'commit', origin: 'window-a', step: structuredClone(onA), bases: { [MAP_A]: 0 } });
      target.applyRemote({ type: 'commit', origin: 'window-a', step: structuredClone(onA), bases: { [MAP_A]: 0 } });
      target.applyRemote({ type: 'commit', origin: 'window-a', step: structuredClone(onB), bases: { [MAP_B]: 0 } });

      // Assert.
      expect([ target.version(MAP_A), target.history(mapHistoryKey(1)).rows.length, target.has(MAP_B) ])
        .toStrictEqual([ 1, 1, false ]);
    });

    it('repeats another window\'s undo and redo, and its save', () =>
    {
      // Arrange.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      const step = source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'))!;
      target.applyRemote({ type: 'commit', origin: 'window-a', step: structuredClone(step), bases: { [MAP_A]: 0 } });

      // Act.
      target.applyRemote({ type: 'undo', origin: 'window-a', stepId: step.id, bases: { [MAP_A]: 1 } });
      const afterUndo = fileOf(target, MAP_A).displayName;
      target.applyRemote({ type: 'redo', origin: 'window-a', stepId: step.id, bases: { [MAP_A]: 2 } });
      target.applyRemote({ type: 'saved', origin: 'window-a', document: MAP_A, marker: [ step.id ] });

      // Assert.
      expect([ afterUndo, fileOf(target, MAP_A).displayName, target.isDirty(MAP_A), target.version(MAP_A) ])
        .toStrictEqual([ 'Test Town', 'Harbor', false, 3 ]);
    });
  });
});
