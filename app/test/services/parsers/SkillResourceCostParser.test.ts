import {
  describe,
  expect,
  it
} from 'vitest';
import { SkillResourceCostParser } from '../../../src/services/parsers/SkillResourceCostParser.ts';
import { NoteNormalizer } from '../../../src/services/utils/NoteNormalizer.ts';

/**
 * Applies resource-cost writers in the same order as {@link RPG_SkillDomainModel.syncNote}.
 */
const syncResourceCostTags = (
  note: string,
  hpCostFlat: number,
  hpCostPercent: number,
  hpCostFormula: string,
  hpCostCanKill: boolean,
  mpCostTagFlat: number,
  mpCostTagPercent: number,
  mpCostTagFormula: string,
  tpCostTagFlat: number,
  tpCostTagPercent: number,
  tpCostTagFormula: string
): string =>
{
  let n = note;

  n = SkillResourceCostParser.writeHpCostFlat(n, hpCostFlat);
  n = SkillResourceCostParser.writeHpCostPercent(n, hpCostPercent);
  n = SkillResourceCostParser.writeHpCostFormula(n, hpCostFormula);
  n = SkillResourceCostParser.writeHpCostCanKill(n, hpCostCanKill);

  n = SkillResourceCostParser.writeMpCostTagFlat(n, mpCostTagFlat);
  n = SkillResourceCostParser.writeMpCostTagPercent(n, mpCostTagPercent);
  n = SkillResourceCostParser.writeMpCostTagFormula(n, mpCostTagFormula);

  n = SkillResourceCostParser.writeTpCostTagFlat(n, tpCostTagFlat);
  n = SkillResourceCostParser.writeTpCostTagPercent(n, tpCostTagPercent);
  n = SkillResourceCostParser.writeTpCostTagFormula(n, tpCostTagFormula);

  return NoteNormalizer.normalize(n);
};

describe('SkillResourceCostParser granular reads', () =>
{
  it('readHpCostFlat pairs with writeHpCostFlat', () =>
  {
    const note = SkillResourceCostParser.writeHpCostFlat('', 11);
    expect(SkillResourceCostParser.readHpCostFlat(note)).toBe(11);
    expect(SkillResourceCostParser.readHpCostFlat('')).toBe(0);
  });

  it('readHpCostFormula pairs with writeHpCostFormula', () =>
  {
    const note = SkillResourceCostParser.writeHpCostFormula('', '  x  ');
    expect(SkillResourceCostParser.readHpCostFormula(note)).toBe('x');
  });
});

describe('SkillResourceCostParser granular writes', () =>
{
  it('writeHpCostFlat appends, replaces, and clears', () =>
  {
    const added = SkillResourceCostParser.writeHpCostFlat('', 8);
    expect(added).toContain('<hp-cost:8>');

    const replaced = SkillResourceCostParser.writeHpCostFlat('<hp-cost:1>\nkeep', 3);
    expect(replaced).toContain('<hp-cost:3>');
    expect(replaced.includes('<hp-cost:1>')).toBe(false);
    expect(replaced).toContain('keep');

    const cleared = SkillResourceCostParser.writeHpCostFlat('<hp-cost:9>', 0);
    expect(cleared.includes('hp-cost')).toBe(false);
  });

  it('writeHpCostFormula and writeHpCostCanKill are independent', () =>
  {
    const withFormula = SkillResourceCostParser.writeHpCostFormula('', 'a.mhp');
    expect(withFormula).toContain('<hp-cost:[a.mhp]>');

    const clearedFormula = SkillResourceCostParser.writeHpCostFormula(withFormula, '');
    expect(clearedFormula.includes('hp-cost')).toBe(false);

    const lethal = SkillResourceCostParser.writeHpCostCanKill('', true);
    expect(lethal).toMatch(/<hp-cost-can-kill>/i);

    const safe = SkillResourceCostParser.writeHpCostCanKill(lethal, false);
    expect(safe.includes('hp-cost-can-kill')).toBe(false);
  });

  it('writeMpCostTagFlat leaves unrelated note lines alone', () =>
  {
    const out = SkillResourceCostParser.writeMpCostTagFlat('foo\n<other:1>', 5);
    expect(out).toContain('<mp-cost:5>');
    expect(out).toContain('foo');
    expect(out).toContain('<other:1>');
  });
});

describe('SkillResourceCostParser read/write integration', () =>
{
  it('round-trips HP flat, percent, formula, and can-kill', () =>
  {
    const note = syncResourceCostTags(
      '<custom:tag>',
      12,
      5,
      'a.mhp * 0.02',
      true,
      0,
      0,
      '',
      0,
      0,
      ''
    );

    expect(SkillResourceCostParser.readHpCostFlat(note)).toBe(12);
    expect(SkillResourceCostParser.readHpCostPercent(note)).toBe(5);
    expect(SkillResourceCostParser.readHpCostFormula(note)).toBe('a.mhp * 0.02');
    expect(SkillResourceCostParser.readHpCostCanKill(note)).toBe(true);
    expect(note.includes('<custom:tag>')).toBe(true);
  });

  it('round-trips MP and TP extra tag costs', () =>
  {
    const note = syncResourceCostTags(
      '',
      0,
      0,
      '',
      false,
      4,
      10,
      'a.mp',
      2,
      15,
      'b.tp'
    );

    expect(SkillResourceCostParser.readMpCostTagFlat(note)).toBe(4);
    expect(SkillResourceCostParser.readMpCostTagPercent(note)).toBe(10);
    expect(SkillResourceCostParser.readMpCostTagFormula(note)).toBe('a.mp');
    expect(SkillResourceCostParser.readTpCostTagFlat(note)).toBe(2);
    expect(SkillResourceCostParser.readTpCostTagPercent(note)).toBe(15);
    expect(SkillResourceCostParser.readTpCostTagFormula(note)).toBe('b.tp');
  });

  it('clears tags when values are zero or formula blank', () =>
  {
    const withTags = syncResourceCostTags('', 1, 0, '', false, 2, 0, '', 0, 0, '');

    const note = syncResourceCostTags(withTags, 0, 0, '', false, 0, 0, '', 0, 0, '');

    expect(SkillResourceCostParser.readHpCostFlat(note)).toBe(0);
    expect(SkillResourceCostParser.readMpCostTagFlat(note)).toBe(0);
  });
});
