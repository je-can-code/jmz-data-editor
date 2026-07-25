import { describe, expect, it } from 'vitest';
import { StatePassiveConditionalExtension } from '@core/domain/entities/state/StatePassiveConditionalExtension.ts';
import { StatePassiveConditionalNoteParser } from '@services/parsers/StatePassiveConditionalNoteParser.ts';

describe('StatePassiveConditionalNoteParser', () =>
{
  it('hydrates autoApplyState tuple from note', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    StatePassiveConditionalNoteParser.hydrate(ext, '<autoApplyState:[205, time, 900]>\n<indefiniteState>');
    expect(ext.autoApplyStateRules)
      .toHaveLength(1);
    expect(ext.autoApplyStateRules[ 0 ].stateId)
      .toBe(205);
    expect(ext.autoApplyStateRules[ 0 ].condition)
      .toBe('time');
    expect(ext.autoApplyStateRules[ 0 ].param)
      .toBe(900);
  });

  it('write emits autoApplyState when all fields are set', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    ext.autoApplyStateRules = [
      {
        stateId: 205,
        condition: 'time',
        param: 900,
      },
    ];
    const note = StatePassiveConditionalNoteParser.write(ext, '');
    expect(note)
      .toContain('<autoApplyState:[205, time, 900]>');
  });

  it('write omits incomplete autoApplyState rules', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    ext.autoApplyStateRules = [
      {
        stateId: 205,
        condition: 'time',
        param: null,
      },
    ];
    const note = StatePassiveConditionalNoteParser.write(ext, 'keep');
    expect(note)
      .toBe('keep');
    expect(note)
      .not
      .toMatch(/autoApplyState/i);
  });

  it('strip removes autoApplyState tags', () =>
  {
    const stripped = StatePassiveConditionalNoteParser.strip('<autoApplyState:[42, move, 2]>\nkeep');
    expect(stripped)
      .toContain('keep');
    expect(stripped)
      .not
      .toMatch(/autoApplyState/i);
  });

  it('hydrate reads every autoApplyState tag', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    StatePassiveConditionalNoteParser.hydrate(
      ext,
      '<autoApplyState:[16, time, 180]>\n<autoApplyState:[99, hpDmg, 60]>',
    );
    expect(ext.autoApplyStateRules)
      .toHaveLength(2);
    expect(ext.autoApplyStateRules[ 0 ].stateId)
      .toBe(16);
    expect(ext.autoApplyStateRules[ 1 ].stateId)
      .toBe(99);
  });

  it('write emits one tag per complete autoApplyState rule', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    ext.autoApplyStateRules = [
      {
        stateId: 16,
        condition: 'time',
        param: 180,
      },
      {
        stateId: 99,
        condition: 'hpDmg',
        param: 60,
      },
    ];
    const note = StatePassiveConditionalNoteParser.write(ext, 'keep');
    expect(note.match(/autoApplyState/gi)?.length)
      .toBe(2);
    expect(note)
      .toContain('<autoApplyState:[16, time, 180]>');
    expect(note)
      .toContain('<autoApplyState:[99, hpDmg, 60]>');
    expect(note)
      .toContain('keep');
  });

  it('hydrates autoExecuteSkill 3-tuple from note', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    StatePassiveConditionalNoteParser.hydrate(ext, '<autoExecuteSkill:[275, time, 60]>');
    expect(ext.autoExecuteSkillRules)
      .toHaveLength(1);
    expect(ext.autoExecuteSkillRules[ 0 ].skillId)
      .toBe(275);
    expect(ext.autoExecuteSkillRules[ 0 ].condition)
      .toBe('time');
    expect(ext.autoExecuteSkillRules[ 0 ].param)
      .toBe(60);
  });

  it('hydrates autoExecuteSkill enemiesNearby 4-tuple from note', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    StatePassiveConditionalNoteParser.hydrate(ext, '<autoExecuteSkill:[1022, enemiesNearby, 1, 60]>');
    expect(ext.autoExecuteSkillRules[ 0 ].condition)
      .toBe('enemiesNearby');
    expect(ext.autoExecuteSkillRules[ 0 ].enemyMinCount)
      .toBe(1);
    expect(ext.autoExecuteSkillRules[ 0 ].enemyCooldownFrames)
      .toBe(60);
    expect(ext.autoExecuteSkillRules[ 0 ].enemyTriggerTiles)
      .toBeNull();
  });

  it('hydrates autoExecuteSkill enemiesNearby 5-tuple from note', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    StatePassiveConditionalNoteParser.hydrate(
      ext,
      '<autoExecuteSkill:[275, enemiesNearby, 1, 60, 2]>',
    );
    expect(ext.autoExecuteSkillRules[ 0 ].enemyTriggerTiles)
      .toBe(2);
  });

  it('write emits autoExecuteSkill enemiesNearby with optional trigger tiles', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    ext.autoExecuteSkillRules = [
      {
        skillId: 275,
        condition: 'enemiesNearby',
        param: null,
        enemyMinCount: 1,
        enemyCooldownFrames: 60,
        enemyTriggerTiles: 2,
      },
    ];
    const note = StatePassiveConditionalNoteParser.write(ext, '');
    expect(note)
      .toContain('<autoExecuteSkill:[275, enemiesNearby, 1, 60, 2]>');
  });

  it('write emits multiple autoExecuteSkill tags', () =>
  {
    const ext = new StatePassiveConditionalExtension();
    ext.autoExecuteSkillRules = [
      {
        skillId: 1021,
        condition: 'time',
        param: 60,
        enemyMinCount: null,
        enemyCooldownFrames: null,
        enemyTriggerTiles: null,
      },
      {
        skillId: 1023,
        condition: 'move',
        param: 1,
        enemyMinCount: null,
        enemyCooldownFrames: null,
        enemyTriggerTiles: null,
      },
    ];
    const note = StatePassiveConditionalNoteParser.write(ext, '');
    expect(note.match(/autoExecuteSkill/gi)?.length)
      .toBe(2);
    expect(note)
      .toContain('<autoExecuteSkill:[1021, time, 60]>');
    expect(note)
      .toContain('<autoExecuteSkill:[1023, move, 1]>');
  });

  it('fromStateNote round-trips through applyToNote', () =>
  {
    const ext = StatePassiveConditionalExtension.fromStateNote(
      '<custom>\n<autoApplyState:[42, move, 2]>\n<autoExecuteSkill:[275, stand, 120]>',
    );
    expect(ext.autoApplyStateRules[ 0 ].condition)
      .toBe('move');
    expect(ext.autoExecuteSkillRules[ 0 ].condition)
      .toBe('stand');
    const note = ext.applyToNote(
      '<custom>\n<autoApplyState:[42, move, 2]>\n<autoExecuteSkill:[275, stand, 120]>',
    );
    expect(note)
      .toContain('<custom>');
    expect(note)
      .toContain('<autoApplyState:[42, move, 2]>');
    expect(note)
      .toContain('<autoExecuteSkill:[275, stand, 120]>');
  });
});
