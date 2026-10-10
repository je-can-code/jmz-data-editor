import type { ConfigRead, OnDemandConfig, SkyCondition, SkyOffer, SkyReading } from '../../core/modules/PluginModule.ts';
import type { SkyPick } from '../../core/time/WindowClock.ts';
import { SEASON_NAMES, snapshotOfClock, type GameDate } from '../time/timeSnapshot.ts';
import { MONTH_NAMES } from '../time/timeWords.ts';
import { isSettlingDay, phaseOfSkyDay, skyMonthOf, skyPhaseOf, skySeasonOf } from './skyCalendar.ts';
import { skyConditionNames, skyConfigFrom, type SkyConfig } from './skyConfig.ts';
import {
  allowedIn,
  clampIntensity,
  faceFor,
  intensitiesOf,
  isPossibleIn,
  monthMultiplierFor,
  settledType,
  SKY_LADDER,
  skySeasonName,
  skyTypeOf,
  USUAL_STRENGTH,
} from './skyStates.ts';

/**
 * What the sky says while the author has picked none.
 */
const NO_SKY_PICKED = 'A new game\'s sky is random, so none shows until you pick one.';

/**
 * What the sky says while its config is being read.
 */
const READING_THE_SKY = 'Reading the project\'s sky…';

/**
 * What the sky says when the project's config holds no sky J-Weather-Time could walk.
 */
const NO_SKY_TO_READ = 'The sky cannot be read from data/config.weather.json, so none shows.';

/**
 * Places a moment of the window's clock on J-Weather-Time's count of phases, as the plugin places the game's clock
 * (ForecastDirector.phaseOf): the time of day's phase, on the date the clock's season moves the game's start to, which
 * is the start itself until the author picks another season.
 * @param {GameDate} start The date a new game starts on.
 * @param {number} minutes The clock's time of day, in minutes past midnight.
 * @param {number | null} season The clock's season, or null for the season the game starts in.
 * @returns {number} The phase.
 */
const skyPhaseAt = (start: GameDate, minutes: number, season: number | null): number =>
{
  const moment = snapshotOfClock(start, minutes, season);
  return skyPhaseOf(moment.years, moment.months, moment.days, moment.timeOfDay);
};

/**
 * Names a season by its id as the game names it, such as Winter.
 * @param {number} seasonId The season id, 0 to 3.
 * @returns {string} The name, or "this season" for an id off the calendar.
 */
const seasonWords = (seasonId: number): string =>
{
  return SEASON_NAMES[seasonId] ?? 'this season';
};

/**
 * Words what the sky shows, as J-Weather writes weather down (WeatherLabel.words): the look, then its strength in
 * brackets, saying when the look is a face the condition wears at this hour and season rather than its own.
 * @param {string} preset The look.
 * @param {string} intensity The strength.
 * @param {boolean} faced Whether the look is one of the condition's faces.
 * @returns {string} The words, such as "Shows as starfall (moderate) at this hour and season."
 */
const showsWords = (preset: string, intensity: string, faced: boolean): string =>
{
  return faced
    ? `Shows as ${preset} (${intensity}) at this hour and season.`
    : `Shows as ${preset} (${intensity}).`;
};

/**
 * Works out what the sky is doing at a phase, for the condition and strength the author picked, as J-Weather-Time hands
 * the sky to J-Weather (ForecastDirector.skyFor): the face the condition wears at that season and phase of the day, at
 * the picked strength pulled into the range the condition is drawn at, with the condition beside it for a climate to
 * read.
 *
 * A condition the sky could not be in then shows nothing: one the project's sky does not have, one the season does not
 * allow, and one the month weighs at nothing, since the sky's walk never rolls into such a condition, nor stays in one. On a season's last day the sky stops rolling and steers toward the condition it settles to, a step every phase
 * from the condition picked, which the day came in with, as the plugin steers it.
 * @param {SkyConfig} sky The sky.
 * @param {SkyPick} pick The condition and the strength picked.
 * @param {number} phase The phase, on J-Weather-Time's count.
 * @returns {SkyReading} What the sky is doing.
 */
