import { describe, expect, it } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { createEvent } from '../../../../src/mapEditor/core/events/eventEdits.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { blueprintMapKey, mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { placeTransfers } from '../../../../src/mapEditor/core/transferPairs/pairPlacement.ts';
import { NO_PICKS, pairPlanOf, type PairPicks, type PairPlan } from '../../../../src/mapEditor/core/transferPairs/pairPlans.ts';
import { isPairStep } from '../../../../src/mapEditor/core/transferPairs/PairWriter.ts';
import { INSIDE, OUTSIDE, PAIR_LOOKS, pairMapOf, pairWindow, settlePairs, type PairWindow } from '../../support/pairFixtures.ts';

/*
 * A transfer pair's two ends stand on two maps, and a save writes one map at a time, so the pair is written at once, the
 * moment it is placed, undone or redone, both maps in one act, the way a blueprint's change is. So the writer owes this:
 *
 * - placing a pair writes both ends in one act, and a held map holding nothing else unsaved reads as saved after;
 * - an undo, from either map, takes both ends back out of both files, leaving each exactly as it was, and a redo writes
 *   them again;
 * - a held map's unsaved edits never reach its file: the file takes the version of the pair planned against it, and the
 *   map still reads as unsaved; a map saved since the pair reached it gives it back as the map holds it;
 * - a map nobody has open is written through, never opened, and once opened here it takes the pair up, so an undo from it
 *   writes both files back;
 * - an act the disk refuses writes nothing, and the pair, with every move made since, is taken back here so the window and
 *   the disk agree, and the author hears why; a pair that cannot be taken back is an alarm, and stays unwritten;
 * - a move made in another window is that window's to write; a transfer on one map is saved with its map, not here;
 * - an undo of a pair whose held map's file changed on disk since is refused before anything moves, naming the map.
 */
