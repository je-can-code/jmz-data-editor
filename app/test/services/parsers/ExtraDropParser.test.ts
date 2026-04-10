import { describe, expect, it } from 'vitest';
import { ExtraDropManager } from '@services/parsers/ExtraDropParser.ts';

// RPG_DropItem is a simple shape: { kind: number, dataId: number, denominator: number }
// We will construct these as plain objects and cast as any for the tests where needed.

describe('ExtraDropManager.read', () =>
{
  it('returns [] when no <drops:[]> tags exist', () =>
  {
    const note = `Line A\n<other:[1,2,3]>\nLine B`;

    const result = ExtraDropManager.read(note);

    expect(result)
      .toEqual([]);
  });

  it('parses multiple tags with letter/word types and mixed casing', () =>
  {
    const note = [
      '<drops:[i,1,10]>',           // item, id 1, chance 10
      '<drops:[Weapon,5,3]>',       // weapon, id 5, chance 3
      '<drops:[ARMOR,7,25]>',       // armor, id 7, chance 25
    ].join('\n');

    const result = ExtraDropManager.read(note);

    // kind: 1=item, 2=weapon, 3=armor
    expect(result.length)
      .toBe(3);

    expect(result[ 0 ])
      .toEqual({
        kind: 1,
        dataId: 1,
        denominator: 10
      });
    expect(result[ 1 ])
      .toEqual({
        kind: 2,
        dataId: 5,
        denominator: 3
      });
    expect(result[ 2 ])
      .toEqual({
        kind: 3,
        dataId: 7,
        denominator: 25
      });
  });
});

describe('ExtraDropManager.write', () =>
{
  it('removes existing tags, preserves unrelated lines, and writes new tags with normalized letters', () =>
  {
    const originalNote = [
      '<lore:some>\r\n',
      '<drops:[i,1,10]>\n',
      '\n',
      '<drops:[w,2,5]>\r\r',
      '<other:tag>\n',
    ].join('');

    const newDrops = [
      {
        kind: 1,
        dataId: 3,
        denominator: 15
      },
      {
        kind: 3,
        dataId: 7,
        denominator: 25
      },
    ] as any[];

    const result = ExtraDropManager.write(originalNote, newDrops);

    // With centralized NoteNormalizer:
    // - All EOL -> LF
    // - Blank lines collapsed
    // - Trim at both ends
    const expected = [
      '<lore:some>',
      '<other:tag>',
      '<drops:[i,3,15]>',
      '<drops:[a,7,25]>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('round-trips read -> write with letter normalization (i/w/a) and newline cleanup', () =>
  {
    const noteWithVariedTags = [
      '<drops:[item,10,5]>',  // word form
      '<drops:[weapon,3,7]>', // word form
      '<drops:[A,2,30]>',     // letter, uppercase
      '',
    ].join('\n');

    const parsed = ExtraDropManager.read(noteWithVariedTags);

    // Write these onto a clean note that has some other content and extra spacing
    const targetNote = 'Keep me\n\nAnd me';

    const result = ExtraDropManager.write(targetNote, parsed as any);

    // All letters should be normalized to lowercase i/w/a, in the same order they were read.
    // Also duplicate newlines are collapsed and LF-only output is enforced.
    const expected = [
      'Keep me',
      'And me',
      '<drops:[i,10,5]>',
      '<drops:[w,3,7]>',
      '<drops:[a,2,30]>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});
