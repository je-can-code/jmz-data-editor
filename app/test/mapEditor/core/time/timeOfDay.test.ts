import { describe, expect, it } from 'vitest';
import { clockLabel, hourOf, minuteOf, MINUTES_PER_DAY, onTheClock, timeOfDayAt } from '../../../../src/mapEditor/core/time/timeOfDay.ts';

/*
 * A time of day is a whole number of minutes past midnight, 0 to 1439, which is what the window's clock holds and what
 * every map view reads its sky at. Anything handed to the clock is brought onto its face to the nearest minute: a time
 * past the end of the day comes round from midnight, and one before midnight runs back from the end of the day, so the
 * clock never holds a time no day has. A time reads as the hour it falls in, which is what the sky changes with, and is
 * worded as the game's own clock words it, on a 24-hour face with two digits each.
 */
describe('timeOfDay', () =>
{
  describe('onTheClock', () =>
  {
    it('keeps a time the day holds as it is, at both ends of the day', () =>
    {
      // Arrange: midnight, 14:00 and a minute before midnight.
      const times = [ 0, 840, 1439 ];

      // Act.
      const onClock = times.map(onTheClock);

      // Assert.
      expect(onClock)
        .toStrictEqual([ 0, 840, 1439 ]);
    });

    it('brings a time past the end of the day round from midnight', () =>
    {
      // Arrange: midnight a day on, and 01:00 two days on.
      const times = [ 1440, (2 * 1440) + 60 ];

      // Act.
      const onClock = times.map(onTheClock);

      // Assert.
      expect(onClock)
        .toStrictEqual([ 0, 60 ]);
    });

    it('runs a time before midnight back from the end of the day', () =>
    {
      // Arrange: a minute before midnight, and an hour before it.
      const times = [ -1, -60 ];

      // Act.
      const onClock = times.map(onTheClock);

      // Assert.
      expect(onClock)
        .toStrictEqual([ 1439, 1380 ]);
    });

    it('rounds a time to the nearest whole minute', () =>
    {
      // Arrange.
      const times = [ 840.4, 840.6 ];

      // Act.
      const onClock = times.map(onTheClock);

      // Assert.
      expect(onClock)
        .toStrictEqual([ 840, 841 ]);
    });
  });

  describe('timeOfDayAt', () =>
  {
    it('counts the minutes past midnight of an hour and a minute', () =>
    {
      // Arrange: 14:00 and 23:59.
      const times: [ number, number ][] = [ [ 14, 0 ], [ 23, 59 ] ];

      // Act.
      const minutes = times.map(([ hours, past ]) => timeOfDayAt(hours, past));

      // Assert.
      expect(minutes)
        .toStrictEqual([ 840, MINUTES_PER_DAY - 1 ]);
    });
  });

  describe('hourOf', () =>
  {
    it('reads the hour a time falls in, a minute before the next hour still in its own', () =>
    {
      // Arrange: 14:00, 14:59 and 15:00.
      const times = [ 840, 899, 900 ];

      // Act.
      const hours = times.map(hourOf);

      // Assert.
      expect(hours)
        .toStrictEqual([ 14, 14, 15 ]);
    });
  });

  describe('minuteOf', () =>
  {
    it('reads the minute past the hour', () =>
    {
      // Arrange: 14:00 and 14:59.
      const times = [ 840, 899 ];

      // Act.
      const minutes = times.map(minuteOf);

      // Assert.
      expect(minutes)
        .toStrictEqual([ 0, 59 ]);
    });
  });

  describe('clockLabel', () =>
  {
    it('words a time with two digits for the hour and two for the minute', () =>
    {
      // Arrange: midnight, half past two, 14:00 and a minute before midnight.
      const times = [ 0, 150, 840, 1439 ];

      // Act.
      const labels = times.map(clockLabel);

      // Assert.
      expect(labels)
        .toStrictEqual([ '00:00', '02:30', '14:00', '23:59' ]);
    });
  });
});
