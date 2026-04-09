import { describe, expect, it } from 'vitest';
import { SdpParser } from '@services/parsers/SdpParser.ts';

describe('SdpParser.readDrop', () =>
{
  it('parses <sdpDropData: [key,25]> into object', () =>
  {
    const note = [
      '<lore:alpha>',
      '<sdpDropData: [my_key,25]>',
      '<desc:beta>',
    ].join('\n');

    const result = SdpParser.readDrop(note);

    expect(result)
      .toEqual({
        key: 'my_key',
        dropChance: 25
      });
  });

  it('returns null when no drop tag exists', () =>
  {
    const note = [
      '<lore:alpha>',
      '<desc:beta>',
    ].join('\n');

    const result = SdpParser.readDrop(note);

    expect(result)
      .toBeNull();
  });

  it('parses even with spaces around comma', () =>
  {
    const note = '<sdpDropData: [k1, 40]>';

    const result = SdpParser.readDrop(note);

    expect(result)
      .toEqual({
        key: 'k1',
        dropChance: 40
      });
  });
});

describe('SdpParser.writeDrop', () =>
{
  it('adds when none exist; removes prior duplicates then appends (normalized)', () =>
  {
    const original = [
      '<a:one>\r\n',
      '<sdpDropData:[old,10]>\n',
      '\n',
      '<sdpDropData:[duplicate,99]>\r\r',
      '<b:two>\n',
    ].join('');

    const result = SdpParser.writeDrop(original, {
      key: 'new_key',
      dropChance: 35
    });

    // NoteNormalizer => LF-only, blank lines collapsed, trimmed; single final tag appended
    const expected = [
      '<a:one>',
      '<b:two>',
      '<sdpDropData:[new_key,35]>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('removes the drop tag when key is empty and normalizes', () =>
  {
    const original = [
      '<l1:alpha>',
      '<sdpDropData: [old_key,15]>',
      '<l2:beta>',
      '',
    ].join('\n');

    const result = SdpParser.writeDrop(original, {
      key: '',
      dropChance: 0
    });

    const expected = [
      '<l1:alpha>',
      '<l2:beta>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});

describe('SdpParser.deleteDrop', () =>
{
  it('removes only the drop tag and normalizes', () =>
  {
    const original = [
      '<top:keep>',
      '<sdpDropData: [remove_me,20]>',
      '<bottom:keep>',
      '',
    ].join('\n');

    const result = SdpParser.deleteDrop(original);

    const expected = [
      '<top:keep>',
      '<bottom:keep>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('no-op when there is no drop tag (still normalized)', () =>
  {
    const original = [
      '<top:keep>\r\n',
      '\r\n',
      '<bottom:keep>\r\n',
    ].join('');

    const result = SdpParser.deleteDrop(original);

    const expected = [
      '<top:keep>',
      '<bottom:keep>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});

describe('SdpParser.readPoints', () =>
{
  it('parses positive and negative integer points', () =>
  {
    const notePos = '<sdpPoints: 25>';
    const noteNeg = '<sdpPoints: -15>';

    expect(SdpParser.readPoints(notePos))
      .toBe(25);
    expect(SdpParser.readPoints(noteNeg))
      .toBe(-15);
  });

  it('returns null when not present', () =>
  {
    const note = '<lore:none>';

    expect(SdpParser.readPoints(note))
      .toBeNull();
  });
});

describe('SdpParser.writePoints', () =>
{
  it('writes points after removing any existing points tag (normalized)', () =>
  {
    const original = [
      '<a:one>\r\n',
      '<sdpPoints: 1>\n',
      '\n',
      '<b:two>\r\r',
    ].join('');

    const result = SdpParser.writePoints(original, 42);

    const expected = [
      '<a:one>',
      '<b:two>',
      '<sdpPoints:42>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('adds a points tag when none exist (appended at end)', () =>
  {
    const original = [
      '<x:alpha>',
      '<y:beta>',
    ].join('\n');

    const result = SdpParser.writePoints(original, -7);

    const expected = [
      '<x:alpha>',
      '<y:beta>',
      '<sdpPoints:-7>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });
});
