import { describe, expect, it } from 'vitest';
import { ApplyStateParser } from '@services/parsers/ApplyStateParser.ts';

describe('ApplyStateParser.read', () =>
{
  it('returns [] when no applyState/thisApplyState tags exist', () =>
  {
    const note = 'Line A\n<other:[1,2,3]>\nLine B';

    expect(ApplyStateParser.read(note))
      .toEqual([]);
  });

  it('parses applyState (2/3/4-length tuples) as caster-wide rows', () =>
  {
    const note = [
      '<applyState:[4,50]>',
      '<applyState:[5,100,180]>',
      '<applyState:[6,25,120,3]>',
    ].join('\n');

    const result = ApplyStateParser.read(note);

    expect(result)
      .toEqual([
        {
          stateId: 4,
          chance: 50,
          duration: null,
          stacks: null,
          thisSkillOnly: false,
        },
        {
          stateId: 5,
          chance: 100,
          duration: 180,
          stacks: null,
          thisSkillOnly: false,
        },
        {
          stateId: 6,
          chance: 25,
          duration: 120,
          stacks: 3,
          thisSkillOnly: false,
        },
      ]);
  });

  it('parses thisApplyState rows with thisSkillOnly true, after applyState rows', () =>
  {
    const note = [
      '<applyState:[4,50]>',
      '<thisApplyState:[7,100,60,2]>',
    ].join('\n');

    const result = ApplyStateParser.read(note);

    expect(result)
      .toEqual([
        {
          stateId: 4,
          chance: 50,
          duration: null,
          stacks: null,
          thisSkillOnly: false,
        },
        {
          stateId: 7,
          chance: 100,
          duration: 60,
          stacks: 2,
          thisSkillOnly: true,
        },
      ]);
  });
});

describe('ApplyStateParser.write', () =>
{
  it('drops invalid rows (stateId < 1), clamps chance to 0-100, and omits stacks without a duration', () =>
  {
    const result = ApplyStateParser.write('', [
      {
        stateId: 0,
        chance: 100,
        duration: null,
        stacks: null,
        thisSkillOnly: false,
      },
      {
        stateId: 4,
        chance: 150,
        duration: null,
        stacks: 5,
        thisSkillOnly: false,
      },
    ]);

    expect(result)
      .toBe('<applyState:[4,100]>');
  });

  it('writes the full 4-tuple when both duration and stacks are set, and routes thisSkillOnly to thisApplyState', () =>
  {
    const result = ApplyStateParser.write('', [
      {
        stateId: 6,
        chance: 25,
        duration: 120,
        stacks: 3,
        thisSkillOnly: false,
      },
      {
        stateId: 7,
        chance: 100,
        duration: 60,
        stacks: 2,
        thisSkillOnly: true,
      },
    ]);

    expect(result)
      .toBe([
        '<applyState:[6,25,120,3]>',
        '<thisApplyState:[7,100,60,2]>',
      ].join('\n'));
  });

  it('removes existing tags and preserves unrelated lines', () =>
  {
    const originalNote = [
      '<lore:some>',
      '<applyState:[4,50]>',
      '<thisApplyState:[7,100,60,2]>',
      '<other:tag>',
    ].join('\n');

    const result = ApplyStateParser.write(originalNote, []);

    expect(result)
      .toBe([
        '<lore:some>',
        '<other:tag>',
      ].join('\n'));
  });
});
