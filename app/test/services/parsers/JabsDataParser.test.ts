import { describe, expect, it } from 'vitest';
import { JabsAiTraits } from '@core/domain/valueObjects/jabs-ai-traits.ts';
import { JabsBattlerRoles } from '@core/domain/valueObjects/jabs-battler-roles.ts';
import { JabsConfigs } from '@core/domain/valueObjects/jabs-configs.ts';
import { JabsDataParser } from '@services/parsers/JabsDataParser.ts';

describe('JabsDataParser.readAiTraits', () =>
{
  it('parses all eight canonical skill-choice traits case-insensitively and defaults missing ones to false', () =>
  {
    const note = [
      '<aiTrait: Careful>',
      '<aiTrait:executor>',
      '<lore:alpha>',
      '<aiTrait:RECKLESS>',
      '<aiTrait:Tactical>',
      '<aiTrait:berserker>',
      '<aiTrait:cleanser>',
      '<aiTrait:healer>',
      '<aiTrait:buffer>',
    ].join('\n');

    const traits = JabsDataParser.readAiTraits(note);

    expect(traits)
      .toEqual({
        careful: true,
        executor: true,
        reckless: true,
        tactical: true,
        berserker: true,
        cleanser: true,
        healer: true,
        buffer: true,
      });
  });

  it('returns all false when none present', () =>
  {
    const note = [ '<lore:one>', '<desc:two>' ].join('\n');

    const traits = JabsDataParser.readAiTraits(note);

    expect(traits)
      .toEqual({
        careful: false,
        executor: false,
        reckless: false,
        tactical: false,
        berserker: false,
        cleanser: false,
        healer: false,
        buffer: false,
      });
  });

  it('does NOT populate trait flags from legacy <aiTrait:leader>/<aiTrait:follower> notetags (those are roles now)', () =>
  {
    const note = [
      '<aiTrait:leader>',
      '<aiTrait:follower>',
      '<aiTrait:careful>',
    ].join('\n');

    const traits = JabsDataParser.readAiTraits(note);

    // careful comes through; leader/follower do NOT — they belong to JabsBattlerRoles now.
    expect(traits.careful)
      .toBe(true);
    expect(traits)
      .not
      .toHaveProperty('leader');
    expect(traits)
      .not
      .toHaveProperty('follower');
  });
});

