import { describe, expect, it } from 'vitest';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { placeStamp } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { changeBattlers } from '../../../../src/mapEditor/modules/jabs/battlerChanges.ts';
import { planBattlerChange, type BattlerContext } from '../../../../src/mapEditor/modules/jabs/battlerEdits.ts';
import { battlerLevelFit, stampAtLevel } from '../../../../src/mapEditor/modules/jabs/battlerLevelFit.ts';
import { NEW_BATTLER_LEVELS_DOCUMENT, setNewBattlerLevel } from '../../../../src/mapEditor/modules/jabs/battlerLevelSetting.ts';
import { battlerStamp, commonPage } from '../../../../src/mapEditor/modules/jabs/battlerLooks.ts';
import { pageLevelOf, type JabsDefaults } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import { motionDefaultsFrom } from '../../../../src/mapEditor/modules/jabs/motionTags.ts';
import { applyEdits, command, event, hubWith, page } from '../../support/eventKindFixtures.ts';

/*
 * The battler brush places each battler at the level the map it lands on calls for, worked out at the moment of the click
 * from the level set for that map in Map Properties and from the map's own battlers as they stand (see newBattlerLevel):
 * so a level given a battler in the battler panel teaches the map at once, and undoing it un-teaches it, nothing being
 * kept anywhere but the battlers themselves. The level is written into the battler's page exactly as the panel's level row
 * writes one, so a brushed battler reads line for line like one given that level by hand; a battler at no level goes
 * down as the brush holds it, at its enemy's own. The words beside the pointer say which level and why.
 *
 * The preview asks on every move of the pointer, so what a map comes to is kept until the map or the levels change, and
 * the stamp at each level is made once, keeping the ghost's picture from one tile to the next.
 */
