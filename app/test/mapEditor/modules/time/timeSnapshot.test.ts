import { describe, expect, it } from 'vitest';
import {
  dateOfSeason,
  instantOf,
  instantOfPoint,
  instantOfSnapshot,
  seasonOfMonth,
  snapshotAt,
  snapshotOfClock,
  UNKNOWN_SEASON,
  type GameDate,
} from '../../../../src/mapEditor/modules/time/timeSnapshot.ts';

/*
 * The moment J-TIME judges a page at: the window's clock gives the hour and the minute, the game's starting date gives
 * the second, the day, the month and the year, and the part of the day and the season follow from those, as the plugin
 * derives them: six four-hour parts from Moontide, and Spring from March, Summer from June, Autumn from September and
 * Winter from December, with no season for a month off the calendar. Moments are compared on one timeline that reads a
 * date the way the game's Date does: months counted from 1, a day past a month's end running into the next month, and a
 * year under 100 read as 1900 and on.
 *
 * The clock's season moves the date. A start already in the season picked stays as it is, and so does a clock with no
 * season picked. Otherwise the date is the start's day in the month the season opens with (March, June, September,
 * December), the first such date after the start, which rolls into the next year once that month has gone by this year;
 * a day past the 30th, which no month of J-TIME's calendar holds, is the 30th. So Chef Adventure's new game, on 16
 * December 2026, is Spring on 16 March 2027, Summer on 16 June 2027 and Autumn on 16 September 2027.
 */
describe('timeSnapshot', () =>
{
  /**
   * Chef Adventure's new game: 16 December 2026, at the top of the minute.
   */
  const START: GameDate = { seconds: 0, days: 16, months: 12, years: 2026 };

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

  describe('dateOfSeason', () =>
  {
    it('keeps the start for the season it already falls in, whichever of the season\'s months it is in, and for no season', () =>
    {
      // Arrange: Chef Adventure's December start in Winter, a January start in Winter, and the December start with no
      // season picked.
      const january: GameDate = { seconds: 0, days: 10, months: 1, years: 2027 };

      // Act.
      const dates = [ dateOfSeason(START, 3), dateOfSeason(january, 3), dateOfSeason(START, null) ];

      // Assert: nothing moved.
      expect(dates)
        .toStrictEqual([ START, january, START ]);
    });

    it('moves a start in another season to its day in the month that season opens with, later that same year', () =>
    {
      // Arrange: J-TIME's own default start, 29 May 2021, in Spring.
      const may: GameDate = { seconds: 0, days: 29, months: 5, years: 2021 };

      // Act: Summer, Autumn and Winter.
      const dates = [ 1, 2, 3 ].map(season => dateOfSeason(may, season));

      // Assert.
      expect(dates)
        .toStrictEqual([
          { seconds: 0, days: 29, months: 6, years: 2021 },
          { seconds: 0, days: 29, months: 9, years: 2021 },
          { seconds: 0, days: 29, months: 12, years: 2021 },
        ]);
    });

    it('rolls into the next year for a season whose opening month has gone by, and not for one still to come', () =>
    {
      // Arrange: Chef Adventure's start, 16 December 2026; and an October start, with Winter's December still to come.
      const october: GameDate = { seconds: 0, days: 5, months: 10, years: 2026 };

      // Act: Spring, Summer and Autumn from December; Summer and Winter from October.
      const dates = [ ...[ 0, 1, 2 ].map(season => dateOfSeason(START, season)), dateOfSeason(october, 1), dateOfSeason(october, 3) ];

      // Assert.
      expect(dates)
        .toStrictEqual([
          { seconds: 0, days: 16, months: 3, years: 2027 },
          { seconds: 0, days: 16, months: 6, years: 2027 },
          { seconds: 0, days: 16, months: 9, years: 2027 },
          { seconds: 0, days: 5, months: 6, years: 2027 },
          { seconds: 0, days: 5, months: 12, years: 2026 },
        ]);
    });

    it('brings a day past the 30th back to the 30th, which every month of J-TIME\'s calendar ends on, and keeps the 30th', () =>
    {
      // Arrange: starts in January on the 31st, a 45th written into the plugin's parameters, and the 30th.
      const days = [ 31, 45, 30 ];

      // Act: each moved to Spring.
      const moved = days.map(day => dateOfSeason({ seconds: 0, days: day, months: 1, years: 2027 }, 0).days);

      // Assert.
      expect(moved)
        .toStrictEqual([ 30, 30, 30 ]);
    });

    it('keeps the start\'s second, and leaves the start as it is for a season J-TIME does not number', () =>
    {
      // Arrange: a start at second 30.
      const start: GameDate = { ...START, seconds: 30 };

      // Act: Summer, then seasons below and past the four.
      const dates = [ dateOfSeason(start, 1), dateOfSeason(start, -1), dateOfSeason(start, 4) ];

      // Assert.
      expect(dates)
        .toStrictEqual([ { seconds: 30, days: 16, months: 6, years: 2027 }, start, start ]);
    });
  });

  describe('snapshotOfClock', () =>
  {
    it('builds the moment at the clock\'s time on the date its season moves the start to, in that season', () =>
    {
      // Arrange: 22:45 with Summer picked, and with no season picked.

      // Act.
      const moments = [ snapshotOfClock(START, 22 * 60 + 45, 1), snapshotOfClock(START, 22 * 60 + 45, null) ];

      // Assert.
      expect(moments)
        .toStrictEqual([
          { seconds: 0, minutes: 45, hours: 22, days: 16, months: 6, years: 2027, timeOfDay: 5, seasonOfYear: 1 },
          { seconds: 0, minutes: 45, hours: 22, days: 16, months: 12, years: 2026, timeOfDay: 5, seasonOfYear: 3 },
        ]);
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