const readSkyAt = (sky: SkyConfig, pick: SkyPick, phase: number): SkyReading =>
{
  const { condition, strength } = pick;
  const seasonId = skySeasonOf(phase);
  const seasonName = skySeasonName(seasonId);
  const month = skyMonthOf(phase);
  if (skyTypeOf(sky, condition) === null)
  {
    return { weather: null, words: `The project's sky has no condition named ${condition}.` };
  }

  if (allowedIn(sky, seasonName).includes(condition) === false)
  {
    return { weather: null, words: `The sky is never ${condition} in ${seasonWords(seasonId)}, so none shows.` };
  }

  if (monthMultiplierFor(sky, month, condition) <= 0)
  {
    return { weather: null, words: `The sky is never ${condition} in ${MONTH_NAMES[month - 1] ?? 'this month'}, so none shows.` };
  }

  const phaseId = phaseOfSkyDay(phase);
  const settling = isSettlingDay(phase);
  const type = settling
    ? settledType(sky, condition, seasonName, phaseId)
    : condition;
  const intensity = clampIntensity(sky, type, strength);
  const preset = faceFor(sky, type, seasonName, phaseId);
  const weather = { preset, intensity, type };
  if (settling)
  {
    return {
      weather,
      words: `The last day of ${seasonWords(seasonId)} settles the sky toward ${sky.settleTo}, so it shows as ${preset} (${intensity}).`,
    };
  }

  return { weather, words: showsWords(preset, intensity, preset !== skyTypeOf(sky, type)?.preset) };
};

/**
 * Lists the conditions the sky can be in, at a phase, in the order the config lists them: each with the strengths it is
 * ever drawn at, whether the sky can be in it at that phase at all, and the strength it takes when picked.
 * @param {SkyConfig} sky The sky.
 * @param {number} phase The phase, on J-Weather-Time's count.
 * @returns {SkyCondition[]} The conditions.
 */
const skyConditionsAt = (sky: SkyConfig, phase: number): SkyCondition[] =>
{
  const seasonName = skySeasonName(skySeasonOf(phase));
  const month = skyMonthOf(phase);
  return skyConditionNames(sky).map(name => ({
    name,
    strengths: intensitiesOf(sky, name),
    possible: isPossibleIn(sky, name, seasonName, month),
    strengthFor: (wanted: string | null) => clampIntensity(sky, name, wanted ?? USUAL_STRENGTH),
  }));
};

/**
 * Builds the sky J-Weather-Time drives, as J-Weather's module offers it the map views: read from J-Weather's config,
 * which holds the sky beside the looks it names, only once something needs it, a sky picked or the picker opened, and
 * read out of each read of the config once, however often the clock moves. The clock's date comes from the game's start,
 * as J-TIME's module moves it by the clock's season.
 * @param {OnDemandConfig} config J-Weather's config.
 * @param {GameDate} start The date a new game starts on.
 * @returns {SkyOffer} The sky.
 */
const skyOfferFor = (config: OnDemandConfig, start: GameDate): SkyOffer =>
{
  let readFrom: ConfigRead | undefined = undefined;
  let sky: SkyConfig | null = null;

  /**
   * Reads the sky out of the config as it was last read.
   * @returns {SkyConfig | null | undefined} The sky, null for a config holding none, or undefined until it is read.
   */
  const skyAsRead = (): SkyConfig | null | undefined =>
  {
    const read = config.current();
    if (read !== undefined && read !== readFrom)
    {
      readFrom = read;
      sky = skyConfigFrom(read.content);
    }

    return read === undefined ? undefined : sky;
  };

  return {
    config,
    strengths: SKY_LADDER,
    conditionsAt: (minutes: number, season: number | null) =>
    {
      const read = skyAsRead();
      if (read === undefined || read === null)
      {
        return { conditions: [], problem: read === undefined ? READING_THE_SKY : NO_SKY_TO_READ };
      }

      return { conditions: skyConditionsAt(read, skyPhaseAt(start, minutes, season)), problem: null };
    },
    readingAt: (pick: SkyPick | null, minutes: number, season: number | null) =>
    {
      if (pick === null)
      {
        return { weather: null, words: NO_SKY_PICKED };
      }

      const read = skyAsRead();
      if (read === undefined)
      {
        return { weather: null, words: READING_THE_SKY };
      }

      return read === null
        ? { weather: null, words: NO_SKY_TO_READ }
        : readSkyAt(read, pick, skyPhaseAt(start, minutes, season));
    },
  };
};

export { NO_SKY_PICKED, NO_SKY_TO_READ, READING_THE_SKY, readSkyAt, skyConditionsAt, skyOfferFor, skyPhaseAt };
