import { describe, expect, it } from 'vitest';
import JsonMapper from '@mappers/JsonMapper.ts';

// The class under test implements three main entry points:
// - parseString
// - parseArrayFromString
// - parseObject

describe('JsonMapper.parseString', () =>
{
  it('parses booleans case-insensitively', () =>
  {
    expect(JsonMapper.parseString('true'))
      .toBe(true);
    expect(JsonMapper.parseString('True'))
      .toBe(true);
    expect(JsonMapper.parseString('FALSE'))
      .toBe(false);
  });

  it('parses numbers (int and float)', () =>
  {
    expect(JsonMapper.parseString('0'))
      .toBe(0);
    expect(JsonMapper.parseString('007'))
      .toBe(7);
    expect(JsonMapper.parseString('3.14'))
      .toBeCloseTo(3.14, 5);
  });

  it('falls back to string when not boolean or number', () =>
  {
    expect(JsonMapper.parseString('hello'))
      .toBe('hello');
  });
});

describe('JsonMapper.parseArrayFromString', () =>
{
  it('parses a flat array of numbers', () =>
  {
    const input = '[1, 2, 3]';
    const result = JsonMapper.parseArrayFromString(input) as unknown as any[];

    expect(result)
      .toEqual([ 1, 2, 3 ]);
    expect(result.every(v => typeof v === 'number'))
      .toBe(true);
  });

  it('parses a flat array of mixed types (booleans and numbers)', () =>
  {
    const input = '[true,false,7]';
    const result = JsonMapper.parseArrayFromString(input) as unknown as any[];

    expect(result)
      .toEqual([ true, false, 7 ]);
  });

  it('parses a single nested array within the array', () =>
  {
    const input = '[1,[2,3],false]';
    const result = JsonMapper.parseArrayFromString(input) as unknown as any[];

    expect(result)
      .toEqual([ 1, [ 2, 3 ], false ]);
  });
});

describe('JsonMapper.parseObject', () =>
{
  it('returns null for null or undefined input', () =>
  {
    expect(JsonMapper.parseObject(null))
      .toBeNull();
    expect(JsonMapper.parseObject(undefined))
      .toBeNull();
  });

  it('parses stringified arrays like "[1, 2, 3]"', () =>
  {
    const result = JsonMapper.parseObject('[1, 2, 3]');

    expect(result)
      .toEqual([ 1, 2, 3 ]);
  });

  it('parses nested array content when given as a string', () =>
  {
    const result = JsonMapper.parseObject('[1,[2,3],false]');

    expect(result)
      .toEqual([ 1, [ 2, 3 ], false ]);
  });

  it('parses an in-memory array recursively', () =>
  {
    // Mix of string-represented values and already-typed values
    const input = [ '1', 'false', '3.5', true, 9 ];
    const result = JsonMapper.parseObject(input);

    expect(result)
      .toEqual([ 1, false, 3.5, true, 9 ]);
  });

  it('passes through numbers, booleans, and objects as-is', () =>
  {
    expect(JsonMapper.parseObject(42))
      .toBe(42);
    expect(JsonMapper.parseObject(false))
      .toBe(false);

    const obj = {
      a: 1,
      b: 'two'
    };
    expect(JsonMapper.parseObject(obj))
      .toBe(obj);
  });

  it('treats non-array strings as possible booleans or numbers, else raw string', () =>
  {
    expect(JsonMapper.parseObject('true'))
      .toBe(true);
    expect(JsonMapper.parseObject('2.25'))
      .toBeCloseTo(2.25, 5);
    expect(JsonMapper.parseObject('hello'))
      .toBe('hello');
  });
});
