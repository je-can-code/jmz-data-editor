import type { JsonValue } from '../../core/model/json.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import type { PageCondition } from '../../core/pageRule/pageRule.ts';
import { questTagsHold } from './questConditions.ts';
import { newGameQuestLog, QUEST_CONFIG, questConfigNotice, type QuestLog } from './questLog.ts';
import { readQuestTags } from './questTags.ts';
import { questTagWords } from './questWords.ts';

/**
 * J-OMNI-Quests' file name, as js/plugins.js lists it.
 */
const QUEST_PLUGIN = 'J-OMNI-Quests';

/**
 * The id J-OMNI-Quests' module adds its page condition under.
 */
const QUEST_PAGES_ID = 'quest.pages';

/**
 * J-OMNI-Quests' page tags as a condition of the game's page rule: a page carrying any holds only while all of them do,
 * judged as the plugin judges them against the quests the game tracks. A page carrying none is never held back by it.
 * Quests move only as the game is played, never with the clock, so a page's answer is worked out once, as it is read,
 * and the clock never asks for it again.
 * @param {QuestLog} log The quests the game tracks, each in its state.
 * @returns {PageCondition} The condition.
 */
const questPageCondition = (log: QuestLog): PageCondition =>
{
  return {
    id: QUEST_PAGES_ID,
    read: page =>
    {
      const tags = readQuestTags(page);
      if (tags.length === 0)
      {
        return null;
      }

      const held = questTagsHold(tags, log);
      return {
        followsClock: false,
        holds: () => held,
        words: tags.map(tag => questTagWords(tag, log)),
      };
    },
  };
};

/**
 * What the editor knows of J-OMNI-Quests, while it is enabled: its page tags, judged as the plugin judges them against
 * every quest and objective in the state a new game starts it in, worked out from the project's config.quest.json as the
 * plugin works it out, so every map shows each event's page as a fresh save would: a quest-giver waiting for its quest
 * to be inactive shows its offer, and a page waiting for that quest to be under way or done stays hidden. Each page says
 * when it shows in the author's words, naming each quest as the player sees it. The config is read again whenever it
 * changes on disk, and every page with it; a config that cannot be read is said over every map view, and every page
 * waiting on a quest is then held back, as though no quest existed.
 */
const questModule: PluginModule = {
  id: 'quest',
  title: 'J-OMNI-Quests',
  plugins: [ QUEST_PLUGIN ],
  configs: [ QUEST_CONFIG ],
  register: (contributions, context) =>
  {
    // the registry hands over every config the module names, null for one the project lacks, with why it lacks it.
    const config = context.configs.get(QUEST_CONFIG) as JsonValue | null;
    const notice = questConfigNotice(config, context.configProblems.get(QUEST_CONFIG));
    if (notice !== null)
    {
      contributions.notice(notice);
    }

    contributions.pageCondition(questPageCondition(newGameQuestLog(config)));
  },
};

export { QUEST_PAGES_ID, QUEST_PLUGIN, questModule, questPageCondition };
