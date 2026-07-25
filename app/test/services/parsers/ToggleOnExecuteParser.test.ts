import { describe, expect, it } from 'vitest';
import { ToggleOnExecuteParser } from '@services/parsers/ToggleOnExecuteParser.ts';

describe('ToggleOnExecuteParser.read', () =>
{
  it('returns [] when no toggleOnExecute tags exist', () =>
  {
    const note = 'Line A\n<other:[1,2,3]>\nLine B';

    expect(ToggleOnExecuteParser.read(note))
      .toEqual([]);
  });

  it('parses multiple tags in first-seen order, deduped', () =>
  {
    const note = [
      '<toggleOnExecute:12>',
      '<toggleOnExecute:13>',
      '<toggleOnExecute:12>',
    ].join('\n');

    expect(ToggleOnExecuteParser.read(note))
      .toEqual([ 12, 13 ]);
  });

  it('ignores non-positive or malformed ids', () =>
  {
    const note = [
      '<toggleOnExecute:0>',
      '<toggleOnExecute:5>',
    ].join('\n');

    expect(ToggleOnExecuteParser.read(note))
      .toEqual([ 5 ]);
  });
});

describe('ToggleOnExecuteParser.write', () =>
{
  it('writes one tag per id, deduped, preserving order', () =>
  {
    const result = ToggleOnExecuteParser.write('', [ 12, 13, 12 ]);

    expect(result)
      .toBe([
        '<toggleOnExecute:12>',
        '<toggleOnExecute:13>',
      ].join('\n'));
  });

  it('drops non-positive ids and removes existing tags while preserving unrelated lines', () =>
  {
    const originalNote = [
      '<lore:some>',
      '<toggleOnExecute:12>',
      '<other:tag>',
    ].join('\n');

    const result = ToggleOnExecuteParser.write(originalNote, [ 0, -1 ]);

    expect(result)
      .toBe([
        '<lore:some>',
        '<other:tag>',
      ].join('\n'));
  });

  it('round-trips read -> write', () =>
  {
    const note = [
      '<toggleOnExecute:4>',
      '<toggleOnExecute:9>',
    ].join('\n');

    const parsed = ToggleOnExecuteParser.read(note);
    const result = ToggleOnExecuteParser.write('Keep me', parsed);

    expect(result)
      .toBe([
        'Keep me',
        '<toggleOnExecute:4>',
        '<toggleOnExecute:9>',
      ].join('\n'));
  });
});
