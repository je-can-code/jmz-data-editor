import { hourOf } from '../../core/time/timeOfDay.ts';

/**
 * How many hours each phase of the day occupies before the next takes over, as J-TIME's TimePhases.hoursPerPhase has
 * it: six phases of four hours make the day.
 */
const HOURS_PER_PHASE = 4;

/**
 * The phase J-TIME hands back for an hour that is not on the 24-hour clock (TimePhases.unknownPhase).
 */
const UNKNOWN_PHASE = -1;

/**
 * What the game calls each phase of the day, by phase, as Time_Snapshot.TimesOfDayName names them on its clock:
 * Moontide from midnight, Dawn from 4:00, Morning from 8:00, Afternoon from noon, Evening from 16:00 and Night from 20:00.
 */
const PHASE_NAMES: readonly string[] = [ 'Moontide', 'Dawn', 'Morning', 'Afternoon', 'Evening', 'Night' ];

/**
 * Reports whether a value is a real hour on the 24-hour clock, as TimePhases#isClockHour judges it: a whole number from
 * 0 to 23. The game's clock can hold something else, since setting the time writes the hour straight through.
 * @param {number} hours The value.
 * @returns {boolean} True for an hour on the clock.
 */
const isClockHour = (hours: number): boolean =>
{
  return Number.isInteger(hours) && hours >= 0 && hours <= 23;
};

/**
 * Buckets an hour into the phase of the day it belongs to, as TimePhases#phaseOfHour does: every phase is four hours
 * wide, so the phase is how many of them fit beneath the hour.
 * @param {number} hours The hour of the day.
 * @returns {number} The phase, 0 to 5, or {@link UNKNOWN_PHASE} for an hour off the clock.
 */
const phaseOfHour = (hours: number): number =>
{
  if (isClockHour(hours) === false)
  {
    return UNKNOWN_PHASE;
  }

  return Math.floor(hours / HOURS_PER_PHASE);
};

/**
 * Names the part of the day a time falls in, as the game's own clock names it.
 * @param {number} minutes The time of day, in minutes past midnight, on the clock.
 * @returns {string} The phase's name, such as Night.
 */
const partOfDay = (minutes: number): string =>
{
  return PHASE_NAMES[phaseOfHour(hourOf(minutes))];
};

export { HOURS_PER_PHASE, isClockHour, partOfDay, PHASE_NAMES, phaseOfHour, UNKNOWN_PHASE };
