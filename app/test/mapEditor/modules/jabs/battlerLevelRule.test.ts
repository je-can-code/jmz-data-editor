import { describe, expect, it } from 'vitest';
import type { DocumentChange } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  battlersOn,
  levelWords,
  mapLevelOf,
  mostCommonLevel,
  newBattlerLevel,
  nextBattlerWords,
  touchesBattlerLevels,
  type MapBattler,
} from '../../../../src/mapEditor/modules/jabs/battlerLevelRule.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * The battler brush gives each battler it places the level its map calls for, trying in order: the level set for the map
 * in Map Properties, whatever the enemy; the level that enemy already carries on the map, the most common among its
 * battlers there; the map's level, the most common among all its battlers; and none at all, so the enemy's own level from
 * the database applies, as the brush always placed them before. A battler giving no level counts for nothing, so a map
 * learns its level from the first battler given one. A tie between levels goes to the higher, so the answer never hangs on
 * the order battlers happen to stand in the map's list.
 *
 * The map's battlers are counted as the server counts an enemy's battlers for the brush: each event once for every enemy
 * its pages name, read from the first of its pages naming that enemy. Every step is held against a near miss that would
 * pass if the step were skipped or read loosely.
 */
describe('battlerLevelRule', () =>
{
  /**
   * One comment line.
   * @param {string} text The line.
   * @param {number} code 108 for a comment's first line, 408 for a later one.
   * @returns {RmmzEventCommand} The command.
   */
  const line = (text: string, code = 108): RmmzEventCommand => command(code, [ text ]);

  /**
   * A battler page of an enemy, at a level or none.
   * @param {number} enemyId The enemy.
   * @param {number | null} level The level its page gives, or null for none.
   * @returns {RmmzEventPage} The page.
   */
  const battlerPage = (enemyId: number, level: number | null): RmmzEventPage =>
  {
    return page(level === null
      ? [ line(`<enemyId:${enemyId}>`) ]
      : [ line(`<enemyId:${enemyId}>`), line(`<level:${level}>`, 408) ]);
  };

  /**
   * A battler of an enemy, counted as the rule counts it.
   * @param {number} enemyId The enemy.
   * @param {number | null} level Its level, or null for none.
   * @returns {MapBattler} The battler.
   */
  const battler = (enemyId: number, level: number | null): MapBattler => ({ enemyId, level });

  describe('battlersOn', () =>
  {
    it('counts each event once for each enemy it names, from the first of its pages naming it, skipping empty slots', () =>
    {
      // Arrange: a battler at level 4; an empty slot; an event naming no enemy; a battler whose later page names the same
      // enemy at another level; one changing enemy on its second page; and one giving no level.
      const events: (RmmzMapEvent | null)[] = [
        null,
        event(1, [ battlerPage(5, 4) ]),
        null,
        event(3, [ page([ line('<sight:4>') ]) ]),
        event(4, [ battlerPage(5, 6), battlerPage(5, 9) ]),
        event(5, [ battlerPage(5, 2), page([]), battlerPage(7, 8) ]),
        event(6, [ battlerPage(7, null) ]),
      ];

      // Act.
      const battlers = battlersOn(events);

      // Assert: event 4's second page, naming the enemy its first already named, counts for nothing.
      expect(battlers)
        .toStrictEqual([ battler(5, 4), battler(5, 6), battler(5, 2), battler(7, 8), battler(7, null) ]);
    });
  });

  describe('mostCommonLevel', () =>
  {
    it('finds the most common level however the levels are ordered, and none among no levels', () =>
    {
      // Arrange: 3 twice beside 9 once, in two orders, the rarer first in one.
      const orders = [ [ 3, 9, 3 ], [ 9, 3, 3 ], [] ];

      // Act.
      const found = orders.map(mostCommonLevel);

      // Assert.
      expect(found)
        .toStrictEqual([ 3, 3, null ]);
    });

    it('gives a tie to the higher level, whichever came first', () =>
    {
      // Arrange: 4 and 12 once each, in both orders, and a three-way tie with a negative level among them.
      const ties = [ [ 4, 12 ], [ 12, 4 ], [ -1, 7, 5 ] ];

      // Act.
      const found = ties.map(mostCommonLevel);

      // Assert.
      expect(found)
        .toStrictEqual([ 12, 12, 7 ]);
    });
  });

  describe('mapLevelOf', () =>
  {
    it('reads the most common level among the battlers giving one, counting none for those giving none', () =>
    {
      // Arrange: three battlers at no level beside two at level 6 and one at level 2.
      const battlers = [ battler(5, null), battler(5, null), battler(7, null), battler(5, 6), battler(8, 6), battler(7, 2) ];

      // Act.
      const level = [ mapLevelOf(battlers), mapLevelOf([ battler(5, null) ]) ];

      // Assert.
      expect(level)
        .toStrictEqual([ 6, null ]);
    });
  });

  describe('newBattlerLevel', () =>
  {
    it('takes the level set for the map first, whatever the enemy and its battlers here', () =>
    {
      // Arrange: the enemy at level 4 here, the map at level 9, and a level of 20 set for the map.
      const battlers = [ battler(5, 4), battler(7, 9), battler(8, 9) ];

      // Act.
      const choice = newBattlerLevel(battlers, 5, 20);

      // Assert.
      expect(choice)
        .toStrictEqual({ level: 20, from: 'setting' });
    });

    it('takes the level the enemy already carries here, over a map level more common among the others', () =>
    {
      // Arrange: the enemy twice at level 4 and once at no level; three others at level 9.
      const battlers = [ battler(5, 4), battler(5, null), battler(7, 9), battler(8, 9), battler(5, 4), battler(9, 9) ];

      // Act.
      const choice = newBattlerLevel(battlers, 5, null);

      // Assert.
      expect(choice)
        .toStrictEqual({ level: 4, from: 'enemy' });
    });

    it('takes the map\'s level for an enemy whose battlers here give none of their own', () =>
    {
      // Arrange: the enemy here at no level; the others twice at 9 and once at 3.
      const battlers = [ battler(5, null), battler(7, 9), battler(7, 3), battler(8, 9) ];

      // Act.
      const choice = newBattlerLevel(battlers, 5, null);

      // Assert.
      expect(choice)
        .toStrictEqual({ level: 9, from: 'map' });
    });

    it('takes no level at all while no battler on the map gives one, so the enemy\'s own applies', () =>
    {
      // Arrange: battlers of the enemy and of another, none giving a level.
      const battlers = [ battler(5, null), battler(7, null) ];

      // Act.
      const choices = [ newBattlerLevel(battlers, 5, null), newBattlerLevel([], 5, null) ];

      // Assert.
      expect(choices)
        .toStrictEqual([ { level: null, from: 'none' }, { level: null, from: 'none' } ]);
    });

    it('gives a tie to the higher level, for the enemy\'s level and for the map\'s alike', () =>
    {
      // Arrange: the enemy once at 4 and once at 6; and a map whose others stand once at 3 and once at 8.
      const enemyTie = [ battler(5, 6), battler(5, 4) ];
      const mapTie = [ battler(7, 8), battler(8, 3) ];

      // Act.
      const choices = [ newBattlerLevel(enemyTie, 5, null), newBattlerLevel(mapTie, 5, null) ];

      // Assert.
      expect(choices)
        .toStrictEqual([ { level: 6, from: 'enemy' }, { level: 8, from: 'map' } ]);
    });
  });

  describe('levelWords', () =>
  {
    it('says which level the next battler starts at and why, in a few words', () =>
    {
      // Arrange: a level from each source, and none.
      const choices = [
        { level: 12, from: 'setting' as const },
        { level: 4, from: 'enemy' as const },
        { level: -2, from: 'map' as const },
        { level: null, from: 'none' as const },
      ];

      // Act.
      const words = choices.map(levelWords);

      // Assert.
      expect(words)
        .toStrictEqual([ 'Level 12 · this map\'s setting', 'Level 4 · this enemy\'s level here', 'Level -2 · this map\'s level', 'The enemy\'s own level' ]);
    });
  });

  describe('nextBattlerWords', () =>
  {
    it('says the level set, else the enemy\'s level here before the map\'s level, else the enemy\'s own', () =>
    {
      // Arrange: a level set over a map level, a map level alone, and neither.
      const cases: [ number | null, number | null ][] = [ [ 20, 9 ], [ null, 9 ], [ null, null ] ];

      // Act.
      const words = cases.map(([ setting, mapLevel ]) => nextBattlerWords(setting, mapLevel));

      // Assert.
      expect(words)
        .toStrictEqual([
          'Next battler: level 20, this map\'s setting.',
          'Next battler: its enemy\'s level here, else level 9, this map\'s level.',
          'Next battler: the enemy\'s own level.',
        ]);
    });
  });

  describe('touchesBattlerLevels', () =>
  {
    /**
     * A change patching a map at a path.
     * @param {(string | number)[]} path Where.
     * @returns {DocumentChange} The change.
     */
    const setAt = (path: (string | number)[]): DocumentChange => ({ kind: 'patched', key: 'map:1', revision: 2, patch: { kind: 'set', path, before: 1, after: 2 } });

    it('hears a page changed, an event placed or taken away, and the map replaced', () =>
    {
      // Arrange.
      const changes: DocumentChange[] = [
        setAt([ 'events', 3, 'pages', 0, 'list', 1, 'parameters', 0 ]),
        setAt([ 'events', 3 ]),
        { kind: 'patched', key: 'map:1', revision: 2, patch: { kind: 'splice', path: [ 'events' ], index: 4, removed: [], inserted: [ null ] } },
        { kind: 'replaced', key: 'map:1', revision: 2 },
      ];

      // Act.
      const heard = changes.map(touchesBattlerLevels);

      // Assert.
      expect(heard)
        .toStrictEqual([ true, true, true, true ]);
    });

    it('lets tiles, a resize, an event moved or renamed, and the map\'s own settings pass', () =>
    {
      // Arrange.
      const changes: DocumentChange[] = [
        { kind: 'patched', key: 'map:1', revision: 2, patch: { kind: 'tiles', indices: [ 4 ], before: [ 1 ], after: [ 2 ] } },
        { kind: 'patched', key: 'map:1', revision: 2, patch: { kind: 'resize', before: { width: 1, height: 1, data: [ 0 ] }, after: { width: 2, height: 1, data: [ 0, 0 ] } } },
        setAt([ 'events', 3, 'x' ]),
        setAt([ 'events', 3, 'name' ]),
        setAt([ 'note' ]),
      ];

      // Act.
      const heard = changes.map(touchesBattlerLevels);

      // Assert.
      expect(heard)
        .toStrictEqual([ false, false, false, false, false ]);
    });
  });
});
