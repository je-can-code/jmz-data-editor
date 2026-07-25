import { describe, expect, it } from 'vitest';
import { SkillJabsExtension } from '@core/domain/entities/jabs/SkillJabsExtension.ts';
import { SkillJabsNoteParser } from '@services/parsers/SkillJabsNoteParser.ts';

describe('SkillJabsNoteParser', () =>
{
  it('reads and writes actionId round-trip', () =>
  {
    const ext = new SkillJabsExtension();
    SkillJabsNoteParser.hydrate(ext, '<actionId:3>\n<castTime: 10>');
    expect(ext.actionId)
      .toBe(3);
    expect(ext.castTime)
      .toBe(10);
    const note = SkillJabsNoteParser.writeSkillTags(ext, '<other>');
    expect(note)
      .toContain('<actionId:3>');
    expect(note)
      .toContain('<castTime:10>');
    expect(note)
      .toContain('<other>');
  });

  it('stripSkillTags removes managed tags', () =>
  {
    const stripped = SkillJabsNoteParser.stripSkillTags('<direct>\n<actionId:1>\nfoo');
    expect(stripped)
      .toContain('foo');
    expect(stripped)
      .not
      .toMatch(/actionId/);
    expect(stripped)
      .not
      .toMatch(/direct/i);
  });

  it('fromSkillNote + applyToNote preserves foreign note lines', () =>
  {
    const j = SkillJabsExtension.fromSkillNote('<bonus-hits:2>\n<hp-cost:5>');
    expect(j.jabsBonusHitsFromSkillNote)
      .toBe(2);
    const out = j.applyToNote('<hp-cost:5>');
    expect(out)
      .toContain('<bonus-hits:2>');
    expect(out)
      .toContain('<hp-cost:5>');
  });

  it('hydrate reads legacy bonusHits and write emits bonus-hits', () =>
  {
    const j = SkillJabsExtension.fromSkillNote('<bonusHits:3>');
    expect(j.jabsBonusHitsFromSkillNote)
      .toBe(3);
    const out = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(out)
      .toContain('<bonus-hits:3>');
    expect(out)
      .not
      .toMatch(/bonusHits/i);
  });

  it('hydrate reads boolean and combo tags', () =>
  {
    const j = SkillJabsExtension.fromSkillNote('<comboStarter>\n<combo:[1, 2]>');
    expect(j.comboStarter)
      .toBe(true);
    expect(j.comboRaw)
      .toBe('[1, 2]');
  });

  it('reads and writes ogcd and gcd override; strip removes them', () =>
  {
    const j = SkillJabsExtension.fromSkillNote('<ogcd>\n<gcd: 45>\n<trail>');
    expect(j.ogcd)
      .toBe(true);
    expect(j.globalCooldownOverride)
      .toBe(45);
    const note = SkillJabsNoteParser.writeSkillTags(j, 'keep');
    expect(note)
      .toContain('<ogcd>');
    expect(note)
      .toContain('<gcd:45>');
    expect(note)
      .toContain('keep');
    const stripped = SkillJabsNoteParser.stripSkillTags('<ogcd><gcd:12>x');
    expect(stripped)
      .toContain('x');
    expect(stripped)
      .not
      .toMatch(/ogcd/i);
    expect(stripped)
      .not
      .toMatch(/gcd:/i);
  });

  it('hydrate treats gcd:0 as absent override', () =>
  {
    const j = SkillJabsExtension.fromSkillNote('<gcd:0>');
    expect(j.globalCooldownOverride)
      .toBe(null);
    const out = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(out)
      .not
      .toMatch(/gcd:/i);
  });

  it('cast preview warn at is clamped to cast time on hydrate and write', () =>
  {
    const j = SkillJabsExtension.fromSkillNote('<castTime:20>\n<castPreviewWarnAt:99>');
    expect(j.castTime)
      .toBe(20);
    expect(j.castPreviewWarnAt)
      .toBe(20);
    const note = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(note)
      .toContain('<castPreviewWarnAt:20>');
  });

  it('hydrate drops redundant visual tags (center anchor, unit scale, zero offset)', () =>
  {
    const j = SkillJabsExtension.fromSkillNote(
      '<visAnchor:[0.5, 0.5]>\n<visScale:[1, 1]>\n<visOffset:[0, 0]>'
    );
    expect(j.visAnchorRaw)
      .toBe(null);
    expect(j.visScaleRaw)
      .toBe(null);
    expect(j.visOffsetRaw)
      .toBe(null);
    const note = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(note)
      .not
      .toMatch(/visAnchor/i);
    expect(note)
      .not
      .toMatch(/visScale/i);
    expect(note)
      .not
      .toMatch(/visOffset/i);
  });

  it('reads and writes pierce, guard, counters, and iframes as structured fields', () =>
  {
    const j = SkillJabsExtension.fromSkillNote(
      '<pierce:[3, 5]>\n<guard:[-10, 25]>\n<counterParry:[12, 50]>\n<counterGuard:[8, 100]>\n<iframes:[2, 9]>'
    );
    expect(j.pierceMaxCount)
      .toBe(3);
    expect(j.pierceDelayFrames)
      .toBe(5);
    expect(j.guardFlat)
      .toBe(-10);
    expect(j.guardPercent)
      .toBe(25);
    expect(j.counterParrySkillId)
      .toBe(12);
    expect(j.counterParryChance)
      .toBe(50);
    expect(j.counterGuardSkillId)
      .toBe(8);
    expect(j.counterGuardChance)
      .toBe(100);
    expect(j.iframesStartFrame)
      .toBe(2);
    expect(j.iframesEndFrame)
      .toBe(9);
    const note = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(note)
      .toContain('<pierce:[3, 5]>');
    expect(note)
      .toContain('<guard:[-10, 25]>');
    expect(note)
      .toContain('<counterParry:[12, 50]>');
    expect(note)
      .toContain('<counterGuard:[8, 100]>');
    expect(note)
      .toContain('<iframes:[2, 9]>');
  });

  it('hydrate drops iframes when invincible dodge is set; write omits iframes while invincible', () =>
  {
    const j = SkillJabsExtension.fromSkillNote('<invincibleDodge>\n<iframes:[1, 5]>');
    expect(j.invincibleDodge)
      .toBe(true);
    expect(j.iframesStartFrame)
      .toBe(null);
    expect(j.iframesEndFrame)
      .toBe(null);
    const note = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(note)
      .toContain('<invincibleDodge>');
    expect(note)
      .not
      .toMatch(/iframes/i);
  });

  it('round-trips J-ABS-Juice tags (icon, weapon style, motion, span, repeat count, stab tip, profile gun)', () =>
  {
    const note = [
      '<jabsJuiceIcon:97>',
      '<jabsJuiceWeaponStyle:sword_a>',
      '<juiceMotion:arc-reverse>',
      '<juiceSpan:90>',
      '<juiceRepeatCount:3>',
      '<juiceStabTipDegrees:-45>',
      '<juiceProfileGun>',
      '<hp-cost:5>',
    ].join('\n');
    const j = SkillJabsExtension.fromSkillNote(note);
    expect(j.juiceIconIndex)
      .toBe(97);
    expect(j.juiceWeaponStyle)
      .toBe('sword_a');
    expect(j.juiceMotion)
      .toBe('arc-reverse');
    expect(j.juiceArcSpanDegrees)
      .toBe(90);
    expect(j.juiceRepeatCount)
      .toBe(3);
    expect(j.juiceStabTipDegrees)
      .toBe(-45);
    expect(j.juiceProfileGun)
      .toBe(true);

    const out = j.applyToNote('<hp-cost:5>');
    expect(out)
      .toContain('<jabsJuiceIcon:97>');
    expect(out)
      .toContain('<jabsJuiceWeaponStyle:sword_a>');
    expect(out)
      .toContain('<juiceMotion:arc-reverse>');
    expect(out)
      .toContain('<juiceSpan:90>');
    expect(out)
      .toContain('<juiceRepeatCount:3>');
    expect(out)
      .toContain('<juiceStabTipDegrees:-45>');
    expect(out)
      .toContain('<juiceProfileGun>');
    expect(out)
      .toContain('<hp-cost:5>');
  });

  it('strip removes every managed J-ABS-Juice tag', () =>
  {
    const stripped = SkillJabsNoteParser.stripSkillTags(
      '<jabsJuiceIcon:12><jabsJuiceWeaponStyle:bow_a><juiceMotion:spin>'
      + '<juiceSpan:120><juiceRepeatCount:2><juiceStabTipDegrees:30><juiceProfileGun>keep'
    );
    expect(stripped)
      .toContain('keep');
    expect(stripped)
      .not
      .toMatch(/juice/i);
  });

  it('write clamps repeat count above 8 and drops disabled / blank juice fields', () =>
  {
    const j = new SkillJabsExtension();
    j.juiceIconIndex = -1;
    j.juiceWeaponStyle = '   ';
    j.juiceMotion = '';
    j.juiceArcSpanDegrees = null;
    j.juiceRepeatCount = 99;
    j.juiceStabTipDegrees = null;
    j.juiceProfileGun = false;

    const out = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(out)
      .not
      .toMatch(/jabsJuiceIcon/i);
    expect(out)
      .not
      .toMatch(/jabsJuiceWeaponStyle/i);
    expect(out)
      .not
      .toMatch(/juiceMotion/i);
    expect(out)
      .not
      .toMatch(/juiceSpan/i);
    expect(out)
      .not
      .toMatch(/juiceStabTipDegrees/i);
    expect(out)
      .not
      .toMatch(/juiceProfileGun/i);
    expect(out)
      .toContain('<juiceRepeatCount:8>');
  });

  it('write normalizes juiceMotion casing to kebab-case lowercase', () =>
  {
    const j = new SkillJabsExtension();
    j.juiceMotion = ' Arc-Reverse ';
    const out = SkillJabsNoteParser.writeSkillTags(j, '');
    expect(out)
      .toContain('<juiceMotion:arc-reverse>');
  });
});
