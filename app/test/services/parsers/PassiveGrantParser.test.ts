import { describe, expect, it } from 'vitest';
import { PassiveGrantParser } from '@services/parsers/PassiveGrantParser.ts';

describe('PassiveGrantParser reads', () =>
{
  it('returns [] for both tags when absent', () =>
  {
    const note = 'Line A\n<other:[1,2,3]>\nLine B';

    expect(PassiveGrantParser.readPassiveStateIds(note))
      .toEqual([]);
    expect(PassiveGrantParser.readUniquePassiveStateIds(note))
      .toEqual([]);
  });

  it('parses passive and uniquePassive independently, deduped in first-seen order', () =>
  {
    const note = [
      '<passive:[10,11,10]>',
      '<uniquePassive:[12]>',
    ].join('\n');

    expect(PassiveGrantParser.readPassiveStateIds(note))
      .toEqual([ 10, 11 ]);
    expect(PassiveGrantParser.readUniquePassiveStateIds(note))
      .toEqual([ 12 ]);
  });

  it('flattens multiple passive tag lines together', () =>
  {
    const note = [
      '<passive:[10,11]>',
      '<passive:[12]>',
    ].join('\n');

    expect(PassiveGrantParser.readPassiveStateIds(note))
      .toEqual([ 10, 11, 12 ]);
  });
});

describe('PassiveGrantParser.write', () =>
{
  it('writes only tags with at least one id', () =>
  {
    const result = PassiveGrantParser.write('', [ 10, 11 ], []);

    expect(result)
      .toBe('<passive:[10,11]>');
  });

  it('writes both tags when both have ids, drops non-positive/duplicate ids', () =>
  {
    const result = PassiveGrantParser.write('', [ 10, 0, 10 ], [ 12 ]);

    expect(result)
      .toBe([
        '<passive:[10]>',
        '<uniquePassive:[12]>',
      ].join('\n'));
  });

  it('removes existing tags and preserves unrelated lines', () =>
  {
    const originalNote = [
      '<lore:some>',
      '<passive:[10]>',
      '<uniquePassive:[12]>',
      '<other:tag>',
    ].join('\n');

    const result = PassiveGrantParser.write(originalNote, [], []);

    expect(result)
      .toBe([
        '<lore:some>',
        '<other:tag>',
      ].join('\n'));
  });

  it('round-trips read -> write', () =>
  {
    const note = [
      '<passive:[10,11]>',
      '<uniquePassive:[12]>',
      'Keep me',
    ].join('\n');

    const passiveIds = PassiveGrantParser.readPassiveStateIds(note);
    const uniqueIds = PassiveGrantParser.readUniquePassiveStateIds(note);
    const result = PassiveGrantParser.write('Keep me', passiveIds, uniqueIds);

    expect(result)
      .toBe([
        '<passive:[10,11]>',
        '<uniquePassive:[12]>',
        'Keep me',
      ].join('\n'));
  });
});
