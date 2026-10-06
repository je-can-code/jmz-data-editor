import { describe, expect, it } from 'vitest';
import {
  instantOf,
  instantOfPoint,
  instantOfSnapshot,
  seasonOfMonth,
  snapshotAt,
  UNKNOWN_SEASON,
} from '../../../../src/mapEditor/modules/time/timeSnapshot.ts';

/*
 * The moment J-TIME judges a page at: the window's clock gives the hour and the minute, the game's starting date gives
 * the second, the day, the month and the year, and the part of the day and the season follow from those, as the plugin
 * derives them: six four-hour parts from Moontide, and Spring from March, Summer from June, Autumn from September and
 * Winter from December, with no season for a month off the calendar. Moments are compared on one timeline that reads a
 * date the way the game's Date does: months counted from 1, a day past a month's end running into the next month, and a
 * year under 100 read as 1900 and on.
 */
describe('timeSnapshot', () =>
{
  describe('seasonOfMonth', () =>
  {
    it('finds the season each month falls in, and none for a month off the calendar', () =>
    {
      // Arrange: the first and last month of each season, and 13.
      const months = [ 3, 5, 6, 8, 9, 11, 12, 2, 13 ];

      // Act.
      const seasons = months.map(seasonOfMonth);

      // Assert.
      expect(seasons)
        .toStrictEqual([ 0, 0, 1, 1, 2, 2, 3, 3, UNKNOWN_SEASON ]);
    });
  });

  describe('snapshotAt', () =>
  {
    it('takes the hour and minute from the clock and everything else from the start', () =>
    {
      // Arrange: 22:45 on Chef Adventure's starting date, at second 30.
      const start = { seconds: 30, days: 16, months: 12, years: 2026 };

      // Act.
      const snapshot = snapshotAt(start, 22 * 60 + 45);

      // Assert.
      expect(snapshot)
        .toStrictEqual({ seconds: 30, minutes: 45, hours: 22, days: 16, months: 12, years: 2026, timeOfDay: 5, seasonOfYear: 3 });
    });
  });

  describe('instants', () =>
  {
    it('places a snapshot and a point seconds first on the same timeline as the date they name', () =>
    {
      // Arrange: 18:00:30 on the 16th of December 2026, both ways.
      const snapshot = snapshotAt({ seconds: 30, days: 16, months: 12, years: 2026 }, 18 * 60);

      // Act.
      const placed = [ instantOfSnapshot(snapshot), instantOfPoint([ 30, 0, 18, 16, 12, 2026 ]) ];

      // Assert.
      expect(placed)
        .toStrictEqual([ Date.UTC(2026, 11, 16, 18, 0, 30), Date.UTC(2026, 11, 16, 18, 0, 30) ]);
    });

    it('runs a day past its month\'s end into the next month, and reads a year under 100 as 1900 and on', () =>
    {
      // Arrange: the 31st of April 2026, and the 1st of January of the year 26.

      // Act.
      const placed = [ instantOf(2026, 4, 31, 0, 0, 0), instantOf(26, 1, 1, 0, 0, 0) ];

      // Assert.
      expect(placed.map(time => new Date(time).toISOString()))
        .toStrictEqual([ '2026-05-01T00:00:00.000Z', '1926-01-01T00:00:00.000Z' ]);
    });
  });
});
