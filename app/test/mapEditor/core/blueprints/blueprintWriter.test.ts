import { describe, expect, it } from 'vitest';
import { MapEditorApiError, type BlueprintWrite } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { BlueprintWriter, isWrittenAtOnce } from '../../../../src/mapEditor/core/blueprints/blueprintWriter.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { operationFor } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { storedBlueprints } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import {
  a5,
  BLUEPRINT,
  campMap,
  campStamp,
  eventOf,
  groundOf,
  guardPage,
  MAP_HEIGHT,
  MAP_WIDTH,
  settle,
  writtenWindow,
  type WrittenWindow,
} from '../../support/propagationFixtures.ts';

/*
 * A change to a blueprint is written to disk as it is made, undone or redone, the blueprints and every map it reached in
 * one act, so no discard or crash can leave the blueprint ahead of its copies. A run of strokes goes in one act; an undo
 * goes at once. Each map's file takes the change against what the file holds: a map held without unsaved edits takes the
 * very change it took in place, and reads as saved after; a map held with unsaved edits takes its file's own version,
 * which never carries those edits, and still reads as unsaved; a map nobody has open takes the change written through. A
 * map saved with the change in it gives it back on undo by the version it was saved with. An act the disk refuses writes
 * nothing, and the change, with everything made since, is taken back here so the window and the disk agree, and the author
 * hears why; one that cannot be taken back is an alarm, and stays unwritten. Moves made in another window are that
 * window's to write. Before an undo moves anything, a file changed on disk since is named.
 *
 * Maps 1, 2 and 3 each hold one placement of the blueprint at (1, 1) with its guard (5) and post (6). The window holds maps
 * 1 and 2; map 3 is on disk.
 */
