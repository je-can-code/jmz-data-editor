import { describe, expect, it } from 'vitest';
import { computeBeyondMaxPreview } from '@services/parsers/BeyondMaxLevelPreview.ts';

/**
 * Builds a 100-entry params row (index 0 unused) where level N's value is `f(N)`, matching the shape
 * `RPG_Class.params[paramId]` actually has in Classes.json.
 */
function buildRow(f: (level: number) => number): number[]
{
  const row: number[] = [];
  for (let level = 0; level <= 99; level++)
  {
    row[ level ] = f(level);
  }
  return row;
}

describe('computeBeyondMaxPreview', () =>
{
  it('continues a linear curve exactly (slope is already constant)', () =>
  {
    // value(level) = level * 10 -> delta between any two consecutive levels is always 10.
    const row = buildRow((level) => level * 10);

    const points = computeBeyondMaxPreview(row, 105);

    expect(points.map((p) => p.level))
      .toEqual([ 100, 101, 102, 103, 104, 105 ]);
    // level 99 = 990, +10/level onward.
    expect(points.map((p) => p.value))
      .toEqual([ 1000, 1010, 1020, 1030, 1040, 1050 ]);
  });

  it('flattens a curve whose last 5 levels were deliberately plateaued', () =>
  {
    // ramps up to level 94 (value 940), then holds flat for 94-99 (the deliberate plateau).
    const row = buildRow((level) => (level <= 94 ? level * 10 : 940));

    const points = computeBeyondMaxPreview(row, 102);

    // average of the 5 deltas across levels 94-99 is 0 -> flat continuation forever.
    expect(points.map((p) => p.value))
      .toEqual([ 940, 940, 940 ]);
  });

  it('replaces a quadratic curve with a straight line past 99 (average-of-last-5-deltas, not the formula)', () =>
  {
    const row = buildRow((level) => level * level);

    const points = computeBeyondMaxPreview(row, 101);

    // deltas between levels 94-99 (quadratic): 189,191,193,195,197 -> average 193.
    const level99 = 99 * 99;
    expect(points)
      .toEqual([
        { level: 100, value: level99 + 193 },
        { level: 101, value: level99 + 193 + 193 },
      ]);
  });

  it('caps at 999 even when trueMaxLevel is set higher', () =>
  {
    const row = buildRow((level) => level);

    const points = computeBeyondMaxPreview(row, 5000);

    expect(points[ points.length - 1 ]!.level)
      .toBe(999);
  });

  it('returns an empty array when trueMaxLevel does not exceed 99', () =>
  {
    const row = buildRow((level) => level);

    expect(computeBeyondMaxPreview(row, 99))
      .toEqual([]);
    expect(computeBeyondMaxPreview(row, 50))
      .toEqual([]);
  });

  it('returns an empty array when given fewer than 2 authored values', () =>
  {
    expect(computeBeyondMaxPreview([ 5 ], 200))
      .toEqual([]);
    expect(computeBeyondMaxPreview([], 200))
      .toEqual([]);
  });
});
