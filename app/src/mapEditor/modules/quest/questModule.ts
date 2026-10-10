import type { JsonValue } from '../../core/model/json.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import type { PageCondition } from '../../core/pageRule/pageRule.ts';
import { questOf, questTagsHold } from './questConditions.ts';
import { newGameQuestLog, QUEST_CONFIG, questConfigNotice, type QuestLog } from './questLog.ts';
import { questPreviewKey } from './questPreview.ts';
import { questPreviewKind } from './questPreviewList.ts';
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
 * judged as the plugin judges them against the quests the game tracks, each quest as the window's preview sets it and as
 * a new game has it wherever the preview sets nothing. A page carrying none is never held back by it. Quests move only as
 * the game is played, never with the clock, so the clock never asks for a page again; a page names the quests it reads,
 * so the preview asks for it again only when what it sets of one of those changes.
 * @param {QuestLog} log The quests the game tracks, each in the state a new game starts it in.
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

      // a quest the game does not track never holds whatever the preview sets, so only tracked quests are read.
      const reads = [ ...new Set(tags.flatMap(tag =>
      {
        const quest = questOf(tag, log);
        return quest === null ? [] : [ questPreviewKey(quest.key) ];
      })) ];
      return {
        followsClock: false,
        reads,
        holds: moment => questTagsHold(tags, log, moment.preview),
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
 * when it shows in the author's words, naming each quest as the player sees it.
 *
 * Every quest and objective can be set further along the story in the Switches & Variables window, as a kind of preview
 * state of the module's own; every page reading a quest set there is judged by it instead, and only those pages. The
 * config is read again whenever it changes on disk, and every page with it; a config that cannot be read is said over
 * every map view, and every page waiting on a quest is then held back, as though no quest existed.
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

    // the page condition and the window's list read the same quests, so they always name the same ones.
    const log = newGameQuestLog(config);
    contributions.pageCondition(questPageCondition(log));
    contributions.previewKind(questPreviewKind(log));
  },
};

export { QUEST_PAGES_ID, QUEST_PLUGIN, questModule, questPageCondition };
