import { describe, expect, it } from 'vitest';
import { DocumentHub, type DocumentStore, type HistoryCheck } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, eventHistoryKey, mapHistoryKey, type HistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import type { Transaction } from '../../../../src/mapEditor/core/history/Transaction.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { operationFor } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A blueprint's change reaches every copy of it as part of one step, and the copies follow the blueprint rather than
 * being changed for their own sake: the maps they stand on are the step's followers. So the history core owes a step like
 * that this, above the rule every other step keeps: an edit made since on a follower never refuses its undo or its redo.
 * Each of its patches there moves wherever nothing changed the same data since, under the very rule that refuses any
 * other step, cell by cell for tiles, and the rest is left as it stands, the way a cell painted over by hand keeps its
 * paint when the change is made. A copy renamed by hand after the change keeps its name when the change is undone, and
 * the author hears which, with the edit in its way. Its other documents, the blueprint's own, keep the rule whole, and so
 * does every step marking no follower at all: the tree's, a door pair's.
 *
 * Nothing about it may leave the window lying to itself. The step moves as the part that moved, by its own id, in every
 * history; the part an undo left stays applied as a forgotten step, so an older edit's undo is still checked against its
 * patches; a file known to hold the whole step holds the part left once nothing else moves there; and another window
 * repeats the move exactly. A redo mirrors it, leaving out what changed since the undo, which is then gone.
 *
 * The fixture is two maps, each 3 by 2, with a door (event 1) and a chest (event 3), and the blueprints. The change raises
 * the guard's sight in the blueprints and renames both maps' doors and map 1's chest, so a copy changed since always has a
 * sibling on its map, and a map, that must still follow.
 */
