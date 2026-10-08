import { describe, expect, it } from 'vitest';
import {
  isSettlingDay,
  phaseOfSkyDay,
  settlingMonths,
  SKY_OFF_CLOCK,
  skyDayOfMonthOf,
  skyMonthOf,
  skyPhaseOf,
  skySeasonOf,
} from '../../../../src/mapEditor/modules/weather/skyCalendar.ts';

/*
 * J-Weather-Time reads the sky by one count of phases, six to a day of thirty-day months, and the season a face follows
 * is the season of the month that count lands in (SkyForecast). The editor counts exactly as the plugin counts, or a
 * clear night would wear the wrong face: a date's day of the year is the thirty days of each month before it and the
 * day itself, so a day past the thirtieth runs into the next month and the 0th into the month before, as they do in the
 * plugin; an hour off the clock has no phase at all. Seasons do not sit on the calendar's quarters: Winter is December,
 * January and February. A season's last day, the thirtieth of May, August, November and February, is the day the sky
 * settles toward its neutral condition, and no other day is.
 */
describe('skyCalendar', () =>
{
  describe('skyPhaseOf', () =>
  {
    it('counts a date and a phase of its day as the plugin counts them', () =>
    {
      // Arrange: a new Chef Adventure game's date, December 16, 2026, at night, and the first phase of year 0.

      // Act.
      const phases = [ skyPhaseOf(2026, 12, 16, 5), skyPhaseOf(0, 1, 1, 0) ];

      // Assert: 2026 years of 360 days, 345 days into the year, six phases a day, the sixth phase.
      expect(phases)
        .toStrictEqual([ 4378235, 0 ]);
    });

    it('gives an hour off the clock no phase', () =>
    {
      // Arrange: the phase J-TIME gives an hour off the clock.

      // Act.
      const phase = skyPhaseOf(2026, 12, 16, SKY_OFF_CLOCK);

      // Assert.
      expect(phase)
        .toBe(-1);
    });
  });

  describe('reading a phase back', () =>
  {
    it('reads back the month, the day and the phase of the day a date was counted from', () =>
    {
      // Arrange: June 16, 2027 at 14:00, and February 30, 2027 at midnight, the last day of a thirty-day February.
      const phases = [ skyPhaseOf(2027, 6, 16, 3), skyPhaseOf(2027, 2, 30, 0) ];

      // Act.
      const read = phases.map(phase => [ skyMonthOf(phase), skyDayOfMonthOf(phase), phaseOfSkyDay(phase) ]);

      // Assert.
      expect(read)
        .toStrictEqual([ [ 6, 16, 3 ], [ 2, 30, 0 ] ]);
    });

    it('runs a day past the thirtieth into the next month, the 0th into the month before, and the year\'s end into the next', () =>
    {
      // Arrange: May 31, March 0 and December 31.
      const phases = [ skyPhaseOf(2027, 5, 31, 0), skyPhaseOf(2027, 3, 0, 0), skyPhaseOf(2026, 12, 31, 0) ];

      // Act.
      const read = phases.map(phase => [ skyMonthOf(phase), skyDayOfMonthOf(phase), skySeasonOf(phase) ]);

      // Assert: June 1 in Summer, February 30 in Winter, and January 1 in Winter.
      expect(read)
        .toStrictEqual([ [ 6, 1, 1 ], [ 2, 30, 3 ], [ 1, 1, 3 ] ]);
    });
  });

  describe('skySeasonOf', () =>
  {
    it('finds each season by its month, on each side of every handover', () =>
    {
      // Arrange: the 30th of each season's last month, and the 1st of the next season's first.
      const dates = [ [ 2, 30 ], [ 3, 1 ], [ 5, 30 ], [ 6, 1 ], [ 8, 30 ], [ 9, 1 ], [ 11, 30 ], [ 12, 1 ] ];

      // Act.
      const seasons = dates.map(([ month, day ]) => skySeasonOf(skyPhaseOf(2027, month, day, 2)));

      // Assert.
      expect(seasons)
        .toStrictEqual([ 3, 0, 0, 1, 1, 2, 2, 3 ]);
    });
  });

  describe('settlingMonths', () =>
  {
    it('lists each season\'s last month, not the calendar\'s quarters', () =>
    {
      // Arrange: the seasons as the plugin lists their months.

      // Act.
      const months = settlingMonths();

      // Assert.
      expect(months)
        .toStrictEqual([ 5, 8, 11, 2 ]);
    });
  });

  describe('isSettlingDay', () =>
  {
    it('settles on the thirtieth of each season\'s last month, at every hour of it', () =>
    {
      // Arrange: May, August, November and February 30th, at midnight and at night.
      const dates = [ [ 5, 0 ], [ 8, 5 ], [ 11, 0 ], [ 2, 5 ] ];

      // Act.
      const settling = dates.map(([ month, phaseId ]) => isSettlingDay(skyPhaseOf(2027, month, 30, phaseId)));

      // Assert.
      expect(settling)
        .toStrictEqual([ true, true, true, true ]);
    });

    it('settles on no day beside one: the 29th, the next month\'s 1st, and the 30th of a month that is not a season\'s last', () =>
    {
      // Arrange: May 29, June 1, April 30, June 30 and December 30, the quarters' ends among them.
      const dates = [ [ 5, 29 ], [ 6, 1 ], [ 4, 30 ], [ 6, 30 ], [ 12, 30 ] ];

      // Act.
      const settling = dates.map(([ month, day ]) => isSettlingDay(skyPhaseOf(2027, month, day, 3)));

      // Assert.
      expect(settling)
        .toStrictEqual([ false, false, false, false, false ]);
    });
  });
});
