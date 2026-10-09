import { describe, expect, it } from 'vitest';
import type { BlueprintWrite } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BlueprintMapFollower, keepBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMapFollower.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { blueprintHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { storedBlueprints } from '../../support/blueprintFixtures.ts';
import {
  a5,
  BLUEPRINT,
  campStamp,
  groundOf,
  propagationWindow,
  settle,
  writtenWindow,
  type PropagationWindow,
} from '../../support/propagationFixtures.ts';

/*
 * A blueprint's tab is laid out from what the blueprints keep, and every edit made there writes the blueprint back as the
 * tab shows it, so a tab left showing an older blueprint would put it back over a newer one with its next edit. So the
 * follower owes every window this: whenever the blueprints change other than by a change made in a tab (a version of
 * their file found on disk, or the author taking the version on disk over their own), a tab with nothing unwritten is
 * laid out afresh from its blueprint, and the next edit there writes on top of the newer one; a tab whose blueprint did
 * not change keeps its history; a tab holding changes not yet written keeps them and is flagged waiting for the author's
 * choice, keeping their own making the blueprint what the tab shows; and a blueprint deleted on disk is handed over, with
 * its last name, for its tab to be closed, while one taken away here by a step is not, since an undo brings it back.
 *
 * The camp is 2 by 2 on layer 1, A5 tiles 1 to 4; maps 1, 2 and 3 each hold a placement of it at (1, 1).
 */
describe('BlueprintMapFollower', () =>
{
  /**
   * The camp's stamp with its four tiles as given.
   * @param {readonly number[]} values The tiles, row by row.
   * @returns {Stamp} The stamp.
   */
  const campWith = (values: readonly number[]): Stamp =>
  {
    return { ...campStamp(), tiles: { layers: [ 0 ], values: [ ...values ], calledFor: [ -1, -1, -1, -1 ] } };
  };

  /**
   * The blueprints as a version of their file found on disk holds them: the camp alone, named and tiled as given.
   * @param {readonly number[]} values The camp's tiles, row by row.
   * @param {string} name The camp's name.
   * @returns {JsonValue} The blueprints, in their stored form.
   */
  const onDisk = (values: readonly number[], name = 'Camp'): JsonValue =>
  {
    return storedBlueprints({ [BLUEPRINT]: { name, stamp: campWith(values) } }) as JsonValue;
  };

  /**
   * Paints one of the camp's top cells in its tab, as a stroke there does.
   * @param {PropagationWindow} window The window.
   * @param {number} x The column, 0 or 1.
   * @param {number} value The tile.
   * @returns {HistoryStep | null} The step.
   */
  const paintCamp = (window: PropagationWindow, x: number, value: number): HistoryStep | null =>
  {
    return window.hub.edit('Paint', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.tiles(window.blueprintKey, [ [ cellIndex(2, 2, x, 0, 0), value ] ]));
  };

  /**
   * Reads the camp's four tiles as its tab shows them.
   * @param {PropagationWindow} window The window.
   * @returns {number[]} The tiles, row by row.
   */
  const tabTiles = (window: PropagationWindow): number[] => Array.from(window.blueprintMap.cells.subarray(0, 4));

  /**
   * Starts a follower on a window.
   * @param {PropagationWindow} window The window.
   * @returns {BlueprintMapFollower} The follower, started.
   */
  const followerOn = (window: PropagationWindow): BlueprintMapFollower =>
  {
    const follower = new BlueprintMapFollower(window.hub);
    follower.start();
    return follower;
  };

  describe('a tab with nothing unwritten', () =>
  {
    it('is laid out afresh from a version of its blueprint found on disk, its earlier changes no longer undoable', async () =>
    {
      // Arrange: a stroke in the tab, written.
      const window = await writtenWindow();
      followerOn(window);
      paintCamp(window, 0, a5(9));
      await settle();

      // Act: the blueprints' file changes on disk, the camp's other top cell repainted there.
      window.hub.applyOutsideContent(BLUEPRINTS_DOCUMENT, onDisk([ a5(9), a5(20), a5(3), a5(4) ]));

      // Assert.
      expect([ tabTiles(window), window.hub.isDirty(window.blueprintKey), window.hub.history(blueprintHistoryKey(BLUEPRINT)).rows.map(row => row.label) ])
        .toStrictEqual([ [ a5(9), a5(20), a5(3), a5(4) ], false, [] ]);
    });

    it('writes its next edit on top of the version found on disk, which reaches its copies from there', async () =>
    {
      // Arrange: the tab following a version of the camp found on disk.
      const window = await writtenWindow();
      followerOn(window);
      paintCamp(window, 0, a5(9));
      await settle();
      window.hub.applyOutsideContent(BLUEPRINTS_DOCUMENT, onDisk([ a5(9), a5(20), a5(3), a5(4) ]));

      // Act.
      paintCamp(window, 0, a5(30));
      await settle();

      // Assert: the blueprints keep the disk's cell and the new stroke, and the copies take the stroke.
      const last = window.acts[window.acts.length - 1] as BlueprintWrite;
      const camp = (last.blueprints as { data: { blueprints: Record<string, { stamp: { tiles: { values: number[] } } }> } }).data.blueprints[BLUEPRINT];
      expect([ camp.stamp.tiles.values, [ 1, 2, 3 ].map(mapId => groundOf(window.disk.get(mapId) as RmmzMap, 1, 1)) ])
        .toStrictEqual([ [ a5(30), a5(20), a5(3), a5(4) ], [ a5(30), a5(30), a5(30) ] ]);
    });

    it('is left as it is, history and all, when the version found on disk leaves its blueprint as it was', async () =>
    {
      // Arrange: a stroke in the tab, written.
      const window = await writtenWindow();
      followerOn(window);
      paintCamp(window, 0, a5(9));
      await settle();

      // Act: the camp only renamed on disk.
      window.hub.applyOutsideContent(BLUEPRINTS_DOCUMENT, onDisk([ a5(9), a5(2), a5(3), a5(4) ], 'Fort'));

      // Assert.
      expect([ tabTiles(window), window.hub.history(blueprintHistoryKey(BLUEPRINT)).rows.map(row => row.label) ])
        .toStrictEqual([ [ a5(9), a5(2), a5(3), a5(4) ], [ 'Paint' ] ]);
    });

    it('follows the version on disk the author takes over the window\'s own', async () =>
    {
      // Arrange: a stroke in the tab, written, then the blueprints flagged against a version found on disk.
      const window = await writtenWindow();
      followerOn(window);
      paintCamp(window, 0, a5(9));
      await settle();
      const theirs = onDisk([ a5(1), a5(20), a5(3), a5(4) ]);
      window.hub.flagConflict(BLUEPRINTS_DOCUMENT, { kind: 'disk', content: theirs });

      // Act: the author takes the version on disk.
      window.hub.reload(BLUEPRINTS_DOCUMENT, theirs);

      // Assert.
      expect([ tabTiles(window), window.hub.isDirty(window.blueprintKey), window.hub.isConflicted(window.blueprintKey) ])
        .toStrictEqual([ [ a5(1), a5(20), a5(3), a5(4) ], false, false ]);
    });
  });

  describe('a tab holding changes not yet written', () =>
  {
    /**
     * A window with no disk to write to, its camp painted in its tab, then the blueprints reloaded from a version found on
     * disk, as the author taking it over their own does: the tab still holds its stroke, which reached no file.
     * @returns {Promise<{ window: PropagationWindow, follower: BlueprintMapFollower }>} The window and its follower.
     */
    const heldBack = async () =>
    {
      const window = await propagationWindow();
      const follower = followerOn(window);
      paintCamp(window, 0, a5(9));
      const theirs = onDisk([ a5(1), a5(20), a5(3), a5(4) ]);
      window.hub.flagConflict(BLUEPRINTS_DOCUMENT, { kind: 'disk', content: theirs });
      window.hub.reload(BLUEPRINTS_DOCUMENT, theirs);
      return { window, follower };
    };

    it('keeps them, and waits for the author\'s choice against the blueprint as the blueprints now keep it', async () =>
    {
      // Arrange and Act: the reload is the act; the helper ends with it.
      const { window } = await heldBack();

      // Assert: the tab shows its own stroke, and its conflict holds the version on disk, laid out.
      const conflict = window.hub.conflict(window.blueprintKey);
      const theirs = conflict !== null && conflict.kind === 'disk' ? (conflict.content as unknown as RmmzMap).data.slice(0, 2) : null;
      expect([ tabTiles(window), conflict?.kind, theirs ])
        .toStrictEqual([ [ a5(9), a5(2), a5(3), a5(4) ], 'disk', [ a5(1), a5(20) ] ]);
    });

    it('makes the blueprint what the tab shows when the author keeps their own changes, and waits no longer', async () =>
    {
      // Arrange.
      const { window, follower } = await heldBack();

      // Act.
      const kept = keepBlueprintMap(window.hub, follower, BLUEPRINT);

      // Assert.
      const camp = blueprintIn(window.hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT);
      const labels = window.hub.history(blueprintHistoryKey(BLUEPRINT)).rows.map(row => row.label);
      expect([ kept, labels[labels.length - 1], camp?.stamp.tiles?.values, window.hub.isConflicted(window.blueprintKey) ])
        .toStrictEqual([ true, 'Keep my changes', [ a5(9), a5(2), a5(3), a5(4) ], false ]);
    });

    it('keeps nothing for a blueprint the blueprints no longer hold', async () =>
    {
      // Arrange: the camp's tab held, the blueprints holding nothing.
      const { window, follower } = await heldBack();
      window.hub.reload(BLUEPRINTS_DOCUMENT, storedBlueprints({}) as JsonValue);

      // Act.
      const kept = keepBlueprintMap(window.hub, follower, BLUEPRINT);

      // Assert.
      expect(kept)
        .toBe(false);
    });
  });

  describe('a blueprint deleted', () =>
  {
    it('is handed over with its last name when the deletion was found on disk, for its tab to be closed', async () =>
    {
      // Arrange.
      const window = await writtenWindow();
      const follower = followerOn(window);
      const handed: [ string, string ][] = [];
      follower.onDeletedOnDisk((blueprintId, name) => handed.push([ blueprintId, name ]));

      // Act.
      window.hub.applyOutsideContent(BLUEPRINTS_DOCUMENT, storedBlueprints({}) as JsonValue);

      // Assert.
      expect(handed)
        .toStrictEqual([ [ BLUEPRINT, 'Camp' ] ]);
    });

    it('is not handed over when it was taken away here, which an undo brings back', async () =>
    {
      // Arrange.
      const window = await writtenWindow();
      const follower = followerOn(window);
      const handed: string[] = [];
      follower.onDeletedOnDisk(blueprintId => handed.push(blueprintId));

      // Act: the camp taken away by a step here, as a delete or an undone save does.
      window.hub.edit('Delete', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', BLUEPRINT ], undefined));

      // Assert: the tab stays, as the blueprint shows gone there.
      expect([ handed, window.hub.has(window.blueprintKey) ])
        .toStrictEqual([ [], true ]);
    });
  });
});
