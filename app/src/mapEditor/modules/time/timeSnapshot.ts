import { hourOf, minuteOf } from '../../core/time/timeOfDay.ts';
import { phaseOfHour } from './timePhases.ts';

/**
 * A moment as J-TIME's Time_Snapshot holds it: each unit of the calendar and the clock, the part of the day its hour
 * falls in, and the season its month falls in.
 */
type TimeSnapshot = {
  readonly seconds: number;
  readonly minutes: number;
  readonly hours: number;
  readonly days: number;
  readonly months: number;
  readonly years: number;
  readonly timeOfDay: number;
  readonly seasonOfYear: number;
};

/**
 * Everything of a new game's moment the window's clock does not move: the date it starts on, and the second.
 */
type StartingDate = {
  readonly seconds: number;
  readonly days: number;
  readonly months: number;
  readonly years: number;
};

/**
 * A moment as J-TIME builds one from an array (Game_Time#toTimeSnapshot), seconds first: second, minute, hour, day,
 * month, year.
 */
type CalendarPoint = readonly [ number, number, number, number, number, number ];

/**
 * The season J-TIME hands back for a month off the calendar (Game_Time#seasonOfYear).
 */
const UNKNOWN_SEASON = -1;

/**
 * What the game calls each season, by season (Time_Snapshot.SeasonsName): Spring from March, Summer from June, Autumn
 * from September and Winter from December.
 */
const SEASON_NAMES: readonly string[] = [ 'Spring', 'Summer', 'Autumn', 'Winter' ];

/**
 * The months of each season, by season, as Game_Time#seasonOfYear lists them.
 */
const SEASON_MONTHS: readonly (readonly number[])[] = [ [ 3, 4, 5 ], [ 6, 7, 8 ], [ 9, 10, 11 ], [ 1, 2, 12 ] ];

/**
 * How long a day and an hour last, in milliseconds, as J-TIME's Date#addDays and Date#addHours move a date.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Finds the season a month falls in, as Game_Time#seasonOfYear does.
 * @param {number} months The month, 1 to 12.
 * @returns {number} The season, 0 to 3, or {@link UNKNOWN_SEASON} for a month off the calendar.
 */
const seasonOfMonth = (months: number): number =>
{
  return SEASON_MONTHS.findIndex(season => season.includes(months));
};

/**
 * Builds the moment the game's clock reads at a time of day on its starting date: the hour and minute from the window's
 * clock, the second and the date from the start, and the part of the day and the season from those, as J-TIME builds
 * its artificial snapshot.
 * @param {StartingDate} date The starting date and second.
 * @param {number} timeOfDay The time of day, in minutes past midnight.
 * @returns {TimeSnapshot} The moment.
 */
const snapshotAt = (date: StartingDate, timeOfDay: number): TimeSnapshot =>
{
  const hours = hourOf(timeOfDay);
  return {
    seconds: date.seconds,
    minutes: minuteOf(timeOfDay),
    hours,
    days: date.days,
    months: date.months,
    years: date.years,
    timeOfDay: phaseOfHour(hours),
    seasonOfYear: seasonOfMonth(date.months),
  };
};

/**
 * Places a moment on one timeline, as J-TIME places every moment it compares: through Date, months counted from 0, so a
 * day past a month's end runs into the next month and a year under 100 is read as 1900 and on, as the game reads them.
 * The game builds its dates on the player's own clock and these are built on universal time, which differs only across
 * a change for daylight saving, when a local hour is skipped or repeated.
 * @param {number} years The year.
 * @param {number} months The month, from 1.
 * @param {number} days The day of the month.
 * @param {number} hours The hour.
 * @param {number} minutes The minute.
 * @param {number} seconds The second.
 * @returns {number} The moment, in milliseconds.
 */
const instantOf = (years: number, months: number, days: number, hours: number, minutes: number, seconds: number): number =>
{
  return Date.UTC(years, months - 1, days, hours, minutes, seconds);
};

/**
 * Places a snapshot on the timeline.
 * @param {TimeSnapshot} snapshot The moment.
 * @returns {number} The moment, in milliseconds.
 */
const instantOfSnapshot = (snapshot: TimeSnapshot): number =>
{
  return instantOf(snapshot.years, snapshot.months, snapshot.days, snapshot.hours, snapshot.minutes, snapshot.seconds);
};

/**
 * Places a calendar point on the timeline.
 * @param {CalendarPoint} point The point, seconds first.
 * @returns {number} The moment, in milliseconds.
 */
const instantOfPoint = (point: CalendarPoint): number =>
{
  const [ seconds, minutes, hours, days, months, years ] = point;
  return instantOf(years, months, days, hours, minutes, seconds);
};

export {
  DAY_MS,
  HOUR_MS,
  instantOf,
  instantOfPoint,
  instantOfSnapshot,
  SEASON_NAMES,
  seasonOfMonth,
  snapshotAt,
  UNKNOWN_SEASON,
};
export type { CalendarPoint, StartingDate, TimeSnapshot };
