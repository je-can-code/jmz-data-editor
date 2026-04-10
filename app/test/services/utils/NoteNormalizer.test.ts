import { describe, expect, it } from 'vitest';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

describe('NoteNormalizer.normalize', () =>
{
  it('converts CRLF/CR to LF, collapses multiple blank lines, and trims ends', () =>
  {
    const input = [
      ' Alpha \t\r\n',   // trailing spaces before CRLF
      '\r\n',            // blank CRLF
      '\n\n',            // multiple LFs
      'Beta\r',          // CR only
      '\n',
      '\r\n',
      '  Gamma  ',        // spaces around content
      '\n\n\n',
    ].join('');

    const result = NoteNormalizer.normalize(input);

    // Expect: LF-only, single blank collapse, overall trimmed. Internal spaces on lines are preserved.
    const expected = [
      'Alpha \t',
      'Beta',
      '  Gamma',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('handles empty or purely whitespace input by returning an empty string', () =>
  {
    expect(NoteNormalizer.normalize(''))
      .toBe('');
    expect(NoteNormalizer.normalize('\r\n\n\r\n'))
      .toBe('');
    expect(NoteNormalizer.normalize('   \n  \r  '))
      .toBe('');
  });
});

describe('NoteNormalizer.removeLinesMatching', () =>
{
  it('removes lines matching a non-global regex and normalizes output', () =>
  {
    const input = [
      '<keep:one>\r\n',
      '<drop:this>\n',
      '\n',
      '<keep:two>\r\r',
    ].join('');

    const regex = /<drop:this>/i; // non-global

    const result = NoteNormalizer.removeLinesMatching(input, regex);

    const expected = [
      '<keep:one>',
      '<keep:two>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('removes all matching lines even with a global regex (lastIndex safe) and normalizes', () =>
  {
    const input = [
      '<x:1>\n',
      '<keep>A</keep>\n',
      '<x:2>\n',
      '<x:3>\n',
      '<keep>B</keep>\n',
    ].join('');

    const globalRegex = /<x:\d+>/g; // global regex

    const result = NoteNormalizer.removeLinesMatching(input, globalRegex);

    const expected = [
      '<keep>A</keep>',
      '<keep>B</keep>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('returns normalized input when nothing matches (also removing excessive blanks)', () =>
  {
    const input = [
      '<a:one>\r\n',
      '\r\n',
      '<b:two>\n',
      '\n\n',
    ].join('');

    const regex = /<not-here>/i;

    const result = NoteNormalizer.removeLinesMatching(input, regex);

    const expected = [
      '<a:one>',
      '<b:two>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});

describe('NoteNormalizer.appendBlock', () =>
{
  it('appends a normalized block with exactly one separator newline', () =>
  {
    const base = [
      '<top:keep>\r\n',
      '\n',
      '<bottom:keep>\r\r',
    ].join('');

    const block = [
      '\n',
      '<new:one>\r\n',
      '<new:two>\n\n',
    ].join('');

    const result = NoteNormalizer.appendBlock(base, block);

    const expected = [
      '<top:keep>',
      '<bottom:keep>',
      '<new:one>',
      '<new:two>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('returns normalized base when block is empty/whitespace', () =>
  {
    const base = '<keep:only>\r\n\n';
    const block = '  \r\n  ';

    const result = NoteNormalizer.appendBlock(base, block);

    expect(result)
      .toBe('<keep:only>');
  });

  it('returns normalized block when base is empty/whitespace', () =>
  {
    const base = '  \n\r  ';
    const block = '<fresh:block>\r\n\n';

    const result = NoteNormalizer.appendBlock(base, block);

    expect(result)
      .toBe('<fresh:block>');
  });
});

describe('NoteNormalizer.prependBlock', () =>
{
  it('prepends a normalized block at the top with exactly one separator newline', () =>
  {
    const base = [
      '<lore:alpha>\r\n',
      '\n',
      '<desc:beta>\r\r',
    ].join('');

    const block = [
      '\n\n',
      '<level:10>\r',
    ].join('');

    const result = NoteNormalizer.prependBlock(base, block);

    const expected = [
      '<level:10>',
      '<lore:alpha>',
      '<desc:beta>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('returns normalized base when block is empty/whitespace', () =>
  {
    const base = '<keep:me>\n\n';
    const block = '  ';

    const result = NoteNormalizer.prependBlock(base, block);

    expect(result)
      .toBe('<keep:me>');
  });
});

describe('NoteNormalizer.replaceOrAppendInline', () =>
{
  it('replaces the first matching line inline (non-global regex) and normalizes', () =>
  {
    const base = [
      '<l1:alpha>',
      '<tag: 1>',
      '<l2:beta>',
    ].join('\n');

    const regex = /<tag: ?\d+>/i; // non-global
    const newTag = '<tag: 10>';

    const result = NoteNormalizer.replaceOrAppendInline(base, regex, newTag);

    const expected = [
      '<l1:alpha>',
      '<tag: 10>',
      '<l2:beta>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('replaces only the first occurrence when multiple match (global regex, lastIndex safe)', () =>
  {
    const base = [
      '<tag: 1>',
      '<middle:keep>',
      '<tag: 2>',
    ].join('\n');

    const globalRegex = /<tag: ?\d+>/g; // global
    const newTag = '<tag: 99>';

    const result = NoteNormalizer.replaceOrAppendInline(base, globalRegex, newTag);

    const expected = [
      '<tag: 99>',
      '<middle:keep>',
      '<tag: 2>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('appends at the end when no matching line is found (normalized)', () =>
  {
    const base = [
      '<a:one>\r\n',
      '\n',
      '<b:two>\r',
    ].join('');

    const regex = /<missing:tag>/i;
    const newTag = '<missing:tag>';

    const result = NoteNormalizer.replaceOrAppendInline(base, regex, newTag);

    const expected = [
      '<a:one>',
      '<b:two>',
      '<missing:tag>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});
