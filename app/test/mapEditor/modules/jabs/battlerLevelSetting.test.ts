import { describe, expect, it } from 'vitest';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { cloneJson, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  levelSetFor,
  NEW_BATTLER_LEVELS_DOCUMENT,
  saveNewBattlerLevels,
  setNewBattlerLevel,
  typedLevel,
} from '../../../../src/mapEditor/modules/jabs/battlerLevelSetting.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The level a map's new battlers start at is the editor's own setting, set in Map Properties: kept per map in
 * jmz-editor/new-battler-levels.json, never in the map's file, which the game reads, and never read by the game. Setting
 * or clearing it is one step in the map's own history, so undo in the map or its properties takes it back like any other
 * property, and a clear takes the map's entry out rather than leaving an empty one. It is written at once, as the tile
 * marks are. The box in Map Properties takes nothing at all, to clear it, or a whole number as the battler panel's level
 * box takes one; an entry in the file that is not a whole number is refused loudly rather than read as some other level.
 */
describe('battlerLevelSetting', () =>
{
  /**
   * The levels a window holds when map 2 starts its new battlers at level 7.
   */
  const LEVELS: JsonValue = { schemaVersion: 1, data: { maps: { 2: 7 } } };

  /**
   * Builds a window holding map 1 and the levels, writing down every file its saves write.
   * @param {JsonValue} levels The levels, as their file holds them.
   * @returns {{ hub: DocumentHub, written: Map<DocumentKey, JsonValue> }} The window, and what each file it wrote holds.
   */
  const windowWith = (levels: JsonValue = LEVELS) =>
  {
    const written = new Map<DocumentKey, JsonValue>();
    const store: DocumentStore = {
      load: async () => null,
      save: async (key, content) =>
      {
        written.set(key, cloneJson(content));
      },
    };
    const hub = new DocumentHub({ clientId: 'window-a', store });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt(NEW_BATTLER_LEVELS_DOCUMENT, levels);
    return { hub, written };
  };

  describe('typedLevel', () =>
  {
    it('reads nothing typed as no level, and a whole number from -999,999 to 999,999 as that level', () =>
    {
      // Arrange.
      const typed = [ '', '   ', '12', ' -3 ', '+5', '999999', '-999999' ];

      // Act.
      const read = typed.map(typedLevel);

      // Assert.
      expect(read)
        .toStrictEqual([ { level: null }, { level: null }, { level: 12 }, { level: -3 }, { level: 5 }, { level: 999999 }, { level: -999999 } ]);
    });

    it('refuses a fraction, a word, and a number past either end', () =>
    {
      // Arrange.
      const typed = [ '1.5', 'ten', '12a', '1000000', '-1000000' ];

      // Act.
      const read = typed.map(typedLevel);

      // Assert.
      expect(read)
        .toStrictEqual([ null, null, null, null, null ]);
    });
  });

  describe('levelSetFor', () =>
  {
    it('reads the level set for a map, and none for a map without one or a window not holding the levels', () =>
    {
      // Arrange: map 2 at level 7, beside a window holding no levels at all.
      const { hub } = windowWith();
      const bare = new DocumentHub({ clientId: 'window-b' });

      // Act.
      const levels = [ levelSetFor(hub, 2), levelSetFor(hub, 1), levelSetFor(bare, 2) ];

      // Assert.
      expect(levels)
        .toStrictEqual([ 7, null, null ]);
    });

    it('refuses an entry that is not a whole number, which the editor never writes', () =>
    {
      // Arrange: a level written as text, and one with a fraction, by hand.
      const texts = windowWith({ schemaVersion: 1, data: { maps: { 1: '12' } } }).hub;
      const fractions = windowWith({ schemaVersion: 1, data: { maps: { 1: 2.5 } } }).hub;

      // Act.
      const reads = [ () => levelSetFor(texts, 1), () => levelSetFor(fractions, 1) ];

      // Assert.
      expect(reads[0])
        .toThrow('the saved new battler levels give map 1 "12", which is not a level');
      expect(reads[1])
        .toThrow('the saved new battler levels give map 1 2.5, which is not a level');
    });
  });

  describe('setNewBattlerLevel', () =>
  {
    it('sets the level as one step of the map\'s own history, which undo takes back and redo puts back', () =>
    {
      // Arrange.
      const { hub } = windowWith();
      const map = JSON.stringify(hub.map('map:1').toJson());

      // Act.
      const step = setNewBattlerLevel(hub, 1, 12);
      const set = levelSetFor(hub, 1);
      hub.undo(mapHistoryKey(1));
      const undone = levelSetFor(hub, 1);
      hub.redo(mapHistoryKey(1));

      // Assert: map 2's level never moves, and the map itself is untouched throughout.
      expect([ step?.label, step?.histories, set, undone, levelSetFor(hub, 1), levelSetFor(hub, 2), JSON.stringify(hub.map('map:1').toJson()) === map ])
        .toStrictEqual([ 'Change new battler level', [ mapHistoryKey(1) ], 12, null, 12, 7, true ]);
    });

    it('clears the level as one step, taking the map\'s entry out of the levels', () =>
    {
      // Arrange: map 1 at level 9, beside map 2 at 7.
      const { hub } = windowWith({ schemaVersion: 1, data: { maps: { 1: 9, 2: 7 } } });

      // Act.
      const step = setNewBattlerLevel(hub, 1, null);
      const maps = cloneJson(hub.document(NEW_BATTLER_LEVELS_DOCUMENT).valueAt([ 'data', 'maps' ]));
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, maps, levelSetFor(hub, 1) ])
        .toStrictEqual([ 'Clear new battler level', { 2: 7 }, 9 ]);
    });

    it('records nothing for the level a map already starts at, nor for clearing a level never set', () =>
    {
      // Arrange: map 1 at level 9 in one window, at none in another.
      const levelled = windowWith({ schemaVersion: 1, data: { maps: { 1: 9 } } }).hub;
      const unset = windowWith().hub;

      // Act.
      const steps = [ setNewBattlerLevel(levelled, 1, 9), setNewBattlerLevel(unset, 1, null) ];

      // Assert.
      expect([ steps, levelled.history(mapHistoryKey(1)).rows.length, unset.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ [ null, null ], 0, 0 ]);
    });

    it('refuses a level that is not a whole number, recording nothing', () =>
    {
      // Arrange.
      const { hub } = windowWith();

      // Act.
      const set = () => setNewBattlerLevel(hub, 1, 2.5);

      // Assert.
      expect(set)
        .toThrow('a level is a whole number, not 2.5');
      expect([ levelSetFor(hub, 1), hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ null, 0 ]);
    });

    it('never puts the level in the map\'s file, which a save writes as the map holds it, the level going to its own file', async () =>
    {
      // Arrange: the map changed by hand too, so a save writes its file as well.
      const { hub, written } = windowWith();
      const renamed = buildMapJson();
      (renamed.events[1] as RmmzMapEvent).name = 'Front door';
      hub.edit('Rename event', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'events', 1, 'name' ], 'Front door'));

      // Act.
      setNewBattlerLevel(hub, 1, 12);
      const unsaved = hub.dirtyKeys();
      for (const key of unsaved)
      {
        await hub.save(key);
      }

      // Assert: the map's file holds the map and nothing more; the level sits in the levels' file alone.
      expect([ unsaved, written.get('map:1'), written.get(NEW_BATTLER_LEVELS_DOCUMENT) ])
        .toStrictEqual([
          [ 'map:1', NEW_BATTLER_LEVELS_DOCUMENT ],
          renamed,
          { schemaVersion: 1, data: { maps: { 1: 12, 2: 7 } } },
        ]);
    });
  });

  describe('saveNewBattlerLevels', () =>
  {
    it('writes the levels once one is set, and nothing while nothing is unsaved', async () =>
    {
      // Arrange.
      const { hub, written } = windowWith();
      setNewBattlerLevel(hub, 1, 12);

      // Act.
      const first = await saveNewBattlerLevels(hub);
      const second = await saveNewBattlerLevels(hub);

      // Assert.
      expect([ first, second, [ ...written.keys() ], written.get(NEW_BATTLER_LEVELS_DOCUMENT), hub.isDirty(NEW_BATTLER_LEVELS_DOCUMENT) ])
        .toStrictEqual([
          { ok: true, saved: true },
          { ok: true, saved: false },
          [ NEW_BATTLER_LEVELS_DOCUMENT ],
          { schemaVersion: 1, data: { maps: { 1: 12, 2: 7 } } },
          false,
        ]);
    });
  });
});
