import { describe, expect, it } from 'vitest';
import { isClockHour, partOfDay, phaseOfHour, UNKNOWN_PHASE } from '../../../../src/mapEditor/modules/time/timePhases.ts';

/*
 * The day is divided as J-TIME divides it (TimePhases): six phases of four hours, so the phase is how many of them fit
 * beneath the hour, and an hour that is not a whole number from 0 to 23 belongs to no phase. Each phase has the name
 * the game's own clock shows (Time_Snapshot.TimesOfDayName): Moontide from midnight, Dawn from 4:00, Morning from 8:00,
 * Afternoon from noon, Evening from 16:00 and Night from 20:00, a phase's last minute still its own.
 */
describe('timePhases', () =>
{
  describe('isClockHour', () =>
  {
    it('takes a whole hour from 0 to 23', () =>
    {
      // Arrange: both ends of the day.
      const hours = [ 0, 23 ];

      // Act.
      const onClock = hours.map(isClockHour);

      // Assert.
      expect(onClock)
        .toStrictEqual([ true, true ]);
    });

    it('refuses an hour before or past the day, or a fraction of one', () =>
    {
      // Arrange: either side of the day's ends, and half past noon written as an hour.
      const hours = [ -1, 24, 12.5 ];

      // Act.
      const onClock = hours.map(isClockHour);

      // Assert.
      expect(onClock)
        .toStrictEqual([ false, false, false ]);
    });
  });

  describe('phaseOfHour', () =>
  {
    it('buckets each hour into its four-hour phase, at both edges of every phase', () =>
    {
      // Arrange: each phase's first and last hour.
      const hours = [ 0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23 ];

      // Act.
      const phases = hours.map(phaseOfHour);

      // Assert.
      expect(phases)
        .toStrictEqual([ 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5 ]);
    });

    it('puts an hour off the clock in no phase', () =>
    {
      // Arrange.
      const hours = [ 24, -4 ];

      // Act.
      const phases = hours.map(phaseOfHour);

      // Assert.
      expect(phases)
        .toStrictEqual([ UNKNOWN_PHASE, UNKNOWN_PHASE ]);
    });
  });

  describe('partOfDay', () =>
  {
    it('names each part of the day as the game\'s clock does, its last minute still its own', () =>
    {
      // Arrange: each phase's first minute, and the minute before the next phase.
      const times = [ 0, 239, 240, 479, 480, 719, 720, 959, 960, 1199, 1200, 1439 ];

      // Act.
      const names = times.map(partOfDay);

      // Assert.
      expect(names)
        .toStrictEqual([
          'Moontide', 'Moontide', 'Dawn', 'Dawn', 'Morning', 'Morning',
          'Afternoon', 'Afternoon', 'Evening', 'Evening', 'Night', 'Night',
        ]);
    });
  });
});
