import { describe, expect, it } from 'vitest';
import { StealParser } from '@services/parsers/StealParser.ts';

describe('StealParser.read', () =>
{
  it('defaults all rates to 0 when no tags exist', () =>
  {
    const note = 'Line A\n<other:[1,2,3]>\nLine B';

    expect(StealParser.read(note))
      .toEqual({ lst: 0, mst: 0, tst: 0 });
  });

  it('parses all three tags independently', () =>
  {
    const note = [
      '<lst:5>',
      '<mst:10>',
      '<tst:-3>',
    ].join('\n');

    expect(StealParser.read(note))
      .toEqual({ lst: 5, mst: 10, tst: -3 });
  });

  it('takes the last matching line when a tag repeats within one note', () =>
  {
    const note = [
      '<lst:5>',
      '<lst:3>',
    ].join('\n');

    expect(StealParser.read(note))
      .toEqual({ lst: 3, mst: 0, tst: 0 });
  });
});

describe('StealParser.write', () =>
{
  it('omits tags whose rate is 0', () =>
  {
    const result = StealParser.write('', { lst: 0, mst: 0, tst: 0 });

    expect(result)
      .toBe('');
  });

  it('writes only the non-zero tags in lst/mst/tst order, truncating fractional input', () =>
  {
    const result = StealParser.write('', { lst: 5.9, mst: 0, tst: -3 });

    expect(result)
      .toBe([
        '<lst:5>',
        '<tst:-3>',
      ].join('\n'));
  });

  it('removes existing tags and appends fresh ones, dropping any zeroed-out rate', () =>
  {
    const originalNote = [
      '<lore:some>',
      '<lst:5>',
      '<mst:10>',
      '<other:tag>',
    ].join('\n');

    const result = StealParser.write(originalNote, { lst: 7, mst: 0, tst: 0 });

    expect(result)
      .toBe([
        '<lore:some>',
        '<other:tag>',
        '<lst:7>',
      ].join('\n'));
  });

  it('round-trips read -> write', () =>
  {
    const note = [
      '<lst:5>',
      '<mst:-2>',
      '<tst:1>',
    ].join('\n');

    const parsed = StealParser.read(note);
    const result = StealParser.write('Keep me', parsed);

    expect(result)
      .toBe([
        'Keep me',
        '<lst:5>',
        '<mst:-2>',
        '<tst:1>',
      ].join('\n'));
  });
});
