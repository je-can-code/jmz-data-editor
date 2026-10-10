import { describe, expect, it, vi } from 'vitest';
import {
  diskOperationId,
  DocumentHub,
  isFileGone,
  isOutsideStep,
  type CommitCheck,
  type DocumentSnapshot,
  type DocumentStore,
  type HubEvent,
  type RemoteOperation,
} from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import {
  blueprintHistoryKey,
  commonEventHistoryKey,
  eventHistoryKey,
  mapHistoryKey,
  type HistoryKey,
} from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { MapTiles, Patch } from '../../../../src/mapEditor/core/model/patches.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { operationFor } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The history core is what makes the editor safe to experiment in, so it owes these things above all.
 *
 * Every step reverses exactly: undo puts every touched document back the way it was, down to array lengths,
 * absent keys and tile cells, and redo puts the step back again.
 *
 * A transaction is one step wherever it lives. A door pair lands in both maps' histories; a blueprint change
 * lands in the blueprint's and in every map with a copy. It undoes from any of them however many unrelated steps
 * came after it on any of those maps, and is refused, naming the later edit and changing nothing, when that edit
 * changed the same target or moved where it sits: a resize moves every tile, and adding or removing items in a
 * list moves every item after them. An undo that wrote to where a target used to be would quietly damage
 * something else. Redo holds to the same rule forwards: a step comes back only when no edit made or undone since
 * its undo changed what it changes, moved it, or would be moved by its return. The maps' own histories stay
 * coherent around a step undone out of order, and a refused step never leaves a history stuck: it can be forgotten.
 *
 * Saving never touches history. Jeremy: "saving is just saving data, not resetting the undo history." Neither a
 * save nor another window ever sees an edit that is still open, since it may yet be cancelled.
 *
 * A document reads as saved exactly when it holds what its file holds, as the window last read the file, wrote it, or
 * heard another window write it, whatever moved either there. Where its history stands decides nothing: a blueprint's
 * change writes a map's file at once, apart from the map's unsaved edits, so a map can come to hold its file's content,
 * or leave it, by roads no list of steps tells. A map that read as saved while its file held something else would lose
 * work with nobody warned, and every blueprint change after it would be planned against the wrong copy.
 *
 * A file changed outside the editor never resets history either. On a clean document the file's version arrives as
 * one step, "Externally modified", in the history of whatever it touched and already saved: undo brings back the
 * version the editor had, as an unsaved edit, and redo takes the file's version again. Every window that hears the
 * change records the very same step, so their copies stay one. A file holding what the window last wrote or read
 * there, as the echo of its own save does, records nothing; a document with unsaved edits is flagged and never merged
 * into.
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

  /**
   * Captures everything an undo could change in a hub: each held document's file, revision and lineage, which
   * documents are unsaved, and the rows of the given histories. Revisions count every patch a document takes,
   * so two captures are equal only when nothing was applied anywhere, not even applied and put back.
   * @param {DocumentHub} hub The hub.
   * @param {readonly HistoryKey[]} histories The histories to read.
   * @returns {object} The capture.
   */
  const stateOf = (hub: DocumentHub, histories: readonly HistoryKey[]) => ({
    files: hub.documentKeys().map(key => hub.document(key).toJson()),
    revisions: hub.documentKeys().map(key => hub.document(key).revision),
    lineages: hub.documentKeys().map(key => [ ...hub.lineage(key) ]),
    dirty: hub.dirtyKeys(),
    histories: histories.map(key => hub.history(key)),
  });

  /**
   * Builds a map whose ground layer is painted and whose other layers are empty but for one tile on layer 3 at
   * (1, 1). The emptiness is the point: once a resize moves the cells, the index that tile had names an empty cell
   * one row down, so a stale undo finds exactly the value it expects there, and only an explicit check can tell
   * that the tile moved.
   * @returns {RmmzMap} The map file.
   */
  const sparseMap = (): RmmzMap =>
  {
    const map = buildMapJson();
    const data = new Array<number>(3 * 2 * 6).fill(0);
    for (let cell = 0; cell < 3 * 2; cell++)
    {
      data[cell] = 2816 + cell;
    }

    // layer 3 is z 2, and a cell's index is (z * height + y) * width + x.
    data[(2 * 2 + 1) * 3 + 1] = 777;
    return { ...map, data };
  };

  /**
   * A hub holding the sparse map as map 1 and the fixture map as map 2.
   * @returns {DocumentHub} The hub.
   */
  const buildSparseHub = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a', now: () => 1000 });
    hub.adopt(MAP_A, sparseMap() as unknown as JsonValue);
    hub.adopt(MAP_B, buildMapJson() as unknown as JsonValue);
    return hub;
  };

  /**
   * Erases the layer-3 tile at (1, 1) on map 1 and notes the pair on map 2, as one step on both maps.
   * @param {DocumentHub} hub The hub.
   * @returns {HistoryStep} The step.
   */
  const eraseTilePair = (hub: DocumentHub): HistoryStep => hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
  {
    tx.tiles(MAP_A, [ [ hub.map('map:1').cellIndex(1, 1, 2), 0 ] ]);
    tx.set(MAP_B, [ 'note' ], 'door');
  }) as HistoryStep;

  /**
   * Builds the tiles a map would have with one empty row added at the bottom, the way a resize makes them.
   * @param {MapDocument} map The map as it stands.
   * @returns {MapTiles} The new size and its tile data.
   */
  const growOneRow = (map: MapDocument): MapTiles =>
  {
    const height = map.height + 1;
    const data: number[] = [];
    for (let z = 0; z < 6; z++)
    {
      for (let y = 0; y < height; y++)
      {
        for (let x = 0; x < map.width; x++)
        {
          data.push(map.cellAt(x, y, z));
        }
      }
    }

    return { width: map.width, height, data };
  };

  /**
   * A hub whose map 1 event 1 has three pages, of which only the last runs by itself (trigger 3, autorun), and
   * which holds the fixture map as map 2.
   * @returns {DocumentHub} The hub.
   */
  const buildPagedHub = (): DocumentHub =>
  {
    const map = buildMapJson();
    const door = map.events[1] as RmmzMapEvent;
    map.events[1] = { ...door, pages: [ createEventPage(), createEventPage(), { ...createEventPage(), trigger: 3 } ] };

    const hub = new DocumentHub({ clientId: 'window-a', now: () => 1000 });
    hub.adopt(MAP_A, map as unknown as JsonValue);
    hub.adopt(MAP_B, buildMapJson() as unknown as JsonValue);
    return hub;
  };

  /**
   * Makes the second page of map 1's event 1 autorun and notes the pair on map 2, as one step in the event's
   * history and map 2's.
   * @param {DocumentHub} hub The hub.
   * @returns {HistoryStep} The step.
   */
  const autorunSecondPage = (hub: DocumentHub): HistoryStep => hub.edit('Autorun page 2', [ eventHistoryKey(1, 1), mapHistoryKey(2) ], tx =>
  {
    tx.set(MAP_A, [ 'events', 1, 'pages', 1, 'trigger' ], 3);
    tx.set(MAP_B, [ 'note' ], 'paired');
  }) as HistoryStep;

  /**
   * Reads the trigger of every page of map 1's event 1, in page order.
   * @param {DocumentHub} hub The hub.
   * @returns {number[]} The triggers.
   */
  const triggersOf = (hub: DocumentHub): number[] => (hub.map('map:1').event(1) as RmmzMapEvent).pages.map(page => page.trigger);

  /**
   * Renames map 1's door and adds event 5 to the end of map 2's list, as one step on both maps.
   * @param {DocumentHub} hub The hub.
   * @returns {HistoryStep} The step.
   */
  const placeDoorPair = (hub: DocumentHub): HistoryStep => hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
  {
    tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
    tx.apply(MAP_B, hub.map('map:2').placeEventPatch(createMapEvent(5, 0, 1)));
  }) as HistoryStep;

  /**
   * Places an event named "Newer" on map 2, in the slot its id names.
   * @param {DocumentHub} hub The hub.
   * @param {number} id The event id.
   * @returns {HistoryStep} The step.
   */
  const placeNewerEvent = (hub: DocumentHub, id: number): HistoryStep => hub.edit('Place event', [ mapHistoryKey(2) ], tx =>
    tx.apply(MAP_B, hub.map('map:2').placeEventPatch({ ...createMapEvent(id, 1, 1), name: 'Newer' }))) as HistoryStep;

  /**
   * Lists map 2's event slots as id and name, empty slots as null.
   * @param {DocumentHub} hub The hub.
   * @returns {(string | null)[]} The slots.
   */
  const slotsOf = (hub: DocumentHub): (string | null)[] => fileOf(hub, MAP_B).events.map(event => (event === null ? null : `${event.id}:${event.name}`));

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

    it('says an edit is open from the moment it begins until it is committed or cancelled', () =>
    {
      // Arrange.
      const hub = buildHub();
      const idle = hub.isEditing();

      // Act.
      const committed = hub.begin('Rename map', [ mapHistoryKey(1) ]);
      const whileCommitting = hub.isEditing();
      committed.set(MAP_A, [ 'displayName' ], 'Harbor').commit();
      const afterCommit = hub.isEditing();
      const cancelled = hub.begin('Rename map', [ mapHistoryKey(1) ]);
      const whileCancelling = hub.isEditing();
      cancelled.cancel();

      // Assert.
      expect([ idle, whileCommitting, afterCommit, whileCancelling, hub.isEditing() ])
        .toStrictEqual([ false, true, false, true, false ]);
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

  /*
   * A window's commit checks are how a document with rules beyond any patch's keeps to them, whatever tool edits it: a
   * blueprint opened as a map keeps its size and its events however it is painted or edited. So an edit a check refuses
   * must leave no trace (every document as it was, no step in any history, nothing unsaved, the hub free for the next
   * edit), and the author must hear why. A check reads the edit as it leaves the documents, and may add to it, which is
   * how a change can be carried further as part of the same step. Only this window's own edits are asked about.
   */
  describe('commit checks', () =>
  {
    /**
     * A check refusing any edit that changes map 2, in the words given, and letting every other through.
     * @param {string} words Why it refuses.
     * @returns {CommitCheck} The check.
     */
    const keepsMapB = (words: string): CommitCheck => transaction =>
    {
      return transaction.entries.some(entry => entry.document === MAP_B) ? words : null;
    };

    it('puts back an edit a check refuses, recording nothing anywhere, and says why', () =>
    {
      // Arrange: an edit to both maps, which the check refuses for touching map 2.
      const hub = buildHub();
      hub.addCommitCheck(keepsMapB('map 2 stays as it is'));
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));
      const before = { ...stateOf(hub, [ mapHistoryKey(1), mapHistoryKey(2) ]), revisions: null };

      // Act.
      const step = hub.edit('Rename both', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'displayName' ], 'Harbor');
        tx.set(MAP_B, [ 'displayName' ], 'Harbor too');
      });

      // Assert.
      expect([ step, { ...stateOf(hub, [ mapHistoryKey(1), mapHistoryKey(2) ]), revisions: null }, events ])
        .toStrictEqual([
          null,
          before,
          [ { type: 'refused', label: 'Rename both', histories: [ 'map:1', 'map:2' ], message: 'map 2 stays as it is' } ],
        ]);
    });

    it('lets through an edit every check passes, and takes the next edit after one it refused', () =>
    {
      // Arrange: a refused edit to map 2 first.
      const hub = buildHub();
      hub.addCommitCheck(keepsMapB('map 2 stays as it is'));
      hub.edit('Rename B', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Harbor'));

      // Act.
      const step = hub.edit('Rename A', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ step?.label, fileOf(hub, MAP_A).displayName, fileOf(hub, MAP_B).displayName, hub.history(mapHistoryKey(2)).rows ])
        .toStrictEqual([ 'Rename A', 'Harbor', 'Test Town', [] ]);
    });

    it('asks the checks in the order they were added, stopping at the first that refuses', () =>
    {
      // Arrange: one passing, then two refusing.
      const hub = buildHub();
      const asked: string[] = [];
      hub.addCommitCheck(() =>
      {
        asked.push('first');
        return null;
      });
      hub.addCommitCheck(() =>
      {
        asked.push('second');
        return 'the second says no';
      });
      hub.addCommitCheck(() =>
      {
        asked.push('third');
        return 'the third says no';
      });
      const refusals: string[] = [];
      hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ asked, refusals ])
        .toStrictEqual([ [ 'first', 'second' ], [ 'the second says no' ] ]);
    });

    it('shows a check the edit as it leaves the documents, and keeps what the check adds as part of the same step', () =>
    {
      // Arrange: a check that names map 2 after map 1 as part of every edit renaming map 1.
      const hub = buildHub();
      const seen: unknown[] = [];
      hub.addCommitCheck(transaction =>
      {
        seen.push(hub.document(MAP_A).valueAt([ 'displayName' ]), transaction.entries.length);
        transaction.set(MAP_B, [ 'displayName' ], `After ${String(hub.document(MAP_A).valueAt([ 'displayName' ]))}`);
        return null;
      });

      // Act.
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      const named = fileOf(hub, MAP_B).displayName;
      hub.undo(mapHistoryKey(1));

      // Assert: one step held both, and one undo took both back.
      expect([ seen, step.entries.map(entry => entry.document), named, fileOf(hub, MAP_A).displayName, fileOf(hub, MAP_B).displayName ])
        .toStrictEqual([ [ 'Harbor', 1 ], [ MAP_A, MAP_B ], 'After Harbor', 'Test Town', 'Test Town' ]);
    });

    it('never asks about an edit that changed nothing', () =>
    {
      // Arrange.
      const hub = buildHub();
      const check = vi.fn(() => 'never');
      hub.addCommitCheck(check);

      // Act.
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Test Town'));

      // Assert.
      expect([ step, check.mock.calls.length ])
        .toStrictEqual([ null, 0 ]);
    });

    it('refuses a transaction opened with begin at its commit, putting back everything it showed', () =>
    {
      // Arrange: a stroke over map 2, which shows as it goes.
      const hub = buildHub();
      hub.addCommitCheck(keepsMapB('map 2 stays as it is'));
      const before = fileOf(hub, MAP_B);
      const stroke = hub.begin('Paint', [ mapHistoryKey(2) ]);
      stroke.tiles(MAP_B, [ [ 0, 900 ] ]);
      const [ midStroke ] = hub.map('map:2').cells;

      // Act.
      const step = stroke.commit();

      // Assert: the hub takes another edit at once.
      expect([ midStroke, step, fileOf(hub, MAP_B), stroke.isOpen, hub.begin('Next', [ mapHistoryKey(1) ]).isOpen ])
        .toStrictEqual([ 900, null, before, false, true ]);
    });

    it('puts the edit back when a check fails outright, the failure going on up, and takes the next edit', () =>
    {
      // Arrange.
      const hub = buildHub();
      const remove = hub.addCommitCheck(() =>
      {
        throw new Error('the check broke');
      });

      // Act.
      const run = () => hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect(run)
        .toThrow('the check broke');
      remove();
      expect([ fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).rows, hub.edit('Again', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'x'))?.label ])
        .toStrictEqual([ 'Test Town', [], 'Again' ]);
    });

    it('stops asking a check once it is taken away', () =>
    {
      // Arrange.
      const hub = buildHub();
      const remove = hub.addCommitCheck(keepsMapB('map 2 stays as it is'));

      // Act.
      remove();
      const step = hub.edit('Rename B', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ step?.label, fileOf(hub, MAP_B).displayName ])
        .toStrictEqual([ 'Rename B', 'Harbor' ]);
    });

    it('never asks about another window\'s edit, which that window\'s own checks looked over', () =>
    {
      // Arrange: the second window refuses edits to map 2, the first does not.
      const first = buildHub(undefined, 'window-a');
      const second = buildHub(undefined, 'window-b');
      second.addCommitCheck(keepsMapB('map 2 stays as it is'));
      mirror(first, second);

      // Act.
      first.edit('Rename B', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ fileOf(second, MAP_B).displayName, second.history(mapHistoryKey(2)).rows.map(row => row.label) ])
        .toStrictEqual([ 'Harbor', [ 'Rename B' ] ]);
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

    it('carries a side\'s exact text only when it was read', () =>
    {
      // Arrange.
      const hub = buildTreeHub();

      // Act.
      const step = hub.edit('Delete map', [ 'tree' ], tx =>
      {
        tx.set('mapinfos', [ 1 ], null);
        tx.file('map:1', buildMapJson() as unknown as JsonValue, null, { before: '{"exact":"bytes"}' });
        tx.file('map:2', null, buildMapJson() as unknown as JsonValue);
      }) as HistoryStep;

      // Assert.
      const [ removed, created ] = step.files ?? [];
      expect([ removed.beforeText, Object.keys(removed), Object.keys(created) ])
        .toStrictEqual([ '{"exact":"bytes"}', [ 'document', 'before', 'after', 'beforeText' ], [ 'document', 'before', 'after' ] ]);
    });

    it('carries the copy the window held beside a removed file, copied, and only where there was one', () =>
    {
      // Arrange: map 1 is held here with an edit never saved.
      const hub = buildTreeHub();
      hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
      hub.edit('Rename map', [ 'map:1' ], tx => tx.set('map:1', [ 'displayName' ], 'Unsaved'));
      const held = hub.snapshot('map:1');

      // Act.
      const step = hub.edit('Delete map', [ 'tree' ], tx =>
      {
        tx.set('mapinfos', [ 1 ], null);
        tx.file('map:1', buildMapJson() as unknown as JsonValue, null, { beforeHeld: held });
        tx.file('map:2', null, buildMapJson() as unknown as JsonValue);
      }) as HistoryStep;
      (held.content as { displayName: string }).displayName = 'changed after the step';

      // Assert.
      const [ removed, created ] = step.files ?? [];
      const carried = removed.beforeHeld as DocumentSnapshot;
      expect([ (carried.content as { displayName: string }).displayName, carried.histories.map(({ key }) => key), Object.keys(created) ])
        .toStrictEqual([ 'Unsaved', [ 'map:1' ], [ 'document', 'before', 'after' ] ]);
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

    it('puts back the patches that already moved when a later one finds its target changed behind the hub\'s back', () =>
    {
      // Arrange: map 1's half of the pair is changed without any step, and undo reverses map 2's half first.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'note' ], 'paired');
        tx.set(MAP_B, [ 'note' ], 'paired');
      });
      hub.document(MAP_A).apply({ kind: 'set', path: [ 'note' ], before: 'paired', after: 'elsewhere' });
      const files = [ fileOf(hub, MAP_A), fileOf(hub, MAP_B) ];

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert: refused with no recorded edit to blame, both maps as they were, and the pair still done.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy,
        [ fileOf(hub, MAP_A), fileOf(hub, MAP_B) ],
        hub.history(mapHistoryKey(2)).position,
      ])
        .toStrictEqual([ 'conflict', null, files, 1 ]);
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

  describe('undoing a step past later edits', () =>
  {
    /**
     * Renames map 1's door and, on map 2, makes an empty slot 5 past the end of the list and puts event 5 in it, as one
     * step on both maps, the way placing a door pair does.
     * @param {DocumentHub} hub The hub.
     * @returns {HistoryStep} The step.
     */
    const placeSlottedPair = (hub: DocumentHub): HistoryStep => hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
    {
      tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
      tx.apply(MAP_B, { kind: 'splice', path: [ 'events' ], index: 5, removed: [], inserted: [ null ] });
      tx.apply(MAP_B, { kind: 'set', path: [ 'events', 5 ], before: null, after: createMapEvent(5, 0, 1) as unknown as JsonValue });
    }) as HistoryStep;

    it('undoes a step past an event placed after the empty slot it made, leaving the slot empty and the event its id', () =>
    {
      // Arrange: map 2 places event 6 after the pair's event 5.
      const hub = buildHub();
      placeSlottedPair(hub);
      placeNewerEvent(hub, 6);

      // Act: undo the pair from map 1, where it is still the newest step.
      const result = hub.undo(mapHistoryKey(1));

      // Assert: the slot alone is left, so event 6 keeps its id; the door's name is back.
      expect([ result.ok, result.ok && result.left?.map(part => [ part.document, part.patch.kind, part.by?.label ]), slotsOf(hub), fileOf(hub, MAP_A).events[1]?.name ])
        .toStrictEqual([ true, [ [ MAP_B, 'splice', 'Place event' ] ], [ null, '1:Door', null, '3:Chest', null, null, '6:Newer' ], 'Door' ]);
    });

    it('undoes a step whose empty slot nothing stands beyond, taking the slot out with the rest', () =>
    {
      // Arrange: the pair alone.
      const hub = buildHub();
      placeSlottedPair(hub);

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert: nothing is left; map 2's list is as long as it was.
      expect([ result.ok, result.ok && result.left, slotsOf(hub) ])
        .toStrictEqual([ true, undefined, [ null, '1:Door', null, '3:Chest', null ] ]);
    });

    it('redoes a step undone with its empty slot left, putting the event back in that slot', () =>
    {
      // Arrange: the pair undone past event 6.
      const hub = buildHub();
      placeSlottedPair(hub);
      placeNewerEvent(hub, 6);
      hub.undo(mapHistoryKey(1));

      // Act.
      const result = hub.redo(mapHistoryKey(1));

      // Assert.
      expect([ result.ok, slotsOf(hub), fileOf(hub, MAP_A).events[1]?.name ])
        .toStrictEqual([ true, [ null, '1:Door', null, '3:Chest', null, '5:EV005', '6:Newer' ], 'Door to cave' ]);
    });

    it('still refuses to undo a step whose event a later edit changed, naming the edit and the map it is on', () =>
    {
      // Arrange: event 6 placed after the pair's event, which alone would not refuse it, then event 5 renamed.
      const hub = buildHub();
      placeSlottedPair(hub);
      placeNewerEvent(hub, 6);
      hub.edit('Rename event', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'events', 5, 'name' ], 'Cave door'));
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert: refused before anything moved.
      expect([ result.ok === false && result.reason, result.ok === false && 'blockedBy' in result && result.blockedBy?.label, result.ok === false && 'document' in result && result.document, stateOf(hub, histories) ])
        .toStrictEqual([ 'conflict', 'Rename event', MAP_B, before ]);
    });

    it('refuses to undo a step on two maps after a resize moved the tiles it changed, and changes nothing', () =>
    {
      // Arrange: map 1 grows a row after the pair, so the erased tile's cell has a new index, and the index it had
      // now names an empty cell one row down, on the layer below.
      const hub = buildSparseHub();
      eraseTilePair(hub);
      hub.edit('Resize', [ mapHistoryKey(1) ], tx => tx.resize(MAP_A, growOneRow(hub.map('map:1'))));
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act: undo the pair from map 2, where it is still the newest step.
      const asked = hub.canUndo(mapHistoryKey(2));
      const result = hub.undo(mapHistoryKey(2));

      // Assert: refused and named before anything is tried, the same answer both ways, and nothing touched.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        asked,
        stateOf(hub, histories),
        events,
      ])
        .toStrictEqual([ 'moved', 'Resize', result, before, [] ]);
    });

    it('undoes a step on two maps after a resize of the map it only changed a field on', () =>
    {
      // Arrange: the same pair, but the map that grows is map 2, where the pair only wrote the note.
      const hub = buildSparseHub();
      eraseTilePair(hub);
      hub.edit('Resize', [ mapHistoryKey(2) ], tx => tx.resize(MAP_B, growOneRow(hub.map('map:2'))));

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert: the tile is back where it was erased, the note is back, and map 2 keeps its new row.
      expect([ result.ok, hub.map('map:1').cellAt(1, 1, 2), fileOf(hub, MAP_B).note, fileOf(hub, MAP_B).height ])
        .toStrictEqual([ true, 777, '', 3 ]);
    });

    it('refuses to undo a step on two maps after an earlier page of the event it changed was deleted, and changes nothing', () =>
    {
      // Arrange: map 1 deletes the first page after the pair, so the page the pair changed moved up one, and the
      // index the pair addressed now holds the third page, which already autoruns.
      const hub = buildPagedHub();
      autorunSecondPage(hub);
      hub.edit('Delete page', [ mapHistoryKey(1) ], tx => tx.splice(MAP_A, [ 'events', 1, 'pages' ], 0, 1, []));
      const histories = [ eventHistoryKey(1, 1), mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        triggersOf(hub),
        stateOf(hub, histories),
      ])
        .toStrictEqual([ 'moved', 'Delete page', [ 3, 3 ], before ]);
    });

    it('undoes a step on two maps after a later page of the event it changed was deleted', () =>
    {
      // Arrange: the deleted page comes after the one the pair changed, which therefore stays where it was.
      const hub = buildPagedHub();
      autorunSecondPage(hub);
      hub.edit('Delete page', [ mapHistoryKey(1) ], tx => tx.splice(MAP_A, [ 'events', 1, 'pages' ], 2, 1, []));

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert.
      expect([ result.ok, triggersOf(hub), fileOf(hub, MAP_B).note ])
        .toStrictEqual([ true, [ 0, 0 ], '' ]);
    });

    it('refuses to undo a placement out of order when taking it out would slide a later event into its slot', () =>
    {
      // Arrange: the pair adds event 5 to the end of map 2's list, and map 2 then adds event 6 behind it, so taking
      // event 5 out would leave event 6 in slot 5 while it still says it is event 6.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.apply(MAP_B, hub.map('map:2').placeEventPatch(createMapEvent(5, 0, 1)));
      });
      hub.edit('Place event', [ mapHistoryKey(2) ], tx => tx.apply(MAP_B, hub.map('map:2').placeEventPatch(createMapEvent(6, 1, 1))));
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        result.ok === false && 'message' in result && result.message,
        stateOf(hub, histories),
      ])
        .toStrictEqual([ 'moved', 'Place event', 'undoing "Place door pair" would move what "Place event" changed', before ]);
    });

    it('undoes a placement out of order after another event fills a free slot in front of it', () =>
    {
      // Arrange: the same pair, but map 2's next event goes into its empty slot 2, which moves nothing.
      const hub = buildHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Door to cave');
        tx.apply(MAP_B, hub.map('map:2').placeEventPatch(createMapEvent(5, 0, 1)));
      });
      hub.edit('Place event', [ mapHistoryKey(2) ], tx => tx.apply(MAP_B, hub.map('map:2').placeEventPatch(createMapEvent(2, 1, 1))));

      // Act.
      const result = hub.undo(mapHistoryKey(1));

      // Assert: event 5 is gone, event 2 stays in its slot, and the door on map 1 has its old name.
      expect([ result.ok, fileOf(hub, MAP_B).events.map(event => event?.id ?? null), fileOf(hub, MAP_A).events[1]?.name ])
        .toStrictEqual([ true, [ null, 1, 2, 3, null ], 'Door' ]);
    });

    it('refuses to undo out of order after a later edit changed the same data, even once another put the value back', () =>
    {
      // Arrange: after the change, map 1 renames the guard and then renames it back, so its name matches again and
      // only the record of those edits shows it was changed in between.
      const hub = buildHub();
      propagateBlueprint(hub);
      hub.edit('Rename guard', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Captain'));
      hub.edit('Rename guard back', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)'));
      const histories = [ blueprintHistoryKey('guard'), mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.undo(blueprintHistoryKey('guard'));

      // Assert: the newer of the two renames is named.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        result.ok === false && 'message' in result && result.message,
        stateOf(hub, histories),
      ])
        .toStrictEqual([ 'conflict', 'Rename guard back', '"Rename guard back" later changed what "Raise guard sight" changed', before ]);
    });

    it('rolls a blueprint change back on every map after other events on those maps change, pages and all', () =>
    {
      // Arrange: after the change, map 1 renames its chest and paints a cell, and map 2 gives its door a second page
      // and gains an event at the end of its list; none of it touches the guards the change renamed.
      const hub = buildHub();
      propagateBlueprint(hub);
      hub.edit('Rename chest', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'events', 3, 'name' ], 'Crate'));
      hub.edit('Paint town', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 5, 600 ] ]));
      hub.edit('Add page', [ eventHistoryKey(2, 1) ], tx => tx.splice(MAP_B, [ 'events', 1, 'pages' ], 1, 0, [ createEventPage() as unknown as JsonValue ]));
      hub.edit('Place event', [ mapHistoryKey(2) ], tx => tx.apply(MAP_B, hub.map('map:2').placeEventPatch(createMapEvent(5, 1, 1))));

      // Act.
      const result = hub.undo(blueprintHistoryKey('guard'));

      // Assert: the change is gone from all three documents, and every later edit stays.
      expect([
        result.ok,
        hub.document(BLUEPRINTS).valueAt([ 'data', 'blueprints', 0, 'sight' ]),
        fileOf(hub, MAP_A).events[1]?.name,
        fileOf(hub, MAP_B).events[3]?.name,
        fileOf(hub, MAP_A).events[3]?.name,
        fileOf(hub, MAP_A).data[5],
        fileOf(hub, MAP_B).events[1]?.pages.length,
        fileOf(hub, MAP_B).events[5]?.id,
      ])
        .toStrictEqual([ true, 4, 'Door', 'Chest', 'Crate', 600, 2, 5 ]);
    });

    it('refuses to undo a pair out of order under a later stroke over a cell it painted, but not under one beside it', () =>
    {
      // Arrange: the same pair in two hubs; afterwards map 1 paints the pair's own cell in one, the next cell in the other.
      const hubs = [ buildHub(), buildHub() ];
      hubs.forEach(hub => hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.tiles(MAP_A, [ [ 0, 900 ] ]);
        tx.set(MAP_B, [ 'note' ], 'door');
      }));
      hubs[0].edit('Paint', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 0, 901 ] ]));
      hubs[1].edit('Paint', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 1, 901 ] ]));

      // Act.
      const results = hubs.map(hub => hub.undo(mapHistoryKey(2)));

      // Assert.
      expect([
        results.map(result => (result.ok === false && 'blockedBy' in result ? [ result.reason, result.blockedBy?.label ] : result.ok)),
        hubs.map(hub => fileOf(hub, MAP_A).data.slice(0, 2)),
        hubs.map(hub => fileOf(hub, MAP_B).note),
      ])
        .toStrictEqual([ [ [ 'conflict', 'Paint' ], true ], [ [ 901, 2 ], [ 1, 901 ] ], [ 'door', '' ] ]);
    });

    it('still refuses once the edit in the way is forgotten, since its patches stay where they are', () =>
    {
      // Arrange: the resize leaves every history, but the map keeps its new size and the tiles stay moved.
      const hub = buildSparseHub();
      eraseTilePair(hub);
      const resize = hub.edit('Resize', [ mapHistoryKey(1) ], tx => tx.resize(MAP_A, growOneRow(hub.map('map:1')))) as HistoryStep;
      hub.forgetStep(resize.id);
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        hub.history(mapHistoryKey(1)).rows.map(row => row.label),
        stateOf(hub, histories),
      ])
        .toStrictEqual([ 'moved', 'Resize', [ 'Place door pair' ], before ]);
    });

    it('hands another window the steps in place that no history lists, so the same undo is refused there', () =>
    {
      // Arrange: the resize is forgotten in the first window, then both maps are handed to a second window.
      const source = buildSparseHub();
      eraseTilePair(source);
      const resize = source.edit('Resize', [ mapHistoryKey(1) ], tx => tx.resize(MAP_A, growOneRow(source.map('map:1')))) as HistoryStep;
      source.forgetStep(resize.id);
      const snapshots = [ MAP_A, MAP_B ].map(key => structuredClone(source.snapshot(key)));
      const target = new DocumentHub({ clientId: 'window-b' });
      snapshots.forEach(snapshot => target.adoptSnapshot(snapshot));

      // Act.
      const result = target.undo(mapHistoryKey(2));

      // Assert: only map 1's copy carries a step beside its histories, the resize; the pair travels in the
      // histories alone; and the second window refuses the undo just as the first would.
      expect([
        snapshots.map(snapshot => snapshot.unlisted.map(step => step.label)),
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        target.map('map:1').cellAt(1, 1, 2),
      ])
        .toStrictEqual([ [ [ 'Resize' ], [] ], 'moved', 'Resize', 0 ]);
    });

    it('refuses a copy that names a step as applied without carrying it, changing nothing, and takes the whole copy', () =>
    {
      // Arrange: a copy of map 1 whose forgotten resize has been left out, beside the whole copy.
      const source = buildSparseHub();
      eraseTilePair(source);
      const resize = source.edit('Resize', [ mapHistoryKey(1) ], tx => tx.resize(MAP_A, growOneRow(source.map('map:1')))) as HistoryStep;
      source.forgetStep(resize.id);
      const whole = structuredClone(source.snapshot(MAP_A));
      const target = buildHub(undefined, 'window-b');
      const before = stateOf(target, [ mapHistoryKey(1) ]);

      // Act: the partial copy first, then the whole one.
      const takePartial = () => target.adoptSnapshot({ ...whole, unlisted: [] });
      const refusal = (() =>
      {
        try
        {
          takePartial();
          return null;
        }
        catch (error)
        {
          return (error as Error).message;
        }
      })();
      const afterRefusal = stateOf(target, [ mapHistoryKey(1) ]);
      target.adoptSnapshot(whole);

      // Assert.
      expect([ refusal, afterRefusal, fileOf(target, MAP_A), [ ...target.lineage(MAP_A) ] ])
        .toStrictEqual([
          `the copy of map:1 names ${resize.id} without carrying it`,
          before,
          fileOf(source, MAP_A),
          [ ...source.lineage(MAP_A) ],
        ]);
    });

    it('refuses as untracked an undo on a map re-opened from a disk copy whose pages moved, and changes nothing', () =>
    {
      // Arrange: the pair makes page 2 autorun; map 1 is closed, its first page is deleted on disk, and it re-opens
      // from that file, which carries no record of the pair, so the page it changed now sits where page 3 was.
      const hub = buildPagedHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'pages', 1, 'trigger' ], 3);
        tx.set(MAP_B, [ 'note' ], 'door');
      });
      const onDisk = fileOf(hub, MAP_A);
      hub.release(MAP_A);
      (onDisk.events[1] as RmmzMapEvent).pages.splice(0, 1);
      hub.adopt(MAP_A, onDisk as unknown as JsonValue);
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert: the refusal names the map by its label, and says which document it is for a window that names it otherwise.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy,
        result.ok === false && 'message' in result && result.message,
        result.ok === false && 'document' in result && result.document,
        triggersOf(hub),
        stateOf(hub, histories),
      ])
        .toStrictEqual([
          'untracked',
          null,
          'this window cannot tell what changed in Map 1 after "Place door pair"',
          MAP_A,
          [ 3, 3 ],
          before,
        ]);
    });

    it('refuses as untracked an undo on a map re-opened from a disk copy cropped by a column, and changes nothing', () =>
    {
      // Arrange: the pair paints water over the grass at (1, 0), beside the water at (2, 0); map 1 is closed, loses
      // its left column on disk, and re-opens, so cell 1 now holds the water that was at (2, 0).
      const grass = 2816;
      const water = 2048;
      const data = new Array<number>(3 * 2 * 6).fill(0);
      [ grass, grass, water, grass, grass, grass ].forEach((tile, cell) =>
      {
        data[cell] = tile;
      });
      const hub = new DocumentHub({ clientId: 'window-a', now: () => 1000 });
      hub.adopt(MAP_A, { ...buildMapJson(), data } as unknown as JsonValue);
      hub.adopt(MAP_B, buildMapJson() as unknown as JsonValue);
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.tiles(MAP_A, [ [ 1, water ] ]);
        tx.set(MAP_B, [ 'note' ], 'door');
      });
      const onDisk = fileOf(hub, MAP_A);
      hub.release(MAP_A);
      const cropped: number[] = [];
      for (let layer = 0; layer < 6; layer++)
      {
        for (let y = 0; y < 2; y++)
        {
          cropped.push(onDisk.data[(layer * 2 + y) * 3 + 1], onDisk.data[(layer * 2 + y) * 3 + 2]);
        }
      }
      hub.adopt(MAP_A, { ...onDisk, width: 2, data: cropped } as unknown as JsonValue);
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert: refused, and the water that moved into cell 1, at (1, 0) now, stays water.
      expect([ result.ok === false && result.reason, hub.map('map:1').cellAt(1, 0, 0), stateOf(hub, histories) ])
        .toStrictEqual([ 'untracked', water, before ]);
    });

    it('undoes a pair on a map re-opened from a copy that carries its record of the pair', () =>
    {
      // Arrange: map 1 is closed and taken back from a copy made just before, which lists the pair as applied.
      const hub = buildPagedHub();
      hub.edit('Place door pair', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'events', 1, 'pages', 1, 'trigger' ], 3);
        tx.set(MAP_B, [ 'note' ], 'door');
      });
      const copy = structuredClone(hub.snapshot(MAP_A));
      hub.release(MAP_A);
      hub.adoptSnapshot(copy);

      // Act.
      const result = hub.undo(mapHistoryKey(2));

      // Assert.
      expect([ result.ok, triggersOf(hub), fileOf(hub, MAP_B).note ])
        .toStrictEqual([ true, [ 0, 0, 3 ], '' ]);
    });
  });

  describe('redoing a step past edits made since its undo', () =>
  {
    it('refuses to redo a placement that would push an event placed since its undo out of its slot, and changes nothing', () =>
    {
      // Arrange: the pair is undone from map 1, then map 2 places a newer event 5 in the slot the pair had used, so
      // putting the pair's event 5 back would push the newer one into slot 6 while it still says it is event 5.
      const hub = buildHub();
      placeDoorPair(hub);
      hub.undo(mapHistoryKey(1));
      placeNewerEvent(hub, 5);
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act: redo the pair from map 1, where it is still the next redo.
      const asked = hub.canRedo(mapHistoryKey(1));
      const result = hub.redo(mapHistoryKey(1));

      // Assert: refused and named before anything is tried, the same answer both ways, and nothing touched.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        result.ok === false && 'message' in result && result.message,
        asked,
        stateOf(hub, histories),
      ])
        .toStrictEqual([ 'moved', 'Place event', 'redoing "Place door pair" would move what "Place event" changed', result, before ]);
    });

    it('refuses to redo a pair while one of its maps is not held, before checking anything else', () =>
    {
      // Arrange: the pair is undone from map 1, and map 2 is let go.
      const hub = buildHub();
      placeDoorPair(hub);
      hub.undo(mapHistoryKey(1));
      hub.release(MAP_B);

      // Act.
      const result = hub.redo(mapHistoryKey(1));

      // Assert.
      expect([ result.ok, result.ok === false && result.reason, result.ok === false && 'documents' in result && result.documents ])
        .toStrictEqual([ false, 'missing-documents', [ 'map:2' ] ]);
    });

    it('redoes a placement after edits since its undo that leave its slot alone', () =>
    {
      // Arrange: after the undo, map 2's newer event goes into its empty slot 2, and a cell is painted.
      const hub = buildHub();
      placeDoorPair(hub);
      hub.undo(mapHistoryKey(1));
      placeNewerEvent(hub, 2);
      hub.edit('Paint cave', [ mapHistoryKey(2) ], tx => tx.tiles(MAP_B, [ [ 0, 800 ] ]));

      // Act.
      const result = hub.redo(mapHistoryKey(1));

      // Assert: the pair is back on both maps, and the newer event and the painting keep their places.
      expect([ result.ok, slotsOf(hub), fileOf(hub, MAP_A).events[1]?.name, fileOf(hub, MAP_B).data[0] ])
        .toStrictEqual([ true, [ null, '1:Door', '2:Newer', '3:Chest', null, '5:EV005' ], 'Door to cave', 800 ]);
    });

    it('refuses to redo a change after the edit it was made on top of was undone since, and changes nothing', () =>
    {
      // Arrange: map 1 deletes the first page, and the event window then makes the page now first autorun. Both are
      // undone, the event window's first, so the page the change addressed is second again, and the index it wrote
      // to holds the first page, which does not autorun either.
      const hub = buildPagedHub();
      hub.edit('Delete page', [ mapHistoryKey(1) ], tx => tx.splice(MAP_A, [ 'events', 1, 'pages' ], 0, 1, []));
      hub.edit('Autorun page', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'pages', 0, 'trigger' ], 3));
      hub.undo(eventHistoryKey(1, 1));
      hub.undo(mapHistoryKey(1));
      const histories = [ eventHistoryKey(1, 1), mapHistoryKey(1) ];
      const before = stateOf(hub, histories);

      // Act.
      const result = hub.redo(eventHistoryKey(1, 1));

      // Assert.
      expect([
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
        result.ok === false && 'message' in result && result.message,
        triggersOf(hub),
        stateOf(hub, histories),
      ])
        .toStrictEqual([ 'moved', 'Delete page', 'undoing "Delete page" moved what "Autorun page" changes', [ 0, 0, 3 ], before ]);
    });

    it('redoes a change after an edit behind it was undone since', () =>
    {
      // Arrange: the same, but the deleted page was the last, behind the page the change addressed.
      const hub = buildPagedHub();
      hub.edit('Delete page', [ mapHistoryKey(1) ], tx => tx.splice(MAP_A, [ 'events', 1, 'pages' ], 2, 1, []));
      hub.edit('Autorun page', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'pages', 0, 'trigger' ], 3));
      hub.undo(eventHistoryKey(1, 1));
      hub.undo(mapHistoryKey(1));

      // Act.
      const result = hub.redo(eventHistoryKey(1, 1));

      // Assert: the first page autoruns, and the restored last page keeps its own trigger.
      expect([ result.ok, triggersOf(hub) ])
        .toStrictEqual([ true, [ 3, 0, 3 ] ]);
    });

    it('redoes a change whose own edit underneath was undone and redone since, putting it back where it was', () =>
    {
      // Arrange: one history adds a page and makes it autorun, undoes both, and redoes the page.
      const hub = buildPagedHub();
      hub.edit('Add page', [ eventHistoryKey(1, 1) ], tx => tx.splice(MAP_A, [ 'events', 1, 'pages' ], 1, 0, [ createEventPage() as unknown as JsonValue ]));
      hub.edit('Autorun new page', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'pages', 1, 'trigger' ], 3));
      hub.undo(eventHistoryKey(1, 1));
      hub.undo(eventHistoryKey(1, 1));
      hub.redo(eventHistoryKey(1, 1));

      // Act.
      const result = hub.redo(eventHistoryKey(1, 1));

      // Assert.
      expect([ result.ok, triggersOf(hub) ])
        .toStrictEqual([ true, [ 0, 3, 0, 3 ] ]);
    });

    it('refuses the same redo in a window that repeated every operation', () =>
    {
      // Arrange: the pair, its undo and the newer event all happen in the first window and are repeated in the second.
      const source = buildHub();
      const target = buildHub(undefined, 'window-b');
      mirror(source, target);
      placeDoorPair(source);
      source.undo(mapHistoryKey(1));
      placeNewerEvent(source, 5);

      // Act.
      const result = target.redo(mapHistoryKey(1));

      // Assert.
      expect([ result.ok === false && result.reason, result.ok === false && 'blockedBy' in result && result.blockedBy?.label, slotsOf(target) ])
        .toStrictEqual([ 'moved', 'Place event', [ null, '1:Door', null, '3:Chest', null, '5:Newer' ] ]);
    });

    it('hands another window an undone edit that no history lists any more, so the same redo is refused there', () =>
    {
      // Arrange: after both undos, map 1 records something new, which drops the deletion from every history; the map
      // then goes to a second window.
      const source = buildPagedHub();
      source.edit('Delete page', [ mapHistoryKey(1) ], tx => tx.splice(MAP_A, [ 'events', 1, 'pages' ], 0, 1, []));
      source.edit('Autorun page', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'pages', 0, 'trigger' ], 3));
      source.undo(eventHistoryKey(1, 1));
      source.undo(mapHistoryKey(1));
      source.edit('Retitle', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const snapshot = structuredClone(source.snapshot(MAP_A));
      const target = new DocumentHub({ clientId: 'window-b' });
      target.adoptSnapshot(snapshot);

      // Act.
      const result = target.redo(eventHistoryKey(1, 1));

      // Assert: the deletion travels beside the histories, and the second window refuses the redo as the first would.
      expect([
        snapshot.unlisted.map(step => step.label),
        result.ok === false && result.reason,
        result.ok === false && 'blockedBy' in result && result.blockedBy?.label,
      ])
        .toStrictEqual([ [ 'Delete page' ], 'moved', 'Delete page' ]);
    });

    it('refuses as untracked a redo on a copy whose record does not reach back to the undo, and redoes it with the whole record', () =>
    {
      // Arrange: map 2 is taken back from a copy that records nothing since the pair's undo, as a window that had
      // stopped tracking the pair would send it.
      const hub = buildHub();
      placeDoorPair(hub);
      hub.undo(mapHistoryKey(1));
      const whole = structuredClone(hub.snapshot(MAP_B));
      hub.adoptSnapshot({ ...whole, moves: [] });
      const histories = [ mapHistoryKey(1), mapHistoryKey(2) ];
      const before = stateOf(hub, histories);

      // Act: redo on the untracked copy, then take the whole copy and redo again.
      const refused = hub.redo(mapHistoryKey(1));
      const afterRefusal = stateOf(hub, histories);
      hub.adoptSnapshot(whole);
      const redone = hub.redo(mapHistoryKey(1));

      // Assert: the refusal names the map by its label, and says which document it is for a window that names it otherwise.
      expect([
        refused.ok === false && refused.reason,
        refused.ok === false && 'blockedBy' in refused && refused.blockedBy,
        refused.ok === false && 'message' in refused && refused.message,
        refused.ok === false && 'document' in refused && refused.document,
        afterRefusal,
        redone.ok,
        slotsOf(hub),
      ])
        .toStrictEqual([
          'untracked',
          null,
          'this window cannot tell what changed in Map 2 since "Place door pair" was undone',
          MAP_B,
          before,
          true,
          [ null, '1:Door', null, '3:Chest', null, '5:EV005' ],
        ]);
    });

    it('keeps its record of moves only as far back as the oldest undo a history can still redo', () =>
    {
      // Arrange: a reader for the record a copy of map 1 would carry.
      const hub = buildHub();
      const recorded = () => [ ...hub.snapshot(MAP_A).moves ];

      // Act: two steps, an undo, a step in the event's history, then a map step that drops the undone one.
      hub.edit('One', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'One'));
      const two = hub.edit('Two', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Two')) as HistoryStep;
      const nothingUndone = recorded();
      hub.undo(mapHistoryKey(1));
      const afterUndo = recorded();
      const three = hub.edit('Three', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'note' ], 'three')) as HistoryStep;
      const afterAnother = recorded();
      hub.edit('Four', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'parallaxName' ], 'Sky'));

      // Assert.
      expect([ nothingUndone, afterUndo, afterAnother, recorded() ])
        .toStrictEqual([ [], [ two.id ], [ two.id, three.id ], [] ]);
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

    it('reads as saved once later edits bring a document back to what its file holds, whatever steps it took there', () =>
    {
      // Arrange: a rename, then a second edit putting the old name back, both on map 1; map 2 renamed alone.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const renamed = hub.isDirty(MAP_A);
      hub.edit('Rename back', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Test Town'));

      // Act.
      hub.edit('Rename', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Harbor'));

      // Assert: map 1 holds two steps no save named, and reads as saved; map 2 does not.
      expect([ renamed, hub.appliedSteps(MAP_A).length, hub.isDirty(MAP_A), hub.dirtyKeys() ])
        .toStrictEqual([ true, 2, false, [ MAP_B ] ]);
    });

    it('leaves an edit still open out of whether a document is saved, reading it once the edit is done', () =>
    {
      // Arrange: a stroke under way on map 1, asked about before it began, and once it has painted.
      const hub = buildHub();
      const before = hub.isDirty(MAP_A);
      const stroke = hub.begin('Paint', [ mapHistoryKey(1) ]);
      stroke.tiles(MAP_A, [ [ 0, 999 ] ]);
      const midStroke = hub.isDirty(MAP_A);

      // Act.
      stroke.commit();

      // Assert.
      expect([ before, midStroke, hub.isDirty(MAP_A) ])
        .toStrictEqual([ false, false, true ]);
    });

    it('works out a document\'s saved state under an open edit from what it holds without that edit', () =>
    {
      // Arrange: a rename made, then a stroke opened over it before the map was ever asked about.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      hub.edit('Rename back', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Test Town'));
      const stroke = hub.begin('Paint', [ mapHistoryKey(1) ]);
      stroke.tiles(MAP_A, [ [ 0, 999 ] ]);

      // Act.
      const midStroke = hub.isDirty(MAP_A);
      stroke.cancel();

      // Assert: saved mid-stroke, as the map would be with the stroke cancelled, and so it is.
      expect([ midStroke, hub.isDirty(MAP_A) ])
        .toStrictEqual([ false, false ]);
    });

    it('hands what a document\'s file holds to another window with its unsaved edits, and nothing more for a clean one', () =>
    {
      // Arrange: map 1 renamed and unsaved; map 2 untouched.
      const source = buildHub();
      const target = new DocumentHub({ clientId: 'window-b', now: () => 1000 });
      source.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const snapshots = [ source.snapshot(MAP_A), source.snapshot(MAP_B) ];

      // Act.
      snapshots.forEach(snapshot => target.adoptSnapshot(snapshot));

      // Assert: the other window reads map 1 unsaved against the file this one knows, and map 2 saved.
      expect([ snapshots.map(snapshot => 'file' in snapshot), target.isDirty(MAP_A), target.fileContent(MAP_A), target.isDirty(MAP_B) ])
        .toStrictEqual([ [ true, false ], true, buildMapJson(), false ]);
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

    /**
     * Reads a history's rows the way the history panel lists them.
     * @param {DocumentHub} hub The hub.
     * @param {HistoryKey} key The history.
     * @returns {string[]} "label" for a done step and "(label)" for an undone one, oldest first.
     */
    const rowsOf = (hub: DocumentHub, key: HistoryKey): string[] => hub.history(key).rows.map(row => (row.done ? row.label : `(${row.label})`));

    /**
     * A hub holding map 1 with a rename saved, whose file then changes in MZ.
     * @returns {Promise<object>} The hub, and the store's files and saves.
     */
    const buildChangedOutside = async () =>
    {
      const { store, files, saves } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      await hub.save(MAP_A);
      changeOnDisk(files, 'Changed in MZ');
      return { hub, files, saves };
    };

    it('records the file\'s version on a clean document as one step, keeping every step before it and staying saved', async () =>
    {
      // Arrange: map 2 beside it is held too, and nothing about it changes.
      const { hub, saves } = await buildChangedOutside();

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert: the lineage still starts from the file first loaded, and nothing was written to any file.
      expect([ result, fileOf(hub, MAP_A).displayName, rowsOf(hub, mapHistoryKey(1)), hub.isDirty(MAP_A), saves.length ])
        .toStrictEqual([ 'recorded', 'Changed in MZ', [ 'Rename', 'Externally modified' ], false, 1 ]);
      expect([ hub.lineage(MAP_A).length, hub.lineage(MAP_A)[0], rowsOf(hub, mapHistoryKey(2)), fileOf(hub, MAP_B).displayName ])
        .toStrictEqual([ 3, diskOperationId(buildMapJson() as unknown as JsonValue), [], 'Test Town' ]);
    });

    it('tells the step a version found on disk is recorded as from every step made in a window', async () =>
    {
      // Arrange: the rename made here, then the file's version taken.
      const { hub } = await buildChangedOutside();
      await hub.handleExternalChange(MAP_A);

      // Act.
      const told = hub.appliedSteps(MAP_A).map(step => [ step.label, isOutsideStep(step) ]);

      // Assert.
      expect(told)
        .toStrictEqual([ [ 'Rename', false ], [ 'Externally modified', true ] ]);
    });

    it('undoes the step to the version the editor had, as an unsaved edit, and redoes it to the file\'s version, saved again', async () =>
    {
      // Arrange.
      const { hub, saves } = await buildChangedOutside();
      await hub.handleExternalChange(MAP_A);

      // Act.
      const undone = hub.undo(mapHistoryKey(1));
      const afterUndo = [ fileOf(hub, MAP_A).displayName, hub.isDirty(MAP_A), rowsOf(hub, mapHistoryKey(1)) ];
      const redone = hub.redo(mapHistoryKey(1));

      // Assert: neither move wrote to the file, which holds the outside version throughout.
      expect([ undone.ok && undone.step.label, afterUndo, redone.ok, fileOf(hub, MAP_A).displayName, hub.isDirty(MAP_A), saves.length ])
        .toStrictEqual([ 'Externally modified', [ 'Harbor', true, [ 'Rename', '(Externally modified)' ] ], true, 'Changed in MZ', false, 1 ]);
    });

    it('lets the steps before it undo once it is undone, back to the file first loaded', async () =>
    {
      // Arrange.
      const { hub } = await buildChangedOutside();
      await hub.handleExternalChange(MAP_A);

      // Act.
      const undone = [ hub.undo(mapHistoryKey(1)), hub.undo(mapHistoryKey(1)) ].map(result => result.ok && result.step.label);

      // Assert.
      expect([ undone, fileOf(hub, MAP_A) ])
        .toStrictEqual([ [ 'Externally modified', 'Rename' ], buildMapJson() ]);
    });

    it('lets another history undo past the step when it changed other data, and refuses, naming it, when it changed the same', async () =>
    {
      // Arrange: in two windows the event window renames the door and it is saved; then the file changes outside, the
      // map's title in the first window and the door's name in the second.
      const stores = [ buildStore(), buildStore() ];
      const hubs = stores.map(({ store }) => buildHub(store));
      for (const hub of hubs)
      {
        hub.edit('Rename door', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Gate'));
        await hub.save(MAP_A);
      }
      changeOnDisk(stores[0].files, 'Changed in MZ');
      const renamed = structuredClone(stores[1].files.get(MAP_A)) as unknown as RmmzMap;
      (renamed.events[1] as RmmzMapEvent).name = 'Portal';
      stores[1].files.set(MAP_A, renamed as unknown as JsonValue);
      for (const hub of hubs)
      {
        await hub.handleExternalChange(MAP_A);
      }

      // Act.
      const results = hubs.map(hub => hub.undo(eventHistoryKey(1, 1)));

      // Assert.
      expect([
        results.map(result => (result.ok ? result.step.label : [ result.reason, 'blockedBy' in result && result.blockedBy?.label ])),
        hubs.map(hub => [ fileOf(hub, MAP_A).displayName, fileOf(hub, MAP_A).events[1]?.name ]),
      ])
        .toStrictEqual([ [ 'Rename door', [ 'conflict', 'Externally modified' ] ], [ [ 'Changed in MZ', 'Door' ], [ 'Test Town', 'Portal' ] ] ]);
    });

    it('records the very same step in two windows that hear the same change, so one repeating the other\'s finds it there', async () =>
    {
      // Arrange: two windows at the same state over one file, and a record of what the first posts.
      const { store, files } = buildStore();
      const hubs = [ buildHub(store, 'window-a'), buildHub(store, 'window-b') ];
      changeOnDisk(files, 'Changed in MZ');
      const posted: RemoteOperation[] = [];
      hubs[0].subscribe(event =>
      {
        const operation = 'source' in event && event.source === 'local'
          ? operationFor(event, 'window-a')
          : null;
        if (operation !== null)
        {
          posted.push(operation);
        }
      });

      // Act: both hear the change, then the second is handed what the first posted.
      for (const hub of hubs)
      {
        await hub.handleExternalChange(MAP_A);
      }
      const heard: string[] = [];
      hubs[1].subscribe(event => heard.push(event.type));
      posted.forEach(operation => hubs[1].applyRemote(structuredClone(operation)));

      // Assert: the step was already there, so only the save is heard.
      expect([ posted.map(operation => operation.type), heard, [ ...hubs[1].lineage(MAP_A) ], hubs[1].history(mapHistoryKey(1)), hubs[1].isDirty(MAP_A) ])
        .toStrictEqual([ [ 'commit', 'saved' ], [ 'saved' ], [ ...hubs[0].lineage(MAP_A) ], hubs[0].history(mapHistoryKey(1)), false ]);
    });

    it('records the step in the history of whatever it touched, for the tree, the tilesets and editor-only documents', async () =>
    {
      // Arrange: each document's file changes by one value.
      const onDisk = new Map<DocumentKey, JsonValue>([
        [ 'mapinfos', [ null, { id: 1, name: 'Port' } ] ],
        [ 'tilesets', [ null, { id: 1, name: 'Overworld' } ] ],
        [ 'editor-data:layouts', { schemaVersion: 1, data: { layouts: { main: {} } } } ],
      ]);
      const store: DocumentStore = { load: async key => structuredClone(onDisk.get(key) as JsonValue), save: async () => undefined };
      const hub = new DocumentHub({ clientId: 'window-a', store });
      hub.adopt('mapinfos', [ null, { id: 1, name: 'Harbor' } ]);
      hub.adopt('tilesets', [ null, { id: 1, name: 'Outside' } ]);
      hub.adopt('editor-data:layouts', { schemaVersion: 1, data: { layouts: {} } });

      // Act.
      const results = [
        await hub.handleExternalChange('mapinfos'),
        await hub.handleExternalChange('tilesets'),
        await hub.handleExternalChange('editor-data:layouts'),
      ];

      // Assert.
      expect([ results, rowsOf(hub, 'tree'), rowsOf(hub, 'tilesets'), rowsOf(hub, 'editor-data:layouts'), hub.dirtyKeys() ])
        .toStrictEqual([ [ 'recorded', 'recorded', 'recorded' ], [ 'Externally modified' ], [ 'Externally modified' ], [ 'Externally modified' ], [] ]);
    });

    it('records a change to the common events in the history of each one it touched, and undoes it whole from any of them', async () =>
    {
      // Arrange: common event 2 is renamed and a third arrives; common event 1 stays as it was.
      const intro = { id: 1, name: 'Intro', list: [] };
      const onDisk: JsonValue = [ null, intro, { id: 2, name: 'Market', list: [] }, { id: 3, name: 'Inn', list: [] } ];
      const store: DocumentStore = { load: async () => structuredClone(onDisk), save: async () => undefined };
      const hub = new DocumentHub({ clientId: 'window-a', store });
      const before: JsonValue = [ null, intro, { id: 2, name: 'Shop', list: [] } ];
      hub.adopt('common-events', before);
      await hub.handleExternalChange('common-events');
      const recorded = [ rowsOf(hub, commonEventHistoryKey(1)), rowsOf(hub, commonEventHistoryKey(2)), rowsOf(hub, commonEventHistoryKey(3)) ];

      // Act.
      const undone = hub.undo(commonEventHistoryKey(3));

      // Assert.
      expect([ recorded, undone.ok, hub.document('common-events').toJson(), rowsOf(hub, commonEventHistoryKey(2)), hub.isDirty('common-events') ])
        .toStrictEqual([ [ [], [ 'Externally modified' ], [ 'Externally modified' ] ], true, before, [ '(Externally modified)' ], true ]);
    });

    it('finds nothing to do when the file holds what it last saved, even with edits made since, and records no step', async () =>
    {
      // Arrange: a rename saved, then a retitle not yet saved; the file holds the save, as its echo would find it.
      const { store } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      await hub.save(MAP_A);
      hub.edit('Retitle', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'unsaved'));
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, events, rowsOf(hub, mapHistoryKey(1)), hub.isDirty(MAP_A), fileOf(hub, MAP_A).note ])
        .toStrictEqual([ 'unchanged', [], [ 'Rename', 'Retitle' ], true, 'unsaved' ]);
    });

    it('finds nothing to do when the file holds a state its latest edits passed through, as a save\'s echo overtaking its message does', async () =>
    {
      // Arrange: another window saved once the rename and the retag had reached this one, and the file holds that save;
      // a later edit is here too, and the save's own message has not arrived, so this window still counts all three unsaved.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'saved elsewhere'));
      files.set(MAP_A, fileOf(hub, MAP_A) as unknown as JsonValue);
      hub.edit('Retitle', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'parallaxName' ], 'Sky'));

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert: nothing flagged, and the edits stay as they were.
      expect([ result, hub.isConflicted(MAP_A), rowsOf(hub, mapHistoryKey(1)), hub.isDirty(MAP_A), fileOf(hub, MAP_A).parallaxName ])
        .toStrictEqual([ 'unchanged', false, [ 'Rename', 'Retag', 'Retitle' ], true, 'Sky' ]);
    });

    it('counts the document saved exactly as far as the state its file matches, so undoing back past it reads as unsaved', async () =>
    {
      // Arrange: two unsaved retags over the loaded file; the file then comes to hold the first of them, as a save's
      // echo would, or a write that happens to match it.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Retag once', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'first'));
      const first = fileOf(hub, MAP_A);
      hub.edit('Retag twice', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'second'));
      files.set(MAP_A, first as unknown as JsonValue);

      // Act: the change arrives, then both retags are undone one at a time.
      const result = await hub.handleExternalChange(MAP_A);
      const atSecond = hub.isDirty(MAP_A);
      hub.undo(mapHistoryKey(1));
      const atFirst = hub.isDirty(MAP_A);
      hub.undo(mapHistoryKey(1));
      const atLoaded = hub.isDirty(MAP_A);

      // Assert: unsaved on either side of the state the file holds, and saved exactly at it.
      expect([ result, hub.isConflicted(MAP_A), atSecond, atFirst, atLoaded, fileOf(hub, MAP_A).note ])
        .toStrictEqual([ 'unchanged', false, true, false, true, '' ]);
    });

    it('counts a document with unsaved edits saved once its file comes to hold exactly what it holds', async () =>
    {
      // Arrange: a rename not yet saved here, which the file already holds, as when another window's save of it
      // arrives ahead of the message saying so.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      files.set(MAP_A, fileOf(hub, MAP_A) as unknown as JsonValue);
      const before = hub.isDirty(MAP_A);

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert: saved, with the rename still the only step and nothing recorded for the file.
      expect([ before, result, hub.isDirty(MAP_A), rowsOf(hub, mapHistoryKey(1)) ])
        .toStrictEqual([ true, 'unchanged', false, [ 'Rename' ] ]);
    });

    it('still finds the file holding what it was last loaded as, however many edits came since', async () =>
    {
      // Arrange: forty unsaved edits over a file nobody touched.
      const { store } = buildStore();
      const hub = buildHub(store);
      for (let count = 1; count <= 40; count++)
      {
        hub.edit(`Retag ${count}`, [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], `edit ${count}`));
      }

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, hub.isConflicted(MAP_A), fileOf(hub, MAP_A).note ])
        .toStrictEqual([ 'unchanged', false, 'edit 40' ]);
    });

    it('flags a removed file where it is held, keeping what it holds, and a document it does not hold not at all', () =>
    {
      // Arrange.
      const hub = buildHub();
      const before = fileOf(hub, MAP_A);

      // Act.
      const results = [ hub.applyOutsideContent(MAP_A, null), hub.applyOutsideContent('map:40', null) ];

      // Assert.
      expect([ results, hub.conflict(MAP_A), fileOf(hub, MAP_A), hub.isConflicted(MAP_B) ])
        .toStrictEqual([ [ 'conflicted', 'ignored' ], { kind: 'disk', content: null }, before, false ]);
    });

    /*
     * A map whose file is removed outside the editor holds the only copy left, so it matches no file: it reads as unsaved,
     * which is what makes closing its window ask first, until a save writes the file back. A map that read as saved there
     * would be let go of with nobody warned, and the map lost. The file coming back is a version found on disk like any
     * other, weighed against what the file held before it went: a map holding just that takes it as a clean map would.
     */
    describe('a file removed from disk', () =>
    {
      it('reads a clean map as unsaved once its file is removed, the map beside it still saved, and saved once a save writes it back', async () =>
      {
        // Arrange: map 1's file removed from disk, and taken as removed.
        const { store, files } = buildStore();
        const hub = buildHub(store);
        files.delete(MAP_A);
        hub.applyOutsideContent(MAP_A, null);
        const removed = [ hub.dirtyKeys(), hub.isFileRemoved(MAP_A), hub.fileContent(MAP_A), hub.isFileRemoved(MAP_B) ];

        // Act: the author keeps the map, and saves it.
        hub.clearConflict(MAP_A);
        await hub.save(MAP_A);

        // Assert: the save wrote the map back as it stands, and it reads as saved again.
        expect([ removed, files.get(MAP_A), hub.isDirty(MAP_A), hub.isFileRemoved(MAP_A), hub.fileContent(MAP_A) ])
          .toStrictEqual([ [ [ MAP_A ], true, null, false ], fileOf(hub, MAP_A), false, false, fileOf(hub, MAP_A) ]);
      });

      it('settles a removed file\'s conflict by the save that writes it back, and leaves a changed file\'s standing', async () =>
      {
        // Arrange: map 1's file removed, and map 2's changed on disk while it held an unsaved edit.
        const { store, files } = buildStore();
        const hub = buildHub(store);
        files.delete(MAP_A);
        hub.applyOutsideContent(MAP_A, null);
        hub.edit('Rename map', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Harbor'));
        hub.flagConflict(MAP_B, { kind: 'disk', content: buildMapJson() as unknown as JsonValue });
        const before = [ isFileGone(hub.conflict(MAP_A)), isFileGone(hub.conflict(MAP_B)), isFileGone(null) ];

        // Act: both saved, neither settled by hand first.
        await hub.save(MAP_A);
        await hub.save(MAP_B);

        // Assert: map 1's file is back and nothing stands over it; map 2's choice still waits for the author.
        expect([ before, files.get(MAP_A), hub.conflict(MAP_A), hub.isDirty(MAP_A), hub.conflict(MAP_B)?.kind ])
          .toStrictEqual([ [ true, false, false ], fileOf(hub, MAP_A), null, false, 'disk' ]);
      });

      it('takes a removed file come back as the map holds it as nothing new, the map saved and the removal no longer flagged', () =>
      {
        // Arrange.
        const hub = buildHub();
        hub.applyOutsideContent(MAP_A, null);

        // Act.
        const result = hub.applyOutsideContent(MAP_A, buildMapJson() as unknown as JsonValue);

        // Assert.
        expect([ result, hub.isDirty(MAP_A), hub.isConflicted(MAP_A), hub.isFileRemoved(MAP_A), rowsOf(hub, mapHistoryKey(1)) ])
          .toStrictEqual([ 'unchanged', false, false, false, [] ]);
      });

      it('records a removed file come back changed as a step on a map holding no edits of its own, saved and no longer flagged', () =>
      {
        // Arrange.
        const hub = buildHub();
        hub.applyOutsideContent(MAP_A, null);
        const changed = { ...buildMapJson(), displayName: 'Back again' } as unknown as JsonValue;

        // Act.
        const result = hub.applyOutsideContent(MAP_A, changed);

        // Assert.
        expect([ result, fileOf(hub, MAP_A).displayName, rowsOf(hub, mapHistoryKey(1)), hub.isDirty(MAP_A), hub.isConflicted(MAP_A) ])
          .toStrictEqual([ 'recorded', 'Back again', [ 'Externally modified' ], false, false ]);
      });

      it('flags a removed file come back changed on a map holding edits of its own, which keeps them and stays unsaved', () =>
      {
        // Arrange: map 1 renamed and unsaved before its file was removed.
        const hub = buildHub();
        hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
        hub.applyOutsideContent(MAP_A, null);
        const changed = { ...buildMapJson(), displayName: 'Back again' } as unknown as JsonValue;

        // Act.
        const result = hub.applyOutsideContent(MAP_A, changed);

        // Assert.
        expect([ result, hub.conflict(MAP_A), fileOf(hub, MAP_A).displayName, hub.isDirty(MAP_A), hub.isFileRemoved(MAP_A) ])
          .toStrictEqual([ 'conflicted', { kind: 'disk', content: changed }, 'Harbor', true, false ]);
      });

      it('takes a removed file come back when only re-read after the stream came back, though the map read as unsaved', () =>
      {
        // Arrange: map 1's file removed; map 2 holds an unsaved rename, so a re-read leaves it alone.
        const hub = buildHub();
        hub.applyOutsideContent(MAP_A, null);
        hub.edit('Rename', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Harbor'));
        const file = buildMapJson() as unknown as JsonValue;

        // Act.
        const results = [ hub.applyOutsideContent(MAP_A, file, true), hub.applyOutsideContent(MAP_B, file, true) ];

        // Assert.
        expect([ results, hub.isDirty(MAP_A), hub.isConflicted(MAP_A), hub.isDirty(MAP_B) ])
          .toStrictEqual([ [ 'unchanged', 'ignored' ], false, false, true ]);
      });

      it('hands a removed file to another window, which reads the map as unsaved and takes the file back as this one would', () =>
      {
        // Arrange: map 1's file removed here; map 2's still there.
        const source = buildHub();
        const target = new DocumentHub({ clientId: 'window-b', now: () => 1000 });
        source.applyOutsideContent(MAP_A, null);
        const snapshots = [ source.snapshot(MAP_A), source.snapshot(MAP_B) ];
        snapshots.forEach(snapshot => target.adoptSnapshot(snapshot));
        const adopted = [ target.isDirty(MAP_A), target.isFileRemoved(MAP_A), target.isDirty(MAP_B) ];

        // Act: the file comes back as it was before it went.
        const result = target.applyOutsideContent(MAP_A, buildMapJson() as unknown as JsonValue);

        // Assert.
        expect([ snapshots.map(snapshot => snapshot.removed), adopted, result, target.isDirty(MAP_A) ])
          .toStrictEqual([ [ true, undefined ], [ true, true, false ], 'unchanged', false ]);
      });
    });

    it('leaves a document with unsaved edits alone when its file is only re-read, and takes a clean one\'s change', () =>
    {
      // Arrange: map 1 has an unsaved rename; both files changed while the change stream was down.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const changed = { ...buildMapJson(), note: 'changed while down' } as unknown as JsonValue;

      // Act.
      const results = [ hub.applyOutsideContent(MAP_A, changed, true), hub.applyOutsideContent(MAP_B, changed, true) ];

      // Assert.
      expect([ results, hub.isConflicted(MAP_A), fileOf(hub, MAP_A).note, fileOf(hub, MAP_B).note, rowsOf(hub, mapHistoryKey(2)) ])
        .toStrictEqual([ [ 'ignored', 'recorded' ], false, '', 'changed while down', [ 'Externally modified' ] ]);
    });

    it('works out what it last saved past a step undone since, and finds nothing to do then either', async () =>
    {
      // Arrange: two renames saved, the second then undone; the file still holds both.
      const { store } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'saved'));
      await hub.save(MAP_A);
      hub.undo(mapHistoryKey(1));

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, hub.isConflicted(MAP_A), rowsOf(hub, mapHistoryKey(1)), fileOf(hub, MAP_A).note ])
        .toStrictEqual([ 'unchanged', false, [ 'Rename', '(Retag)' ], '' ]);
    });

    it('finds nothing to do when the file holds what it last wrote, though the step that save held is gone', async () =>
    {
      // Arrange: a rename saved, undone, and pushed out of the history by a new edit; the file holds the rename.
      const { store } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      await hub.save(MAP_A);
      hub.undo(mapHistoryKey(1));
      hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'unsaved'));

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert: nothing flagged, the edits stay as they were, and the map still reads unsaved against the rename.
      expect([ result, hub.isConflicted(MAP_A), rowsOf(hub, mapHistoryKey(1)), fileOf(hub, MAP_A).note, hub.isDirty(MAP_A) ])
        .toStrictEqual([ 'unchanged', false, [ 'Retag' ], 'unsaved', true ]);
    });

    it('finds nothing to do when the file holds what it was known to hold, though an unsaved edit\'s data was changed behind its back', async () =>
    {
      // Arrange: an unsaved rename, whose target then changes without any step, so it no longer takes back out.
      const { store } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      hub.document(MAP_A).apply({ kind: 'set', path: [ 'displayName' ], before: 'Harbor', after: 'Elsewhere' });

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert: nothing flagged, with the window's copy as it was.
      expect([ result, hub.isConflicted(MAP_A), fileOf(hub, MAP_A).displayName, rowsOf(hub, mapHistoryKey(1)) ])
        .toStrictEqual([ 'unchanged', false, 'Elsewhere', [ 'Rename' ] ]);
    });

    it('flags a document with unsaved edits once its file comes to hold something it cannot tell from any state it passed through', async () =>
    {
      // Arrange: a rename saved, undone, and pushed out of the history by a new edit; the file then changes in MZ.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      await hub.save(MAP_A);
      hub.undo(mapHistoryKey(1));
      hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'unsaved'));
      const changed = changeOnDisk(files, 'Changed in MZ');

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert: flagged, since nothing unsaved is ever merged into; the edits stay as they were, and the map reads
      // unsaved against the file's new version.
      expect([ result, hub.conflict(MAP_A), rowsOf(hub, mapHistoryKey(1)), hub.isDirty(MAP_A), hub.fileContent(MAP_A) ])
        .toStrictEqual([ 'conflicted', { kind: 'disk', content: changed }, [ 'Retag' ], true, changed ]);
    });

    it('learns what a file re-read holds for a document with unsaved edits, which then reads as saved when it holds just that', () =>
    {
      // Arrange: map 1 has an unsaved rename, and its file came to hold that very rename while the change stream was down.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const renamed = { ...buildMapJson(), displayName: 'Harbor' } as unknown as JsonValue;
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      const result = hub.applyOutsideContent(MAP_A, renamed, true);

      // Assert: left alone, but saved, and every listener told what the file holds.
      expect([ result, hub.isDirty(MAP_A), hub.isConflicted(MAP_A), events ])
        .toStrictEqual([ 'ignored', false, false, [ { type: 'written', document: MAP_A, content: renamed, source: 'local', origin: 'window-a' } ] ]);
    });

    it('keeps unsaved edits and flags the document with the file\'s content beside them, recording no step', async () =>
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
      expect([ result, fileOf(hub, MAP_A).displayName, hub.conflict(MAP_A), events, rowsOf(hub, mapHistoryKey(1)) ])
        .toStrictEqual([ 'conflicted', 'Harbor', conflict, [ { type: 'conflicted', document: MAP_A, conflict } ], [ 'Rename' ] ]);
    });

    it('flags a document mid-edit rather than recording a step under the open edit', async () =>
    {
      // Arrange.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      changeOnDisk(files, 'Changed in MZ');
      const transaction = hub.begin('Paint', [ mapHistoryKey(1) ]);
      transaction.tiles(MAP_A, [ [ 0, 5 ] ]);

      // Act.
      const result = await hub.handleExternalChange(MAP_A);
      transaction.cancel();

      // Assert.
      expect([ result, hub.isConflicted(MAP_A), fileOf(hub, MAP_A).displayName, rowsOf(hub, mapHistoryKey(1)) ])
        .toStrictEqual([ 'conflicted', true, 'Test Town', [] ]);
    });

    it('flags rather than records a file whose whole value changed kind, keeping what it holds', async () =>
    {
      // Arrange: the map tree's file is no longer a list at all.
      const store: DocumentStore = { load: async () => ({ rows: [] }), save: async () => undefined };
      const hub = new DocumentHub({ clientId: 'window-a', store });
      hub.adopt('mapinfos', [ null, { id: 1, name: 'Harbor' } ]);

      // Act.
      const result = await hub.handleExternalChange('mapinfos');

      // Assert.
      expect([ result, hub.conflict('mapinfos'), hub.document('mapinfos').toJson(), rowsOf(hub, 'tree') ])
        .toStrictEqual([ 'conflicted', { kind: 'disk', content: { rows: [] } }, [ null, { id: 1, name: 'Harbor' } ], [] ]);
    });

    it('clears a flag an earlier change raised once the file holds what the window last had again', async () =>
    {
      // Arrange: an unsaved rename meets a change on disk, which is flagged; then the file goes back as it was.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const original = structuredClone(files.get(MAP_A) as JsonValue);
      changeOnDisk(files, 'Changed in MZ');
      const first = await hub.handleExternalChange(MAP_A);
      files.set(MAP_A, original);

      // Act.
      const second = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ first, second, hub.isConflicted(MAP_A), fileOf(hub, MAP_A).displayName, hub.isDirty(MAP_A) ])
        .toStrictEqual([ 'conflicted', 'unchanged', false, 'Harbor', true ]);
    });

    it('records a removed file that comes back changed as a step, clearing the removal\'s flag', async () =>
    {
      // Arrange: the file was removed, which routing flags, and a changed one now stands in its place.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      hub.flagConflict(MAP_A, { kind: 'disk', content: null });
      changeOnDisk(files, 'Back again');

      // Act.
      const result = await hub.handleExternalChange(MAP_A);

      // Assert.
      expect([ result, hub.isConflicted(MAP_A), fileOf(hub, MAP_A).displayName, rowsOf(hub, mapHistoryKey(1)) ])
        .toStrictEqual([ 'recorded', false, 'Back again', [ 'Externally modified' ] ]);
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
      target.applyRemote({ type: 'saved', origin: 'window-a', document: MAP_A, marker: [ step.id ], content: fileOf(source, MAP_A) as unknown as JsonValue });
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

  /*
   * A document kept alongside others, such as the record of where blueprints are placed, is state saved a part at a
   * time with the documents it describes. It moves with their steps like any document, but it never reads as unsaved
   * and is never saved whole, a change to its file is handed on rather than taken or flagged, it is never flagged at
   * all, and another window's step goes into it whenever its patches fit, whatever its head.
   */
  describe('documents kept alongside others', () =>
  {
    const USES: DocumentKey = 'editor-data:blueprint-uses';

    /**
     * A hub holding both fixture maps and an empty record of placements.
     * @param {DocumentStore} store Optional store.
     * @param {string} clientId The window's id.
     * @returns {DocumentHub} The hub.
     */
    const buildRecordHub = (store?: DocumentStore, clientId = 'window-a'): DocumentHub =>
    {
      const hub = buildHub(store, clientId);
      hub.adopt(USES, { schemaVersion: 2, data: { maps: {} } });
      return hub;
    };

    /**
     * Paints map 1 or 2 and records a placement on it in the same step, as placing a blueprint does.
     * @param {DocumentHub} hub The hub.
     * @param {1 | 2} mapId The map.
     * @param {number} x The placement's column.
     * @returns {HistoryStep} The step.
     */
    const place = (hub: DocumentHub, mapId: 1 | 2, x: number): HistoryStep => hub.edit('Place', [ mapHistoryKey(mapId) ], tx =>
    {
      tx.set(`map:${mapId}`, [ 'note' ], `placed at ${x}`);
      tx.set(USES, [ 'data', 'maps', String(mapId) ], { aa22: [ { x, y: 0 } ] });
    }) as HistoryStep;

    it('never reads as unsaved, while the map its step changed does', () =>
    {
      // Arrange.
      const hub = buildRecordHub();

      // Act.
      place(hub, 1, 3);

      // Assert.
      expect([ hub.isDirty(USES), hub.isDirty(MAP_A), hub.dirtyKeys() ])
        .toStrictEqual([ false, true, [ MAP_A ] ]);
    });

    it('keeps no copy of its file, its keeper writing that a part at a time, and hands none to another window', () =>
    {
      // Arrange.
      const hub = buildRecordHub();
      place(hub, 1, 3);

      // Act.
      const snapshot = hub.snapshot(USES);

      // Assert: the map beside it keeps the file it was loaded from.
      expect([ hub.fileContent(USES), 'file' in snapshot, hub.fileContent(MAP_A) ])
        .toStrictEqual([ null, false, buildMapJson() ]);
    });

    it('refuses to be saved whole, writing nothing', async () =>
    {
      // Arrange.
      const { store, saves } = buildStore();
      const hub = buildRecordHub(store);
      place(hub, 1, 3);

      // Act.
      const save = hub.save(USES);

      // Assert.
      await expect(save)
        .rejects.toThrow('editor-data:blueprint-uses is kept alongside the documents it describes, and is never saved whole');
      expect(saves)
        .toStrictEqual([]);
    });

    it('hands a change to its file on as it was read, taking nothing and flagging nothing', () =>
    {
      // Arrange: a placement here the file lacks, then the file changed elsewhere, and then removed.
      const hub = buildRecordHub();
      place(hub, 1, 3);
      const before = hub.document(USES).toJson();
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));
      const changed = { schemaVersion: 2, data: { maps: { 2: { bb11: [ { x: 0, y: 0 } ] } } } };

      // Act.
      const results = [ hub.applyOutsideContent(USES, changed), hub.applyOutsideContent(USES, null, true) ];

      // Assert.
      expect([ results, events, hub.document(USES).toJson(), hub.isConflicted(USES) ])
        .toStrictEqual([
          [ 'kept', 'kept' ],
          [
            { type: 'outside', document: USES, content: changed, recheck: false },
            { type: 'outside', document: USES, content: null, recheck: true },
          ],
          before,
          false,
        ]);
    });

    it('is never flagged in conflict, while any other document is', () =>
    {
      // Arrange.
      const hub = buildRecordHub();

      // Act.
      hub.flagConflict(USES, { kind: 'disk', content: null });
      hub.flagConflict(MAP_A, { kind: 'disk', content: null });

      // Assert.
      expect([ hub.isConflicted(USES), hub.isConflicted(MAP_A) ])
        .toStrictEqual([ false, true ]);
    });

    it('takes steps made on different parts at the same moment in two windows in both, in either order', () =>
    {
      // Arrange: each window places on its own map before hearing the other.
      const windowA = buildRecordHub(undefined, 'window-a');
      const windowB = buildRecordHub(undefined, 'window-b');
      const fromA: RemoteOperation[] = [];
      const fromB: RemoteOperation[] = [];
      windowA.subscribe(event => fromA.push(operationFor(event, 'window-a') as RemoteOperation));
      windowB.subscribe(event => fromB.push(operationFor(event, 'window-b') as RemoteOperation));
      place(windowA, 1, 3);
      place(windowB, 2, 5);
      const events: HubEvent[] = [];
      windowA.subscribe(event => events.push(event));
      windowB.subscribe(event => events.push(event));

      // Act.
      windowA.applyRemote(structuredClone(fromB[0]));
      windowB.applyRemote(structuredClone(fromA[0]));

      // Assert: both placements in both windows, each map's own step in its own history, and nothing out of step.
      const expected = { schemaVersion: 2, data: { maps: { 1: { aa22: [ { x: 3, y: 0 } ] }, 2: { aa22: [ { x: 5, y: 0 } ] } } } };
      expect([
        windowA.document(USES).toJson(),
        windowB.document(USES).toJson(),
        fileOf(windowA, MAP_B).note,
        events.map(event => event.type),
      ])
        .toStrictEqual([ expected, expected, 'placed at 5', [ 'committed', 'committed' ] ]);
    });

    it('refuses another window\'s step whose patch on it does not fit, changing nothing anywhere', () =>
    {
      // Arrange: both windows place on map 1 before hearing each other.
      const windowA = buildRecordHub(undefined, 'window-a');
      const windowB = buildRecordHub(undefined, 'window-b');
      const fromB: RemoteOperation[] = [];
      windowB.subscribe(event => fromB.push(operationFor(event, 'window-b') as RemoteOperation));
      place(windowA, 1, 3);
      place(windowB, 1, 5);
      const before = [ windowA.document(USES).toJson(), fileOf(windowA, MAP_A) ];
      const events: HubEvent[] = [];
      windowA.subscribe(event => events.push(event));

      // Act.
      windowA.applyRemote(structuredClone(fromB[0]));

      // Assert.
      expect([ [ windowA.document(USES).toJson(), fileOf(windowA, MAP_A) ], events ])
        .toStrictEqual([ before, [ { type: 'out-of-sync', documents: [ MAP_A, USES ], origin: 'window-b' } ] ]);
    });

    it('still holds every other document to its head', () =>
    {
      // Arrange: map 1 moved on in this window alone, then another window's step on map 1 and the record.
      const windowA = buildRecordHub(undefined, 'window-a');
      const windowB = buildRecordHub(undefined, 'window-b');
      const fromB: RemoteOperation[] = [];
      windowB.subscribe(event => fromB.push(operationFor(event, 'window-b') as RemoteOperation));
      windowA.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      place(windowB, 1, 5);
      const events: HubEvent[] = [];
      windowA.subscribe(event => events.push(event));

      // Act.
      windowA.applyRemote(structuredClone(fromB[0]));

      // Assert.
      expect([ windowA.document(USES).toJson(), events ])
        .toStrictEqual([ { schemaVersion: 2, data: { maps: {} } }, [ { type: 'out-of-sync', documents: [ MAP_A, USES ], origin: 'window-b' } ] ]);
    });
  });

  /*
   * A save names the window that wrote the file, so whoever writes what goes with that file knows whether that window
   * wrote it already; and the steps a document holds, and those its file holds, can be read.
   */
  describe('saves and the steps behind them', () =>
  {
    it('names this window for its own save, and the saving window for another window\'s, each with what the file holds', async () =>
    {
      // Arrange.
      const { store } = buildStore();
      const hub = buildHub(store);
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      const renamed = fileOf(hub, MAP_A) as unknown as JsonValue;
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      await hub.save(MAP_A);
      hub.applyRemote({ type: 'saved', origin: 'window-b', document: MAP_A, marker: [ step.id ], content: renamed });

      // Assert.
      expect(events)
        .toStrictEqual([
          { type: 'saved', document: MAP_A, marker: [ step.id ], source: 'local', origin: 'window-a', content: renamed },
          { type: 'saved', document: MAP_A, marker: [ step.id ], source: 'remote', origin: 'window-b', content: renamed },
        ]);
    });

    it('reads as saved against what another window saved, whatever its own steps say', () =>
    {
      // Arrange: map 1 renamed here, then another window says it saved a retitle of the map this window has not seen.
      const hub = buildHub();
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      const retitled = { ...buildMapJson(), displayName: 'Harbor', note: 'retitled elsewhere' } as unknown as JsonValue;
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act: one save names only the rename; one names a step never seen here.
      hub.applyRemote({ type: 'saved', origin: 'window-b', document: MAP_A, marker: [ step.id ], content: retitled });
      const afterKnown = hub.isDirty(MAP_A);
      hub.applyRemote({ type: 'saved', origin: 'window-b', document: MAP_A, marker: [ 'window-b#9' ], content: buildMapJson() as unknown as JsonValue });

      // Assert: unsaved against a file holding the retitle the map lacks, though the save named every step the map holds,
      // and unsaved still against the next; the step never seen is announced, and its steps are not taken.
      expect([ afterKnown, hub.isDirty(MAP_A), hub.savedSteps(MAP_A), events.map(event => event.type) ])
        .toStrictEqual([ true, true, [ step.id ], [ 'saved', 'out-of-sync' ] ]);
    });

    it('takes another window\'s word of a file it wrote otherwise than by saving, telling every listener, and ignores a document it does not hold', () =>
    {
      // Arrange: map 1 renamed here, and not saved.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const renamed = fileOf(hub, MAP_A) as unknown as JsonValue;
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.applyRemote({ type: 'written', origin: 'window-b', document: MAP_A, content: renamed });
      hub.applyRemote({ type: 'written', origin: 'window-b', document: 'map:40', content: renamed });

      // Assert.
      expect([ hub.isDirty(MAP_A), hub.fileContent(MAP_A), events ])
        .toStrictEqual([ false, renamed, [ { type: 'written', document: MAP_A, content: renamed, source: 'remote', origin: 'window-b' } ] ]);
    });

    it('finds a step a held history lists, done or undone, and nothing for one no history lists any more', () =>
    {
      // Arrange: a rename done, one undone, and one forgotten.
      const hub = buildHub();
      const done = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      const forgotten = hub.edit('Retitle', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'displayName' ], 'Cave')) as HistoryStep;
      hub.forgetStep(forgotten.id);
      const undone = hub.edit('Note', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'undone')) as HistoryStep;
      hub.undo(mapHistoryKey(1));

      // Act.
      const found = [ done, undone, forgotten ].map(step => hub.knownStep(step.id));

      // Assert.
      expect(found)
        .toStrictEqual([ done, undone, null ]);
    });

    it('lists the steps a document holds and those its file holds, and none for a document not held', async () =>
    {
      // Arrange: a saved rename, an unsaved one, and one undone.
      const { store } = buildStore();
      const hub = buildHub(store);
      const saved = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      await hub.save(MAP_A);
      const unsaved = hub.edit('Retitle', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'unsaved')) as HistoryStep;
      hub.edit('Undone', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'undone'));
      hub.undo(mapHistoryKey(1));

      // Act.
      const lists = [ hub.appliedSteps(MAP_A).map(step => step.id), hub.savedSteps(MAP_A), hub.appliedSteps('map:9'), hub.savedSteps('map:9') ];

      // Assert.
      expect(lists)
        .toStrictEqual([ [ saved.id, unsaved.id ], [ saved.id ], [], [] ]);
    });
  });

  /*
   * A blueprint's change reaches every copy of it as one step, so a check looking an edit over can name more histories
   * for it, write patches through to maps no window holds, which reach their files alone, and say what the files of maps
   * held with unsaved edits take instead of the maps' own patches. A step writing a document through moves without that
   * document being held anywhere; a window holding one changes it in place; and a document opened from a file such a
   * step wrote takes the step up, so undo reaches it from there too, but only while its file holds exactly what the step
   * left. Getting any of this wrong would leave a blueprint's undo stuck, or put a map's file out of step with its copy.
   */
  describe('documents written through, and files that differ from their documents', () =>
  {
    const MAP_UNHELD: DocumentKey = 'map:9';

    /**
     * A patch renaming a map from the fixture's name, as one against an unheld map's file would be made.
     * @param {string} name The new name.
     * @returns {import('../../../../src/mapEditor/core/model/patches.ts').Patch} The patch.
     */
    const renameFile = (name: string) => ({ kind: 'set' as const, path: [ 'displayName' ], before: 'Test Town', after: name });

    /**
     * A check that, with every edit renaming map 1, writes the same rename through to map 9 and joins map 9's history.
     * @returns {CommitCheck} The check.
     */
    const writesMapNine = (): CommitCheck => transaction =>
    {
      if (transaction.entries.some(entry => entry.document === MAP_A))
      {
        transaction.writeThrough(MAP_UNHELD, renameFile('Harbor'));
        transaction.join([ mapHistoryKey(9) ]);
      }

      return null;
    };

    it('joins a check\'s histories to the step, each once, so it undoes from any of them', () =>
    {
      // Arrange: a check joining map 2's history, and naming map 1's again, to every rename of map 1.
      const hub = buildHub();
      hub.addCommitCheck(transaction =>
      {
        transaction.set(MAP_B, [ 'displayName' ], 'Harbor too');
        transaction.join([ mapHistoryKey(2), mapHistoryKey(1) ]);
        return null;
      });
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;

      // Act.
      const undone = hub.undo(mapHistoryKey(2));

      // Assert: the other map's event history never had it.
      expect([ step.histories, undone.ok, fileOf(hub, MAP_A).displayName, fileOf(hub, MAP_B).displayName, hub.history(eventHistoryKey(2, 3)).rows ])
        .toStrictEqual([ [ 'map:1', 'map:2' ], true, 'Test Town', 'Test Town', [] ]);
    });

    it('refuses a joined history living on a document neither held nor written through, putting the edit back', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.addCommitCheck(transaction =>
      {
        transaction.join([ mapHistoryKey(9) ]);
        return null;
      });

      // Act.
      const run = () => hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect(run)
        .toThrow('open map:9 before recording history on it');
      expect([ fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ 'Test Town', [] ]);
    });

    it('carries a patch written through in the step, changing nothing held, and moves it with that document held nowhere', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.addCommitCheck(writesMapNine());
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      const made = [ step.through, step.entries.map(entry => entry.document), step.histories, hub.has(MAP_UNHELD) ];

      // Act.
      const undone = hub.undo(mapHistoryKey(1));
      const afterUndo = fileOf(hub, MAP_A).displayName;
      const redone = hub.redo(mapHistoryKey(1));

      // Assert.
      expect([ made, undone.ok, afterUndo, redone.ok, fileOf(hub, MAP_A).displayName ])
        .toStrictEqual([ [ [ 'map:9' ], [ 'map:1', 'map:9' ], [ 'map:1', 'map:9' ], false ], true, 'Test Town', true, 'Harbor' ]);
    });

    it('still asks for a document a step changed in place and no longer finds held', () =>
    {
      // Arrange: a step across both maps, then map 2 let go of.
      const hub = buildHub();
      hub.edit('Rename both', [ mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(MAP_A, [ 'displayName' ], 'Harbor');
        tx.set(MAP_B, [ 'displayName' ], 'Harbor too');
      });
      hub.release(MAP_B);

      // Act.
      const undone = hub.undo(mapHistoryKey(1));

      // Assert.
      expect(undone)
        .toMatchObject({ ok: false, reason: 'missing-documents', documents: [ MAP_B ] });
    });

    it('refuses to write through a document the window holds, and skips a patch that changes nothing', () =>
    {
      // Arrange.
      const hub = buildHub();
      const seen: unknown[] = [];
      hub.addCommitCheck(transaction =>
      {
        transaction.writeThrough(MAP_UNHELD, renameFile('Test Town'));
        seen.push(transaction.through);
        try
        {
          transaction.writeThrough(MAP_B, renameFile('Harbor'));
        }
        catch (error)
        {
          seen.push((error as Error).message);
        }

        return null;
      });

      // Act.
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;

      // Assert: the step keeps its exact shape, with nothing written through.
      expect([ seen, step.entries.map(entry => entry.document), 'through' in step ])
        .toStrictEqual([ [ [], 'map:2 is held here, so it changes in place' ], [ 'map:1' ], false ]);
    });

    it('puts back only what it applied when an edit writing through is refused', () =>
    {
      // Arrange: a later check refusing what the first wrote through.
      const hub = buildHub();
      hub.addCommitCheck(writesMapNine());
      hub.addCommitCheck(transaction => (transaction.through.length > 0 ? 'not today' : null));

      // Act.
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ step, fileOf(hub, MAP_A).displayName, hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ null, 'Test Town', [] ]);
    });

    it('carries what the files of held documents take in place of their patches, none included, gathered by document', () =>
    {
      // Arrange: map 1's file takes two patches given apart, one changing nothing, and map 2's takes none.
      const hub = buildHub();
      hub.addCommitCheck(transaction =>
      {
        transaction.fileVersion(MAP_A, [ renameFile('On disk') ]);
        transaction.fileVersion(MAP_B, []);
        transaction.fileVersion(MAP_A, [ renameFile('Test Town'), { kind: 'set', path: [ 'note' ], before: '', after: 'disk' } ]);
        return null;
      });

      // Act.
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;

      // Assert: the documents themselves took only the edit.
      expect([ step.fileVersions, fileOf(hub, MAP_A).displayName, fileOf(hub, MAP_A).note ])
        .toStrictEqual([
          [
            { document: MAP_A, patches: [ renameFile('On disk'), { kind: 'set', path: [ 'note' ], before: '', after: 'disk' } ] },
            { document: MAP_B, patches: [] },
          ],
          'Harbor',
          '',
        ]);
    });

    it('refuses a file version for a document the window does not hold', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.addCommitCheck(transaction =>
      {
        transaction.fileVersion(MAP_UNHELD, []);
        return null;
      });

      // Act.
      const run = () => hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect(run)
        .toThrow('map:9 is not held here, so its file takes what is written through');
    });

    it('applies a step written through to a document another window opened from its file, whatever its head', () =>
    {
      // Arrange: the second window holds map 9 as the file has it, at a head the first never saw.
      const first = buildHub(undefined, 'window-a');
      first.addCommitCheck(writesMapNine());
      const second = buildHub(undefined, 'window-b');
      second.adopt(MAP_UNHELD, buildMapJson() as unknown as JsonValue);
      mirror(first, second);

      // Act.
      first.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      first.undo(mapHistoryKey(1));
      const afterUndo = fileOf(second, MAP_UNHELD).displayName;
      first.redo(mapHistoryKey(1));

      // Assert.
      expect([ afterUndo, fileOf(second, MAP_UNHELD).displayName, second.history(mapHistoryKey(9)).rows.map(row => [ row.label, row.done ]) ])
        .toStrictEqual([ 'Test Town', 'Harbor', [ [ 'Rename', true ] ] ]);
    });

    it('still reports a document written through whose copy elsewhere the step does not fit', () =>
    {
      // Arrange: the second window's map 9 renamed already.
      const first = buildHub(undefined, 'window-a');
      first.addCommitCheck(writesMapNine());
      const second = buildHub(undefined, 'window-b');
      second.adopt(MAP_UNHELD, { ...buildMapJson(), displayName: 'Elsewhere' } as unknown as JsonValue);
      const events: HubEvent[] = [];
      second.subscribe(event => (event.type === 'out-of-sync' ? events.push(event) : undefined));
      mirror(first, second);

      // Act.
      first.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ fileOf(second, MAP_A).displayName, events.map(event => event.type === 'out-of-sync' ? event.documents : []) ])
        .toStrictEqual([ 'Test Town', [ [ MAP_A, MAP_UNHELD ] ] ]);
    });

    it('takes up the steps a document\'s file holds when it is opened, saved, in its own history, and undoes them there', () =>
    {
      // Arrange: map 9 opened from the file the step wrote.
      const hub = buildHub();
      hub.addCommitCheck(writesMapNine());
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      hub.adopt(MAP_UNHELD, { ...buildMapJson(), displayName: 'Harbor' } as unknown as JsonValue);
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      const taken = hub.attachSteps(MAP_UNHELD, [ step ]);
      const state = [ hub.appliedSteps(MAP_UNHELD).map(each => each.id), hub.savedSteps(MAP_UNHELD), hub.isDirty(MAP_UNHELD), hub.history(mapHistoryKey(9)).rows.map(row => row.label) ];
      const undone = hub.undo(mapHistoryKey(9));

      // Assert.
      expect([ taken, state, events[0], undone.ok, fileOf(hub, MAP_UNHELD).displayName, fileOf(hub, MAP_A).displayName ])
        .toStrictEqual([
          true,
          [ [ step.id ], [ step.id ], false, [ 'Rename' ] ],
          { type: 'attached', document: MAP_UNHELD, stepIds: [ step.id ] },
          true,
          'Test Town',
          'Test Town',
        ]);
    });

    it('takes up nothing from a file that no longer holds what the step left there, and the step is then untracked there', () =>
    {
      // Arrange: map 9's file renamed again after the step.
      const hub = buildHub();
      hub.addCommitCheck(writesMapNine());
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      hub.adopt(MAP_UNHELD, { ...buildMapJson(), displayName: 'Renamed in MZ' } as unknown as JsonValue);

      // Act.
      const taken = hub.attachSteps(MAP_UNHELD, [ step ]);
      const undone = hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ taken, hub.appliedSteps(MAP_UNHELD), hub.history(mapHistoryKey(9)).rows, undone ])
        .toStrictEqual([ false, [], [], expect.objectContaining({ ok: false, reason: 'untracked' }) ]);
    });

    it('takes up nothing for a step undone since, a document already holding steps, or no steps at all', () =>
    {
      // Arrange: one step undone, and map 1 holding steps of its own.
      const hub = buildHub();
      hub.addCommitCheck(writesMapNine());
      const step = hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor')) as HistoryStep;
      hub.undo(mapHistoryKey(1));
      hub.adopt(MAP_UNHELD, buildMapJson() as unknown as JsonValue);
      const other = hub.edit('Note', [ mapHistoryKey(2) ], tx => tx.set(MAP_B, [ 'note' ], 'kept')) as HistoryStep;

      // Act.
      const answers = [ hub.attachSteps(MAP_UNHELD, [ step ]), hub.attachSteps(MAP_B, [ other ]), hub.attachSteps(MAP_UNHELD, []), hub.attachSteps('map:8', [ other ]) ];

      // Assert.
      expect([ answers, hub.appliedSteps(MAP_UNHELD) ])
        .toStrictEqual([ [ false, false, false, false ], [] ]);
    });

    it('notes what a file written otherwise holds, the map reading saved exactly when it holds that, telling every listener', () =>
    {
      // Arrange: two steps on map 1; the file comes to hold the first alone, as a write of it elsewhere would leave it.
      const hub = buildHub();
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));
      const first = fileOf(hub, MAP_A) as unknown as JsonValue;
      hub.edit('Note', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'later'));
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.noteWritten(MAP_A, first);
      const dirtyAfterFirst = hub.isDirty(MAP_A);
      hub.undo(mapHistoryKey(1));

      // Assert: back at what the file holds, the map reads as saved, though no save ever named its steps.
      expect([ dirtyAfterFirst, hub.isDirty(MAP_A), hub.savedSteps(MAP_A), events[0] ])
        .toStrictEqual([ true, false, [], { type: 'written', document: MAP_A, content: first, source: 'local', origin: 'window-a' } ]);
    });

    it('notes nothing for a document not held, and refuses one kept alongside others', () =>
    {
      // Arrange.
      const hub = buildHub();
      hub.adopt('editor-data:blueprint-uses', { schemaVersion: 2, data: { maps: {} } });
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.noteWritten(MAP_UNHELD, buildMapJson() as unknown as JsonValue);
      hub.notePatched(MAP_UNHELD, [ renameFile('Harbor') ]);
      const run = () => hub.noteWritten('editor-data:blueprint-uses', { schemaVersion: 2, data: { maps: {} } });

      // Assert.
      expect(run)
        .toThrow('editor-data:blueprint-uses is kept alongside the documents it describes, and is never written whole');
      expect(events)
        .toStrictEqual([]);
    });

    it('notes a file taking patches onto what the window knew it held, apart from the map\'s unsaved edits', () =>
    {
      // Arrange: map 1 retitled by hand, unsaved; then its file takes a rename the map never had, as a blueprint's change
      // written to it at once would.
      const hub = buildHub();
      hub.edit('Retitle', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'note' ], 'by hand'));
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act: the patches noted, then the retitle undone and the map renamed to match.
      hub.notePatched(MAP_A, [ renameFile('Harbor') ]);
      const afterPatch = [ hub.isDirty(MAP_A), (hub.fileContent(MAP_A) as unknown as RmmzMap).displayName, (hub.fileContent(MAP_A) as unknown as RmmzMap).note ];
      hub.undo(mapHistoryKey(1));
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Assert: the file holds the rename and none of the retitle; the map, holding just the rename once the retitle is
      // undone, reads as saved.
      expect([ afterPatch, fileOf(hub, MAP_A).note, hub.isDirty(MAP_A), events[0] ])
        .toStrictEqual([
          [ true, 'Harbor', '' ],
          '',
          false,
          { type: 'written', document: MAP_A, content: hub.fileContent(MAP_A), source: 'local', origin: 'window-a' },
        ]);
    });

    it('reads a file again when patches it took do not fit what the window knew, unsaved until the read lands', async () =>
    {
      // Arrange: the file on disk renamed behind the window's back; then a patch reaches it that assumed the rename.
      const { store, files } = buildStore();
      const hub = buildHub(store);
      const onDisk = { ...buildMapJson(), displayName: 'Harbor', note: 'took it' } as unknown as JsonValue;
      files.set(MAP_A, onDisk);
      const events: HubEvent[] = [];
      hub.subscribe(event => events.push(event));

      // Act.
      hub.notePatched(MAP_A, [ { kind: 'set', path: [ 'note' ], before: 'renamed', after: 'took it' } ]);
      const meanwhile = [ hub.fileContent(MAP_A), hub.isDirty(MAP_A) ];
      await Promise.resolve();
      await Promise.resolve();

      // Assert: not known until the read lands, then what the disk holds.
      expect([ meanwhile, hub.fileContent(MAP_A), hub.isDirty(MAP_A), events.map(event => event.type) ])
        .toStrictEqual([ [ null, true ], onDisk, true, [ 'written' ] ]);
    });

    it('keeps a file unknown without a store to read it again from', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act: two renames from the fixture's name, of which the second no longer fits.
      hub.notePatched(MAP_A, [ renameFile('Elsewhere'), renameFile('Elsewhere') ]);

      // Assert.
      expect([ hub.fileContent(MAP_A), hub.isDirty(MAP_A) ])
        .toStrictEqual([ null, true ]);
    });

    /**
     * A store over the fixture's files whose reads fail for a while, as a file held open elsewhere for a moment, or a
     * server busy for one, makes them, counting every read of each document.
     * @param {number} failing How many reads fail before they go through.
     * @returns {{ store: DocumentStore, files: Map<DocumentKey, JsonValue>, reads: Map<DocumentKey, number> }} The store,
     * its files and its reads.
     */
    const buildFlakyStore = (failing: number) =>
    {
      const { store, files } = buildStore();
      const reads = new Map<DocumentKey, number>();
      let left = failing;
      const flaky: DocumentStore = {
        load: key =>
        {
          reads.set(key, (reads.get(key) ?? 0) + 1);
          left -= 1;
          return left >= 0
            ? Promise.reject(new Error('the file is busy'))
            : store.load(key);
        },
        save: store.save,
      };

      return { store: flaky, files, reads };
    };

    /**
     * A patch a file takes that assumed something the window never knew the file held, so the file is read again.
     * @returns {Patch} The patch.
     */
    const unforeseenPatch = (): Patch => ({ kind: 'set', path: [ 'note' ], before: 'renamed', after: 'took it' });

    it('tries a failed read of a file again a while later, each wait twice the last, the map reading as saved once the file can be read', async () =>
    {
      // Arrange: map 1 holds just what its file does; its first two reads fail.
      vi.useFakeTimers();
      try
      {
        const { store, reads } = buildFlakyStore(2);
        const hub = buildHub(store);
        hub.notePatched(MAP_A, [ unforeseenPatch() ]);
        const seen: [ number, boolean ][] = [];

        // Act: just short of each wait, and at it.
        for (const wait of [ 999, 1, 1999, 1 ])
        {
          await vi.advanceTimersByTimeAsync(wait);
          seen.push([ reads.get(MAP_A) ?? 0, hub.isDirty(MAP_A) ]);
        }

        // Assert: read again at a second and three seconds, unsaved until the third read landed, saved after.
        expect([ seen, hub.fileContent(MAP_A) ])
          .toStrictEqual([ [ [ 1, true ], [ 2, true ], [ 2, true ], [ 3, false ] ], buildMapJson() ]);
      }
      finally
      {
        vi.useRealTimers();
      }
    });

    it('stops trying a failed read of a file once something newer is learnt of it, or its map is let go of', async () =>
    {
      // Arrange: three maps whose files are read again, every read failing; map 3 is left alone, so it shows the reads
      // going on.
      vi.useFakeTimers();
      try
      {
        const { store, reads } = buildFlakyStore(Number.POSITIVE_INFINITY);
        const hub = buildHub(store);
        hub.adopt('map:3', buildMapJson() as unknown as JsonValue);
        [ MAP_A, MAP_B, 'map:3' as DocumentKey ].forEach(key => hub.notePatched(key, [ unforeseenPatch() ]));
        await vi.advanceTimersByTimeAsync(0);

        // Act: map 1 saved, its file learnt from what the save wrote; map 2 let go of.
        await hub.save(MAP_A);
        hub.release(MAP_B);
        await vi.advanceTimersByTimeAsync(60_000);

        // Assert.
        expect([ reads.get(MAP_A), reads.get(MAP_B), (reads.get('map:3') ?? 0) > 1, hub.isDirty(MAP_A) ])
          .toStrictEqual([ 1, 1, true, false ]);
      }
      finally
      {
        vi.useRealTimers();
      }
    });

    it('takes no read of a file that lands after something newer was learnt about it', async () =>
    {
      // Arrange: a store whose reads hand back the file as it stood when asked, but only once let go.
      const files = new Map<DocumentKey, JsonValue>([ [ MAP_A, buildMapJson() as unknown as JsonValue ] ]);
      let letGo = () => undefined as void;
      const gate = new Promise<void>(resolve =>
      {
        letGo = resolve;
      });
      const store: DocumentStore = {
        load: key =>
        {
          const content = structuredClone(files.get(key) as JsonValue);
          return gate.then(() => content);
        },
        save: async (key, content) =>
        {
          files.set(key, structuredClone(content));
        },
      };
      const hub = buildHub(store);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'displayName' ], 'Harbor'));

      // Act: a patch that does not fit starts a read; a save lands before the read does.
      hub.notePatched(MAP_A, [ { kind: 'set', path: [ 'note' ], before: 'renamed', after: 'took it' } ]);
      await hub.save(MAP_A);
      letGo();
      await gate;
      await Promise.resolve();

      // Assert: the file holds what the save wrote, not the older read.
      expect([ (hub.fileContent(MAP_A) as unknown as RmmzMap).displayName, hub.isDirty(MAP_A) ])
        .toStrictEqual([ 'Harbor', false ]);
    });

    it('reads a document\'s committed content, an edit still open left out', () =>
    {
      // Arrange: a stroke still open on map 1.
      const hub = buildHub();
      const stroke = hub.begin('Rename', [ mapHistoryKey(1) ]);
      stroke.set(MAP_A, [ 'displayName' ], 'Mid-stroke');

      // Act.
      const committed = hub.committedContent(MAP_A) as unknown as RmmzMap;

      // Assert.
      expect([ committed.displayName, fileOf(hub, MAP_A).displayName ])
        .toStrictEqual([ 'Test Town', 'Mid-stroke' ]);
    });
  });
});
