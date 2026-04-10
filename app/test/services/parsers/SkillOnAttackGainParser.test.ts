import { describe, expect, it } from 'vitest';
import { SkillOnAttackGainParser } from '@services/parsers/SkillOnAttackGainParser.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

const syncOnAttackGainTags = (
  note: string,
  onAttackHpGainFlat: number,
  onAttackHpGainPercent: number,
  onAttackHpGainFormula: string,
  onAttackMpGainFlat: number,
  onAttackMpGainPercent: number,
  onAttackMpGainFormula: string,
  onAttackTpGainFlat: number,
  onAttackTpGainPercent: number,
  onAttackTpGainFormula: string
): string =>
{
  let n = note;

  n = SkillOnAttackGainParser.writeOnAttackHpGainFlat(n, onAttackHpGainFlat);
  n = SkillOnAttackGainParser.writeOnAttackHpGainPercent(n, onAttackHpGainPercent);
  n = SkillOnAttackGainParser.writeOnAttackHpGainFormula(n, onAttackHpGainFormula);

  n = SkillOnAttackGainParser.writeOnAttackMpGainFlat(n, onAttackMpGainFlat);
  n = SkillOnAttackGainParser.writeOnAttackMpGainPercent(n, onAttackMpGainPercent);
  n = SkillOnAttackGainParser.writeOnAttackMpGainFormula(n, onAttackMpGainFormula);

  n = SkillOnAttackGainParser.writeOnAttackTpGainFlat(n, onAttackTpGainFlat);
  n = SkillOnAttackGainParser.writeOnAttackTpGainPercent(n, onAttackTpGainPercent);
  n = SkillOnAttackGainParser.writeOnAttackTpGainFormula(n, onAttackTpGainFormula);

  return NoteNormalizer.normalize(n);
};

describe('SkillOnAttackGainParser', () =>
{
  it('round-trips HP flat / percent / formula', () =>
  {
    const note = syncOnAttackGainTags(
      '',
      5,
      10,
      'a.atk',
      0,
      0,
      '',
      0,
      0,
      ''
    );
    expect(SkillOnAttackGainParser.readOnAttackHpGainFlat(note))
      .toBe(5);
    expect(SkillOnAttackGainParser.readOnAttackHpGainPercent(note))
      .toBe(10);
    expect(SkillOnAttackGainParser.readOnAttackHpGainFormula(note))
      .toBe('a.atk');
  });

  it('writeOnAttackMpGainFlat replaces and clears', () =>
  {
    const added = SkillOnAttackGainParser.writeOnAttackMpGainFlat('', 7);
    expect(added)
      .toContain('<on-attack-mp-gain:7>');

    const cleared = SkillOnAttackGainParser.writeOnAttackMpGainFlat('<on-attack-mp-gain:7>', 0);
    expect(cleared.includes('on-attack-mp-gain'))
      .toBe(false);
  });

  it('TP gain tags are independent of HP/MP', () =>
  {
    const note = SkillOnAttackGainParser.writeOnAttackTpGainPercent(
      SkillOnAttackGainParser.writeOnAttackTpGainFlat('', 2),
      15
    );
    expect(SkillOnAttackGainParser.readOnAttackTpGainFlat(note))
      .toBe(2);
    expect(SkillOnAttackGainParser.readOnAttackTpGainPercent(note))
      .toBe(15);
    expect(SkillOnAttackGainParser.readOnAttackHpGainFlat(note))
      .toBe(0);
  });
});
