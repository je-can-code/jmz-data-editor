/**
 * How many minutes an hour holds.
 */
const MINUTES_PER_HOUR = 60;

/**
 * How many minutes a day holds. A time of day is a whole number of minutes past midnight, from 0 up to but never
 * including this, so 14:00 is 840 and 23:59 is 1439.
 */
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * Brings a number of minutes onto the clock face, to the nearest whole minute: a time past the end of the day comes
 * round again from midnight, and one before midnight runs back from the end of the day, so a clock never shows a time
 * a day does not hold.
 * @param {number} minutes The minutes past midnight, any number.
 * @returns {number} The time of day, 0 to 1439.
 */
const onTheClock = (minutes: number): number =>
{
  const whole = Math.round(minutes) % MINUTES_PER_DAY;

  // the remainder keeps the sign of what was divided, so a time before midnight is brought back into the day.
  return whole < 0
    ? whole + MINUTES_PER_DAY
    : whole;
};

/**
 * Builds a time of day from an hour and a minute past it.
 * @param {number} hours The hour, 0 to 23.
 * @param {number} minutes The minute, 0 to 59.
 * @returns {number} The time of day, in minutes past midnight.
 */
const timeOfDayAt = (hours: number, minutes: number): number =>
{
  return (hours * MINUTES_PER_HOUR) + minutes;
};

/**
 * Reads the hour a time of day falls in, as a clock showing whole hours reads it: 14:59 is still 14.
 * @param {number} minutes The time of day, in minutes past midnight.
 * @returns {number} The hour, 0 to 23.
 */
const hourOf = (minutes: number): number =>
{
  return Math.floor(minutes / MINUTES_PER_HOUR);
};

/**
 * Reads the minute past the hour a time of day falls on.
 * @param {number} minutes The time of day, in minutes past midnight.
 * @returns {number} The minute, 0 to 59.
 */
const minuteOf = (minutes: number): number =>
{
  return minutes % MINUTES_PER_HOUR;
};

/**
 * Words a time of day as the game's own clock shows it: the hour and the minute, two digits each, on a 24-hour face.
 * @param {number} minutes The time of day, in minutes past midnight.
 * @returns {string} The time, such as {@code 14:00} or {@code 02:30}.
 */
const clockLabel = (minutes: number): string =>
{
  const hours = String(hourOf(minutes)).padStart(2, '0');
  const past = String(minuteOf(minutes)).padStart(2, '0');
  return `${hours}:${past}`;
};

export { clockLabel, hourOf, minuteOf, MINUTES_PER_DAY, MINUTES_PER_HOUR, onTheClock, timeOfDayAt };
