import { describe, expect, it } from 'vitest';
import { UnslottedSkillsParser } from '@services/parsers/UnslottedSkillsParser.ts';

describe('UnslottedSkillsParser', () =>
{
  it('reads an empty list from a note with no tag', () =>
  {
    expect(UnslottedSkillsParser.read('some other tag\n<foo>'))
      .toEqual([]);
  });

  it('reads skill ids from a single tag', () =>
  {
    expect(UnslottedSkillsParser.read('<unslottedSkills:[901,902]>'))
      .toEqual([ 901, 902 ]);
  });

  it('merges and dedupes ids across multiple tag lines', () =>
  {
    expect(
      UnslottedSkillsParser.read('<unslottedSkills:[901,902]>\n<unslottedSkills:[902,903]>')
    )
      .toEqual([ 901, 902, 903 ]);
  });

  it('writes a single tag line from the given ids, replacing prior tags', () =>
  {
    const out = UnslottedSkillsParser.write('<unslottedSkills:[1]>\nkeep', [ 901, 902 ]);
    expect(out)
      .toContain('<unslottedSkills:[901,902]>');
    expect(out)
      .toContain('keep');
    expect(out.includes('[1]'))
      .toBe(false);
  });

  it('writes no tag at all when given an empty list', () =>
  {
    const out = UnslottedSkillsParser.write('<unslottedSkills:[901]>\nkeep', []);
    expect(out)
      .not
      .toMatch(/unslottedSkills/i);
    expect(out)
      .toContain('keep');
  });
});
