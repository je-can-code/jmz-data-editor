import { describe, expect, it } from 'vitest';
import { ClassGrowthApplier } from '@services/classes/ClassGrowthApplier.ts';
import { knownGrowthCurveParams } from '../../../src/mappers/ParameterIdMapper.ts';

/**
 * Applying growth formulas is what the Classes board's Parameter Growth rows do, one row or every edited row
 * at once. The applier owes the board three things: every formula lands, both as its tag and as the levels
 * the game reads, however many are applied together; Max Tech, which has no levels, only ever gets its tag;
 * and nothing it was not asked to change moves, since a sweep across edited rows must leave the rest alone.
 */
describe('ClassGrowthApplier', () =>
{
  /**
   * Finds a growth-curve stat by its key.
   * @param {string} key The stat's key, such as `atk`.
   * @returns The stat.
   */
  const stat = (key: string) => knownGrowthCurveParams()
    .find((param) => param.key === key)!;

  describe('hasBakedLevels', () =>
  {
    it('bakes a base parameter into levels, and never Max Tech, which lives only in its tag', () =>
    {
      // Arrange
      // Act
      const attack = ClassGrowthApplier.hasBakedLevels(stat('atk'));
      const maxTech = ClassGrowthApplier.hasBakedLevels(stat('mtp'));

      // Assert
      expect(attack)
        .toBe(true);
      expect(maxTech)
        .toBe(false);
    });
  });

  describe('bake', () =>
  {
    it('evaluates the formula at levels 1 to 99, leaving level 0 empty', () =>
    {
      // Arrange- Some Guy's attack.
      const formula = '(12+3*(a.level-1))*1';

      // Act
      const values = ClassGrowthApplier.bake(formula);

      // Assert
      expect(values[ 1 ])
        .toBe(12);
      expect(values[ 99 ])
        .toBe(306);
      expect(values.length)
        .toBe(100);
      expect(0 in values)
        .toBe(false);
    });
  });

  describe('apply', () =>
  {
    it('writes every formula applied together as its tag, none undoing another', () =>
    {
      // Arrange
      const growth = { note: '<unslottedSkills:[911]>', params: [] };

      // Act
      const { note } = ClassGrowthApplier.apply(growth, [
        { param: stat('atk'), formula: '(12+3*(a.level-1))*1.15' },
        { param: stat('def'), formula: '(10+3*(a.level-1))*1.05' },
      ]);

      // Assert- both tags, and the line that was already there.
      expect(note)
        .toContain('<atkGrowthCurve:[(12+3*(a.level-1))*1.15]>');
      expect(note)
        .toContain('<defGrowthCurve:[(10+3*(a.level-1))*1.05]>');
      expect(note)
        .toContain('<unslottedSkills:[911]>');
    });

    it('bakes a base parameter\'s formula into its levels, and leaves every other stat\'s levels as they were', () =>
    {
      // Arrange- Max Life and Max Magi already baked; only attack is applied.
      const growth = { note: '', params: [ [ 0, 220 ], [ 0, 140 ], [ 0, 10 ] ] };

      // Act
      const { params } = ClassGrowthApplier.apply(growth, [
        { param: stat('atk'), formula: '(12+3*(a.level-1))*1' },
      ]);

      // Assert
      expect(params[ 2 ][ 1 ])
        .toBe(12);
      expect(params[ 2 ][ 99 ])
        .toBe(306);
      expect(params[ 0 ])
        .toEqual([ 0, 220 ]);
      expect(params[ 1 ])
        .toEqual([ 0, 140 ]);
    });

    it('gives Max Tech only its tag, since it has no levels to bake', () =>
    {
      // Arrange
      const growth = { note: '', params: [ [ 0, 220 ] ] };

      // Act
      const { note, params } = ClassGrowthApplier.apply(growth, [
        { param: stat('mtp'), formula: '(180+30*(a.level-1))*1' },
      ]);

      // Assert
      expect(note)
        .toContain('<mtpGrowthCurve:[(180+30*(a.level-1))*1]>');
      expect(params)
        .toEqual([ [ 0, 220 ] ]);
    });

    it('copies the params rather than changing the ones it was given', () =>
    {
      // Arrange
      const growth = { note: '', params: [ [ 0, 220 ] ] };

      // Act
      const { params } = ClassGrowthApplier.apply(growth, [
        { param: stat('atk'), formula: '(12+3*(a.level-1))*1' },
      ]);
      params[ 0 ][ 1 ] = 999;

      // Assert
      expect(growth.params)
        .toEqual([ [ 0, 220 ] ]);
    });
  });
});
