import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';

// Helper: minimal KnownParameter-like objects without importing the type
const makeKnownParam = (overrides?: Partial<{
  id: number,
  name: string,
  key: string,
  longParamId: number,
  regex: string,
  formatValue: (f: string) => string,
}>) => ({
  id: 0,
  name: 'Test',
  key: 'atk',
  longParamId: 2,
  ...overrides,
});

describe('GrowthParser.read', () =>
{
  it('reads using default pattern "BuffPlus" when none provided', () =>
  {
    const param = makeKnownParam({ key: 'atk' });
    const note = [
      '<atkBuffPlus:[a.level * 2 + 5]>',
      '<atkBuffPlus:[a.level + 1]>',
    ].join('\n');

    const value = GrowthParser.read(note, param);

    // last match wins via RPGManager.getStringFromNoteByRegex
    expect(value)
      .toBe('a.level + 1');
  });

  it('reads using custom regex override when provided (e.g., Plus)', () =>
  {
    const param = makeKnownParam({
      key: 'exp',
      regex: 'Plus'
    });
    const note = [
      '<expPlus:[a.level * 3]>',
      '<expPlus:[a.level + 10]>',
    ].join('\n');

    const value = GrowthParser.read(note, param);

    expect(value)
      .toBe('a.level + 10');
  });

  it('returns empty string when not found', () =>
  {
    const param = makeKnownParam({ key: 'def' });
    const note = '<atkBuffPlus:[a.level * 2]>';

    const value = GrowthParser.read(note, param);

    expect(value)
      .toBe('');
  });
});

describe('GrowthParser.write', () =>
{
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() =>
  {
    errSpy = vi.spyOn(console, 'error')
      .mockImplementation(() =>
      {
      });
  });

  afterEach(() =>
  {
    errSpy.mockRestore();
  });

  it('adds a new tag when none exist (default pattern)', () =>
  {
    const param = makeKnownParam({ key: 'atk' });
    const original = '<lore:line>';

    const result = GrowthParser.write(original, param, 'a.level * 2 + 5');

    const expected = [
      '<lore:line>',
      '<atkBuffPlus:[a.level * 2 + 5]>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('replaces an existing tag when present (global, last/new single tag remains)', () =>
  {
    const param = makeKnownParam({ key: 'atk' });
    const original = [
      '<lore:first>',
      '<atkBuffPlus:[a.level * 1]>',
      '<lore:second>',
    ].join('\n');

    const result = GrowthParser.write(original, param, 'a.level + 10');

    const expected = [
      '<lore:first>',
      '<atkBuffPlus:[a.level + 10]>',
      '<lore:second>',
    ].join('\n');

    expect(result)
      .toBe(expected);
  });

  it('removes the tag when newFormula is empty and cleans up newlines', () =>
  {
    const param = makeKnownParam({ key: 'atk' });
    const original = [
      '<l1:alpha>\r\n',
      '<atkBuffPlus:[a.level * 3]>\n',
      '\n',
      '<l2:beta>\r\r',
    ].join('');

    const result = GrowthParser.write(original, param, '');

    // With centralized NoteNormalizer:
    // - All EOL -> LF
    // - Blank lines collapsed
    // - Trim at both ends
    const expected = '<l1:alpha>\n<l2:beta>';

    expect(result)
      .toBe(expected);
  });

  it('rejects invalid characters and leaves note unchanged (logs error)', () =>
  {
    const param = makeKnownParam({ key: 'atk' });
    const original = 'Keep me';

    // Contains an invalid character: semicolon
    const bad = 'a.level + 1; alert(1)';

    const result = GrowthParser.write(original, param, bad);

    expect(result)
      .toBe(original);
    expect(errSpy)
      .toHaveBeenCalledTimes(1);
  });

  it('uses knownParam.formatValue when provided to transform the written value', () =>
  {
    const param = makeKnownParam({
      key: 'atk',
      formatValue: (f: string) => `(${f})`,
    });

    const result = GrowthParser.write('', param, 'a.level*2');

    expect(result)
      .toBe('<atkBuffPlus:[(a.level*2)]>');
  });

  it('supports custom regex override when writing (e.g., Plus)', () =>
  {
    const param = makeKnownParam({
      key: 'exp',
      regex: 'Plus'
    });
    const result = GrowthParser.write('', param, 'a.level * 3');

    expect(result)
      .toBe('<expPlus:[a.level * 3]>');
  });
});

describe('GrowthParser.evaluateFormula', () =>
{
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() =>
  {
    errSpy = vi.spyOn(console, 'error')
      .mockImplementation(() =>
      {
      });
  });

  afterEach(() =>
  {
    errSpy.mockRestore();
  });

  it('evaluates against the mock battler object with level', () =>
  {
    const value5 = GrowthParser.evaluateFormula('a.level * 2 + 5', 5);
    const value0 = GrowthParser.evaluateFormula('a.level * 2 + 5', 0);

    expect(value5)
      .toBe(15);
    expect(value0)
      .toBe(5);
  });

  it('returns 0 for invalid or throwing formulas and logs error', () =>
  {
    const bad = 'a.level **';
    const result = GrowthParser.evaluateFormula(bad, 10);

    expect(result)
      .toBe(0);
    expect(errSpy)
      .toHaveBeenCalled();
  });
});

describe('GrowthParser.generateDataPoints', () =>
{
  it('generates values from 0..maxLevel stepping by step', () =>
  {
    const data = GrowthParser.generateDataPoints('a.level + 1', 10, 5);

    expect(data)
      .toEqual([
        {
          level: 0,
          value: 1
        },
        {
          level: 5,
          value: 6
        },
        {
          level: 10,
          value: 11
        },
      ]);
  });

  it('ensures the maxLevel point exists even if not aligned to step', () =>
  {
    const data = GrowthParser.generateDataPoints('a.level', 12, 5);

    // 0,5,10 plus forced 12
    expect(data.map(p => p.level))
      .toEqual([ 0, 5, 10, 12 ]);
    expect(data[3].value)
      .toBe(12);
  });
});
