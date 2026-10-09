import { describe, expect, it } from 'vitest';
import {
  deleteBlueprint,
  renameBlueprint,
  saveBlueprint,
  saveBlueprints,
} from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { BLUEPRINTS_DOCUMENT, blueprintsOf, savedBlueprintOf } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { drawsFor, holdBlueprints, storedBlueprints, type BlueprintSeed } from '../../support/blueprintFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * Saving, renaming and deleting blueprints. Each is one step in that blueprint's own history, which one undo takes back,
 * and touches that blueprint alone in the document, every other one staying exactly as it was.
 *
 * Saving keeps a stamp under a new id that never changes, with the name given, trimmed; a name of nothing but spaces is
 * refused. The events a blueprint keeps are its own, never copies of another's, so a stamp copied off linked copies has
 * its events' links taken out, the rest of each note kept, and a note that could not lose its link cleanly refuses the
 * save. Renaming changes the name alone, so every copy's link, which names the id, still names the blueprint. Deleting is
 * refused while anything is a copy of the blueprint, saying how many copies there are and on which maps, and while the
 * copies are still being counted; a blueprint gone since it was shown refuses every edit.
 *
 * Writing the blueprints, which every edit does at once, writes only what the file lacks, and never over a file that
 * changed elsewhere while this window held edits it lacks: those wait for the author's choice, as Save all leaves a map,
 * since once written they would read as saved and nothing would be left to warn them.
 */
