/**
 * The months belonging to each season, by the season id J-TIME numbers them with (SkyForecast.SeasonMonths): Spring
 * from March, Summer from June, Autumn from September, and Winter from December, wrapping the year.
 */
const SKY_SEASON_MONTHS: readonly (readonly number[])[] = [ [ 3, 4, 5 ], [ 6, 7, 8 ], [ 9, 10, 11 ], [ 12, 1, 2 ] ];

/**
 * Days in each month of J-Weather-Time's calendar (SkyForecast.DaysPerMonth), matching J-TIME's.
 */
const SKY_DAYS_PER_MONTH = 30;

/**
 * Months in its year (SkyForecast.MonthsPerYear).
 */
const SKY_MONTHS_PER_YEAR = 12;

/**
 * Phases in its day (SkyForecast.PhasesPerDay), the six four-hour parts of J-TIME's day.
 */
const SKY_PHASES_PER_DAY = 6;

/**
 * The phase J-Weather-Time hands back for an hour off the clock (SkyForecast.OffClock).
 */
const SKY_OFF_CLOCK = -1;

/**
 * Days in J-Weather-Time's year.
 * @returns {number} The days.
 */
const skyDaysPerYear = (): number =>
{
  return SKY_DAYS_PER_MONTH * SKY_MONTHS_PER_YEAR;
};

/**
 * Places a date and a phase of its day on the one count of phases the sky is read by (SkyForecast.absolutePhaseOf): the
 * day of the year is the month's thirty days before it and the day itself, so a day past the thirtieth runs into the
 * next month, and the 0th into the month before, exactly as the plugin counts them.
 * @param {number} years The year.
 * @param {number} months The month, 1 to 12.
 * @param {number} days The day of the month.
 * @param {number} phaseId The phase of the day, 0 to 5, or {@link SKY_OFF_CLOCK} for an hour off the clock.
 * @returns {number} The phase, or {@link SKY_OFF_CLOCK}.
 */
const skyPhaseOf = (years: number, months: number, days: number, phaseId: number): number =>
{
  if (phaseId === SKY_OFF_CLOCK)
  {
    return SKY_OFF_CLOCK;
  }

  const dayOfYear = ((months - 1) * SKY_DAYS_PER_MONTH) + days;
  const absoluteDay = (years * skyDaysPerYear()) + (dayOfYear - 1);
  return (absoluteDay * SKY_PHASES_PER_DAY) + phaseId;
};

/**
 * Which phase of its own day a phase is (SkyForecast.phaseOfDay).
 * @param {number} phase The phase.
 * @returns {number} 0 to 5.
 */
const phaseOfSkyDay = (phase: number): number =>
{
  return phase % SKY_PHASES_PER_DAY;
};

/**
 * Which day of its year a phase falls on, from 0 (SkyForecast.dayIndexOf).
 * @param {number} phase The phase.
 * @returns {number} 0 to 359.
 */
const skyDayIndexOf = (phase: number): number =>
{
  return Math.floor(phase / SKY_PHASES_PER_DAY) % skyDaysPerYear();
};

/**
 * Which month a phase falls in (SkyForecast.monthOf).
 * @param {number} phase The phase.
 * @returns {number} The month, 1 to 12.
 */
const skyMonthOf = (phase: number): number =>
{
  return Math.floor(skyDayIndexOf(phase) / SKY_DAYS_PER_MONTH) + 1;
};

/**
 * Which day of its month a phase falls on (SkyForecast.dayOfMonthOf).
 * @param {number} phase The phase.
 * @returns {number} The day, 1 to 30.
 */
const skyDayOfMonthOf = (phase: number): number =>
{
  return (skyDayIndexOf(phase) % SKY_DAYS_PER_MONTH) + 1;
};

/**
 * Which season a phase falls in, by its month (SkyForecast.seasonIdOf).
 * @param {number} phase The phase.
 * @returns {number} The season, 0 to 3, or -1 for a month on no season's list.
 */
const skySeasonOf = (phase: number): number =>
{
  const month = skyMonthOf(phase);
  return SKY_SEASON_MONTHS.findIndex(months => months.includes(month));
};

/**
 * The last month of each season, where a season hands over to the next (SkyForecast.settlingMonths): May, August,
 * November and February, not the calendar's quarters.
 * @returns {number[]} The months.
 */
const settlingMonths = (): number[] =>
{
  return SKY_SEASON_MONTHS.map(months => months[months.length - 1]);
};

/**
 * Reports whether a phase falls on a season's last day, the thirtieth of its last month, when the sky stops rolling and
 * steers toward its settling condition so the next season starts somewhere neutral (SkyForecast.isSettling).
 * @param {number} phase The phase.
 * @returns {boolean} True on a settling day.
 */
const isSettlingDay = (phase: number): boolean =>
{
  if (skyDayOfMonthOf(phase) !== SKY_DAYS_PER_MONTH)
  {
    return false;
  }

  return settlingMonths().includes(skyMonthOf(phase));
};

export {
  isSettlingDay,
  phaseOfSkyDay,
  settlingMonths,
  SKY_DAYS_PER_MONTH,
  SKY_OFF_CLOCK,
  SKY_PHASES_PER_DAY,
  SKY_SEASON_MONTHS,
  skyDayIndexOf,
  skyDayOfMonthOf,
  skyMonthOf,
  skyPhaseOf,
  skySeasonOf,
};
