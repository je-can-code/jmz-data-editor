import { describe, expect, it } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { isWrittenAtOnce } from '../../../../src/mapEditor/core/blueprints/blueprintWriter.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { operationFor } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import {
  a5,
  BLUEPRINT,
  campMap,
  eventOf,
  groundOf,
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

  it('writes nothing when the disk refuses an act, takes the change back here, and says why', async () =>
  {
    // Arrange.
    const window = await writtenWindow();
    window.failNextWrite(new MapEditorApiError('PUT /api/blueprint-changes answered 409', 409, 'Map 003 no longer holds what the change replaced: cell 13 no longer holds tile 1537'));

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
        [ { message: 'The change to the blueprint could not be written, so it was taken back: Map 003 no longer holds what the change replaced: cell 13 no longer holds tile 1537.', alarm: false } ],
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

  it('writes whatever is waiting when asked, without waiting for the moment, and settles once it lands', async () =>
  {
    // Arrange: a writer that waits a long while.
    const window = await writtenWindow();
    window.writer.stop();
    const { BlueprintWriter } = await import('../../../../src/mapEditor/core/blueprints/blueprintWriter.ts');
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