describe('blueprintEdits', () =>
{
  /**
   * A stamp of one event called Goblin, copied off map 12, whose note says what the test likes.
   * @param {string} note The event's note.
   * @returns {Stamp} The stamp.
   */
  const goblin = (note = ''): Stamp => stampOf({ id: 'window-a:3', mapId: 12, events: [ { ...createMapEvent(4, 0, 0), name: 'Goblin', note } ] });

  /**
   * Builds a window holding the blueprints document, holding the blueprints given.
   * @param {BlueprintSeed} blueprints The blueprints, by id.
   * @returns {DocumentHub} The window's documents.
   */
  const windowWith = (blueprints: BlueprintSeed = {}): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    holdBlueprints(hub, blueprints);
    return hub;
  };

  /**
   * Reads the blueprints a window holds, by id with each one's name.
   * @param {DocumentHub} hub The window's documents.
   * @returns {string[][]} The ids and names, by name.
   */
  const namesIn = (hub: DocumentHub): string[][] =>
  {
    return blueprintsOf(hub.document(BLUEPRINTS_DOCUMENT)).map(blueprint => [ blueprint.id, blueprint.name ]);
  };

  /**
   * Names the maps a refused delete speaks of.
   * @param {number} mapId The map.
   * @returns {string} Its name.
   */
  const mapName = (mapId: number): string =>
  {
    return `Map ${mapId}`;
  };

  describe('saveBlueprint', () =>
  {
    it('keeps a stamp under a new id with its name trimmed, as one step in its own history, which one undo takes back', () =>
    {
      // Arrange: a bat already kept, which stays as it is.
      const hub = windowWith({ aa22: { name: 'Bat', stamp: goblin() } });
      const stamp = goblin();

      // Act.
      const outcome = saveBlueprint(hub, stamp, '  Goblin camp  ', drawsFor([ 'k3x9q2mf' ]));
      const saved = hub.document(BLUEPRINTS_DOCUMENT).valueAt([ 'data', 'blueprints', 'k3x9q2mf' ]);
      const kept = namesIn(hub);
      hub.undo(blueprintHistoryKey('k3x9q2mf'));

      // Assert.
      expect([
        outcome.ok && [ outcome.step?.label, outcome.step?.histories, outcome.blueprint?.id, outcome.blueprint?.name ],
        saved,
        kept,
        hub.document(BLUEPRINTS_DOCUMENT).toJson(),
      ])
        .toStrictEqual([
          [ 'Save blueprint "Goblin camp"', [ 'blueprint:k3x9q2mf' ], 'k3x9q2mf', 'Goblin camp' ],
          savedBlueprintOf('Goblin camp', stamp),
          [ [ 'aa22', 'Bat' ], [ 'k3x9q2mf', 'Goblin camp' ] ],
          storedBlueprints({ aa22: { name: 'Bat', stamp: goblin() } }),
        ]);
    });

    it('takes the links out of the stamp\'s events, keeping the rest of each note and the stamp it was handed', () =>
    {
      // Arrange: one event a copy of another blueprint, beside one that is no copy.
      const hub = windowWith();
      const stamp = stampOf({
        width: 2,
        events: [
          { ...createMapEvent(4, 0, 0), name: 'Goblin', note: 'Guard\n<blueprint:[aaaa, 1]>' },
          { ...createMapEvent(5, 1, 0), name: 'Lamp', note: 'kept as it is' },
        ],
      });

      // Act.
      saveBlueprint(hub, stamp, 'Camp', drawsFor([ 'k3x9q2mf' ]));

      // Assert.
      const [ camp ] = blueprintsOf(hub.document(BLUEPRINTS_DOCUMENT));
      expect([ camp.stamp.events.map(event => event.note), stamp.events[0].note ])
        .toStrictEqual([ [ 'Guard', 'kept as it is' ], 'Guard\n<blueprint:[aaaa, 1]>' ]);
    });

    it('keeps none of the placements of other blueprints the stamp\'s tiles were copied with, leaving the stamp handed over as it was', () =>
    {
      // Arrange: a stamp of tiles copied off a placement of the camp (aa22).
      const hub = windowWith();
      const values = [ 0, 0 ];
      const spots = [ { blueprintId: 'aa22', x: 0, y: 0, width: 2, height: 1 } ];
      const stamp = stampOf({ width: 2, tiles: { layers: [ 0 ], values, calledFor: [ -1, -1 ] }, events: [], spots });

      // Act.
      saveBlueprint(hub, stamp, 'Camp again', drawsFor([ 'k3x9q2mf' ]));

      // Assert.
      const [ camp ] = blueprintsOf(hub.document(BLUEPRINTS_DOCUMENT));
      expect([ Object.hasOwn(camp.stamp, 'spots'), camp.stamp.tiles, stamp.spots ])
        .toStrictEqual([ false, stamp.tiles, spots ]);
    });

    it('draws another id when the first drawn is taken', () =>
    {
      // Arrange.
      const hub = windowWith({ k3x9q2mf: { name: 'Bat', stamp: goblin() } });

      // Act.
      const outcome = saveBlueprint(hub, goblin(), 'Goblin', drawsFor([ 'k3x9q2mf', 'b7c8d9e0' ]));

      // Assert.
      expect([ outcome.ok && outcome.blueprint?.id, namesIn(hub) ])
        .toStrictEqual([ 'b7c8d9e0', [ [ 'k3x9q2mf', 'Bat' ], [ 'b7c8d9e0', 'Goblin' ] ] ]);
    });

    it('refuses a name of nothing but spaces, changing nothing', () =>
    {
      // Arrange.
      const hub = windowWith();

      // Act.
      const outcome = saveBlueprint(hub, goblin(), '   ', drawsFor([ 'k3x9q2mf' ]));

      // Assert.
      expect([ outcome, namesIn(hub), hub.isDirty(BLUEPRINTS_DOCUMENT) ])
        .toStrictEqual([ { ok: false, message: 'Give the blueprint a name.' }, [], false ]);
    });

    it('refuses a stamp whose event\'s note could not lose its link cleanly, changing nothing', () =>
    {
      // Arrange: a stray bracket that would open a tag of its own once the link beside it is gone.
      const hub = windowWith();

      // Act.
      const outcome = saveBlueprint(hub, goblin('z<<blueprint:[aaaa, 1]>w> <moveSpeed:6.0>'), 'Goblin', drawsFor([ 'k3x9q2mf' ]));

      // Assert.
      expect([ outcome, namesIn(hub) ])
        .toStrictEqual([
          {
            ok: false,
            message: 'This stamp can\'t be saved as a blueprint: in Goblin\'s note, the game would read the rest of this note '
              + 'differently; look for a stray < in it.',
          },
          [],
        ]);
    });
  });

  describe('renameBlueprint', () =>
  {
    it('renames a blueprint as one step in its own history, keeping its id and every other blueprint, and one undo takes it back', () =>
    {
      // Arrange.
      const hub = windowWith({ k3x9q2mf: { name: 'Goblin', stamp: goblin() }, aa22: { name: 'Bat', stamp: goblin() } });

      // Act.
      const outcome = renameBlueprint(hub, 'k3x9q2mf', ' Goblin chief ');
      const renamed = namesIn(hub);
      hub.undo(blueprintHistoryKey('k3x9q2mf'));

      // Assert.
      expect([ outcome.ok && [ outcome.step?.label, outcome.step?.histories, outcome.blueprint?.name ], renamed, namesIn(hub) ])
        .toStrictEqual([
          [ 'Rename "Goblin" to "Goblin chief"', [ 'blueprint:k3x9q2mf' ], 'Goblin chief' ],
          [ [ 'aa22', 'Bat' ], [ 'k3x9q2mf', 'Goblin chief' ] ],
          [ [ 'aa22', 'Bat' ], [ 'k3x9q2mf', 'Goblin' ] ],
        ]);
    });

    it('records nothing for the name it has already, spaces aside', () =>
    {
      // Arrange.
      const hub = windowWith({ k3x9q2mf: { name: 'Goblin', stamp: goblin() } });

      // Act.
      const outcome = renameBlueprint(hub, 'k3x9q2mf', 'Goblin ');

      // Assert.
      expect([ outcome.ok && [ outcome.step, outcome.blueprint?.name ], hub.history(blueprintHistoryKey('k3x9q2mf')).rows.length ])
        .toStrictEqual([ [ null, 'Goblin' ], 0 ]);
    });

    it('refuses a name of nothing but spaces, and a blueprint no longer there, changing nothing', () =>
    {
      // Arrange.
      const hub = windowWith({ k3x9q2mf: { name: 'Goblin', stamp: goblin() } });

      // Act.
      const outcomes = [ renameBlueprint(hub, 'k3x9q2mf', ' '), renameBlueprint(hub, 'zz99', 'Bat') ];

      // Assert.
      expect([ outcomes, namesIn(hub) ])
        .toStrictEqual([
          [ { ok: false, message: 'Give the blueprint a name.' }, { ok: false, message: 'That blueprint is no longer there.' } ],
          [ [ 'k3x9q2mf', 'Goblin' ] ],
        ]);
    });
  });

  describe('deleteBlueprint', () =>
  {
    it('deletes a blueprint nothing is a copy of as one step in its own history, keeping every other, and one undo brings it back', () =>
    {
      // Arrange.
      const hub = windowWith({ k3x9q2mf: { name: 'Goblin', stamp: goblin() }, aa22: { name: 'Bat', stamp: goblin() } });
      const before = hub.document(BLUEPRINTS_DOCUMENT).toJson();

      // Act.
      const outcome = deleteBlueprint(hub, 'k3x9q2mf', { total: 0, maps: [] }, mapName);
      const left = namesIn(hub);
      hub.undo(blueprintHistoryKey('k3x9q2mf'));

      // Assert.
      expect([ outcome.ok && [ outcome.step?.label, outcome.step?.histories, outcome.blueprint ], left, hub.document(BLUEPRINTS_DOCUMENT).toJson() ])
        .toStrictEqual([ [ 'Delete blueprint "Goblin"', [ 'blueprint:k3x9q2mf' ], null ], [ [ 'aa22', 'Bat' ] ], before ]);
    });

    it('refuses a blueprint with copies, saying how many and on which maps, changing nothing', () =>
    {
      // Arrange: one copy; five on two maps.
      const hub = windowWith({ k3x9q2mf: { name: 'Goblin', stamp: goblin() } });
      const counts = [
        { total: 1, maps: [ { mapId: 3, copies: 1 } ] },
        { total: 5, maps: [ { mapId: 3, copies: 3 }, { mapId: 40, copies: 2 } ] },
      ];

      // Act.
      const outcomes = counts.map(copies => deleteBlueprint(hub, 'k3x9q2mf', copies, mapName));

      // Assert.
      expect([ outcomes, namesIn(hub) ])
        .toStrictEqual([
          [
            { ok: false, message: '"Goblin" still has 1 copy, on Map 3 (1), so it can\'t be deleted.' },
            { ok: false, message: '"Goblin" still has 5 copies, on Map 3 (3) and Map 40 (2), so it can\'t be deleted.' },
          ],
          [ [ 'k3x9q2mf', 'Goblin' ] ],
        ]);
    });

    it('names four maps at most, summing up the rest', () =>
    {
      // Arrange: copies on five maps, then on six.
      const hub = windowWith({ k3x9q2mf: { name: 'Goblin', stamp: goblin() } });
      const five = [ 1, 2, 3, 4, 5 ].map(mapId => ({ mapId, copies: 1 }));
      const counts = [ { total: 5, maps: five }, { total: 6, maps: [ ...five, { mapId: 6, copies: 1 } ] } ];

      // Act.
      const outcomes = counts.map(copies => deleteBlueprint(hub, 'k3x9q2mf', copies, mapName));

      // Assert.
      expect(outcomes.map(outcome => outcome.ok === false && outcome.message))
        .toStrictEqual([
          '"Goblin" still has 5 copies, on Map 1 (1), Map 2 (1), Map 3 (1), Map 4 (1) and 1 other map, so it can\'t be deleted.',
          '"Goblin" still has 6 copies, on Map 1 (1), Map 2 (1), Map 3 (1), Map 4 (1) and 2 other maps, so it can\'t be deleted.',
        ]);
    });

    it('refuses a blueprint whose copies are not counted yet, and one no longer there, changing nothing', () =>
    {
      // Arrange.
      const hub = windowWith({ k3x9q2mf: { name: 'Goblin', stamp: goblin() } });

      // Act.
      const outcomes = [ deleteBlueprint(hub, 'k3x9q2mf', null, mapName), deleteBlueprint(hub, 'zz99', { total: 0, maps: [] }, mapName) ];

      // Assert.
      expect([ outcomes, namesIn(hub) ])
        .toStrictEqual([
          [
            { ok: false, message: '"Goblin" can\'t be deleted until its copies have been counted.' },
            { ok: false, message: 'That blueprint is no longer there.' },
          ],
          [ [ 'k3x9q2mf', 'Goblin' ] ],
        ]);
    });
  });

  describe('saveBlueprints', () =>
  {
    /**
     * Builds a window holding the blueprints document, writing down every file its saves write.
     * @param {BlueprintSeed} blueprints The blueprints, by id.
     * @param {() => Promise<void>} write What a save does once written down; by default, nothing more.
     * @returns {{ hub: DocumentHub, written: JsonValue[] }} The window, and the content of every file written.
     */
    const writingWindow = (blueprints: BlueprintSeed = {}, write: () => Promise<void> = async () => undefined) =>
    {
      const written: JsonValue[] = [];
      const hub = new DocumentHub({
        clientId: 'window-a',
        store: {
          load: async () => null,
          save: async (_key, content) =>
          {
            written.push(content);
            await write();
          },
        },
      });
      holdBlueprints(hub, blueprints);
      return { hub, written };
    };

    it('writes blueprints holding an edit their file lacks, leaving them saved', async () =>
    {
      // Arrange: a goblin saved as a blueprint, not yet written.
      const { hub, written } = writingWindow();
      saveBlueprint(hub, goblin(), 'Goblin', drawsFor([ 'k3x9q2mf' ]));

      // Act.
      const outcome = await saveBlueprints(hub);

      // Assert.
      expect([ outcome, written, hub.isDirty(BLUEPRINTS_DOCUMENT) ])
        .toStrictEqual([ { ok: true, saved: true }, [ hub.document(BLUEPRINTS_DOCUMENT).toJson() ], false ]);
    });

    it('leaves blueprints with nothing unsaved alone', async () =>
    {
      // Arrange: the blueprints exactly as their file holds them.
      const { hub, written } = writingWindow({ k3x9q2mf: { name: 'Goblin', stamp: goblin() } });

      // Act.
      const outcome = await saveBlueprints(hub);

      // Assert.
      expect([ outcome, written ])
        .toStrictEqual([ { ok: true, saved: false }, [] ]);
    });

    it('holds back blueprints waiting for a choice about their file changed on disk, writing nothing over it', async () =>
    {
      // Arrange: a goblin saved as a blueprint and not yet written when the file gains a bat from somewhere else.
      const { hub, written } = writingWindow();
      saveBlueprint(hub, goblin(), 'Goblin', drawsFor([ 'k3x9q2mf' ]));
      const conflict = hub.applyOutsideContent(BLUEPRINTS_DOCUMENT, storedBlueprints({ aa22: { name: 'Bat', stamp: goblin() } }) as JsonValue);

      // Act.
      const outcome = await saveBlueprints(hub);

      // Assert: the file keeps the bat until the author chooses, and the goblin stays unsaved.
      expect([ conflict, outcome, written, hub.isDirty(BLUEPRINTS_DOCUMENT) ])
        .toStrictEqual([
          'conflicted',
          { ok: false, message: 'The blueprints were not saved: they are waiting for a choice about changes made elsewhere.' },
          [],
          true,
        ]);
    });

    it('rejects when the write itself fails, leaving the blueprints unsaved', async () =>
    {
      // Arrange: a disk that refuses the write.
      const { hub } = writingWindow({}, () => Promise.reject(new Error('the disk is full')));
      saveBlueprint(hub, goblin(), 'Goblin', drawsFor([ 'k3x9q2mf' ]));

      // Act.
      const write = saveBlueprints(hub);

      // Assert.
      await expect(write)
        .rejects.toThrow('the disk is full');
      expect(hub.isDirty(BLUEPRINTS_DOCUMENT))
        .toBe(true);
    });
  });
});
