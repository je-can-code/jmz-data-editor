import type { TimeTag } from './timeTags.ts';
import {
  DAY_MS,
  HOUR_MS,
  instantOf,
  instantOfPoint,
  instantOfSnapshot,
  SEASON_NAMES,
  type CalendarPoint,
  type TimeSnapshot,
} from './timeSnapshot.ts';
import { PHASE_NAMES } from './timePhases.ts';

/**
 * A unit of the moment a tag can ask for exactly.
 */
type ExactUnit = 'minutes' | 'hours' | 'days' | 'months' | 'years' | 'timeOfDay' | 'seasonOfYear';

/**
 * A clock time a range opens or closes at: the hour, then the minute, as a clock reads it.
 */
type ClockPoint = readonly [ number, number ];

/**
 * One requirement a time tag makes, as J-TIME's TimeConditional holds it: one unit of the moment, exactly; a span of
 * the clock, opening and closing on the moment's own date (isTimeRange); or a span of the calendar (isFullDateRange).
 * A span holds strictly between its ends, to the second, as Time_Snapshot#isBetweenSnapshots holds it by default. A
 * tag J-TIME could not read, whose bracketed list is no JSON, is a requirement nothing meets.
 */
type TimeConditional =
  | { readonly kind: 'exact'; readonly unit: ExactUnit; readonly value: number }
  | { readonly kind: 'clock'; readonly opens: ClockPoint; readonly closes: ClockPoint }
  | { readonly kind: 'calendar'; readonly opens: CalendarPoint; readonly closes: CalendarPoint }
  | { readonly kind: 'unreadable' };

/**
 * The unit each exact kind of tag asks for.
 */
const EXACT_UNITS: Readonly<Record<string, ExactUnit>> = {
  Minute: 'minutes',
  Hour: 'hours',
  Day: 'days',
  Month: 'months',
  Year: 'years',
  TimeOfDay: 'timeOfDay',
  SeasonOfYear: 'seasonOfYear',
};

/**
 * Reads a whole number the way J-TIME's mappers do, with parseInt.
 * @param {string} text The text.
 * @returns {number} The number.
 */
const wholeNumber = (text: string): number =>
{
  return Number.parseInt(text, 10);
};

/**
 * Reads a part of the day or a season as TimeMapper reads it: a number as written, or else the name, in any case.
 * @param {string} text The value as written.
 * @param {readonly string[]} names The names, by id.
 * @returns {number} The id.
 */
const namedValue = (text: string, names: readonly string[]): number =>
{
  const number = wholeNumber(text);
  if (Number.isNaN(number) === false)
  {
    return number;
  }

  // the tags admit only the names on the clock's own list, so the name is always there to find.
  return names.findIndex(name => name.toLowerCase() === text.toLowerCase());
};

/**
 * Reads a bracketed list of a full date range as TimeMapper#fullDateRangeToConditional reads it, with JSON.parse,
 * putting the second the list leaves out in front: minute, hour, day, month and year follow it.
 * @param {number} second The second to put in front.
 * @param {string} list The list as written, brackets included.
 * @returns {CalendarPoint} The point.
 * @throws {SyntaxError} When the list is no JSON, as a number written with a leading zero is not.
 */
const calendarPoint = (second: number, list: string): CalendarPoint =>
{
  const [ minutes, hours, days, months, years ] = JSON.parse(list) as number[];
  return [ second, minutes, hours, days, months, years ];
};

/**
 * Builds a full date range's requirement, or one nothing meets when J-TIME could not read it: the plugin throws there,
 * and the editor shows the page as one that never holds rather than stopping.
 * @param {readonly string[]} captures The two lists, as written.
 * @returns {TimeConditional} The requirement.
 */
const fullDateRange = (captures: readonly string[]): TimeConditional =>
{
  const [ opens, closes ] = captures;
  try
  {
    return { kind: 'calendar', opens: calendarPoint(0, opens), closes: calendarPoint(59, closes) };
  }
  catch
  {
    return { kind: 'unreadable' };
  }
};

/**
 * Builds a minute range's requirement as TimeMapper#minuteRangeToConditional does, around the hour of the moment: it
 * opens at the start minute of this hour, and closes at the end minute of this hour, or of the next when the start does
 * not come first. The plugin compares the two as written, as text, so 5-10 counts the start as coming later and closes
 * in the next hour; the hour after 23 is 0.
 * @param {readonly string[]} captures The start and end minutes, as written.
 * @param {TimeSnapshot} now The moment.
 * @returns {TimeConditional} The requirement.
 */
const minuteRange = (captures: readonly string[], now: TimeSnapshot): TimeConditional =>
{
  const [ start, end ] = captures;
  const nextHour = now.hours + 1 === 24 ? 0 : now.hours + 1;
  const closingHour = start < end ? now.hours : nextHour;
  return { kind: 'clock', opens: [ now.hours, wholeNumber(start) ], closes: [ closingHour, wholeNumber(end) ] };
};

/**
 * Builds a day range's requirement as TimeMapper#dayRangeToConditional does: from the start of the first day of the
 * moment's month to the last second of the end day, in the next month when the end day comes before the start day, the
 * month after 12 being the next year's first.
 * @param {readonly string[]} captures The start and end days, as written.
 * @param {TimeSnapshot} now The moment.
 * @returns {TimeConditional} The requirement.
 */
const dayRange = (captures: readonly string[], now: TimeSnapshot): TimeConditional =>
{
  const [ start, end ] = captures.map(wholeNumber);
  const laterMonth = end < start ? now.months + 1 : now.months;
  const closingMonth = laterMonth === 13 ? 1 : laterMonth;
  const closingYear = laterMonth === 13 ? now.years + 1 : now.years;
  return { kind: 'calendar', opens: [ 0, 0, 0, start, now.months, now.years ], closes: [ 59, 59, 23, end, closingMonth, closingYear ] };
};

