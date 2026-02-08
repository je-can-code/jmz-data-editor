import {
  describe,
  expect,
  it
} from 'vitest';
import { MaxTpParser } from '@services/parsers/MaxTpParser.ts';

describe('MaxTpParser.read', () =>
{
  it('returns the last <maxTp:N> value across lines', () =>
  {
    const note = [
      '<maxTp: 25>',
      '<maxTp: 50>',
      '<other:tag>',
    ].join('\n');

    const result = MaxTpParser.read(note);

    expect(result)
      .toBe(50);
  });

  it('returns 0 when tag is not present', () =>
  {
    const note = [
      '<l1:alpha>',
      '<l2:beta>',
    ].join('\n');

    const result = MaxTpParser.read(note);

    expect(result)
      .toBe(0);
  });

  it('reads negative values', () =>
  {
    const note = [
      '<maxTp:-25>',
      '<l2:beta>',
    ].join('\n');

    const result = MaxTpParser.read(note);

    expect(result)
      .toBe(-25);
  });

  it('handles mixed CRLF/LF newlines and still returns the last value', () =>
  {
    const note = [
      '<maxTp: 10>\r\n',
      '<maxTp: 20>\n',
      '\n',
      '<maxTp: 35>\r\r',
    ].join('');

    const result = MaxTpParser.read(note);

    expect(result)
      .toBe(35);
  });
});

describe('MaxTpParser.write', () =>
{
  it('adds a new tag at the top when none exist (normalized output)', () =>
  {
    const original = [
      '<lore:alpha>',
      '<desc:beta>',
    ].join('\n');

    const result = MaxTpParser.write(original, 12);

    // Mirrors LevelParser: add at top if absent; LF-only; trimmed.
    const expected = [
      '<maxTp:12>',
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
      '<maxTp: 5>',
      '<lore:second>',
    ].join('\n');

    const result = MaxTpParser.write(original, 33);

    const expected = [
      '<lore:first>',
      '<maxTp:33>',
      '<lore:second>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('removes the tag when maxTp === 0 and normalizes newlines', () =>
  {
    const original = [
      '<a:one>\r\n',
      '<maxTp: 40>\n',
      '\n',
      '<b:two>\r\r',
    ].join('');

    const result = MaxTpParser.write(original, 0);

    const expected = '<a:one>\n<b:two>';

    expect(result)
      .toBe(expected);
  });
});
