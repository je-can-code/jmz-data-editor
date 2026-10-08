import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import { timeOfDayAt } from '../../core/time/timeOfDay.ts';
import { isClockHour } from './timePhases.ts';
import type { GameDate } from './timeSnapshot.ts';

/**
 * J-TIME's file name, as js/plugins.js lists it.
 */
const TIME_PLUGIN = 'J-TIME';

/**
 * The hour a new game starts on when J-TIME's Starting Hour cannot say: the plugin's own default.
 */
const DEFAULT_STARTING_HOUR = 9;

/**
 * The minute a new game starts on when J-TIME's Starting Minute cannot say: the plugin's own default.
 */
const DEFAULT_STARTING_MINUTE = 0;

/**
 * The second, day, month and year a new game starts on when J-TIME's parameters cannot say: the plugin's own defaults,
 * 29 May 2021 at the top of the minute.
 */
const DEFAULT_STARTING_DATE: GameDate = { seconds: 0, days: 29, months: 5, years: 2021 };

/**
 * Reads one of J-TIME's starting values as the plugin reads it, a number from text, so an empty parameter reads as 0,
 * keeping it only when it is a whole number within what the clock can show.
 * @param {string | undefined} text The parameter's text, or undefined when js/plugins.js has none.
 * @param {(value: number) => boolean} fits Whether a number is one the clock can show.
 * @param {number} fallback What to use otherwise.
 * @returns {number} The value.
 */
const startingValue = (text: string | undefined, fits: (value: number) => boolean, fallback: number): number =>
{
  // a plugins.js written before the parameter existed has no text for it at all, which reads as no number.
  const value = Number(text);
  return fits(value)
    ? value
    : fallback;
};

/**
 * Reports whether a value is a minute past the hour, a whole number from 0 to 59.
 * @param {number} value The value.
 * @returns {boolean} True for a minute the clock can show.
 */
const isClockMinute = (value: number): boolean =>
{
  return Number.isInteger(value) && value >= 0 && value <= 59;
};

/**
 * Reads the time of day a new game starts at, from J-TIME's parameters (J_TIME_PluginMetadata): its Starting Hour and
 * Starting Minute, or, for a game running on real time, the time on the player's own clock right now, which is what the
 * game would show. A starting value the clock cannot show, such as an hour of 25, falls back to the plugin's default.
 * @param {PluginsJsEntry} plugin J-TIME, as js/plugins.js lists it.
 * @param {Date} now The time now, for a game on real time.
 * @returns {number} The starting time, in minutes past midnight.
 */
const startingTimeOf = (plugin: PluginsJsEntry, now: Date): number =>
{
  const { parameters } = plugin;
  if (parameters['useRealTime'] === 'true')
  {
    return timeOfDayAt(now.getHours(), now.getMinutes());
  }

  const hours = startingValue(parameters['startingHour'], isClockHour, DEFAULT_STARTING_HOUR);
  const minutes = startingValue(parameters['startingMinute'], isClockMinute, DEFAULT_STARTING_MINUTE);
  return timeOfDayAt(hours, minutes);
};

/**
 * Reads the date a new game starts on, and the second, which the window's clock never moves, from J-TIME's parameters:
 * its Starting Second, Day, Month and Year, each kept when it is a whole number, as the plugin reads any number there,
 * or the plugin's own default otherwise; or, for a game running on real time, today's date, at the top of the minute the
 * clock shows. The clock's season moves the date on from here.
 * @param {PluginsJsEntry} plugin J-TIME, as js/plugins.js lists it.
 * @param {Date} now The time now, for a game on real time.
 * @returns {GameDate} The second and the date.
 */
const startingDateOf = (plugin: PluginsJsEntry, now: Date): GameDate =>
{
  const { parameters } = plugin;
  if (parameters['useRealTime'] === 'true')
  {
    return { seconds: 0, days: now.getDate(), months: now.getMonth() + 1, years: now.getFullYear() };
  }

  return {
    seconds: startingValue(parameters['startingSecond'], Number.isInteger, DEFAULT_STARTING_DATE.seconds),
    days: startingValue(parameters['startingDay'], Number.isInteger, DEFAULT_STARTING_DATE.days),
    months: startingValue(parameters['startingMonth'], Number.isInteger, DEFAULT_STARTING_DATE.months),
    years: startingValue(parameters['startingYear'], Number.isInteger, DEFAULT_STARTING_DATE.years),
  };
};

export { DEFAULT_STARTING_DATE, DEFAULT_STARTING_HOUR, DEFAULT_STARTING_MINUTE, isClockMinute, startingDateOf, startingTimeOf, TIME_PLUGIN };