describe('BlueprintWriter', () =>
{
  /**
   * Paints the blueprint's top-left cell, as a stroke in its tab does.
   * @param {WrittenWindow} window The window.
   * @param {number} value The new tile.
   * @returns {HistoryStep | null} The step.
   */
  const paintCorner = (window: WrittenWindow, value: number): HistoryStep | null =>
  {
    return window.hub.edit('Paint', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.tiles(window.blueprintKey, [ [ cellIndex(2, 2, 0, 0, 0), value ] ]));
  };

  /**
   * Reads the corner of the placement on a map's file on disk.
   * @param {WrittenWindow} window The window.
   * @param {number} mapId The map.
   * @returns {number} The tile.
   */
  const cornerOnDisk = (window: WrittenWindow, mapId: number): number => groundOf(window.disk.get(mapId) as RmmzMap, 1, 1);

  it('writes a run of strokes to the blueprints and every map they reached in one act, once the run settles', async () =>
  {
    // Arrange.
    const window = await writtenWindow();

    // Act: two strokes in one moment.
    paintCorner(window, a5(8));
    paintCorner(window, a5(9));
    const beforeSettling = window.acts.length;
    await settle();

    // Assert: one act, each map its two strokes' patches, the blueprints holding the last.
    const kept = blueprintIn(window.hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT);
    expect([ beforeSettling, window.acts.map(act => act.maps.map(each => [ each.map, each.patches.length ])), [ 1, 2, 3 ].map(mapId => cornerOnDisk(window, mapId)) ])
      .toStrictEqual([ 0, [ [ [ 1, 2 ], [ 2, 2 ], [ 3, 2 ] ] ], [ a5(9), a5(9), a5(9) ] ]);
    expect(window.blueprintsOnDisk())
      .toStrictEqual(window.hub.committedContent(BLUEPRINTS_DOCUMENT));
    expect(kept?.stamp.tiles?.values[0])
      .toBe(a5(9));
  });

  it('leaves the blueprints, the blueprint\'s tab and every map held without unsaved edits reading as saved once written', async () =>
  {
    // Arrange.
    const window = await writtenWindow();

    // Act.
    paintCorner(window, a5(9));
    const dirtyBefore = window.hub.dirtyKeys();
    await settle();

    // Assert.
    expect([ dirtyBefore, window.hub.dirtyKeys(), window.writer.hasUnwritten() ])
      .toStrictEqual([ [ BLUEPRINTS_DOCUMENT, 'map:1', 'map:2', window.blueprintKey ], [], false ]);
  });

  it('writes an undo at once, taking the change back out of every file, and a redo the same', async () =>
  {
    // Arrange.
    const window = await writtenWindow();
    const original = [ 1, 2, 3 ].map(mapId => structuredClone(window.disk.get(mapId)));
    paintCorner(window, a5(9));
    await settle();

    // Act.
    window.hub.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();
    const afterUndo = [ 1, 2, 3 ].map(mapId => window.disk.get(mapId));
    window.hub.redo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert.
    expect([ afterUndo, [ 1, 2, 3 ].map(mapId => cornerOnDisk(window, mapId)), window.acts.length, window.hub.dirtyKeys() ])
      .toStrictEqual([ original, [ a5(9), a5(9), a5(9) ], 3, [] ]);
  });

  it('writes a map held with unsaved edits by its file\'s own version, never saving those edits, and leaves it unsaved', async () =>
  {
    // Arrange: map 2's copy painted over beside the corner, and a plain event renamed, neither saved.
    const window = await writtenWindow();
    window.hub.edit('Paint', [ mapHistoryKey(2) ], tx => tx.tiles('map:2', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0), a5(7) ] ]));
    window.hub.edit('Rename', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'events', 7, 'name' ], 'Unsaved'));

    // Act.
    paintCorner(window, a5(9));
    await settle();

    // Assert: on the map the painted corner is its own; on disk the corner follows, and the rename never arrives.
    const onDisk = window.disk.get(2) as RmmzMap;
    expect([ groundOf(window.hub.map('map:2'), 1, 1), groundOf(onDisk, 1, 1), eventOf(onDisk, 7).name, window.hub.isDirty('map:2') ])
      .toStrictEqual([ a5(7), a5(9), 'EV007', true ]);
  });

  it('takes a change back out of a map saved with it in by the version it was saved with', async () =>
  {
    // Arrange: map 2's corner painted over by hand, the change written by its file's version, then map 2 saved whole.
    const window = await writtenWindow();
    window.hub.edit('Paint', [ mapHistoryKey(2) ], tx => tx.tiles('map:2', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 2, 1, 0), a5(7) ] ]));
    paintCorner(window, a5(9));
    await settle();
    window.disk.set(2, window.hub.committedContent('map:2') as unknown as RmmzMap);
    window.hub.noteSaved('map:2', window.hub.appliedSteps('map:2').map(step => step.id));

    // Act.
    window.hub.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert: the file holds the map exactly as it now stands, its own painting included, and the map reads as saved.
    expect([ window.disk.get(2), window.hub.isDirty('map:2'), window.problems ])
      .toStrictEqual([ window.hub.committedContent('map:2'), false, [] ]);
  });

  /**
   * Holds map 4, a plain map on disk, with a copy of the blueprint's guard (event 2, speed 3) put on it and not saved, so
   * its file holds no copy at all.
   * @param {WrittenWindow} window The window.
   * @returns {Promise<void>} Settles once the window has read map 4's file.
   */
  const holdUnsavedCopy = async (window: WrittenWindow): Promise<void> =>
  {
    const plain: RmmzMap = { ...mapWithEvents(MAP_WIDTH, MAP_HEIGHT, [ null, [ 3, 3 ], null ]), tilesetId: 4 };
    window.disk.set(4, structuredClone(plain));
    window.hub.adopt('map:4', structuredClone(plain) as unknown as JsonValue);
    const guard: RmmzMapEvent = {
      ...createMapEvent(2, 4, 4),
      name: 'Guard',
      pages: [ guardPage(3) ],
      note: withBlueprintLink('', { blueprintId: BLUEPRINT, eventId: 1, differences: [] }),
    };
    window.hub.edit('Copy', [ mapHistoryKey(4) ], tx => tx.set('map:4', [ 'events', 2 ], guard as unknown as JsonValue));
    await settle();
  };

  /**
   * Sets the speed of the blueprint's guard, as its window does.
   * @param {WrittenWindow} window The window.
   * @param {number} speed The new speed.
   * @returns {HistoryStep | null} The step.
   */
  const speedGuard = (window: WrittenWindow, speed: number): HistoryStep | null =>
  {
    return window.hub.edit('Speed', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], speed));
  };

  /**
   * Reads the speed of map 4's copy of the guard, in the window and on disk.
   * @param {WrittenWindow} window The window.
   * @returns {[ number, number ]} The speed in the window, then on disk.
   */
  const copySpeeds = (window: WrittenWindow): [ number, number ] =>
  {
    const held = window.hub.map('map:4').events[2] as RmmzMapEvent;
    const onDisk = (window.disk.get(4) as RmmzMap).events[2] as RmmzMapEvent;
    return [ held.pages[0].moveSpeed, onDisk.pages[0].moveSpeed ];
  };

  it('gives a change back by the version its file took while the map is not saved since, writing nothing to a file that took none', async () =>
  {
    // Arrange: the guard sped up while map 4's copy was unsaved, so its file took none of the change.
    const window = await writtenWindow();
    await holdUnsavedCopy(window);
    speedGuard(window, 4);
    await settle();
    const acts = window.acts.length;

    // Act.
    window.hub.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert: the undo wrote the camps but not map 4, whose file still holds no copy, and map 4 still reads unsaved.
    expect([ window.acts.slice(acts).map(act => act.maps.map(each => each.map)), (window.disk.get(4) as RmmzMap).events[2], window.hub.isDirty('map:4') ])
      .toStrictEqual([ [ [ 1, 2, 3 ] ], null, true ]);
  });

  it('gives a change back by the map\'s own patches once the map is saved with it in, though its file first took none of it', async () =>
  {
    // Arrange: the guard sped up while map 4's copy was unsaved, then map 4 saved whole, its copy at the new speed.
    const window = await writtenWindow();
    await holdUnsavedCopy(window);
    speedGuard(window, 4);
    await settle();
    window.disk.set(4, window.hub.committedContent('map:4') as unknown as RmmzMap);
    window.hub.noteSaved('map:4', window.hub.appliedSteps('map:4').map(step => step.id));
    const saved = copySpeeds(window);

    // Act.
    window.hub.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert: the copy on disk goes back with the copy on the map, and map 4 reads as saved because its file holds it.
    expect([ saved, copySpeeds(window), window.hub.isDirty('map:4'), window.problems ])
      .toStrictEqual([ [ 4, 4 ], [ 3, 3 ], false, [] ]);
  });

  it('puts a change back by the map\'s own patches when redone after the map was saved', async () =>
  {
    // Arrange: as above, the change given back after map 4 was saved with it in.
    const window = await writtenWindow();
    await holdUnsavedCopy(window);
    speedGuard(window, 4);
    await settle();
    window.disk.set(4, window.hub.committedContent('map:4') as unknown as RmmzMap);
    window.hub.noteSaved('map:4', window.hub.appliedSteps('map:4').map(step => step.id));
    window.hub.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();
    const undone = copySpeeds(window);

    // Act.
    window.hub.redo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert: the redo's act writes map 4 too, its copy back at the new speed on the map and on disk.
    expect([ undone, window.acts[window.acts.length - 1].maps.map(each => each.map), copySpeeds(window), window.hub.isDirty('map:4'), window.problems ])
      .toStrictEqual([ [ 3, 3 ], [ 1, 2, 3, 4 ], [ 4, 4 ], false, [] ]);
  });

  it('writes nothing when the disk refuses an act, takes the change back here, and says why', async () =>
  {
    // Arrange.
    const window = await writtenWindow();
    window.failNextWrite(new MapEditorApiError('PUT /api/blueprint-changes answered 409', 409, 'Map 003 no longer holds what the change replaced: the tile at 1, 1 on layer 1 changed'));

    // Act.
    paintCorner(window, a5(9));
    await settle();

    // Assert: the blueprint and every map are as they were, and nothing is left unwritten.
    expect([ groundOf(window.hub.map('map:1'), 1, 1), window.blueprintMap.cells[0], window.hub.history(blueprintHistoryKey(BLUEPRINT)).position, cornerOnDisk(window, 3), window.writer.hasUnwritten(), window.problems ])
      .toStrictEqual([
        a5(1),
        a5(1),
        0,
        a5(1),
        false,
        [ { message: 'The change to the blueprint could not be written, so it was taken back: Map 003 no longer holds what the change replaced: the tile at 1, 1 on layer 1 changed.', alarm: false } ],
      ]);
  });

  it('strands a change that cannot be taken back after its act failed, alarming the author, and counts it unwritten', async () =>
  {
    // Arrange: the corner on map 1 painted by hand right after the change, before its act fails.
    const window = await writtenWindow();
    window.failNextWrite(new Error('the disk is full'));
    paintCorner(window, a5(9));
    window.hub.edit('Paint by hand', [ mapHistoryKey(1) ], tx => tx.tiles('map:1', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0), a5(15) ] ]));

    // Act.
    await settle();

    // Assert.
    expect([ window.writer.hasUnwritten(), window.problems ])
      .toStrictEqual([ true, [ { message: 'The change to the blueprint could not be written (the disk is full), and "Paint" could not be taken back: undo it by hand.', alarm: true } ] ]);
  });

  /**
   * The blueprints as a version of their file found on disk holds them: the camp renamed Fort, its stamp as it started.
   * @returns {JsonValue} The blueprints, in their stored form.
   */
  const renamedOnDisk = (): JsonValue => storedBlueprints({ [BLUEPRINT]: { name: 'Fort', stamp: campStamp() } }) as JsonValue;

  /**
   * Has the blueprints wait for a choice about a version of their file found on disk, as a change to it reaching the window
   * while a change here is unwritten does.
   * @param {WrittenWindow} window The window.
   */
  const blueprintsChangeOnDisk = (window: WrittenWindow): void =>
  {
    window.hub.flagConflict(BLUEPRINTS_DOCUMENT, { kind: 'disk', content: renamedOnDisk() });
  };

  /**
   * The words the author reads when a change waits for their choice about the blueprints.
   */
  const WAITS = 'The blueprints changed elsewhere before this change to one was written, so it waits: keeping your version brings it back and writes it, taking the other drops it.';

  it('takes a change back the moment the blueprints start waiting for a choice, writing nothing, and keeps it waiting for that choice', async () =>
  {
    // Arrange: a stroke waiting for the run of strokes to settle.
    const window = await writtenWindow();
    const original = [ 1, 2, 3 ].map(mapId => structuredClone(window.disk.get(mapId)));
    paintCorner(window, a5(9));

    // Act: the blueprints' file changes on disk before the stroke is written.
    blueprintsChangeOnDisk(window);
    const atOnce = groundOf(window.hub.map('map:1'), 1, 1);
    await settle();

    // Assert: no copy reached its file without the blueprint, the change is out of the window, and it still waits.
    expect([ atOnce, window.acts.length, [ 1, 2, 3 ].map(mapId => window.disk.get(mapId)), window.hub.history(blueprintHistoryKey(BLUEPRINT)).position, window.writer.hasUnwritten(), window.problems ])
      .toStrictEqual([ a5(1), 0, original, 0, true, [ { message: WAITS, alarm: false } ] ]);
  });

  it('makes a waiting change again, and writes it, once the author keeps this window\'s version of the blueprints', async () =>
  {
    // Arrange: a stroke taken back to wait, the blueprints having changed on disk before it was written.
    const window = await writtenWindow();
    paintCorner(window, a5(9));
    blueprintsChangeOnDisk(window);
    await settle();

    // Act: keeping this window's version, as the banner's choice does.
    window.hub.clearConflict(BLUEPRINTS_DOCUMENT);
    await settle();

    // Assert: the stroke is back, and on disk with every copy, the blueprints holding it.
    const written = window.blueprintsOnDisk() as { data: { blueprints: Record<string, { stamp: { tiles: { values: number[] } } }> } };
    expect([ window.acts.length, [ 1, 2, 3 ].map(mapId => cornerOnDisk(window, mapId)), written.data.blueprints[BLUEPRINT].stamp.tiles.values[0], window.hub.history(blueprintHistoryKey(BLUEPRINT)).position, window.writer.hasUnwritten() ])
      .toStrictEqual([ 1, [ a5(9), a5(9), a5(9) ], a5(9), 1, false ]);
  });

  it('drops a waiting change once the author takes the version of the blueprints on disk, writing nothing of it', async () =>
  {
    // Arrange: a stroke taken back to wait, the blueprints having changed on disk before it was written.
    const window = await writtenWindow();
    paintCorner(window, a5(9));
    blueprintsChangeOnDisk(window);
    await settle();

    // Act: taking the version on disk, as the banner's other choice does.
    window.hub.reload(BLUEPRINTS_DOCUMENT, renamedOnDisk());
    await settle();

    // Assert.
    expect([ window.acts.length, [ 1, 2, 3 ].map(mapId => cornerOnDisk(window, mapId)), groundOf(window.hub.map('map:1'), 1, 1), window.writer.hasUnwritten() ])
      .toStrictEqual([ 0, [ a5(1), a5(1), a5(1) ], a5(1), false ]);
  });

  it('waits for a stroke under way to end before taking a refused change back, sending nothing meanwhile', async () =>
  {
    // Arrange: a change whose act the disk refuses while a stroke on map 2, far from the copy, is under way.
    const window = await writtenWindow();
    window.failNextWrite(new Error('the disk is full'));
    paintCorner(window, a5(9));
    const stroke = window.hub.begin('Stroke', [ mapHistoryKey(2) ]);
    stroke.tiles('map:2', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 8, 8, 0), a5(20) ] ]);
    await settle();
    const midStroke = [ groundOf(window.hub.map('map:1'), 1, 1), window.acts.length, window.writer.hasUnwritten(), window.problems.length ];

    // Act: the stroke ends.
    stroke.commit();
    await new Promise(resolve =>
    {
      setTimeout(resolve, 80);
    });

    // Assert: nothing moved under the stroke; once it ended the change went back, and the author heard why.
    expect([ midStroke, groundOf(window.hub.map('map:1'), 1, 1), window.acts.length, window.writer.hasUnwritten(), window.problems ])
      .toStrictEqual([
        [ a5(9), 1, true, 0 ],
        a5(1),
        1,
        false,
        [ { message: 'The change to the blueprint could not be written, so it was taken back: the disk is full.', alarm: false } ],
      ]);
  });

  it('writes nothing when the blueprints change only by a version of their file found on disk, which it holds already', async () =>
  {
    // Arrange.
    const window = await writtenWindow();

    // Act: the window takes a version found on disk, as it does while nothing here is unwritten.
    const taken = window.hub.applyOutsideContent(BLUEPRINTS_DOCUMENT, renamedOnDisk());
    await settle();

    // Assert.
    expect([ taken, window.acts.length, window.writer.hasUnwritten() ])
      .toStrictEqual([ 'recorded', 0, false ]);
  });

  it('refuses to move a change to a blueprint whose tab waits for a choice about a version found on disk, and never writes one', async () =>
  {
    // Arrange: a stroke written, then its tab flagged waiting for a choice about a version of the camp found on disk.
    const window = await writtenWindow();
    const step = paintCorner(window, a5(9)) as HistoryStep;
    await settle();
    window.hub.flagConflict(window.blueprintKey, { kind: 'disk', content: window.hub.committedContent(window.blueprintKey) });

    // Act: the guard asked, and an undo made past it, as nothing but the window's history router ever should.
    const refusal = window.writer.guard(step, 'backward');
    window.hub.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert: the undo went nowhere near the disk and came back, and the author heard why.
    expect([ refusal, window.acts.length, [ 1, 2, 3 ].map(mapId => cornerOnDisk(window, mapId)), groundOf(window.hub.map('map:1'), 1, 1), window.problems ])
      .toStrictEqual([
        'this blueprint changed on disk while a change to it here was not yet written, and waits for a choice',
        1,
        [ a5(9), a5(9), a5(9) ],
        a5(9),
        [ { message: 'The change to the blueprint could not be written, so it was taken back: this blueprint changed on disk while a change to it here was not yet written, and waits for a choice.', alarm: false } ],
      ]);
  });

  it('refuses to move a change to a blueprint while the blueprints wait for a choice about changes made elsewhere', async () =>
  {
    // Arrange: a change written, then the blueprints' file changed elsewhere.
    const window = await writtenWindow();
    const step = paintCorner(window, a5(9)) as HistoryStep;
    await settle();
    const beforeChoice = window.writer.guard(step, 'backward');
    window.hub.flagConflict(BLUEPRINTS_DOCUMENT, { kind: 'disk', content: { schemaVersion: 1, data: { blueprints: {} } } });

    // Act.
    const refusal = window.writer.guard(step, 'backward');

    // Assert.
    expect([ beforeChoice, refusal ])
      .toStrictEqual([ null, 'the blueprints are waiting for a choice about changes made elsewhere' ]);
  });

  it('sends nothing while a failed act\'s changes go back, even when asked to by what letting go of its files sets off', async () =>
  {
    // Arrange: a writer of its own whose first act fails, and whose kept files ask for everything to be written the moment
    // they let go of a failed write's maps, as opening a map does; a stroke and a rename go in that first act.
    const window = await writtenWindow();
    window.writer.stop();
    const acts: BlueprintWrite[] = [];
    let failing = true;
    const writer: BlueprintWriter = new BlueprintWriter({
      hub: window.hub,
      maps: {
        follow: (step, direction, writes) => window.maps.follow(step, direction, writes),
        misfit: (step, direction) => window.maps.misfit(step, direction),
        landed: (mapIds, ok) =>
        {
          window.maps.landed(mapIds, ok);
          if (ok === false)
          {
            writer.whenWritten().catch(() => undefined);
          }
        },
      },
      write: async act =>
      {
        acts.push(structuredClone(act) as BlueprintWrite);
        if (failing)
        {
          failing = false;
          throw new Error('the disk is full');
        }
      },
      onProblem: () => undefined,
      settleMs: 0,
    });
    paintCorner(window, a5(9));
    window.hub.edit('Rename', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', BLUEPRINT, 'name' ], 'Fort'));

    // Act.
    await settle();
    await writer.whenWritten();

    // Assert: the rename went alone once the stroke was back out, never carrying the stroke's blueprint with it.
    const written = acts.map(act =>
    {
      const camp = (act.blueprints as { data: { blueprints: Record<string, { name: string; stamp: { tiles: { values: number[] } } }> } }).data.blueprints[BLUEPRINT];
      return [ act.maps.length, camp.name, camp.stamp.tiles.values[0] ];
    });
    expect(written)
      .toStrictEqual([ [ 3, 'Fort', a5(9) ], [ 0, 'Fort', a5(1) ] ]);
    writer.stop();
  });

  it('writes whatever is waiting when asked, without waiting for the moment, and settles once it lands', async () =>
  {
    // Arrange: a writer that waits a long while.
    const window = await writtenWindow();
    window.writer.stop();
    const slow = new BlueprintWriter({
      hub: window.hub,
      maps: window.maps,
      write: async act =>
      {
        window.acts.push(act);
      },
      onProblem: () => undefined,
      settleMs: 60_000,
    });
    paintCorner(window, a5(9));

    // Act.
    await slow.whenWritten();

    // Assert.
    expect([ window.acts.length, slow.hasUnwritten() ])
      .toStrictEqual([ 1, false ]);
    slow.stop();
  });

  it('never writes a move made in another window, while the kept files follow it', async () =>
  {
    // Arrange: a second window over the same disk, hearing the first's operations.
    const first = await writtenWindow();
    const second = await writtenWindow();
    first.hub.subscribe(event =>
    {
      const operation = 'source' in event && event.source === 'local' ? operationFor(event, first.hub.clientId) : null;
      if (operation !== null)
      {
        second.hub.applyRemote(structuredClone(operation));
      }
    });

    // Act.
    paintCorner(first, a5(9));
    await settle();

    // Assert: the second window wrote nothing, and its kept file of map 3 holds the change.
    expect([ first.acts.length, second.acts.length, groundOf(second.maps.file(3) as never, 1, 1), groundOf(second.hub.map('map:1'), 1, 1) ])
      .toStrictEqual([ 1, 0, a5(9), a5(9) ]);
  });

  it('names a map whose file changed on disk since the change was written, before an undo moves anything', async () =>
  {
    // Arrange: map 3's corner repainted in MZ after the change was written, and read again.
    const window = await writtenWindow();
    const step = paintCorner(window, a5(9)) as HistoryStep;
    await settle();
    const beforeChange = window.writer.guard(step, 'backward');
    const changed = structuredClone(window.disk.get(3) as RmmzMap);
    changed.data[cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0)] = a5(30);
    window.disk.set(3, changed);
    window.maps.fileChanged('data/Map003.json', false);
    await settle();

    // Act.
    const refusal = window.writer.guard(step, 'backward');

    // Assert.
    expect([ beforeChange, refusal ])
      .toStrictEqual([ null, 'Map 3 changed on disk since this change was written to it' ]);
  });

  it('writes a rename of a blueprint, and its undo, to the blueprints, reaching no map', async () =>
  {
    // Arrange.
    const window = await writtenWindow();
    window.hub.edit('Rename', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', BLUEPRINT, 'name' ], 'Fort'));
    await settle();
    const renamed = window.blueprintsOnDisk();

    // Act.
    window.hub.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert.
    expect([ window.acts.map(act => act.maps.length), (renamed as { data: { blueprints: Record<string, { name: string }> } }).data.blueprints[BLUEPRINT].name, window.blueprintsOnDisk() ])
      .toStrictEqual([ [ 0, 0 ], 'Fort', window.hub.committedContent(BLUEPRINTS_DOCUMENT) ]);
  });

  describe('isWrittenAtOnce', () =>
  {
    it('writes a change to a blueprint or the blueprints at once, and no other step', () =>
    {
      // Arrange: a hub holding a map and the blueprints, with a step on each.
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt(mapDocumentKey(1), campMap() as unknown as JsonValue);
      hub.adopt(BLUEPRINTS_DOCUMENT, { schemaVersion: 1, data: { blueprints: {} } });
      const paint = hub.edit('Paint', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'note' ], 'x')) as HistoryStep;
      const save = hub.edit('Save', [ blueprintHistoryKey('zz11zz11') ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', 'zz11zz11' ], { name: 'x' })) as HistoryStep;

      // Act.
      const written = [ isWrittenAtOnce(paint), isWrittenAtOnce(save) ];

      // Assert.
      expect(written)
        .toStrictEqual([ false, true ]);
    });
  });
});
