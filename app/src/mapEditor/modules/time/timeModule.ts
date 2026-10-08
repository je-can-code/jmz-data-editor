import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { PluginModule, SeasonOffer } from '../../core/modules/PluginModule.ts';
import type { PageCondition } from '../../core/pageRule/pageRule.ts';
import { tagsHold } from './timeConditionals.ts';
import { startingDateOf, startingTimeOf, TIME_PLUGIN } from './timeParameters.ts';
import { partOfDay } from './timePhases.ts';
import { dateOfSeason, SEASON_NAMES, seasonOfMonth, snapshotOfClock, type GameDate } from './timeSnapshot.ts';
import { readTimeTags, type TimeTagKind } from './timeTags.ts';
import { dateWords, timeTagWords } from './timeWords.ts';

/**
 * The id J-TIME's module adds its page condition under.
 */
const TIME_PAGES_ID = 'time.pages';

/**
 * The kinds of time tag whose answer the clock's time of day can never change: each asks only for a part of the date.
 * Every other kind reads the time of day, a span of the calendar included, which can open or close within one day.
 */
const DATE_ONLY: ReadonlySet<TimeTagKind> = new Set<TimeTagKind>([ 'Day', 'Month', 'Year', 'SeasonOfYear' ]);

/**
 * The kinds of time tag whose answer the clock's season can never change: each asks only for the time of day, a span of
 * the clock opening and closing on whatever date the moment falls on. Every other kind reads the date, which the season
 * moves.
 */
const TIME_ONLY: ReadonlySet<TimeTagKind> = new Set<TimeTagKind>([ 'Minute', 'Hour', 'TimeOfDay', 'TimeRange', 'MinuteRange', 'HourRange' ]);

/**
 * J-TIME's page tags as a condition of the game's page rule: a page carrying any holds only while all of them do, judged
 * as the plugin judges them at the moment the game's clock reads with the window's clock's time of day, on the date the
 * clock's season moves the start to: the starting date itself until the author picks another season. A page carrying
 * none is never held back by it.
 * @param {GameDate} start The date a new game starts on, and the second, which the clock's season moves the date on from.
 * @returns {PageCondition} The condition.
 */
const timePageCondition = (start: GameDate): PageCondition =>
{
  return {
    id: TIME_PAGES_ID,
    read: page =>
    {
      const tags = readTimeTags(page);
      if (tags.length === 0)
      {
        return null;
      }

      return {
        followsClock: tags.some(tag => DATE_ONLY.has(tag.kind) === false),
        followsDate: tags.some(tag => TIME_ONLY.has(tag.kind) === false),
        holds: moment => tagsHold(tags, snapshotOfClock(start, moment.timeOfDay, moment.season ?? null)),
        words: tags.map(timeTagWords),
      };
    },
  };
};

/**
 * The seasons J-TIME's calendar runs through, as its clock offers them: what the game calls each, the one a new game
 * starts in, which its starting month decides, and the date each season moves the clock to, in words.
 * @param {GameDate} start The date a new game starts on.
 * @returns {SeasonOffer} The seasons.
 */
const seasonsOf = (start: GameDate): SeasonOffer =>
{
  return {
    names: SEASON_NAMES,
    startsIn: seasonOfMonth(start.months),
    dateWords: season => dateWords(dateOfSeason(start, season)),
  };
};

/**
 * What the editor knows of J-TIME, while it is enabled: the clock every map view shows, starting at the hour the game
 * starts at, naming each part of the day as the game does, and holding a season, which moves the date from the one the
 * game starts on to that season's; and its page tags, judged as the plugin judges them, so every map shows each event's
 * page as a fresh save would at the clock's time and date: a lamp tagged to burn from 18:00 to 05:00 shows its lit page
 * only then, and a page tagged for Summer only once the clock is in Summer. J-Lighting-Time, when it is on too, casts its
 * sky by the same clock.
 */
const timeModule: PluginModule = {
  id: 'time',
  title: 'J-TIME',
  plugins: [ TIME_PLUGIN ],
  register: (contributions, context) =>
  {
    // the module is on only while J-TIME is enabled, so J-TIME is listed.
    const time = context.plugins.get(TIME_PLUGIN) as PluginsJsEntry;
    const now = new Date();
    const start = startingDateOf(time, now);
    contributions.clock({ startsAt: startingTimeOf(time, now), partOfDay, seasons: seasonsOf(start) });
    contributions.pageCondition(timePageCondition(start));
  },
};

export { seasonsOf, TIME_PAGES_ID, timeModule, timePageCondition };
