import { describe, expect, it } from 'vitest';
import { UsableItemThisCritParser } from '@services/parsers/UsableItemThisCritParser.ts';

describe('UsableItemThisCritParser', () =>
{
  it('readThisCritChance returns last matching line inner text', () =>
  {
    const note = '<thisCritChance:[1]>\n<thisCritChance:[a.luk]>';
    expect(UsableItemThisCritParser.readThisCritChance(note))
      .toBe('a.luk');
  });

  it('writeThisCritChance strips duplicates then prepends', () =>
  {
    const out = UsableItemThisCritParser.writeThisCritChance(
      'mid\n<thisCritChance:[1]>\n<thisCritChance:[2]>',
      '3'
    );
    expect(out.startsWith('<thisCritChance:[3]>'))
      .toBe(true);
    expect(out.includes('<thisCritChance:[1]>'))
      .toBe(false);
    expect(out)
      .toContain('mid');
  });

  it('writeThisCritDamageMultiplier clears when formula blank', () =>
  {
    const cleared = UsableItemThisCritParser.writeThisCritDamageMultiplier(
      '<thisCritDamageMultiplier:[x]>\nok',
      '   '
    );
    expect(cleared.includes('thisCritDamageMultiplier'))
      .toBe(false);
    expect(cleared)
      .toContain('ok');
  });

  it('readThisCritsAlways and writeThisCritsAlways pair', () =>
  {
    const withTag = UsableItemThisCritParser.writeThisCritsAlways('', true);
    expect(UsableItemThisCritParser.readThisCritsAlways(withTag))
      .toBe(true);

    const cleared = UsableItemThisCritParser.writeThisCritsAlways(withTag, false);
    expect(UsableItemThisCritParser.readThisCritsAlways(cleared))
      .toBe(false);
  });
});
