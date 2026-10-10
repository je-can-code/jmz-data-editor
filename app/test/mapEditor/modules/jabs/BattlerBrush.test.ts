import { describe, expect, it } from 'vitest';
import { lookWords } from '../../../../src/mapEditor/modules/jabs/BattlerBrush.tsx';
import { commonPage, type BattlerLook } from '../../../../src/mapEditor/modules/jabs/battlerLooks.ts';

/*
 * The battler brush says what each click places before the author places it: a battler like the enemy's own, and how
 * many of them it is like, or, for an enemy standing nowhere yet, the game's most common battler. It never speaks of a
 * level there, since each map gives the battler its own, which the pointer says over that map.
 */
describe('BattlerBrush', () =>
{
  /**
   * What the brush places, like some of the enemy's battlers.
   * @param {number} copies How many it is like.
   * @param {number} of How many the enemy has.
   * @returns {BattlerLook} The look.
   */
  const look = (copies: number, of: number): BattlerLook => ({ name: 'bat', page: commonPage(5), copies, of });

  describe('lookWords', () =>
  {
    it('says how many of the enemy\'s battlers it is like, or that it is like the enemy\'s only one', () =>
    {
      // Arrange: a look like several of the enemy's battlers, and a look like its only one.
      const looks = [ look(41, 49), look(1, 1) ];

      // Act.
      const words = looks.map(lookWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          'Each click places a battler like 41 of the 49 this enemy already has.',
          'Each click places a battler like the one this enemy already has.',
        ]);
    });

    it('says an enemy standing nowhere yet gets the game\'s most common battler', () =>
    {
      // Arrange: an enemy with no battler placed.
      const nowhere = look(0, 0);

      // Act.
      const words = lookWords(nowhere);

      // Assert.
      expect(words)
        .toBe('No battler of this enemy stands on any saved map yet, so each click places the game\'s most common battler, with no picture.');
    });
  });
});
