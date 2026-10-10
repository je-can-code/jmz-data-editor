import { describe, expect, it } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { createEvent } from '../../../../src/mapEditor/core/events/eventEdits.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { blueprintMapKey, mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { placeTransfers } from '../../../../src/mapEditor/core/transferPairs/pairPlacement.ts';
import { NO_PICKS, pairPlanOf, type PairPicks, type PairPlan } from '../../../../src/mapEditor/core/transferPairs/pairPlans.ts';
import { isPairStep } from '../../../../src/mapEditor/core/transferPairs/PairWriter.ts';
import { HistoryRouter } from '../../../../src/mapEditor/core/workspace/HistoryRouter.ts';
import { INSIDE, OUTSIDE, PAIR_LOOKS, pairMapName, pairMapOf, pairWindow, settlePairs, type PairWindow } from '../../support/pairFixtures.ts';

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
 * - a pair is judged by its own events, never by the rest of a map's list or by what the editor saved to a map's file
 *   since: an event placed after the door leaves the door's place empty on an undo rather than refusing it, and a file
 *   the map was saved to takes the door out by its place alone; only a redo finding another event in a door's place in a
 *   held map's file is refused before anything moves, naming the map and saying what to do; an edit to the door itself
 *   still refuses an undo, naming the edit, its map and what to do.
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

    // Act: the door renamed while the act is on its way, which taking the door out would undo.
    const outcome = await placeTransfers(window.sources, plan);
    window.hub.edit('Rename door', [ mapHistoryKey(OUTSIDE) ], tx => tx.set(mapDocumentKey(OUTSIDE), [ 'events', 1, 'name' ], 'Front door'));
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

  /**
   * Places the door pair and undoes it, then has the outside map's file found holding a sign in the door's place, as an
   * event placed there in MZ would leave it.
   * @param {PairWindow} window The window.
   * @returns {Promise<HistoryStep>} The pair's step, undone.
   */
  const signInTheDoorsPlace = async (window: PairWindow): Promise<HistoryStep> =>
  {
    const step = await placeDoorPair(window);
    window.hub.undo(mapHistoryKey(OUTSIDE));
    await settlePairs();
    const changed = structuredClone(window.disk.get(OUTSIDE)) as RmmzMap;
    changed.events = [ null, { ...createMapEvent(1, 8, 8), name: 'Sign' } ];
    window.hub.noteWritten(mapDocumentKey(OUTSIDE), changed as unknown as JsonValue);
    return step;
  };

  it('refuses to redo a pair whose door\'s place in a held map\'s file holds another event, naming the map and what to do', async () =>
  {
    // Arrange: a pair placed and undone, asked about once before the outside map's file changes.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const step = await placeDoorPair(window);
    window.hub.undo(mapHistoryKey(OUTSIDE));
    await settlePairs();
    const untouched = window.writer.guard(step, 'forward');
    const changed = structuredClone(window.disk.get(OUTSIDE)) as RmmzMap;
    changed.events = [ null, { ...createMapEvent(1, 8, 8), name: 'Sign' } ];

    // Act.
    window.hub.noteWritten(mapDocumentKey(OUTSIDE), changed as unknown as JsonValue);
    const guarded = window.writer.guard(step, 'forward');
    const oneMap = window.writer.guard({ ...step, entries: step.entries.filter(entry => entry.document === mapDocumentKey(OUTSIDE)) }, 'forward');

    // Assert: the inside map's file still fits, so only the outside map is named; a step on one map is not the writer's.
    expect([ untouched, guarded, oneMap ])
      .toStrictEqual([ null, `Map ${OUTSIDE}'s file holds something else where this pair's events go. Save Map ${OUTSIDE}, then try again`, null ]);
  });

  it('names the map whose file stands in a redo\'s way as the map tree shows it, and by its id where the tree gives it no name', async () =>
  {
    // Arrange: as above, a sign in the door's place in the outside map's file.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const step = await signInTheDoorsPlace(window);

    // Act: asked once by a window naming the outside map, and once by one whose tree gives it no name.
    const named = window.writer.guard(step, 'forward', mapId => (mapId === OUTSIDE ? 'Riverside Stroll' : 'Harbor Inn'));
    const unnamed = window.writer.guard(step, 'forward', () => '');

    // Assert.
    expect([ named, unnamed ])
      .toStrictEqual([
        'Riverside Stroll\'s file holds something else where this pair\'s events go. Save Riverside Stroll, then try again',
        `Map ${OUTSIDE}'s file holds something else where this pair's events go. Save Map ${OUTSIDE}, then try again`,
      ]);
  });

  it('lets an undo through whatever a held map\'s file holds in the door\'s place, the door taken out of it, or nothing where it is gone', async () =>
  {
    // Arrange: two pairs written; one outside map's file found with its door renamed, the other's without it.
    const renamed = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const gone = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const steps = [ await placeDoorPair(renamed), await placeDoorPair(gone) ];
    const renamedFile = structuredClone(renamed.disk.get(OUTSIDE)) as RmmzMap;
    (renamedFile.events[1] as { name: string }).name = 'Front door';
    const goneFile = structuredClone(gone.disk.get(OUTSIDE)) as RmmzMap;
    goneFile.events = [ null, null ];
    renamed.disk.set(OUTSIDE, structuredClone(renamedFile));
    gone.disk.set(OUTSIDE, structuredClone(goneFile));
    renamed.hub.noteWritten(mapDocumentKey(OUTSIDE), renamedFile as unknown as JsonValue);
    gone.hub.noteWritten(mapDocumentKey(OUTSIDE), goneFile as unknown as JsonValue);

    // Act.
    const guarded = [ renamed.writer.guard(steps[0], 'backward'), gone.writer.guard(steps[1], 'backward') ];
    renamed.hub.undo(mapHistoryKey(INSIDE));
    gone.hub.undo(mapHistoryKey(INSIDE));
    await settlePairs();

    // Assert: the renamed door is taken out, its slot left; the file without the door is not written to at all.
    expect([ guarded, (renamed.disk.get(OUTSIDE) as RmmzMap).events, gone.acts.at(-1)?.maps.map(each => [ each.map, each.patches.length ]), renamed.problems, gone.problems ])
      .toStrictEqual([ [ null, null ], [ null, null ], [ [ INSIDE, 2 ] ], [], [] ]);
  });

  it('undoes a pair from the map it leads to once another event stands after the door, leaving the door\'s place empty', async () =>
  {
    // Arrange: a pair placed, then another event placed on the outside map, after the door, and left unsaved.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const original = structuredClone(window.disk.get(INSIDE));
    await placeDoorPair(window);
    createEvent(window.hub, OUTSIDE, { x: 9, y: 9 });
    const router = new HistoryRouter(window.hub, null, (step, direction, mapName) => window.writer.guard(step, direction, mapName), () => 'copies left', pairMapName);

    // Act.
    const outcome = await router.undo(mapHistoryKey(INSIDE));
    await settlePairs();

    // Assert: the new event keeps its id, the door's slot left empty in the map; the outside file never held the new event,
    // so it goes back to how it was before the pair; the inside map and its file are as they were; nothing is told.
    const outside = window.hub.map(mapDocumentKey(OUTSIDE));
    expect([ outcome, outside.event(1), outside.event(2)?.name, (window.disk.get(OUTSIDE) as RmmzMap).events, window.disk.get(INSIDE), window.hub.map(mapDocumentKey(INSIDE)).event(1), window.problems ])
      .toStrictEqual([ { ok: true }, null, 'EV002', [ null ], original, null, [] ]);
  });

  it('redoes a pair undone with its door\'s place left empty, putting the door back in that place on the map and in its file', async () =>
  {
    // Arrange: as above, the pair undone from the inside map with another event after the door.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    await placeDoorPair(window);
    createEvent(window.hub, OUTSIDE, { x: 9, y: 9 });
    window.hub.undo(mapHistoryKey(INSIDE));
    await settlePairs();

    // Act.
    const redone = window.hub.redo(mapHistoryKey(INSIDE));
    await settlePairs();

    // Assert: the door is back as event 1, before the other event, on the map and in its file.
    const outside = window.hub.map(mapDocumentKey(OUTSIDE));
    expect([ redone.ok, outside.event(1)?.name, outside.event(2)?.name, onDisk(window, OUTSIDE, 1), onDisk(window, INSIDE, 1), window.problems ])
      .toStrictEqual([ true, 'Transfer (Entrance)', 'EV002', 'Transfer (Entrance)', 'Transfer (Northeast Section)', [] ]);
  });

  it('undoes a pair once the map holding the door was saved with an event after it, the save never counting as a change on disk', async () =>
  {
    // Arrange: a pair placed, another event placed outside after the door, and the outside map saved.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const original = structuredClone(window.disk.get(INSIDE));
    await placeDoorPair(window);
    createEvent(window.hub, OUTSIDE, { x: 9, y: 9 });
    await window.hub.save(mapDocumentKey(OUTSIDE));
    const check = window.hub.canUndo(mapHistoryKey(INSIDE));

    // Act.
    const guarded = check.ok ? window.writer.guard(check.step, 'backward') : 'refused';
    const undone = window.hub.undo(mapHistoryKey(INSIDE));
    await settlePairs();

    // Assert: the door is out of the outside file as of the map, the saved event kept, so the map reads as saved.
    expect([ guarded, undone.ok, (window.disk.get(OUTSIDE) as RmmzMap).events.map(event => (event === null ? null : event.name)), window.disk.get(INSIDE), window.hub.dirtyKeys(), window.problems ])
      .toStrictEqual([ null, true, [ null, null, 'EV002' ], original, [], [] ]);
  });

  it('undoes a pair from the map holding the door once that map was saved with a later event and the event undone since', async () =>
  {
    // Arrange: as above, then the later event undone, leaving the door the outside map's newest step.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    await placeDoorPair(window);
    createEvent(window.hub, OUTSIDE, { x: 9, y: 9 });
    await window.hub.save(mapDocumentKey(OUTSIDE));
    window.hub.undo(mapHistoryKey(OUTSIDE));
    const check = window.hub.canUndo(mapHistoryKey(OUTSIDE));

    // Act.
    const guarded = check.ok ? window.writer.guard(check.step, 'backward') : 'refused';
    const undone = window.hub.undo(mapHistoryKey(OUTSIDE));
    await settlePairs();

    // Assert: the file the save wrote loses the door and keeps the saved event, which the map no longer holds, so the map
    // reads as unsaved.
    expect([ guarded, undone.ok, (window.disk.get(OUTSIDE) as RmmzMap).events.map(event => (event === null ? null : event.name)), window.hub.map(mapDocumentKey(OUTSIDE)).eventIds(), window.hub.dirtyKeys(), window.problems ])
      .toStrictEqual([ null, true, [ null, null, 'EV002' ], [], [ mapDocumentKey(OUTSIDE) ], [] ]);
  });

  it('still refuses a pair\'s undo once a later edit changed the door itself, naming the edit, its map and what to do', async () =>
  {
    // Arrange: a pair placed; another event placed after the door, which alone would not stand in the way; then the door
    // renamed.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const step = await placeDoorPair(window);
    createEvent(window.hub, OUTSIDE, { x: 9, y: 9 });
    window.hub.edit('Rename door', [ mapHistoryKey(OUTSIDE) ], tx => tx.set(mapDocumentKey(OUTSIDE), [ 'events', 1, 'name' ], 'Front door'));
    const router = new HistoryRouter(window.hub, null, (each, direction, mapName) => window.writer.guard(each, direction, mapName), null, pairMapName);

    // Act.
    const outcome = await router.undo(mapHistoryKey(INSIDE));
    await settlePairs();

    // Assert: nothing moved, on either map or on disk.
    expect([ outcome, window.hub.map(mapDocumentKey(OUTSIDE)).event(1)?.name, onDisk(window, INSIDE, 1) ])
      .toStrictEqual([
        {
          ok: false,
          nothing: false,
          message: '"Place door pair" cannot be undone: "Rename door" later changed what "Place door pair" changed, on Northeast Section. Undo "Rename door" there first.',
          stuckStepId: step.id,
        },
        'Front door',
        'Transfer (Northeast Section)',
      ]);
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

  it('waits for a refused pair to be taken back, after the stroke it waits on, before saying everything is written', async () =>
  {
    // Arrange: the placing act held on its way and then refused, the pair undone meanwhile, and a stroke open as it fails.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    const release = window.holdNextWrite();
    window.failNextWrite(new Error('the disk is full'));
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;
    const before = [ OUTSIDE, INSIDE ].map(mapId => structuredClone(window.disk.get(mapId)));
    await placeTransfers(window.sources, plan);
    window.hub.undo(mapHistoryKey(OUTSIDE));
    const stroke = window.hub.begin('Paint', [ mapHistoryKey(INSIDE) ]);
    release();
    await settlePairs();

    // Act: a wait for everything to land, as a save makes, through the stroke and past its end.
    let written = false;
    const waiting = window.writer.whenWritten().then(() =>
    {
      written = true;
    });
    await new Promise(resolve =>
    {
      setTimeout(resolve, 60);
    });
    const duringStroke = written;
    stroke.cancel();
    await waiting;

    // Assert: the wait held through the stroke and ended once both moves were taken back, the pair standing undone.
    expect([ duringStroke, written, window.hub.history(mapHistoryKey(OUTSIDE)).position, window.acts.length, [ OUTSIDE, INSIDE ].map(mapId => window.disk.get(mapId)), window.writer.hasUnwritten() ])
      .toStrictEqual([ false, true, 0, 1, before, false ]);
  });

  it('stops waiting for a refused pair\'s answer once stopped, as the stroke it waits on may never end', async () =>
  {
    // Arrange: the placing act refused while a stroke is open, so its answer waits.
    const window = pairWindow({ held: [ OUTSIDE, INSIDE ] });
    window.failNextWrite(new Error('the disk is full'));
    const plan = pairPlanOf(DOOR_PAIR, pairMapOf(window.disk, OUTSIDE), pairMapOf(window.disk, INSIDE), PAIR_LOOKS) as PairPlan;
    const release = window.holdNextWrite();
    await placeTransfers(window.sources, plan);
    window.hub.begin('Paint', [ mapHistoryKey(INSIDE) ]);
    release();
    await settlePairs();
    let written = false;
    const waiting = window.writer.whenWritten().then(() =>
    {
      written = true;
    });
    await settlePairs();
    const beforeStop = written;

    // Act.
    window.writer.stop();
    await waiting;

    // Assert: the wait held until the stop, which ended it with the door still standing, never taken back.
    expect([ beforeStop, written, window.hub.map(mapDocumentKey(OUTSIDE)).event(1)?.name ])
      .toStrictEqual([ false, true, 'Transfer (Entrance)' ]);
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
