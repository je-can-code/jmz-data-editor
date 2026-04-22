import { describe, expect, it } from 'vitest';
import { PassiveAbsEnemyNoteParser } from '@services/parsers/PassiveAbsEnemyNoteParser.ts';

describe('PassiveAbsEnemyNoteParser', () =>
{
  it('reads block flags and last chance tags per line order', () =>
  {
    const note = [
      '<passive-affix-prefix-chance:10>',
      '<passive-affix-prefix-chance:40>',
      '<passive-affix-suffix-chance:5>',
      '<no-rng-passive-prefixes>',
      '<no-rng-passive-suffixes>',
    ].join('\n');

    const r = PassiveAbsEnemyNoteParser.read(note);

    expect(r.noRngPassivePrefixes)
      .toBe(true);
    expect(r.noRngPassiveSuffixes)
      .toBe(true);
    expect(r.passiveAffixPrefixChance)
      .toBe(40);
    expect(r.passiveAffixSuffixChance)
      .toBe(5);
  });

  it('round-trip write preserves flags and chances', () =>
  {
    const base = '<level:5>\n<jabsConfig:invincible>';
    const written = PassiveAbsEnemyNoteParser.write(base, {
      noRngPassivePrefixes: true,
      noRngPassiveSuffixes: false,
      passiveAffixPrefixChance: null,
      passiveAffixSuffixChance: 33,
    });

    expect(written)
      .toContain('<no-rng-passive-prefixes>');
    expect(written)
      .not
      .toContain('<no-rng-passive-suffixes>');
    expect(written)
      .toContain('<passive-affix-suffix-chance:33>');
    expect(written)
      .toContain('<level:5>');

    const r = PassiveAbsEnemyNoteParser.read(written);
    expect(r.noRngPassivePrefixes)
      .toBe(true);
    expect(r.noRngPassiveSuffixes)
      .toBe(false);
    expect(r.passiveAffixPrefixChance)
      .toBe(null);
    expect(r.passiveAffixSuffixChance)
      .toBe(33);
  });

  it('clamps chance values when reading', () =>
  {
    const note = '<passive-affix-prefix-chance:150>\n<passive-affix-suffix-chance:-20>';
    const r = PassiveAbsEnemyNoteParser.read(note);

    expect(r.passiveAffixPrefixChance)
      .toBe(100);
    expect(r.passiveAffixSuffixChance)
      .toBe(0);
  });
});