/**
 * Builds a month range's requirement as TimeMapper#monthRangeToConditional does: from the first of the start month of
 * the moment's year to the last second of the 30th of the end month, a year later when the end month comes first.
 * @param {readonly string[]} captures The start and end months, as written.
 * @param {TimeSnapshot} now The moment.
 * @returns {TimeConditional} The requirement.
 */
const monthRange = (captures: readonly string[], now: TimeSnapshot): TimeConditional =>
{
  const [ start, end ] = captures.map(wholeNumber);
  const closingYear = end < start ? now.years + 1 : now.years;
  return { kind: 'calendar', opens: [ 0, 0, 0, 1, start, now.years ], closes: [ 59, 59, 23, 30, end, closingYear ] };
};

/**
 * Builds the requirement a tag makes at a moment, as TimeMapper's mapper for its kind builds a TimeConditional: some
 * spans are built around the moment's own hour, month or year.
 * @param {TimeTag} tag The tag.
 * @param {TimeSnapshot} now The moment.
 * @returns {TimeConditional} The requirement.
 */
const conditionalOf = (tag: TimeTag, now: TimeSnapshot): TimeConditional =>
{
  const { kind, captures } = tag;
  switch (kind)
  {
    case 'TimeOfDay':
      return { kind: 'exact', unit: 'timeOfDay', value: namedValue(captures[0], PHASE_NAMES) };
    case 'SeasonOfYear':
      return { kind: 'exact', unit: 'seasonOfYear', value: namedValue(captures[0], SEASON_NAMES) };
    case 'TimeRange':
    {
      const [ openHour, openMinute, closeHour, closeMinute ] = captures.map(wholeNumber);
      return { kind: 'clock', opens: [ openHour, openMinute ], closes: [ closeHour, closeMinute ] };
    }
    case 'FullDateRange':
      return fullDateRange(captures);
    case 'MinuteRange':
      return minuteRange(captures, now);
    case 'HourRange':
      return { kind: 'clock', opens: [ wholeNumber(captures[0]), 0 ], closes: [ wholeNumber(captures[1]), 0 ] };
    case 'DayRange':
      return dayRange(captures, now);
    case 'MonthRange':
      return monthRange(captures, now);
    case 'YearRange':
    {
      const [ start, end ] = captures.map(wholeNumber);
      return { kind: 'calendar', opens: [ 0, 0, 0, 1, 1, start ], closes: [ 0, 0, 0, 1, 1, end ] };
    }
    default:
      return { kind: 'exact', unit: EXACT_UNITS[kind], value: wholeNumber(captures[0]) };
  }
};

/**
 * Judges a span of the clock as Game_Event._timeConditionalTimeRangeMet does. The span opens and closes on the moment's
 * own date; one closing at an earlier hour than it opens is overnight and closes a day later, and one closing at an
 * earlier minute than it opens closes an hour later, whatever its hours, as the plugin has it. A span inside one day
 * holds strictly between its ends; an overnight span holds there or in the same span opened a day before, so 18-5
 * holds at 02:00 in the tail of the span that opened last night.
 * @param {ClockPoint} opens When it opens.
 * @param {ClockPoint} closes When it closes.
 * @param {TimeSnapshot} now The moment.
 * @returns {boolean} True when the moment is inside.
 */
const clockSpanHolds = (opens: ClockPoint, closes: ClockPoint, now: TimeSnapshot): boolean =>
{
  const [ openHour, openMinute ] = opens;
  const [ closeHour, closeMinute ] = closes;
  const overnight = openHour > closeHour;
  const overhour = openMinute > closeMinute;
  const opening = instantOf(now.years, now.months, now.days, openHour, openMinute, 0);
  const closing = instantOf(now.years, now.months, now.days, closeHour, closeMinute, 0)
    + (overnight ? DAY_MS : 0)
    + (overhour ? HOUR_MS : 0);
  const at = instantOfSnapshot(now);
  const inside = (from: number, to: number) => at > from && at < to;
  if (overnight === false)
  {
    return inside(opening, closing);
  }

  return inside(opening, closing) || inside(opening - DAY_MS, closing - DAY_MS);
};

/**
 * Judges a requirement at a moment, as Game_Event.timeConditionalMet does: an exact unit by equality, a span of the
 * clock as {@link clockSpanHolds} does, and a span of the calendar strictly between its ends.
 * @param {TimeConditional} conditional The requirement.
 * @param {TimeSnapshot} now The moment.
 * @returns {boolean} True when it holds.
 */
const conditionalHolds = (conditional: TimeConditional, now: TimeSnapshot): boolean =>
{
  switch (conditional.kind)
  {
    case 'exact':
      return now[conditional.unit] === conditional.value;
    case 'clock':
      return clockSpanHolds(conditional.opens, conditional.closes, now);
    case 'calendar':
    {
      const at = instantOfSnapshot(now);
      return at > instantOfPoint(conditional.opens) && at < instantOfPoint(conditional.closes);
    }
    case 'unreadable':
      return false;
  }
};

/**
 * Judges a page's time tags at a moment, as J-TIME's alias of Game_Event#meetsConditions does: every tag must hold, each
 * built afresh around the moment.
 * @param {readonly TimeTag[]} tags The page's tags.
 * @param {TimeSnapshot} now The moment.
 * @returns {boolean} True when they all hold.
 */
const tagsHold = (tags: readonly TimeTag[], now: TimeSnapshot): boolean =>
{
  return tags.every(tag => conditionalHolds(conditionalOf(tag, now), now));
};

export { clockSpanHolds, conditionalHolds, conditionalOf, tagsHold };
export type { ClockPoint, ExactUnit, TimeConditional };
