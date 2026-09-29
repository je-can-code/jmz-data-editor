import { describe, expect, it } from 'vitest';
import { ClassGrowthCloner } from '@services/classes/ClassGrowthCloner.ts';

/**
 * Cloning a class's growth is how an author builds a class from a base one and then only adjusts its
 * multipliers. The clone owes the Classes board three things: the class grows exactly like the source
 * afterwards, formulas and baked levels alike; everything else in the class's note survives untouched,
 * since a class's aptitudes and skills are not growth; and the two classes share nothing, so tuning the
 * clone can never quietly retune the base.
 */
describe('ClassGrowthCloner', () =>
{
  describe('clone', () =>
  {
    it('writes every growth formula the source carries onto the class', () =>
    {
      // Arrange- the class has its own attack and defense curves, which both have to give way.
      const target = {
        note: '<atkGrowthCurve:[(10+2*(a.level-1))*1]>\n<defGrowthCurve:[(9+2*(a.level-1))*1]>',
        params: [],
      };
      const source = {
        note: '<atkGrowthCurve:[(12+3*(a.level-1))*1.15]>\n<defGrowthCurve:[(10+3*(a.level-1))*1.05]>',
        params: [],
      };

      // Act
      const { note } = ClassGrowthCloner.clone(target, source);

      // Assert
      expect(note)
        .toContain('<atkGrowthCurve:[(12+3*(a.level-1))*1.15]>');
      expect(note)
        .toContain('<defGrowthCurve:[(10+3*(a.level-1))*1.05]>');
      expect(note)
        .not.toContain('(10+2*(a.level-1))*1');
    });

    it('removes a growth formula the source does not carry, so the class grows exactly like it', () =>
    {
      // Arrange- only the class has a luck curve.
      const target = {
        note: '<atkGrowthCurve:[(10+2*(a.level-1))*1]>\n<lukGrowthCurve:[(5+1*(a.level-1))*1]>',
        params: [],
      };
      const source = {
        note: '<atkGrowthCurve:[(12+3*(a.level-1))*1.15]>',
        params: [],
      };

      // Act
      const { note } = ClassGrowthCloner.clone(target, source);

      // Assert
      expect(note)
        .not.toContain('lukGrowthCurve');
      expect(note)
        .toContain('<atkGrowthCurve:[(12+3*(a.level-1))*1.15]>');
    });

    it('leaves everything in the class\'s note that is not growth alone', () =>
    {
      // Arrange- a class's own skills and natural growth, which a growth clone has no business with.
      const target = {
        note: '<unslottedSkills:[911,920]>\n<atkGrowthCurve:[(10+2*(a.level-1))*1]>\n<mtpBuffPlus:[(180+30*(a.level-1))*1]>',
        params: [],
      };
      const source = {
        note: '<atkGrowthCurve:[(12+3*(a.level-1))*1.15]>\n<unslottedSkills:[905]>',
        params: [],
      };

      // Act
      const { note } = ClassGrowthCloner.clone(target, source);

      // Assert- the class keeps its own lines, and takes none of the source's that are not growth.
      expect(note)
        .toContain('<unslottedSkills:[911,920]>');
      expect(note)
        .toContain('<mtpBuffPlus:[(180+30*(a.level-1))*1]>');
      expect(note)
        .not.toContain('<unslottedSkills:[905]>');
    });

    it('copies the source\'s baked levels without sharing them', () =>
    {
      // Arrange
      const target = { note: '', params: [ [ 0, 1, 2 ] ] };
      const source = { note: '', params: [ [ 0, 12, 15 ], [ 0, 8, 10 ] ] };

      // Act
      const { params } = ClassGrowthCloner.clone(target, source);
      params[ 0 ][ 1 ] = 99;

      // Assert- the clone held the source's levels, and changing them afterwards left the source alone.
      expect(params)
        .toEqual([ [ 0, 99, 15 ], [ 0, 8, 10 ] ]);
      expect(source.params[ 0 ][ 1 ])
        .toBe(12);
    });
  });
});
