import { describe, expect, it } from 'vitest';
import type { EnemyBattlerPage } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { battlerLookOf, battlerName, battlerStamp, commonPage, withoutLevel } from '../../../../src/mapEditor/modules/jabs/battlerLooks.ts';
import { command, page } from '../../support/eventKindFixtures.ts';

/*
 * The battler brush places, with each click, a battler shaped like most of the picked enemy's battlers already placed:
 * the whole of the most common page among them, its picture, settings and comments alike, but for its level, which is
 * where a battler stands in the game and so is left to the enemy until the author gives one; named as most of them are
 * named. An enemy placed nowhere yet gets the game's most common battler, named for the enemy as most battlers are, with
 * no picture, since only the enemy's own battlers could say what it looks like. Each placement is a stamp of one event on
 * one tile, so it goes down on any map and any tileset.
 */
describe('battlerLooks', () =>
{
  /**
   * One battler of enemy 5, standing on a map.
   * @param {string} eventName The event's name.
   * @param {RmmzEventPage} shown The first of its pages naming the enemy.
   * @returns {EnemyBattlerPage} The battler.
   */
  const placed = (eventName: string, shown: RmmzEventPage): EnemyBattlerPage => ({ mapId: 3, eventId: 1, eventName, page: shown });

  /**
   * A bat's page: floating, at a level, its picture the bat's.
   * @param {number} level The level its page gives.
   * @param {string} characterName Its picture.
   * @returns {RmmzEventPage} The page.
   */
  const bat = (level: number, characterName = 'm_bats'): RmmzEventPage => page(
    [ command(108, [ '<motion:[float]>' ]), command(108, [ '<enemyId:5>' ]), command(408, [ `<level:${level}>` ]), command(408, [ '<moveSpeed:4.1>' ]) ],
    { image: { tileId: 0, characterName, direction: 2, pattern: 1, characterIndex: 1 }, priorityType: 1 },
  );

  describe('withoutLevel', () =>
  {
    it('takes every level line out, in any spelling, a comment\'s first line handing its place to the next', () =>
    {
      // Arrange: a level heading its comment, and another carried on one.
      const levelled = page([ command(108, [ '<enemyId:5>' ]), command(108, [ '<lv:3>' ]), command(408, [ '<sight:4>' ]), command(408, [ '<level:9>' ]) ]);

      // Act.
      const list = withoutLevel(levelled).list.map(each => [ each.code, each.parameters[0] ]);

      // Assert.
      expect(list)
        .toStrictEqual([ [ 108, '<enemyId:5>' ], [ 108, '<sight:4>' ], [ 0, undefined ] ]);
    });
  });

  describe('battlerLookOf', () =>
  {
    it('copies the most common of the enemy\'s battlers, level aside, named as most of them are', () =>
    {
      // Arrange: three bats at three levels and one with another picture; most are named "bat".
      const battlers = [ placed('bat', bat(10)), placed('cave bat', bat(12, 'm_bats_red')), placed('bat', bat(11)), placed('bat', bat(14)) ];

      // Act.
      const look = battlerLookOf(5, 'Cave Bat', battlers);

      // Assert: the three bats differing only in level are one look, and say their levels were left out.
      expect([ look.name, look.copies, look.of, look.page.image.characterName, look.page.list.map(each => each.parameters[0]), look.levelLeft ])
        .toStrictEqual([ 'bat', 3, 4, 'm_bats', [ '<motion:[float]>', '<enemyId:5>', '<moveSpeed:4.1>', undefined ], true ]);
    });

    it('says a level was left out only when the battlers it copies give one, not when others do', () =>
    {
      // Arrange: two plain bats giving no level, the look; beside them one red bat giving a level of its own.
      const plain = page([ command(108, [ '<enemyId:5>' ]), command(408, [ '<moveSpeed:4.1>' ]) ]);
      const battlers = [ placed('bat', plain), placed('bat', plain), placed('red bat', bat(9, 'm_bats_red')) ];

      // Act.
      const look = battlerLookOf(5, 'Cave Bat', battlers);

      // Assert.
      expect([ look.copies, look.of, look.page.list.map(each => each.parameters[0]), look.levelLeft ])
        .toStrictEqual([ 2, 3, [ '<enemyId:5>', '<moveSpeed:4.1>', undefined ], false ]);
    });

    it('takes the first seen of looks placed as often as each other', () =>
    {
      // Arrange: one red bat, then one plain.
      const battlers = [ placed('red', bat(1, 'm_bats_red')), placed('plain', bat(1)) ];

      // Act.
      const look = battlerLookOf(5, 'Cave Bat', battlers);

      // Assert.
      expect([ look.name, look.page.image.characterName, look.copies ])
        .toStrictEqual([ 'red', 'm_bats_red', 1 ]);
    });

    it('gives an enemy placed nowhere the game\'s most common battler, named for the enemy', () =>
    {
      // Arrange: nothing placed.

      // Act.
      const look = battlerLookOf(7, '*Cave Bat', []);

      // Assert.
      expect([ look.name, look.copies, look.of, look.page, look.levelLeft ])
        .toStrictEqual([ 'cave bat', 0, 0, commonPage(7), false ]);
    });
  });

  describe('commonPage', () =>
  {
    it('is drawn with characters, started by the action button, fixed, walking, floating at 4.1 and pictureless', () =>
    {
      // Arrange: nothing beyond the enemy.

      // Act.
      const shown = commonPage(12);

      // Assert.
      expect([
        shown.priorityType, shown.trigger, shown.moveType, shown.moveSpeed, shown.moveFrequency, shown.walkAnime, shown.stepAnime,
        shown.directionFix, shown.through, shown.image, shown.list.map(each => [ each.code, each.parameters[0] ]),
      ])
        .toStrictEqual([
          1, 0, 0, 3, 3, true, false, false, false, { tileId: 0, characterName: '', direction: 2, pattern: 1, characterIndex: 0 },
          [ [ 108, '<motion:[float]>' ], [ 108, '<enemyId:12>' ], [ 408, '<moveSpeed:4.1>' ], [ 0, undefined ] ],
        ]);
    });
  });

  describe('battlerName', () =>
  {
    it('lowers the enemy\'s name and drops the marks sorting it, and names a nameless enemy "battler"', () =>
    {
      // Arrange.
      const names = [ '*Grass', '@Durable Post', 'Cave Bat', ' ', '' ];

      // Act.
      const named = names.map(battlerName);

      // Assert.
      expect(named)
        .toStrictEqual([ 'grass', 'durable post', 'cave bat', 'battler', 'battler' ]);
    });
  });

  describe('battlerStamp', () =>
  {
    it('stamps one event on one tile, with no tiles, so it goes down on any map', () =>
    {
      // Arrange.
      const look = battlerLookOf(7, 'Slime', []);

      // Act.
      const stamp = battlerStamp('window-a:3', look);

      // Assert.
      expect(stamp)
        .toStrictEqual({
          id: 'window-a:3',
          mapId: 0,
          tilesetId: 0,
          origin: { x: 0, y: 0 },
          width: 1,
          height: 1,
          tiles: null,
          events: [ { id: 1, name: 'slime', note: '', pages: [ commonPage(7) ], x: 0, y: 0 } ],
        });
    });
  });
});
