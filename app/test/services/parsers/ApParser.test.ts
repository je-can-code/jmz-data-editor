import { describe, expect, it } from 'vitest';
import { ApParser } from '@services/parsers/ApParser.ts';

describe('ApParser.readAp', () =>
{
  it('parses a positive integer ap value', () =>
  {
    const note = '<ap: 5>';

    expect(ApParser.readAp(note))
      .toBe(5);
  });

  it('returns null when not present', () =>
  {
    const note = '<lore:none>';

    expect(ApParser.readAp(note))
      .toBeNull();
  });
});

describe('ApParser.writeAp', () =>
{
  it('writes ap after removing any existing ap tag (normalized)', () =>
  {
    const original = [
      '<a:one>\r\n',
      '<ap: 1>\n',
      '\n',
      '<b:two>\r\r',
    ].join('');

    const result = ApParser.writeAp(original, 3);

    const expected = [
      '<a:one>',
      '<b:two>',
      '<ap:3>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('adds an ap tag when none exist (appended at end)', () =>
  {
    const original = [
      '<x:alpha>',
      '<y:beta>',
    ].join('\n');

    const result = ApParser.writeAp(original, 2);

    const expected = [
      '<x:alpha>',
      '<y:beta>',
      '<ap:2>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});

describe('ApParser.deleteAp', () =>
{
  it('removes only the ap tag and normalizes', () =>
  {
    const original = [
      '<top:keep>',
      '<ap: 4>',
      '<bottom:keep>',
      '',
    ].join('\n');

    const result = ApParser.deleteAp(original);

    const expected = [
      '<top:keep>',
      '<bottom:keep>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('no-op when there is no ap tag (still normalized)', () =>
  {
    const original = [
      '<top:keep>\r\n',
      '\r\n',
      '<bottom:keep>\r\n',
    ].join('');

    const result = ApParser.deleteAp(original);

    const expected = [
      '<top:keep>',
      '<bottom:keep>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});