describe('battlerLevelFit', () =>
{
  /**
   * The enemies and defaults the battler panel reads a change against: enemy 5 a slime, enemy 7 a bat.
   */
  const CONTEXT: BattlerContext = {
    enemyOf: enemyId => (enemyId === 5 || enemyId === 7 ? { id: enemyId, name: enemyId === 5 ? 'Slime' : 'Bat', note: '' } : null),
    defaults: { sight: 4, pursuit: 6, alertedSightBoost: 2, alertedPursuitBoost: 4, alertDuration: 300, canIdle: true, showHpBar: true, showName: true, inanimate: false } satisfies JabsDefaults,
    motionDefaults: motionDefaultsFrom(null),
  };

  /**
   * One comment line.
   * @param {string} text The line.
   * @param {number} code 108 for a comment's first line, 408 for a later one.
   * @returns {RmmzEventCommand} The command.
   */
  const line = (text: string, code = 108): RmmzEventCommand => command(code, [ text ]);

  /**
   * A battler of an enemy standing on the map, at a level or none.
   * @param {number} id The event's id.
   * @param {number} enemyId The enemy.
   * @param {number | null} level The level its page gives, or null for none.
   * @returns {RmmzMapEvent} The battler.
   */
  const standing = (id: number, enemyId: number, level: number | null): RmmzMapEvent =>
  {
    const lines = level === null
      ? [ line(`<enemyId:${enemyId}>`) ]
      : [ line(`<enemyId:${enemyId}>`), line(`<level:${level}>`, 408) ];
    return event(id, [ page(lines) ]);
  };

  /**
   * Builds a window holding map 1 with the battlers given, and the levels set for each map.
   * @param {RmmzMapEvent[]} battlers The map's battlers.
   * @param {Record<number, number>} levels The level set for each map, by map id.
   * @returns {DocumentHub} The window's documents.
   */
  const windowWith = (battlers: RmmzMapEvent[], levels: Record<number, number> = {}): DocumentHub =>
  {
    const { hub } = hubWith(battlers);
    hub.adopt(NEW_BATTLER_LEVELS_DOCUMENT, { schemaVersion: 1, data: { maps: levels } } as unknown as JsonValue);
    return hub;
  };

  /**
   * What the brush holds for the slime: the game's most common battler, at no level.
   * @returns {Stamp} The stamp.
   */
  const slimeStamp = (): Stamp => battlerStamp('window-a:1', { name: 'slime', page: commonPage(5), copies: 0, of: 0 });

  /**
   * Reads the level a fitted stamp's one battler gives, as J-LevelMaster reads it.
   * @param {Stamp} stamp The stamp.
   * @returns {number | null} The level, or null for none.
   */
  const levelOf = (stamp: Stamp): number | null => pageLevelOf(stamp.events[0].pages[0]);

  describe('stampAtLevel', () =>
  {
    it('gives each battler page the level as the panel writes one, leaving every other page and the rest of the stamp', () =>
    {
      // Arrange: a slime whose second page names no enemy, a light alone.
      const held = slimeStamp();
      const lamp: RmmzEventPage = page([ line('<light:[2]>') ]);
      const stamp: Stamp = { ...held, events: [ { ...held.events[0], pages: [ commonPage(5), lamp ] } ] };

      // Act.
      const levelled = stampAtLevel(stamp, 12);

      // Assert: the level ends the enemy's comment, and the stamp handed in is as it was.
      expect([
        levelled.events[0].pages[0].list.map(each => each.parameters[0]),
        levelled.events[0].pages[1],
        { ...levelled, events: [] },
        stamp.events[0].pages[0].list.length,
      ])
        .toStrictEqual([
          [ '<motion:[float]>', '<enemyId:5>', '<moveSpeed:4.1>', '<level:12>', undefined ],
          lamp,
          { ...stamp, events: [] },
          4,
        ]);
    });
  });

  describe('battlerLevelFit', () =>
  {
    it('places each battler at the level set for its map, over the level the enemy carries there, and says so', () =>
    {
      // Arrange: the slime at level 4 on map 1, which starts new battlers at 20.
      const hub = windowWith([ standing(1, 5, 4) ], { 1: 20 });

      // Act.
      const fitted = battlerLevelFit(hub, slimeStamp(), 5)(hub.map('map:1'));

      // Assert.
      expect([ levelOf(fitted.stamp), fitted.words ])
        .toStrictEqual([ 20, 'Level 20 · this map\'s setting' ]);
    });

    it('places each battler at its enemy\'s level on the map with none set, else the map\'s, else at its enemy\'s own', () =>
    {
      // Arrange: a map with the slime at 4 beside two bats at 9; one with the bats alone; one with a slime at no level.
      const held = slimeStamp();
      const maps = [ [ standing(1, 5, 4), standing(2, 7, 9), standing(3, 7, 9) ], [ standing(1, 7, 9) ], [ standing(1, 5, null) ] ];

      // Act.
      const fitted = maps.map(battlers =>
      {
        const hub = windowWith(battlers);
        return battlerLevelFit(hub, held, 5)(hub.map('map:1'));
      });

      // Assert: a battler at no level goes down as the brush holds it.
      expect([ ...fitted.map(each => [ levelOf(each.stamp), each.words ]), fitted[2].stamp === held ])
        .toStrictEqual([
          [ 4, 'Level 4 · this enemy\'s level here' ],
          [ 9, 'Level 9 · this map\'s level' ],
          [ null, 'The enemy\'s own level' ],
          true,
        ]);
    });

    it('reads the level set for the map the battler lands on, and no other map\'s', () =>
    {
      // Arrange: map 2 starts new battlers at 30; map 1, where the slime stands at 4, sets none.
      const hub = windowWith([ standing(1, 5, 4) ], { 2: 30 });

      // Act.
      const fitted = battlerLevelFit(hub, slimeStamp(), 5)(hub.map('map:1'));

      // Assert.
      expect(levelOf(fitted.stamp))
        .toBe(4);
    });

    it('learns a level the battler panel gives a battler on the map, and forgets it when that is undone', () =>
    {
      // Arrange: the first slime on the map, at its enemy's own level.
      const hub = windowWith([ standing(1, 5, null) ]);
      const fit = battlerLevelFit(hub, slimeStamp(), 5);
      const first = fit(hub.map('map:1'));

      // Act: the panel gives it level 15, which is then undone.
      changeBattlers(hub, 1, () => 0, [ 1 ], { row: 'level', value: 15 }, CONTEXT);
      const taught = fit(hub.map('map:1'));
      hub.undo(mapHistoryKey(1));
      const untaught = fit(hub.map('map:1'));

      // Assert.
      expect([ levelOf(first.stamp), levelOf(taught.stamp), taught.words, levelOf(untaught.stamp), untaught.words ])
        .toStrictEqual([ null, 15, 'Level 15 · this enemy\'s level here', null, 'The enemy\'s own level' ]);
    });

    it('follows the level set for the map in Map Properties, and its undo', () =>
    {
      // Arrange: the slime at 4 on map 1.
      const hub = windowWith([ standing(1, 5, 4) ]);
      const fit = battlerLevelFit(hub, slimeStamp(), 5);
      fit(hub.map('map:1'));

      // Act.
      setNewBattlerLevel(hub, 1, 20);
      const set = fit(hub.map('map:1'));
      hub.undo(mapHistoryKey(1));
      const undone = fit(hub.map('map:1'));

      // Assert.
      expect([ levelOf(set.stamp), levelOf(undone.stamp), undone.words ])
        .toStrictEqual([ 20, 4, 'Level 4 · this enemy\'s level here' ]);
    });

    it('keeps what it worked out while nothing changes, and the stamp at each level the same through any change', () =>
    {
      // Arrange: the slime at 4 on map 1.
      const hub = windowWith([ standing(1, 5, 4) ]);
      const fit = battlerLevelFit(hub, slimeStamp(), 5);

      // Act: asked twice, then again once the slime is renamed, which changes no level.
      const first = fit(hub.map('map:1'));
      const again = fit(hub.map('map:1'));
      hub.edit('Rename event', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'events', 1, 'name' ], 'Big slime'));
      const renamed = fit(hub.map('map:1'));

      // Assert: worked out afresh after the rename, to the very stamp it made before.
      expect([ again === first, renamed === first, renamed.stamp === first.stamp, levelOf(renamed.stamp) ])
        .toStrictEqual([ true, false, true, 4 ]);
    });

    it('places a battler that reads line for line as one placed at no level and given that level in the panel', () =>
    {
      // Arrange: the slime at 4 on map 1; one battler placed by the brush at no level, the other at the map's.
      const hub = windowWith([ standing(1, 5, 4) ]);
      const held = slimeStamp();
      const placedAt = (stamp: Stamp, x: number): RmmzMapEvent =>
      {
        const outcome = placeStamp(hub, 1, stamp, { at: { x, y: 0 }, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null }, 'Stamp');
        return hub.map('map:1').event(outcome.ok ? outcome.eventIds[0] : 0) as RmmzMapEvent;
      };
      const plain = placedAt(held, 0);

      // Act.
      const brushed = placedAt(battlerLevelFit(hub, held, 5)(hub.map('map:1')).stamp, 2);
      const byPanel = applyEdits(plain, planBattlerChange(plain.pages[0], 0, { row: 'level', value: 4 }, CONTEXT));

      // Assert.
      expect([ brushed.pages, pageLevelOf(brushed.pages[0]) ])
        .toStrictEqual([ byPanel.pages, 4 ]);
    });
  });
});
