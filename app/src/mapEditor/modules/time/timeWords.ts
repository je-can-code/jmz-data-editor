import type { TimeTag } from './timeTags.ts';
import { SEASON_NAMES, type GameDate } from './timeSnapshot.ts';
import { HOURS_PER_PHASE, PHASE_NAMES } from './timePhases.ts';

/**
 * What each month is called, by month from January, for naming a date as an author would: J-TIME numbers its months 1
 * to 12, and its help names each season's months by these names.
 */
const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Words a clock time on a 24-hour face, two digits each, as the game's own clock shows one; an hour past 23, which a
 * span closing a day later reaches, keeps counting, so the end of the day reads 24:00.
 * @param {number} hours The hour.
 * @param {number} minutes The minute.
 * @returns {string} The time, such as {@code 05:00}.
 */
const clockWords = (hours: number, minutes: number): string =>
{
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Reads a part of the day or a season as the tag names it: the name of the id written, or the name written, in the
 * game's own words. The tags admit only ids and names on the game's own lists, so one or the other is always there.
 * @param {string} text The value as written.
 * @param {readonly string[]} names The names, by id.
 * @returns {string} The name.
 */
const nameOf = (text: string, names: readonly string[]): string =>
{
  const byId = names[Number.parseInt(text, 10)];
  return byId ?? names.find(name => name.toLowerCase() === text.toLowerCase()) as string;
};

/**
 * Words when a part of the day lasts, by its name: "at Night, from 20:00 to 24:00".
 * @param {string} text The part of the day as written, a name or an id.
 * @returns {string} The words.
 */
const phaseWords = (text: string): string =>
{
  const name = nameOf(text, PHASE_NAMES);
  const start = PHASE_NAMES.indexOf(name) * HOURS_PER_PHASE;
  return `at ${name}, from ${clockWords(start, 0)} to ${clockWords(start + HOURS_PER_PHASE, 0)}`;
};

/**
 * Words a minute range as the plugin keeps it, around whatever hour it is: from the start minute to the end minute of
 * the same hour when the start comes first as written, and of the next hour otherwise, an hour later again when the end
 * minute comes before the start minute.
 * @param {readonly string[]} captures The start and end minutes, as written.
 * @returns {string} The words.
 */
const minuteRangeWords = (captures: readonly string[]): string =>
{
  const [ start, end ] = captures;
  const hoursOn = (start < end ? 0 : 1) + (Number.parseInt(start, 10) > Number.parseInt(end, 10) ? 1 : 0);
  const closing = [ '', ' of the next', ' two hours on' ][hoursOn];
  return `from minute ${Number.parseInt(start, 10)} of each hour to minute ${Number.parseInt(end, 10)}${closing}`;
};

/**
 * Words a clock span as the plugin keeps it: closing an hour later than written when the end minute comes before the
 * start minute.
 * @param {readonly number[]} span The opening hour and minute, then the closing hour and minute.
 * @returns {string} The words.
 */
const clockSpanWords = (span: readonly number[]): string =>
{
  const [ openHour, openMinute, closeHour, closeMinute ] = span;
  const closingHour = openMinute > closeMinute ? closeHour + 1 : closeHour;
  return `from ${clockWords(openHour, openMinute)} to ${clockWords(closingHour, closeMinute)}`;
};

/**
 * Words one point of a full date range: the time, then the day, month and year.
 * @param {string} list The bracketed list as written: minute, hour, day, month, year.
 * @returns {string} The words, such as {@code 09:00 on 29/5/2021}, or the list itself when it is no JSON.
 */
const datePointWords = (list: string): string =>
{
  try
  {
    const [ minutes, hours, days, months, years ] = JSON.parse(list) as number[];
    return `${clockWords(hours, minutes)} on ${days}/${months}/${years}`;
  }
  catch
  {
    return list;
  }
};

/**
 * Words when a time tag holds, as an author would say it, so a panel can say when a page shows: "from 18:00 to 05:00",
 * "at Night, from 20:00 to 24:00", "in Winter".
 * @param {TimeTag} tag The tag.
 * @returns {string} The words.
 */
const timeTagWords = (tag: TimeTag): string =>
{
  const { kind, captures } = tag;
  const [ first, second ] = captures;
  const numbers = captures.map(text => Number.parseInt(text, 10));
  switch (kind)
  {
    case 'Minute':
      return `at minute ${numbers[0]} of each hour`;
    case 'Hour':
      return `from ${clockWords(numbers[0], 0)} to ${clockWords(numbers[0] + 1, 0)}`;
    case 'Day':
      return `on day ${numbers[0]}`;
    case 'Month':
      return `in month ${numbers[0]}`;
    case 'Year':
      return `in ${numbers[0]}`;
    case 'TimeOfDay':
      return phaseWords(first);
    case 'SeasonOfYear':
      return `in ${nameOf(first, SEASON_NAMES)}`;
    case 'TimeRange':
      return clockSpanWords(numbers);
    case 'FullDateRange':
      return `from ${datePointWords(first)} to ${datePointWords(second)}`;
    case 'MinuteRange':
      return minuteRangeWords(captures);
    case 'HourRange':
      return `from ${clockWords(numbers[0], 0)} to ${clockWords(numbers[1], 0)}`;
    case 'DayRange':
      return `from day ${numbers[0]} to day ${numbers[1]}`;
    case 'MonthRange':
      return `from month ${numbers[0]} to month ${numbers[1]}`;
    case 'YearRange':
      return `from ${numbers[0]} until ${numbers[1]}`;
  }
};

/**
 * Words a date as an author would say it: the month by name, the day, then the year, as "June 16, 2027". A month the
 * calendar has no name for, which only a start set off the calendar holds, keeps its number.
 * @param {GameDate} date The date.
 * @returns {string} The words.
 */
const dateWords = (date: GameDate): string =>
{
  const month = MONTH_NAMES[date.months - 1] ?? `Month ${date.months}`;
  return `${month} ${date.days}, ${date.years}`;
};

export { clockWords, dateWords, MONTH_NAMES, timeTagWords };
