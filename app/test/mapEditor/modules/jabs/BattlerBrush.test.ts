import { describe, expect, it } from 'vitest';
import { lookWords } from '../../../../src/mapEditor/modules/jabs/BattlerBrush.tsx';
import { commonPage, type BattlerLook } from '../../../../src/mapEditor/modules/jabs/battlerLooks.ts';

/*
 * The battler brush says what each click places before the author places it: a battler like the enemy's own, how many of
 * them it is like, and, where those give a level of their own, that the one placed fights at its enemy's level instead,
 * since a level left out of a copy is a battler stronger or weaker than its neighbours; or, for an enemy standing nowhere
 * yet, the game's most common battler.
 */
describe('BattlerBrush', () =>
{
  /**
   * What the brush places, like some of the enemy's battlers.
   * @param {number} copies How many it is like.
   * @param {number} of How many the enemy has.
   * @param {boolean} levelLeft Whether those it is like give a level of their own.
   * @returns {BattlerLook} The look.
   */
  const look = (copies: number, of: number, levelLeft: boolean): BattlerLook => ({ name: 'bat', page: commonPage(5), copies, of, levelLeft });

  describe('lookWords', () =>
  {
    it('says how many of the enemy\'s battlers it is like, and that it fights at the enemy\'s level when theirs is left out', () =>
    {
      // Arrange: a look like several, with and without levels left out, and a look like the enemy's only battler.
      const looks = [ look(41, 49, true), look(41, 49, false), look(1, 1, true), look(1, 1, false) ];

      // Act.
      const words = looks.map(lookWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          'Each click places a battler like 41 of the 49 this enemy already has, but at the enemy\'s own level.',
          'Each click places a battler like 41 of the 49 this enemy already has.',
          'Each click places a battler like the one this enemy already has, but at the enemy\'s own level.',
          'Each click places a battler like the one this enemy already has.',
        ]);
    });

    it('says an enemy standing nowhere yet gets the game\'s most common battler', () =>
    {
      // Arrange: an enemy with no battler placed.
      const nowhere = look(0, 0, false);

      // Act.
      const words = lookWords(nowhere);

      // Assert.
      expect(words)
        .toBe('No battler of this enemy stands on any saved map yet, so each click places the game\'s most common battler, with no picture.');
    });
  });
});