describe('PairWriter', () =>
{
  /**
   * The door pair the tests place: a door on 5, 3 outside, and its way out on 4, 7 inside.
   */
  const DOOR_PAIR: PairPicks = { ...NO_PICKS, kind: 'door', ways: 'both', door: { x: 5, y: 3 }, exit: { x: 4, y: 7 } };

  /**
   * Places the door pair, and waits for its act to land.
   * @param {PairWindow} window The window.
   * @returns {Promise<HistoryStep>} The step.
   */
  const placeDoorPair = async (window: PairWindow): Promise<HistoryStep> =>
  {
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;
    const outcome = await placeTransfers(window.sources, plan);
    if (outcome.ok === false)
    {
      throw new Error(outcome.message);
    }

    await settlePairs();
    return outcome.step;
  };

  /**
   * Reads the name of an event on a map's file on disk, or null where there is none.
   * @param {PairWindow} window The window.
   * @param {number} mapId The map.
   * @param {number} eventId The event.
   * @returns {string | null} The name.
   */
  const onDisk = (window: PairWindow, mapId: number, eventId: number): string | null =>
  {
    return (window.disk.get(mapId) as RmmzMap).events[eventId]?.name ?? null;
  };

  it('writes both ends in one act the moment a pair is placed, and a map with nothing else unsaved reads as saved', async () =>
  {
    // Arrange: both maps held.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });

    // Act.
    await placeDoorPair(window);

    // Assert.
    expect([ window.acts.map(act => act.maps.map(each => each.map)), onDisk(window, OUTSIDE, 1), onDisk(window, INSIDE, 1), window.hub.dirtyKeys(), window.writer.hasUnwritten() ])
      .toStrictEqual([ [ [ OUTSIDE, INSIDE ] ], 'Transfer (Entrance)', 'Transfer (Northeast Section)', [], false ]);
  });

  it('takes both ends back out of both files on an undo from either map, leaving each as it was, and writes them on a redo', async () =>
  {
    // Arrange.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const original = [ OUTSIDE, INSIDE ].map(mapId => structuredClone(window.disk.get(mapId)));
    await placeDoorPair(window);
    const placed = [ OUTSIDE, INSIDE ].map(mapId => structuredClone(window.disk.get(mapId)));

    // Act.
    window.hub.undo(mapHistoryKey(INSIDE));
    await settlePairs();
    const undone = [ OUTSIDE, INSIDE ].map(mapId => structuredClone(window.disk.get(mapId)));
    window.hub.redo(mapHistoryKey(OUTSIDE));
    await settlePairs();
    const redone = [ OUTSIDE, INSIDE ].map(mapId => structuredClone(window.disk.get(mapId)));
    window.hub.undo(mapHistoryKey(OUTSIDE));
    await settlePairs();

    // Assert.
    expect([ undone, redone, [ OUTSIDE, INSIDE ].map(mapId => window.disk.get(mapId)), window.acts.length, window.hub.dirtyKeys() ])
      .toStrictEqual([ original, placed, original, 4, [] ]);
  });

  it('keeps a held map\'s unsaved edits off its file, writing the pair as planned for the file, the map still unsaved', async () =>
  {
    // Arrange: an unsaved event on the outside map.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    createEvent(window.hub, OUTSIDE, { x: 2, y: 2 });

    // Act.
    await placeDoorPair(window);
    const placedFile = (window.disk.get(OUTSIDE) as RmmzMap).events.map(event => (event === null ? null : event.name));
    window.hub.undo(mapHistoryKey(OUTSIDE));
    await settlePairs();

    // Assert: the file took the door as event 2 behind an empty slot, and gave it back on the undo; the edit stayed unsaved.
    expect([ placedFile, (window.disk.get(OUTSIDE) as RmmzMap).events, window.hub.isDirty(mapDocumentKey(OUTSIDE)), window.hub.map(mapDocumentKey(OUTSIDE)).event(1)?.name ])
      .toStrictEqual([ [ null, null, 'Transfer (Entrance)' ], [ null ], true, 'EV001' ]);
  });

  it('gives the pair back from a map saved since, as the map holds it', async () =>
  {
    // Arrange: a pair placed on a map holding an unsaved event, then the map saved.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    createEvent(window.hub, OUTSIDE, { x: 2, y: 2 });
    await placeDoorPair(window);
    await window.hub.save(mapDocumentKey(OUTSIDE));

    // Act.
    window.hub.undo(mapHistoryKey(OUTSIDE));
    await settlePairs();

    // Assert: the file keeps the saved event and loses the door; nothing is left unsaved or unwritten.
    expect([ (window.disk.get(OUTSIDE) as RmmzMap).events.map(event => (event === null ? null : event.name)), window.problems, window.hub.dirtyKeys(), window.writer.hasUnwritten() ])
      .toStrictEqual([ [ null, 'EV001' ], [], [], false ]);
  });

  it('writes the end on a map nobody has open through to its file, and once opened here the map undoes it from itself', async () =>
  {
    // Arrange: only the outside map held.
    const window = pairWindow();
    const original = structuredClone(window.disk.get(INSIDE));
    await placeDoorPair(window);
    const written = onDisk(window, INSIDE, 1);
    const held = window.hub.has(mapDocumentKey(INSIDE));

    // Act: the inside map opened from its file, then undone from.
    window.hub.adopt(mapDocumentKey(INSIDE), structuredClone(window.disk.get(INSIDE)) as unknown as JsonValue);
    const undone = window.hub.undo(mapHistoryKey(INSIDE));
    await settlePairs();

    // Assert.
    expect([ written, held, undone.ok, window.disk.get(INSIDE), onDisk(window, OUTSIDE, 1), window.hub.map(mapDocumentKey(OUTSIDE)).event(1) ])
      .toStrictEqual([ 'Transfer (Northeast Section)', false, true, original, null, null ]);
  });

  it('undoes a pair from the map it left from while the other is still unopened, writing the other through', async () =>
  {
    // Arrange: only the outside map held.
    const window = pairWindow();
    const original = structuredClone(window.disk.get(INSIDE));
    await placeDoorPair(window);

    // Act.
    window.hub.undo(mapHistoryKey(OUTSIDE));
    await settlePairs();

    // Assert.
    expect([ window.disk.get(INSIDE), onDisk(window, OUTSIDE, 1), window.hub.has(mapDocumentKey(INSIDE)) ])
      .toStrictEqual([ original, null, false ]);
  });

  it('takes a refused pair back here, writing nothing, and says why', async () =>
  {
    // Arrange: an act the disk refuses.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    window.failNextWrite(new MapEditorApiError('PUT /api/map-changes answered 409', 409, 'Map 028 no longer holds what the change replaced: its events changed'));
    const before = [ OUTSIDE, INSIDE ].map(mapId => structuredClone(window.disk.get(mapId)));

    // Act.
    await placeDoorPair(window);

    // Assert.
    expect([ [ OUTSIDE, INSIDE ].map(mapId => window.disk.get(mapId)), window.hub.map(mapDocumentKey(OUTSIDE)).event(1), window.problems, window.writer.hasUnwritten() ])
      .toStrictEqual([
        before,
        null,
        [ { message: 'The transfer pair could not be written, so it was taken back: Map 028 no longer holds what the change replaced: its events changed.', alarm: false } ],
        false,
      ]);
  });

  it('takes back every move made since a refused act along with it, newest first, so the window ends as the disk is', async () =>
  {
    // Arrange: the placing act held on its way and then refused, and the pair undone meanwhile.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const release = window.holdNextWrite();
    window.failNextWrite(new Error('the disk is full'));
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;
    const before = [ OUTSIDE, INSIDE ].map(mapId => structuredClone(window.disk.get(mapId)));

    // Act.
    await placeTransfers(window.sources, plan);
    window.hub.undo(mapHistoryKey(OUTSIDE));
    release();
    await settlePairs();

    // Assert: the undo was redone and the placing undone, so the pair stands undone, as the disk never held it.
    const { rows, position } = window.hub.history(mapHistoryKey(OUTSIDE));
    expect([ [ OUTSIDE, INSIDE ].map(mapId => window.disk.get(mapId)), rows.length, position, window.acts.length, window.writer.hasUnwritten() ])
      .toStrictEqual([ before, 1, 0, 1, false ]);
  });

  it('alarms over a refused pair that cannot be taken back, a later edit standing in its way, and counts it unwritten', async () =>
  {
    // Arrange: an act held on its way and then refused.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const release = window.holdNextWrite();
    window.failNextWrite(new Error('the disk is full'));
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;

    // Act: an event placed after the door while the act is on its way, which taking the door out would move.
    const outcome = await placeTransfers(window.sources, plan);
    createEvent(window.hub, OUTSIDE, { x: 9, y: 9 });
    release();
    await settlePairs();

    // Assert.
    expect([ outcome.ok, window.problems, window.writer.hasUnwritten() ])
      .toStrictEqual([
        true,
        [ { message: 'The transfer pair could not be written (the disk is full), and "Place door pair" could not be taken back: undo it by hand.', alarm: true } ],
        true,
      ]);
  });

  it('leaves a move made in another window to that window, and a transfer on one map to its map\'s save', async () =>
  {
    // Arrange: a one-way door placed here, and a pair step as another window's commit arrives.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const oneWay = pairPlanOf({ ...DOOR_PAIR, ways: 'one', landing: { x: 4, y: 6 } }, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;

    // Act.
    const placed = await placeTransfers(window.sources, oneWay);
    await settlePairs();

    // Assert: nothing written at once; the door waits for its map's save.
    expect([ placed.ok, window.acts, window.hub.isDirty(mapDocumentKey(OUTSIDE)) ])
      .toStrictEqual([ true, [], true ]);
  });

  it('refuses to undo a pair whose held map\'s file changed on disk since, naming the map, before anything moves', async () =>
  {
    // Arrange: a pair written, then the outside map's file found without its door, taken out in MZ.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const step = await placeDoorPair(window);
    const untouched = window.writer.guard(step, 'backward');
    const changed = structuredClone(window.disk.get(OUTSIDE)) as RmmzMap;
    changed.events = [ null ];

    // Act.
    window.hub.noteWritten(mapDocumentKey(OUTSIDE), changed as unknown as JsonValue);
    const guarded = window.writer.guard(step, 'backward');

    // Assert: the inside map's file still fits, so only the outside map is named; a step on one map is not the writer's.
    expect([ untouched, guarded, window.writer.guard({ ...step, entries: step.entries.slice(0, 1) }, 'backward') ])
      .toStrictEqual([ null, `Map ${OUTSIDE} changed on disk since this transfer pair was written to it`, null ]);
  });

  it('waits for an act on its way before saying everything is written, and counts it unwritten meanwhile', async () =>
  {
    // Arrange: the act held on its way.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const release = window.holdNextWrite();
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;
    await placeTransfers(window.sources, plan);

    // Act.
    let written = false;
    const waiting = window.writer.whenWritten().then(() =>
    {
      written = true;
    });
    await settlePairs();
    const whileHeld = [ written, window.writer.hasUnwritten() ];
    release();
    await waiting;

    // Assert.
    expect([ whileHeld, written, window.writer.hasUnwritten(), onDisk(window, INSIDE, 1) ])
      .toStrictEqual([ [ false, true ], true, false, 'Transfer (Northeast Section)' ]);
  });

  it('waits for an edit under way to end before taking a refused pair back, nothing moving under the stroke', async () =>
  {
    // Arrange: the placing act held on its way and then refused, and a stroke opened on the inside map meanwhile.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const release = window.holdNextWrite();
    window.failNextWrite(new Error('the disk is full'));
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;
    await placeTransfers(window.sources, plan);
    const stroke = window.hub.begin('Paint', [ mapHistoryKey(INSIDE) ]);

    // Act.
    release();
    await settlePairs();
    const duringStroke = window.hub.map(mapDocumentKey(OUTSIDE)).event(1)?.name ?? null;
    stroke.cancel();
    await new Promise(resolve =>
    {
      setTimeout(resolve, 80);
    });

    // Assert: the door stood while the stroke was open, and went once it ended.
    expect([ duringStroke, window.hub.map(mapDocumentKey(OUTSIDE)).event(1), window.problems.length, window.writer.hasUnwritten() ])
      .toStrictEqual([ 'Transfer (Entrance)', null, 1, false ]);
  });

  it('alarms over a refused pair no history can take back any more, forgotten while it was on its way', async () =>
  {
    // Arrange: the placing act held on its way and then refused with something that is no error.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const release = window.holdNextWrite();
    window.failNextWrite('the server went away');
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;
    const outcome = await placeTransfers(window.sources, plan);

    // Act.
    window.hub.forgetStep(outcome.ok ? outcome.step.id : '');
    release();
    await settlePairs();

    // Assert.
    expect([ window.problems, window.writer.hasUnwritten() ])
      .toStrictEqual([ [ { message: 'The transfer pair could not be written (the server went away), and "Place door pair" could not be taken back: undo it by hand.', alarm: true } ], true ]);
  });

  it('tells a listener added later of a problem until it stops listening, and writes nothing once stopped', async () =>
  {
    // Arrange: a listener of its own, and a refused act.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const heard: string[] = [];
    const stopListening = window.writer.onProblem(message => heard.push(message));
    window.failNextWrite(new Error('first'));
    await placeDoorPair(window);

    // Act: the listener gone, a second refused act, then the writer stopped and the pair placed again.
    stopListening();
    window.failNextWrite(new Error('second'));
    await placeDoorPair(window);
    window.writer.stop();
    await placeDoorPair(window);

    // Assert: the listener heard the first alone; the window's own heard both; the last pair went nowhere.
    expect([ heard, window.problems.length, window.acts.length, onDisk(window, OUTSIDE, 1) ])
      .toStrictEqual([ [ 'The transfer pair could not be written, so it was taken back: first.' ], 2, 2, null ]);
  });

  it('writes whatever patches a pair holds, its maps alone, and cannot tell a map\'s file a move on its way no longer fits', async () =>
  {
    // Arrange: a pair renaming both maps and one in the map tree, its act held on its way.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    window.hub.adopt('mapinfos', [ null, { id: 1, name: 'Old' } ]);
    const release = window.holdNextWrite();
    const step = window.hub.edit('Rename both', [ mapHistoryKey(OUTSIDE) ], tx =>
    {
      tx.set(mapDocumentKey(OUTSIDE), [ 'displayName' ], 'Outside');
      tx.set(mapDocumentKey(INSIDE), [ 'displayName' ], 'Inside');
      tx.set('mapinfos', [ 1, 'name' ], 'New');
      tx.join([ mapHistoryKey(INSIDE) ]);
    }) as HistoryStep;

    // Act: the outside map's file found renamed otherwise while the act is on its way, then the act let go.
    const renamed = structuredClone(window.disk.get(OUTSIDE)) as RmmzMap;
    renamed.displayName = 'Elsewhere';
    window.hub.noteWritten(mapDocumentKey(OUTSIDE), renamed as unknown as JsonValue);
    const guarded = window.writer.guard(step, 'backward');
    release();
    await settlePairs();

    // Assert: one act naming both maps alone; the file on its way could not be told apart, so nothing was named.
    expect([ isPairStep(step), window.acts.map(act => act.maps.map(each => [ each.map, each.patches.length ])), guarded, (window.disk.get(INSIDE) as RmmzMap).displayName ])
      .toStrictEqual([ true, [ [ [ OUTSIDE, 1 ], [ INSIDE, 1 ] ] ], null, 'Inside' ]);
  });

  describe('isPairStep', () =>
  {
    it('reads a step changing two maps as a pair, and neither a step on one map nor a blueprint\'s change', () =>
    {
      // Arrange: three steps shaped as each would be.
      const patch = { kind: 'set' as const, path: [ 'note' ], before: '', after: 'x' };
      const base = { id: 's', label: 'l', histories: [], origin: 'w', at: 0 };
      const pair: HistoryStep = { ...base, entries: [ { document: mapDocumentKey(1), patch }, { document: mapDocumentKey(2), patch } ] };
      const single: HistoryStep = { ...base, entries: [ { document: mapDocumentKey(1), patch } ] };
      const blueprint: HistoryStep = { ...base, entries: [ { document: blueprintMapKey('k3x9q2mf'), patch }, { document: mapDocumentKey(1), patch }, { document: mapDocumentKey(2), patch } ] };

      // Act.
      const read = [ pair, single, blueprint ].map(isPairStep);

      // Assert.
      expect(read)
        .toStrictEqual([ true, false, false ]);
    });
  });
});
