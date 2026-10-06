import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import type { PageCondition } from '../../core/pageRule/pageRule.ts';
import { tagsHold } from './timeConditionals.ts';
import { startingDateOf, startingTimeOf, TIME_PLUGIN } from './timeParameters.ts';
import { partOfDay } from './timePhases.ts';
import { snapshotAt, type StartingDate } from './timeSnapshot.ts';
import { readTimeTags, type TimeTagKind } from './timeTags.ts';
import { timeTagWords } from './timeWords.ts';

/**
 * The id J-TIME's module adds its page condition under.
 */
const TIME_PAGES_ID = 'time.pages';

/**
 * The kinds of time tag whose answer the window's clock can never change: each asks only for a part of the date, and the
 * date stays the game's starting date whatever hour the clock shows. Every other kind reads the time of day, a span of
 * the calendar included, which can open or close within the starting date.
 */
const DATE_ONLY: ReadonlySet<TimeTagKind> = new Set<TimeTagKind>([ 'Day', 'Month', 'Year', 'SeasonOfYear' ]);

/**
 * J-TIME's page tags as a condition of the game's page rule: a page carrying any holds only while all of them do, judged
 * as the plugin judges them at the moment the game's clock reads with the window's clock's time of day on the game's
 * starting date. A page carrying none is never held back by it.
 * @param {StartingDate} date The starting date and second, which the window's clock never moves.
 * @returns {PageCondition} The condition.
 */
const timePageCondition = (date: StartingDate): PageCondition =>
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
        holds: moment => tagsHold(tags, snapshotAt(date, moment.timeOfDay)),
        words: tags.map(timeTagWords),
      };
    },
  };
};

/**
 * What the editor knows of J-TIME, while it is enabled: the clock every map view shows, starting at the hour the game
 * starts at and naming each part of the day as the game does; and its page tags, judged as the plugin judges them, so
 * every map shows each event's page as a fresh save would at the clock's time: a lamp tagged to burn from 18:00 to 05:00
 * shows its lit page only then. J-Lighting-Time, when it is on too, casts its sky by the same clock.
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
    contributions.clock({ startsAt: startingTimeOf(time, now), partOfDay });
    contributions.pageCondition(timePageCondition(startingDateOf(time, now)));
  },
};

export { TIME_PAGES_ID, timeModule, timePageCondition };
