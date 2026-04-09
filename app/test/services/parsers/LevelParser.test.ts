import { describe, expect, it } from 'vitest';
import { LevelParser } from '@services/parsers/LevelParser.ts';

describe('LevelParser.read', () =>
{
  it('returns the last <level:N> value across lines', () =>
  {
    const enemy: any = {
      note: [
        '<level: 3>',
        '<level: 8>',
        '<other:tag>',
      ].join('\n')
    };

    const result = LevelParser.read(enemy);

    expect(result)
      .toBe(8);
  });

  it('returns 0 when no level tag is present', () =>
  {
    const enemy: any = {
      note: [
        '<lore:alpha>',
        '<desc:beta>',
      ].join('\n')
    };

    const result = LevelParser.read(enemy);

    expect(result)
      .toBe(0);
  });

  it('handles mixed CRLF/LF newlines and still returns the last value', () =>
  {
    const enemy: any = {
      note: [
        '<level: 2>\r\n',
        '<level: 4>\n',
        '\n',
        '<level: 7>\r\r',
      ].join('')
    };

    const result = LevelParser.read(enemy);

    expect(result)
      .toBe(7);
  });
});

describe('LevelParser.write', () =>
{
  it('adds a new tag at the top when none exist (normalized output)', () =>
  {
    const original = [
      '<lore:alpha>',
      '<desc:beta>',
    ].join('\n');

    const result = LevelParser.write(original, 12);

    // Adds at top when absent; LF-only; trimmed
    const expected = [
      '<level:12>',
      '<lore:alpha>',
      '<desc:beta>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('replaces an existing tag inline when present and preserves surrounding lines', () =>
  {
    const original = [
      '<lore:first>',
      '<level: 5>',
      '<lore:second>',
    ].join('\n');

    const result = LevelParser.write(original, 10);

    const expected = [
      '<lore:first>',
      '<level:10>',
      '<lore:second>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('removes the tag when level <= 0 and normalizes newlines', () =>
  {
    const original = [
      '<l1:alpha>\r\n',
      '<level: 7>\n',
      '\n',
      '<l2:beta>\r\r',
    ].join('');

    const result = LevelParser.write(original, 0);

    // NoteNormalizer => LF-only, collapse blanks, trimmed
    const expected = '<l1:alpha>\n<l2:beta>';

    expect(result)
      .toBe(expected);
  });

  it('removes the tag when level is negative (<= 0) and normalizes newlines', () =>
  {
    const original = [
      '<a:one>\n',
      '<level: 9>\n',
      '<b:two>\n',
      '\n',
    ].join('');

    const result = LevelParser.write(original, -1);

    const expected = [
      '<a:one>',
      '<b:two>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});
