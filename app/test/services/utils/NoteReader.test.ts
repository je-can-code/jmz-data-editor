import { describe, expect, it } from 'vitest';
import NoteReader from '@services/utils/NoteReader.ts';

describe('NoteReader.getStringFromNoteByRegex', () =>
{
  it('returns the last matching capture across lines', () =>
  {
    const note = `\n<tag: first>\n<tag: second>\n`;
    const regex = /<tag:\s*(.*)>/;

    const result = NoteReader.getStringFromNoteByRegex(note, regex);

    expect(result)
      .toBe('second');
  });

  it('returns empty string when no match and nullIfEmpty=false (default)', () =>
  {
    const note = `\n<other: value>\n`;
    const regex = /<tag:\s*(.*)>/;

    const result = NoteReader.getStringFromNoteByRegex(note, regex);

    expect(result)
      .toBe('');
  });

  it('returns null when no note provided and nullIfEmpty=true', () =>
  {
    const regex = /<tag:\s*(.*)>/;

    // empty note
    const result = NoteReader.getStringFromNoteByRegex('', regex, true);

    expect(result)
      .toBeNull();
  });

  it('returns empty string (or null) for empty capture groups', () =>
  {
    const note = `<tag:>`; // capture is ''
    const regex = /<tag:(.*)>/;

    const def = NoteReader.getStringFromNoteByRegex(note, regex);
    const nul = NoteReader.getStringFromNoteByRegex(note, regex, true);

    expect(def)
      .toBe('');
    expect(nul)
      .toBeNull();
  });
});

describe('RPGManager.getArraysFromNotesByRegex', () =>
{
  it('returns null when nothing matches', () =>
  {
    const note = `\n<other:[1,2]>\n`;
    const regex = /<values:\s*(\[.*])>/;

    const result = NoteReader.getArraysFromNotesByRegex(note, regex);

    expect(result)
      .toBeNull();
  });

  it('returns raw strings when tryParse=false', () =>
  {
    const note = `\n<values:[1, 2, 3]>\n<values:[true,false,7]>\n`;
    const regex = /<values:\s*(\[.*])>/;

    const result = NoteReader.getArraysFromNotesByRegex(note, regex, false);

    expect(result)
      .toEqual([
        '[1, 2, 3]',
        '[true,false,7]',
      ]);
  });

  it('parses arrays (numbers/booleans) when tryParse=true (default)', () =>
  {
    const note = `\n<values:[1, 2, 3]>\n<values:[true,false,7]>\n`;
    const regex = /<values:\s*(\[.*])>/;

    const result = NoteReader.getArraysFromNotesByRegex(note, regex);

    expect(result)
      .toEqual([
        [ 1, 2, 3 ],
        [ true, false, 7 ],
      ]);
  });

  it('parses nested arrays (single inner array) correctly', () =>
  {
    const note = `\n<values:[1,[2,3],false]>\n`;
    const regex = /<values:\s*(\[.*])>/;

    const result = NoteReader.getArraysFromNotesByRegex(note, regex);

    expect(result)
      .toEqual([
        [ 1, [ 2, 3 ], false ],
      ]);
  });
});

describe('RPGManager.getNumberFromNoteByRegex', () =>
{
  it('returns the last numeric match across lines (not a sum)', () =>
  {
    const data: any = {
      note: `\n<rate: 3>\n<rate: 2.5>\n<other: 10>\n`,
    };
    const regex = /<rate:\s*([0-9.]+)>/;

    const result = NoteReader.getNumberFromNoteByRegex(data, regex);

    expect(result)
      .toBe(2.5);
  });

  it('returns 0 when no lines match and nullIfEmpty=false (default)', () =>
  {
    const data: any = { note: `\n<foo:bar>\n` };
    const regex = /<rate:\s*([0-9.]+)>/;

    const result = NoteReader.getNumberFromNoteByRegex(data, regex);

    expect(result)
      .toBe(0);
  });

  it('returns null when no match and nullIfEmpty=true', () =>
  {
    const data: any = { note: `no numbers here` };
    const regex = /<num:\s*([0-9.]+)>/;

    const result = NoteReader.getNumberFromNoteByRegex(data, regex, true);

    expect(result)
      .toBeNull();
  });

  it('returns 0 or null when data is null/undefined based on flag', () =>
  {
    const regex = /<num:\s*([0-9.]+)>/;

    const def = NoteReader.getNumberFromNoteByRegex(undefined as any, regex);
    const nul = NoteReader.getNumberFromNoteByRegex(undefined as any, regex, true);

    expect(def)
      .toBe(0);
    expect(nul)
      .toBeNull();
  });
});
