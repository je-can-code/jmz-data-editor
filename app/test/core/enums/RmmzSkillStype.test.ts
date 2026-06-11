import { describe, expect, it } from 'vitest';
import {
  normalizeSkillStypeId,
  skillHistoryTypeFilterAutocompleteOptions,
  skillHistoryTypeFilterOptionForValue,
  skillStypeAutocompleteOptions,
  skillStypeOptionForValue,
  skillStypeOptionsFromNames,
} from '@core/enums/RmmzSkillStype.ts';

describe('RmmzSkillStype', () =>
{
  it('normalizeSkillStypeId truncates and rejects negatives', () =>
  {
    expect(normalizeSkillStypeId(0))
      .toBe(0);
    expect(normalizeSkillStypeId(2))
      .toBe(2);
    expect(normalizeSkillStypeId(2.7))
      .toBe(2);
    expect(normalizeSkillStypeId(-1))
      .toBe(0);
    expect(normalizeSkillStypeId(NaN))
      .toBe(0);
    expect(normalizeSkillStypeId(Infinity))
      .toBe(0);
  });

  it('skillStypeOptionsFromNames falls back to None-only when empty', () =>
  {
    const o = skillStypeOptionsFromNames([]);
    expect(o)
      .toHaveLength(1);
    expect(o[ 0 ].value)
      .toBe(0);
    expect(o[ 0 ].label)
      .toBe('None');
    expect(o[ 0 ].group)
      .toBe('No type');
  });

  it('skillStypeOptionsFromNames maps indices and groups', () =>
  {
    const o = skillStypeOptionsFromNames([ 'None', 'Magic', 'Special' ]);
    expect(o.map((x) => x.value))
      .toEqual([ 0, 1, 2 ]);
    expect(o[ 0 ].group)
      .toBe('No type');
    expect(o[ 1 ].group)
      .toBe('Skill types');
    expect(o[ 2 ].group)
      .toBe('Skill types');
  });

  it('skillStypeOptionsFromNames uses None when index 0 name is blank', () =>
  {
    const o = skillStypeOptionsFromNames([ '   ', 'Magic' ]);
    expect(o[ 0 ].label)
      .toBe('None');
    expect(o[ 1 ].label)
      .toBe('Magic');
  });

  it('skillStypeAutocompleteOptions appends orphan when stypeId is OOB', () =>
  {
    const o = skillStypeAutocompleteOptions(5, [ 'None', 'Magic' ]);
    expect(o.some((x) => x.value === 5 && x.group === 'Invalid'))
      .toBe(true);
  });

  it('skillStypeOptionForValue resolves in-range and OOB', () =>
  {
    expect(skillStypeOptionForValue(1, [ 'None', 'Magic' ]).label)
      .toBe('Magic');
    expect(skillStypeOptionForValue(9, [ 'None', 'Magic' ]).value)
      .toBe(9);
  });

  it('skillHistoryTypeFilterAutocompleteOptions uses Any at 0 and skips system index 0', () =>
  {
    const names = [ '', 'Techniques', 'Magecraft' ];
    const o = skillHistoryTypeFilterAutocompleteOptions(0, names);
    expect(o[ 0 ])
      .toEqual({ value: 0, label: 'Any', group: 'Filter' });
    expect(o.map((x) => x.value))
      .toEqual([ 0, 1, 2 ]);
    expect(o[ 1 ].label)
      .toBe('Techniques');
  });

  it('skillHistoryTypeFilterOptionForValue returns null when unset', () =>
  {
    expect(skillHistoryTypeFilterOptionForValue(null, [ 'None', 'Magic' ]))
      .toBe(null);
    expect(skillHistoryTypeFilterOptionForValue(0, [ 'None', 'Magic' ])?.label)
      .toBe('Any');
    expect(skillHistoryTypeFilterOptionForValue(1, [ 'None', 'Magic' ])?.label)
      .toBe('Magic');
  });
});
