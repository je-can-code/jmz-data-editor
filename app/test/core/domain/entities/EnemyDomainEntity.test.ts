import { describe, expect, it } from 'vitest';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import { JabsBattlerRole } from '@core/domain/valueObjects/jabs-battler-roles.ts';
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;

describe('EnemyDomainModel', () =>
{
  /**
   * Helper to create a mock RMMZ enemy object.
   */
  const createMockRmmzEnemy = (overrides: Partial<RPG_Enemy> = {}): RPG_Enemy =>
  {
    return {
      id: 1,
      name: 'Slime',
      exp: 10,
      gold: 5,
      params: [ 100, 10, 10, 10, 10, 10, 10, 10 ],
      traits: [],
      note: '',
      actions: [],
      battlerHue: 0,
      battlerName: 'Slime',
      dropItems: [],
      ...overrides,
    } as RPG_Enemy;
  };

  it('should correctly handle a full Round-Trip (DTO -> Model -> DTO)', () =>
  {
    const originalNote = '<level:5>\n<maxTp:100>\n<sdpPoints:50>';
    const rmmz = createMockRmmzEnemy({ note: originalNote });

    const model = new RPG_EnemyDomainModel(rmmz);

    // Check initial parsing
    expect(model.level)
      .toBe(5);
    expect(model.maxTp)
      .toBe(100);
    expect(model.sdpPoints)
      .toBe(50);

    // Modify properties
    model.level = 10;
    model.name = 'Giant Slime';

    const result = model.toRmmz();

    // Verify DTO updates
    expect(result.name)
      .toBe('Giant Slime');
    expect(result.note)
      .toContain('<level:10>');
    expect(result.note)
      .toContain('<maxTp:100>');
    // Ensure original RMMZ fields are preserved
    expect(result.battlerName)
      .toBe('Slime');
  });

  it('should normalize messy notes and handle whitespace gracefully', () =>
  {
    const rmmz = createMockRmmzEnemy({
      note: '  <level: 5>  \r\n\r\n  <maxTp: 100>  \n<sdpPoints: 50>'
    });

    const model = new RPG_EnemyDomainModel(rmmz);

    // Internal state should be clean
    expect(model.level)
      .toBe(5);
    expect(model.maxTp)
      .toBe(100);

    const result = model.toRmmz();

    // Output should be standardized (Standard parsers remove leading/trailing spaces in tags)
    expect(result.note)
      .toContain('<level:5>');
    expect(result.note)
      .toContain('<maxTp:100>');
    // NoteNormalizer collapses newlines and converts CRLF to LF
    expect(result.note)
      .not
      .toContain('\r');
    expect(result.note.split('\n').length)
      .toBeLessThan(5);
  });

  it('should enforce Coordination axis mutual exclusivity (Leader vs Follower) via setCoordination', () =>
  {
    // legacy <aiTrait:leader> notetag still hydrates the leader role on read — the migration
    // is one-way and gets normalized on save.
    const model = new RPG_EnemyDomainModel(createMockRmmzEnemy({ note: '<aiTrait:leader>' }));
    expect(model.jabsBattlerRoles.leader)
      .toBe(true);
    expect(model.jabsBattlerRoles.getCoordination())
      .toBe('leader');

    // switching to follower must clear leader — the value object owns the invariant, not the UI.
    model.jabsBattlerRoles.setCoordination(JabsBattlerRole.Follower);

    expect(model.jabsBattlerRoles.follower)
      .toBe(true);
    expect(model.jabsBattlerRoles.leader)
      .toBe(false);

    const result = model.toRmmz();
    // on save the canonical <aiRole:*> form is written and the legacy <aiTrait:leader> alias
    // is scrubbed by writeAiTraits, so neither leader-flavored line should remain.
    expect(result.note)
      .toContain('<aiRole:follower>');
    expect(result.note)
      .not
      .toContain('<aiTrait:leader>');
    expect(result.note)
      .not
      .toContain('<aiRole:leader>');
  });

  it('should enforce Protection axis mutual exclusivity (Guardian vs Ward) via setProtection', () =>
  {
    const model = new RPG_EnemyDomainModel(createMockRmmzEnemy({ note: '<aiRole:guardian>' }));
    expect(model.jabsBattlerRoles.guardian)
      .toBe(true);
    expect(model.jabsBattlerRoles.getProtection())
      .toBe('guardian');

    // a battler cannot simultaneously protect a ward and be protected as one — switching to
    // ward must clear guardian.
    model.jabsBattlerRoles.setProtection(JabsBattlerRole.Ward);

    expect(model.jabsBattlerRoles.ward)
      .toBe(true);
    expect(model.jabsBattlerRoles.guardian)
      .toBe(false);

    // explicitly clear both — the tri-state "None" path.
    model.jabsBattlerRoles.setProtection(null);

    expect(model.jabsBattlerRoles.guardian)
      .toBe(false);
    expect(model.jabsBattlerRoles.ward)
      .toBe(false);
    expect(model.jabsBattlerRoles.getProtection())
      .toBe(null);
  });

  it('should leave Solo and Sentinel orthogonal to the coordination/protection pairs', () =>
  {
    const model = new RPG_EnemyDomainModel(createMockRmmzEnemy());

    // solo is the master opt-out at runtime, but at this layer it does NOT auto-clear the pairs
    // — the value object's invariants only enforce the two pair-level exclusions.
    model.jabsBattlerRoles.setCoordination(JabsBattlerRole.Leader);
    model.jabsBattlerRoles.setProtection(JabsBattlerRole.Guardian);
    model.jabsBattlerRoles.setSolo(true);
    model.jabsBattlerRoles.setSentinel(true);

    expect(model.jabsBattlerRoles.leader)
      .toBe(true);
    expect(model.jabsBattlerRoles.guardian)
      .toBe(true);
    expect(model.jabsBattlerRoles.solo)
      .toBe(true);
    expect(model.jabsBattlerRoles.sentinel)
      .toBe(true);

    const result = model.toRmmz();
    expect(result.note)
      .toContain('<aiRole:leader>');
    expect(result.note)
      .toContain('<aiRole:guardian>');
    expect(result.note)
      .toContain('<aiRole:solo>');
    expect(result.note)
      .toContain('<aiRole:sentinel>');
  });

  it('should migrate legacy <aiTrait:leader>/<aiTrait:follower> notetags to canonical <aiRole:*> on save', () =>
  {
    const model = new RPG_EnemyDomainModel(createMockRmmzEnemy({ note: '<aiTrait:follower>\n<aiTrait:careful>' }));

    // careful is a real skill-choice trait and should hydrate the trait flag.
    expect(model.jabsAiTraits.careful)
      .toBe(true);
    // follower is a role, not a trait — it hydrates the role flag, not anything on jabsAiTraits.
    expect(model.jabsBattlerRoles.follower)
      .toBe(true);

    const result = model.toRmmz();

    // round-trip writes canonical forms for both: <aiTrait:careful> stays as a trait, and
    // <aiTrait:follower> becomes <aiRole:follower>.
    expect(result.note)
      .toContain('<aiTrait:careful>');
    expect(result.note)
      .toContain('<aiRole:follower>');
    expect(result.note)
      .not
      .toContain('<aiTrait:follower>');
  });

  it('should enforce JABS Config mutual exclusivity via updateConfig', () =>
  {
    const model = new RPG_EnemyDomainModel(createMockRmmzEnemy());

    // Set Invincible
    model.jabsConfigs.updateConfig('invincible', true);
    expect(model.jabsConfigs.invincible)
      .toBe(true);
    expect(model.jabsConfigs.notInvincible)
      .toBe(false);

    // Toggle Not Invincible
    model.jabsConfigs.updateConfig('notInvincible', true);
    expect(model.jabsConfigs.notInvincible)
      .toBe(true);
    expect(model.jabsConfigs.invincible)
      .toBe(false);

    const result = model.toRmmz();
    expect(result.note)
      .toContain('<jabsConfig:notInvincible>');
  });

  it('should handle SDP data and parameter growth formulas', () =>
  {
    const rmmz = createMockRmmzEnemy({
      note: '<sdpDropData: [SlimePanel,50]>\n<atkBuffPlus:[a.level * 2]>'
    });

    const model = new RPG_EnemyDomainModel(rmmz);

    expect(model.sdpDrop.key)
      .toBe('SlimePanel');
    // ID 2 corresponds to 'atk' in RPG Maker
    expect(model.growths.get(2))
      .toBe('a.level * 2');

    model.growths.set(2, 'a.level * 5');
    const result = model.toRmmz();
    expect(result.note)
      .toContain('<atkBuffPlus:[a.level * 5]>');
  });

  it('should round-trip Passive-ABS affix gate tags on enemy notes', () =>
  {
    const rmmz = createMockRmmzEnemy({
      note: [
        '<no-rng-passive-prefixes>',
        '<passive-affix-suffix-chance:40>',
      ].join('\n'),
    });

    const model = new RPG_EnemyDomainModel(rmmz);

    expect(model.noRngPassivePrefixes)
      .toBe(true);
    expect(model.noRngPassiveSuffixes)
      .toBe(false);
    expect(model.passiveAffixPrefixChance)
      .toBe(null);
    expect(model.passiveAffixSuffixChance)
      .toBe(40);

    model.noRngPassivePrefixes = false;
    model.passiveAffixPrefixChance = 25;

    const out = model.toRmmz();

    expect(out.note)
      .toContain('<passive-affix-prefix-chance:25>');
    expect(out.note)
      .toContain('<passive-affix-suffix-chance:40>');
    expect(out.note)
      .not
      .toContain('<no-rng-passive-prefixes>');
  });

  it('should handle malformed or missing data without crashing', () =>
  {
    const rmmz = createMockRmmzEnemy({
      note: '<level: NaN>\n<maxTp: -50>\n<sdpDropData: [Invalid]>'
    });

    const model = new RPG_EnemyDomainModel(rmmz);

    // Should fall back to safe defaults where parsing fails
    expect(model.level)
      .toBe(0);
    expect(model.sdpDrop.key)
      .toBe('');

    // Note: maxTp currently allows negatives based on Parser implementation
    expect(model.maxTp)
      .toBe(-50);

    const result = model.toRmmz();
    expect(result.note)
      .toBeDefined();
  });
});