describe('JabsDataParser.writeAiTraits', () =>
{
  it('removes existing trait lines and appends only enabled traits in deterministic order', () =>
  {
    const original = [
      '<top:keep>\r\n',
      '<aiTrait:careful>\n',
      '<aiTrait:healer>\n',
      '<bottom:keep>\r\r',
    ].join('');

    const result = JabsDataParser.writeAiTraits(original, new JabsAiTraits({
      careful: false,
      executor: true,
      reckless: true,
      tactical: false,
      berserker: false,
      cleanser: false,
      healer: false,
      buffer: true,
    }));

    // canonical order matches the enum declaration: careful, executor, reckless, tactical,
    // berserker, cleanser, healer, buffer.
    const expected = [
      '<top:keep>',
      '<bottom:keep>',
      '<aiTrait:executor>',
      '<aiTrait:reckless>',
      '<aiTrait:buffer>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('strips legacy <aiTrait:leader>/<aiTrait:follower> lines so the role writer can re-emit them as <aiRole:*>', () =>
  {
    const original = [
      '<top:keep>',
      '<aiTrait:leader>',
      '<aiTrait:follower>',
      '<aiTrait:careful>',
      '<bottom:keep>',
    ].join('\n');

    const result = JabsDataParser.writeAiTraits(original, new JabsAiTraits({
      careful: true,
    }));

    // legacy leader/follower aliases are scrubbed, and only the canonical careful trait remains.
    const expected = [
      '<top:keep>',
      '<bottom:keep>',
      '<aiTrait:careful>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});

describe('JabsDataParser.readBattlerRoles', () =>
{
  it('parses all six canonical roles from <aiRole:X> notetags', () =>
  {
    const note = [
      '<aiRole:leader>',
      '<aiRole: Follower>',
      '<aiRole:GUARDIAN>',
      '<aiRole:ward>',
      '<aiRole:solo>',
      '<aiRole:sentinel>',
    ].join('\n');

    const roles = JabsDataParser.readBattlerRoles(note);

    expect(roles)
      .toEqual({
        leader: true,
        follower: true,
        guardian: true,
        ward: true,
        solo: true,
        sentinel: true,
      });
  });

  it('hydrates leader/follower from legacy <aiTrait:leader>/<aiTrait:follower> aliases', () =>
  {
    const note = [
      '<aiTrait:leader>',
      '<aiTrait:follower>',
    ].join('\n');

    const roles = JabsDataParser.readBattlerRoles(note);

    expect(roles.leader)
      .toBe(true);
    expect(roles.follower)
      .toBe(true);
  });

  it('prefers canonical <aiRole:X> over the legacy alias on the same line family', () =>
  {
    const note = [
      '<aiRole:leader>',
      '<aiTrait:follower>',
    ].join('\n');

    const roles = JabsDataParser.readBattlerRoles(note);

    expect(roles.leader)
      .toBe(true);
    expect(roles.follower)
      .toBe(true);
  });

  it('returns all false when no role tags are present', () =>
  {
    const note = '<lore:alpha>\n<aiTrait:careful>';

    const roles = JabsDataParser.readBattlerRoles(note);

    expect(roles)
      .toEqual({
        leader: false,
        follower: false,
        guardian: false,
        ward: false,
        solo: false,
        sentinel: false,
      });
  });
});

describe('JabsDataParser.writeBattlerRoles', () =>
{
  it('removes existing <aiRole:*> lines and writes the enabled roles in deterministic order', () =>
  {
    const original = [
      '<top:keep>',
      '<aiRole:leader>',
      '<aiRole:sentinel>',
      '<bottom:keep>',
    ].join('\n');

    const result = JabsDataParser.writeBattlerRoles(original, new JabsBattlerRoles({
      leader: false,
      follower: true,
      guardian: true,
      ward: false,
      solo: false,
      sentinel: true,
    }));

    // canonical order matches the enum: leader, follower, guardian, ward, solo, sentinel.
    const expected = [
      '<top:keep>',
      '<bottom:keep>',
      '<aiRole:follower>',
      '<aiRole:guardian>',
      '<aiRole:sentinel>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('returns the cleaned base when no roles are enabled', () =>
  {
    const original = [
      '<keep:me>',
      '<aiRole:leader>',
    ].join('\n');

    const result = JabsDataParser.writeBattlerRoles(original, new JabsBattlerRoles());

    expect(result)
      .toBe('<keep:me>');
  });
});

describe('JabsDataParser.readBattlerData', () =>
{
  it('reads six numeric fields; last occurrence per field wins', () =>
  {
    const note = [
      '<sight: 1>',
      '<pursuit: 2>',
      '<prepare: 3>',
      '<alertDuration: 4>',
      '<alertedSightBoost: 5>',
      '<alertedPursuitBoost: 6>',
      // later overrides
      '<sight: 10>',
      '<prepare: 30>',
    ].join('\n');

    const data = JabsDataParser.readBattlerData(note);

    expect(data)
      .toEqual({
        sight: 10,
        pursuit: 2,
        prepareSpeed: 30,
        alertDuration: 4,
        alertSightBoost: 5,
        alertPursuitBoost: 6,
      });
  });

  it('returns zeros for all fields when not present', () =>
  {
    const note = '<meta:none>';

    const data = JabsDataParser.readBattlerData(note);

    expect(data)
      .toEqual({
        sight: 0,
        pursuit: 0,
        prepareSpeed: 0,
        alertDuration: 0,
        alertSightBoost: 0,
        alertPursuitBoost: 0,
      });
  });
});

describe('JabsDataParser.writeBattlerData', () =>
{
  it('removes existing battler lines and writes only >0 values in the proper order', () =>
  {
    const original = [
      '<a:one>\r\n',
      '<sight: 1>\n',
      '<pursuit: 2>\n',
      '<prepare: 3>\n',
      '<alertDuration: 4>\n',
      '<alertedSightBoost: 5>\n',
      '<alertedPursuitBoost: 6>\r\r',
      '<b:two>\n',
    ].join('');

    const result = JabsDataParser.writeBattlerData(original, {
      sight: 12,
      pursuit: 0,            // 0 => not written
      prepareSpeed: 9,
      alertDuration: 1,
      alertSightBoost: 0,    // 0 => not written
      alertPursuitBoost: 7,
    });

    // Expect LF-only and append order:
    // sight, pursuit, prepare, alertDuration, alertedSightBoost, alertedPursuitBoost
    const expected = [
      '<a:one>',
      '<b:two>',
      '<sight:12>',
      '<prepare:9>',
      '<alertDuration:1>',
      '<alertedPursuitBoost:7>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('removes battler data and writes none when all values are 0', () =>
  {
    const original = [
      '<x:keep>',
      '<pursuit: 2>',
      '<y:keep>',
    ].join('\n');

    const result = JabsDataParser.writeBattlerData(original, {
      sight: 0,
      pursuit: 0,
      prepareSpeed: 0,
      alertDuration: 0,
      alertSightBoost: 0,
      alertPursuitBoost: 0,
    });

    // Only non-battler lines remain
    const expected = [ '<x:keep>', '<y:keep>' ].join('\n');

    expect(result)
      .toBe(expected);
  });
});

describe('JabsDataParser.readConfigs', () =>
{
  it('parses multiple config flags case-insensitively; others false', () =>
  {
    const note = [
      '<jabsConfig: noIdle>',
      '<jabsConfig:ShowHpBar>',
      '<jabsConfig: INVINCIBLE>',
      '<other:keep>',
    ].join('\n');

    const cfg = JabsDataParser.readConfigs(note);

    expect(cfg)
      .toEqual({
        noIdle: true,
        canIdle: false,
        noHpBar: false,
        showHpBar: true,
        inanimate: false,
        notInanimate: false,
        invincible: true,
        notInvincible: false,
        noName: false,
        showName: false,
      });
  });

  it('returns all false when no config tags present', () =>
  {
    const note = '<lore:alpha>\n<desc:beta>';

    const cfg = JabsDataParser.readConfigs(note);

    expect(cfg)
      .toEqual({
        noIdle: false,
        canIdle: false,
        noHpBar: false,
        showHpBar: false,
        inanimate: false,
        notInanimate: false,
        invincible: false,
        notInvincible: false,
        noName: false,
        showName: false,
      });
  });
});

describe('JabsDataParser.writeConfigs', () =>
{
  it('removes existing config lines and appends only enabled configs in deterministic order', () =>
  {
    const original = [
      '<top:keep>\r\n',
      '<jabsConfig:noIdle>\n',
      '<jabsConfig:showHpBar>\r\r',
      '<bottom:keep>\n',
    ].join('');

    const result = JabsDataParser.writeConfigs(original, new JabsConfigs({
      noIdle: false,
      canIdle: true,
      noHpBar: true,
      showHpBar: false,
      inanimate: true,
      notInanimate: false,
      invincible: false,
      notInvincible: true,
      noName: false,
      showName: true,
    }));

    // Order per implementation: NoIdle, CanIdle, NoHpBar, ShowHpBar, Inanimate, NotInanimate,
    //                           Invincible, NotInvincible, NoName, ShowName
    const expected = [
      '<top:keep>',
      '<bottom:keep>',
      '<jabsConfig:canIdle>',
      '<jabsConfig:noHpBar>',
      '<jabsConfig:inanimate>',
      '<jabsConfig:notInvincible>',
      '<jabsConfig:showName>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});