describe('DocumentHub, steps whose copies follow their change', () =>
{
  const MAP_A: DocumentKey = 'map:1';
  const MAP_B: DocumentKey = 'map:2';
  const BLUEPRINTS: DocumentKey = 'editor-data:blueprints';
  const BLUEPRINT_HISTORY = blueprintHistoryKey('guard');

  /**
   * A hub holding both maps and the blueprints.
   * @param {object} options The window's id, a store, and whether map 2 is held at all.
   * @returns {DocumentHub} The hub.
   */
  const buildHub = (options: { clientId?: string; store?: DocumentStore; holdsB?: boolean } = {}): DocumentHub =>
  {
    const { clientId = 'window-a', store, holdsB = true } = options;
    const hub = new DocumentHub({ clientId, store, now: () => 1000 });
    hub.adopt(MAP_A, buildMapJson() as unknown as JsonValue);
    if (holdsB)
    {
      hub.adopt(MAP_B, buildMapJson() as unknown as JsonValue);
    }

    hub.adopt(BLUEPRINTS, { schemaVersion: 1, data: { blueprints: [ { id: 'guard', sight: 4 } ] } });
    return hub;
  };

  /**
   * Reads an event of a held map.
   * @param {DocumentHub} hub The hub.
   * @param {DocumentKey} key The map.
   * @param {number} eventId The event.
   * @returns {RmmzMapEvent} The event.
   */
  const eventOf = (hub: DocumentHub, key: DocumentKey, eventId: number): RmmzMapEvent => hub.map(key as 'map:1').event(eventId) as RmmzMapEvent;

  /**
   * Reads the guard's sight in the blueprints.
   * @param {DocumentHub} hub The hub.
   * @returns {JsonValue | undefined} The sight.
   */
  const sightOf = (hub: DocumentHub): JsonValue | undefined => hub.document(BLUEPRINTS).valueAt([ 'data', 'blueprints', 0, 'sight' ]);

  /**
   * Makes the change the way a blueprint's propagation does: the blueprints changed, and every copy following, each map
   * joined to the step and marked as following it.
   * @param {DocumentHub} hub The hub.
   * @param {(transaction: Transaction) => void} copies Adds the copies' patches.
   * @param {readonly DocumentKey[]} followers The maps the copies stand on.
   * @returns {HistoryStep} The step.
   */
  const changeWith = (hub: DocumentHub, copies: (transaction: Transaction) => void, followers: readonly DocumentKey[]): HistoryStep => hub.edit(
    'Raise guard sight',
    [ BLUEPRINT_HISTORY, ...followers.map(key => mapHistoryKey(Number(key.slice('map:'.length)))) ],
    tx =>
    {
      tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 5);
      copies(tx);
      followers.forEach(key => tx.markFollower(key));
    },
  ) as HistoryStep;

  /**
   * The usual change: both doors and map 1's chest renamed, on maps 1 and 2.
   * @param {DocumentHub} hub The hub.
   * @returns {HistoryStep} The step.
   */
  const change = (hub: DocumentHub): HistoryStep => changeWith(hub, tx =>
  {
    tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)');
    tx.set(MAP_A, [ 'events', 3, 'name' ], 'Chest (sight 5)');
    tx.set(MAP_B, [ 'events', 1, 'name' ], 'Guard (sight 5)');
  }, [ MAP_A, MAP_B ]);

  /**
   * Renames a map's door in its own event window, as a hand edit of one copy.
   * @param {DocumentHub} hub The hub.
   * @param {DocumentKey} key The map.
   * @param {string} name The new name.
   * @returns {HistoryStep} The step.
   */
  const renameDoor = (hub: DocumentHub, key: DocumentKey, name: string): HistoryStep => hub.edit(
    'Rename door',
    [ eventHistoryKey(Number(key.slice('map:'.length)), 1) ],
    tx => tx.set(key, [ 'events', 1, 'name' ], name),
  ) as HistoryStep;

  /**
   * Reads what a move left, from its answer.
   * @param {HistoryCheck} check The answer.
   * @returns {unknown} The parts left, or the reason it refused.
   */
  const leftOf = (check: HistoryCheck): unknown => (check.ok ? check.left : check.reason);

  /**
   * Captures everything an undo could change in a hub: each held document's file and lineage, and the rows of the given
   * histories.
   * @param {DocumentHub} hub The hub.
   * @param {readonly HistoryKey[]} histories The histories to read.
   * @returns {object} The capture.
   */
  const stateOf = (hub: DocumentHub, histories: readonly HistoryKey[]) => ({
    files: hub.documentKeys().map(key => hub.document(key).toJson()),
    lineages: hub.documentKeys().map(key => [ ...hub.lineage(key) ]),
    histories: histories.map(key => hub.history(key)),
  });

  describe('undo', () =>
  {
    it('takes the change back everywhere but a copy changed since, which keeps that change, naming the edit in its way', () =>
    {
      // Arrange: map 1's door renamed by hand after the change; its chest, and map 2's door, never touched since.
      const hub = buildHub();
      change(hub);
      const rename = renameDoor(hub, MAP_A, 'Front door');

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert.
      expect([ leftOf(undone), eventOf(hub, MAP_A, 1).name, eventOf(hub, MAP_A, 3).name, eventOf(hub, MAP_B, 1).name, sightOf(hub) ])
        .toStrictEqual([
          [ { document: MAP_A, patch: { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' }, by: rename } ],
          'Front door',
          'Chest',
          'Door',
          4,
        ]);
    });

    it('moves the change as the part that moved, by its own id, in every history it belongs to', () =>
    {
      // Arrange.
      const hub = buildHub();
      const step = change(hub);
      renameDoor(hub, MAP_A, 'Front door');

      // Act.
      const undone = hub.undo(mapHistoryKey(2));

      // Assert: undone in all three histories, as the step that left map 1's door out.
      const moved = undone.ok ? undone.step : null;
      expect([
        moved?.id === step.id,
        moved?.entries.map(entry => `${entry.document} ${'path' in entry.patch ? entry.patch.path.join('/') : ''}`),
        [ BLUEPRINT_HISTORY, mapHistoryKey(1), mapHistoryKey(2) ].map(key => hub.history(key).position),
        hub.knownStep(step.id) === moved,
      ])
        .toStrictEqual([
          true,
          [ 'editor-data:blueprints data/blueprints/0/sight', 'map:1 events/3/name', 'map:2 events/1/name' ],
          [ 0, 0, 0 ],
          true,
        ]);
    });

    it('moves the change whole when what changed since on a copy is something the change never touched', () =>
    {
      // Arrange: map 1's door gets a note by hand, which the change never touched.
      const hub = buildHub();
      change(hub);
      hub.edit('Note door', [ eventHistoryKey(1, 1) ], tx => tx.set(MAP_A, [ 'events', 1, 'note' ], 'creaks'));

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert.
      expect([ undone.ok, leftOf(undone), eventOf(hub, MAP_A, 1).name, eventOf(hub, MAP_A, 1).note ])
        .toStrictEqual([ true, undefined, 'Door', 'creaks' ]);
    });

    it('still refuses, changing nothing, when an edit since changed what the change made to the blueprints themselves', () =>
    {
      // Arrange: the sight changed again in the blueprints, outside the change's history.
      const hub = buildHub();
      change(hub);
      const sharper = hub.edit('Sharpen', [ 'editor-data:blueprints' ], tx => tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 6)) as HistoryStep;
      const before = stateOf(hub, [ BLUEPRINT_HISTORY, mapHistoryKey(1) ]);

      // Act.
      const undone = hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ undone, stateOf(hub, [ BLUEPRINT_HISTORY, mapHistoryKey(1) ]) ])
        .toStrictEqual([
          expect.objectContaining({ ok: false, reason: 'conflict', blockedBy: sharper, message: '"Sharpen" later changed what "Raise guard sight" changed' }),
          before,
        ]);
    });

    it('still refuses a step that marks no follower, as a door pair across two maps does', () =>
    {
      // Arrange: the very same change, its maps not marked as following it.
      const hub = buildHub();
      hub.edit('Raise guard sight', [ BLUEPRINT_HISTORY, mapHistoryKey(1), mapHistoryKey(2) ], tx =>
      {
        tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 5);
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)');
        tx.set(MAP_B, [ 'events', 1, 'name' ], 'Guard (sight 5)');
      });
      const rename = renameDoor(hub, MAP_A, 'Front door');

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert.
      expect([ undone, eventOf(hub, MAP_B, 1).name ])
        .toStrictEqual([ expect.objectContaining({ ok: false, reason: 'conflict', blockedBy: rename }), 'Guard (sight 5)' ]);
    });

    it('takes back the cells no stroke painted since and leaves those one did, cell by cell', () =>
    {
      // Arrange: cells 0 and 1 of map 1 changed with the copies, then cell 1 painted over by hand.
      const hub = buildHub();
      changeWith(hub, tx => tx.tiles(MAP_A, [ [ 0, 100 ], [ 1, 101 ] ]), [ MAP_A ]);
      const stroke = hub.edit('Paint', [ mapHistoryKey(1) ], tx => tx.tiles(MAP_A, [ [ 1, 200 ], [ 2, 202 ] ])) as HistoryStep;

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert: cell 0 back to 1; cell 1 keeps the stroke's 200; cell 2, the stroke's alone, untouched.
      expect([ leftOf(undone), [ 0, 1, 2 ].map(index => hub.map(MAP_A).cells[index]) ])
        .toStrictEqual([ [ { document: MAP_A, patch: { kind: 'tiles', indices: [ 1 ], before: [ 2 ], after: [ 101 ] }, by: stroke } ], [ 1, 200, 202 ] ]);
    });

    it('leaves every cell once the map was resized since, every cell having a new place, while the copies still follow', () =>
    {
      // Arrange.
      const hub = buildHub();
      changeWith(hub, tx =>
      {
        tx.tiles(MAP_A, [ [ 0, 100 ] ]);
        tx.set(MAP_A, [ 'events', 3, 'name' ], 'Chest (sight 5)');
      }, [ MAP_A ]);
      const map = hub.map(MAP_A);
      const resize = hub.edit('Resize', [ mapHistoryKey(1) ], tx => tx.resize(MAP_A, { width: 3, height: 2, data: Array.from(map.cells).map(value => value + 1000) })) as HistoryStep;

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert.
      expect([ leftOf(undone), hub.map(MAP_A).cells[0], eventOf(hub, MAP_A, 3).name ])
        .toStrictEqual([ [ { document: MAP_A, patch: { kind: 'tiles', indices: [ 0 ], before: [ 1 ], after: [ 100 ] }, by: resize } ], 1100, 'Chest' ]);
    });

    it('keeps the part left applied as a forgotten step, so an older edit\'s undo is still checked against it', () =>
    {
      // Arrange: the door named on map 1 before the change; after the change, renamed by hand, the change undone around
      // it, and the hand rename undone in its own window, which shows the part left again.
      const hub = buildHub();
      hub.edit('Name door', [ mapHistoryKey(1) ], tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Old door'));
      change(hub);
      renameDoor(hub, MAP_A, 'Front door');
      hub.undo(BLUEPRINT_HISTORY);
      hub.undo(eventHistoryKey(1, 1));

      // Act.
      const undone = hub.undo(mapHistoryKey(1));

      // Assert: the name the change gave stands, applied by a step no history lists, which refuses the older undo.
      const applied = hub.appliedSteps(MAP_A);
      expect([ eventOf(hub, MAP_A, 1).name, applied.map(step => [ step.label, step.histories ]), undone ])
        .toStrictEqual([
          'Guard (sight 5)',
          [ [ 'Name door', [ mapHistoryKey(1) ] ], [ 'Raise guard sight', [] ] ],
          expect.objectContaining({ ok: false, reason: 'conflict', blockedBy: applied[1], message: '"Raise guard sight" later changed what "Name door" changed' }),
        ]);
    });

    it('counts a file holding the whole change as holding the part left, once nothing else of the change is on it', async () =>
    {
      // Arrange: only map 1's door follows; renamed by hand and saved, so its file holds the change and the rename.
      const files = new Map<DocumentKey, JsonValue>();
      const store: DocumentStore = {
        load: async key => files.get(key) as JsonValue,
        save: async (key, content) =>
        {
          files.set(key, content);
        },
      };
      const hub = buildHub({ store });
      changeWith(hub, tx => tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)'), [ MAP_A ]);
      renameDoor(hub, MAP_A, 'Front door');
      await hub.save(MAP_A);

      // Act.
      hub.undo(BLUEPRINT_HISTORY);

      // Assert: the map still reads saved, its file holding the part left and the rename, as the map does.
      expect([ hub.isDirty(MAP_A), hub.savedSteps(MAP_A).length, hub.savedSteps(MAP_A)[0] === hub.appliedSteps(MAP_A)[0].id, (files.get(MAP_A) as unknown as RmmzMap).events[1]?.name ])
        .toStrictEqual([ false, 2, true, 'Front door' ]);
    });
  });

  describe('redo', () =>
  {
    it('puts the change back everywhere but a copy changed since its undo, which keeps that change, and drops the part left out', () =>
    {
      // Arrange: the change undone whole, then map 2's door renamed by hand.
      const hub = buildHub();
      change(hub);
      hub.undo(BLUEPRINT_HISTORY);
      const rename = renameDoor(hub, MAP_B, 'Back door');

      // Act: redone, then undone again, which has nothing of map 2's door left to take back.
      const redone = hub.redo(BLUEPRINT_HISTORY);
      const afterRedo = [ eventOf(hub, MAP_A, 1).name, eventOf(hub, MAP_B, 1).name, sightOf(hub) ];
      const undoneAgain = hub.undo(BLUEPRINT_HISTORY);

      // Assert.
      expect([ leftOf(redone), afterRedo, leftOf(undoneAgain), eventOf(hub, MAP_A, 1).name, eventOf(hub, MAP_B, 1).name ])
        .toStrictEqual([
          [ { document: MAP_B, patch: { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' }, by: rename } ],
          [ 'Guard (sight 5)', 'Back door', 5 ],
          undefined,
          'Door',
          'Back door',
        ]);
    });

    it('still refuses a redo, changing nothing, when an edit since its undo changed the blueprints themselves', () =>
    {
      // Arrange.
      const hub = buildHub();
      change(hub);
      hub.undo(BLUEPRINT_HISTORY);
      hub.edit('Sharpen', [ 'editor-data:blueprints' ], tx => tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 6));
      const before = stateOf(hub, [ BLUEPRINT_HISTORY ]);

      // Act.
      const redone = hub.redo(BLUEPRINT_HISTORY);

      // Assert.
      expect([ redone, stateOf(hub, [ BLUEPRINT_HISTORY ]) ])
        .toStrictEqual([ expect.objectContaining({ ok: false, reason: 'conflict' }), before ]);
    });
  });

  describe('other windows', () =>
  {
    it('repeats a move that left parts exactly, in a window holding the same documents', () =>
    {
      // Arrange: window b repeats everything window a does.
      const a = buildHub({ clientId: 'window-a' });
      const b = buildHub({ clientId: 'window-b' });
      a.subscribe(event =>
      {
        const operation = 'source' in event && event.source === 'local' ? operationFor(event, a.clientId) : null;
        if (operation !== null)
        {
          b.applyRemote(structuredClone(operation));
        }
      });
      const outOfSync: unknown[] = [];
      b.subscribe(event => event.type === 'out-of-sync' && outOfSync.push(event));
      change(a);
      renameDoor(a, MAP_A, 'Front door');

      // Act.
      a.undo(BLUEPRINT_HISTORY);

      // Assert: the same files, the same lineages, the same histories, and the same steps applied on map 1.
      const histories = [ BLUEPRINT_HISTORY, mapHistoryKey(1), mapHistoryKey(2), eventHistoryKey(1, 1) ];
      expect([ stateOf(b, histories), b.appliedSteps(MAP_A).map(step => step.id), outOfSync ])
        .toStrictEqual([ stateOf(a, histories), a.appliedSteps(MAP_A).map(step => step.id), [] ]);
    });
  });

  describe('files', () =>
  {
    it('moves a patch on a map nobody here holds only as far as its file takes it, leaving what changed on disk', () =>
    {
      // Arrange: map 2 written through, its file now holding a door renamed on disk, which the file fit tells.
      const hub = buildHub({ holdsB: false });
      hub.setFileFit((key, patch) => (key === MAP_B && patch.kind === 'set' && patch.path.join('/') === 'events/1/name' ? null : patch));
      hub.edit('Raise guard sight', [ BLUEPRINT_HISTORY, mapHistoryKey(1) ], tx =>
      {
        tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 5);
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)');
        tx.writeThrough(MAP_B, { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' });
        tx.writeThrough(MAP_B, { kind: 'set', path: [ 'events', 3, 'name' ], before: 'Chest', after: 'Chest (sight 5)' });
        [ MAP_A, MAP_B ].forEach(key => tx.markFollower(key));
      });

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert: the part on disk is left, nothing standing in its way that a window recorded; map 2's chest still moves.
      const moved = undone.ok ? undone.step : null;
      expect([ leftOf(undone), moved?.entries.filter(entry => entry.document === MAP_B).map(entry => entry.patch), moved?.through, eventOf(hub, MAP_A, 1).name ])
        .toStrictEqual([
          [ { document: MAP_B, patch: { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' }, by: null } ],
          [ { kind: 'set', path: [ 'events', 3, 'name' ], before: 'Chest', after: 'Chest (sight 5)' } ],
          [ MAP_B ],
          'Door',
        ]);
    });

    it('redoes a change that left every patch on a map nobody here holds, never asking for that map to be open', () =>
    {
      // Arrange: map 2 written through and in the change's histories, as propagation joins it; its file, changed on disk,
      // takes none of the change back, so the undo leaves all of map 2.
      const hub = buildHub({ holdsB: false });
      hub.setFileFit((key, patch) => (key === MAP_B ? null : patch));
      hub.edit('Raise guard sight', [ BLUEPRINT_HISTORY, mapHistoryKey(1) ], tx =>
      {
        tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 5);
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)');
        tx.writeThrough(MAP_B, { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' });
        tx.join([ mapHistoryKey(2) ]);
        [ MAP_A, MAP_B ].forEach(key => tx.markFollower(key));
      });
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Act.
      const redone = hub.redo(BLUEPRINT_HISTORY);

      // Assert: the undo left map 2 alone; the redo puts the change back here, still naming map 2 as written through.
      expect([ leftOf(undone), redone.ok, redone.ok && redone.step.through, eventOf(hub, MAP_A, 1).name, sightOf(hub) ])
        .toStrictEqual([
          [ { document: MAP_B, patch: { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' }, by: null } ],
          true,
          [ MAP_B ],
          'Guard (sight 5)',
          5,
        ]);
    });

    it('moves every patch on a map nobody here holds when there is no way to tell what its file takes', () =>
    {
      // Arrange.
      const hub = buildHub({ holdsB: false });
      hub.edit('Raise guard sight', [ BLUEPRINT_HISTORY ], tx =>
      {
        tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 5);
        tx.writeThrough(MAP_B, { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' });
        tx.markFollower(MAP_B);
      });

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert.
      expect([ undone.ok, leftOf(undone) ])
        .toStrictEqual([ true, undefined ]);
    });

    it('leaves in the file of a map with unsaved edits what the map left, so the file holds the map but for those edits', () =>
    {
      // Arrange: map 1's file took its own version of the change; map 1's door renamed by hand since.
      const hub = buildHub();
      hub.edit('Raise guard sight', [ BLUEPRINT_HISTORY, mapHistoryKey(1) ], tx =>
      {
        tx.set(BLUEPRINTS, [ 'data', 'blueprints', 0, 'sight' ], 5);
        tx.set(MAP_A, [ 'events', 1, 'name' ], 'Guard (sight 5)');
        tx.set(MAP_A, [ 'events', 3, 'name' ], 'Chest (sight 5)');
        tx.fileVersion(MAP_A, [
          { kind: 'set', path: [ 'events', 1 ], before: 'the door whole', after: 'the door renamed whole' },
          { kind: 'set', path: [ 'events', 1, 'name' ], before: 'Door', after: 'Guard (sight 5)' },
          { kind: 'set', path: [ 'events', 10, 'name' ], before: 'Gate', after: 'Gate (sight 5)' },
          { kind: 'set', path: [ 'events', 3, 'name' ], before: 'Chest', after: 'Chest (sight 5)' },
          { kind: 'tiles', indices: [ 4, 5 ], before: [ 5, 6 ], after: [ 50, 60 ] },
        ]);
        tx.markFollower(MAP_A);
      });
      renameDoor(hub, MAP_A, 'Front door');

      // Act.
      const undone = hub.undo(BLUEPRINT_HISTORY);

      // Assert: the file version keeps its patches reaching the door's name, the whole door's or its name's, and gives back
      // the rest, event 10's name among them, whose place in the list merely starts like the door's.
      const moved = undone.ok ? undone.step : null;
      expect(moved?.fileVersions)
        .toStrictEqual([
          {
            document: MAP_A,
            patches: [
              { kind: 'set', path: [ 'events', 10, 'name' ], before: 'Gate', after: 'Gate (sight 5)' },
              { kind: 'set', path: [ 'events', 3, 'name' ], before: 'Chest', after: 'Chest (sight 5)' },
              { kind: 'tiles', indices: [ 4, 5 ], before: [ 5, 6 ], after: [ 50, 60 ] },
            ],
          },
        ]);
    });
  });
});
