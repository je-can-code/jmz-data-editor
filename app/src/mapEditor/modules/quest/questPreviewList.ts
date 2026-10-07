import type { JsonValue } from '../../core/model/json.ts';
import type { PreviewKindDefinition } from '../../core/modules/PluginModule.ts';
import type { GamePreview } from '../../core/preview/GamePreview.ts';
import type { PreviewChoice, PreviewEntry, PreviewOption, PreviewRow } from '../../core/preview/previewList.ts';
import type { QuestLog, TrackedObjective, TrackedQuest } from './questLog.ts';
import {
  followedStateOf,
  isQuestState,
  NEW_GAME_STATE,
  QUEST_STATES,
  QUEST_STATES_KIND,
  questSettingOf,
  writeQuestSetting,
  type QuestSetting,
} from './questPreview.ts';
import type { QuestState } from './questTags.ts';
import { shownNameOf, shownText } from './questWords.ts';

/**
 * What each state is called in the list, as J-OMNI-Quests names them.
 */
const STATE_WORDS: Readonly<Record<QuestState, string>> = {
  inactive: 'Inactive',
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
  missed: 'Missed',
};

/**
 * The id of a quest's own choice among its entry's; each objective's choice goes by the objective's id.
 */
const QUEST_CHOICE = 'quest';

/**
 * The value of the option leaving a quest where its objectives put it, rather than in a state of its own.
 */
const BY_OBJECTIVES = '';

/**
 * The five states as options, in the plugin's order.
 */
const STATE_OPTIONS: readonly PreviewOption[] = QUEST_STATES.map(state => ({ value: state, label: STATE_WORDS[state] }));

/**
 * The quest's own choice: where its objectives put it, which is where a quest left alone stays, or any of the five states
 * as a state of its own, which holds whatever its objectives say, as the plugin's Finalize Quest gives a quest one.
 * @param {TrackedQuest} quest The quest.
 * @param {QuestSetting} setting What the preview sets of it.
 * @returns {PreviewChoice} The choice.
 */
const questChoiceOf = (quest: TrackedQuest, setting: QuestSetting): PreviewChoice =>
{
  const followed = STATE_WORDS[followedStateOf(quest, setting)];
  return {
    id: QUEST_CHOICE,
    label: `Show quest ${quest.key} as`,
    options: [ { value: BY_OBJECTIVES, label: `${followed} (from objectives)` }, ...STATE_OPTIONS ],
    value: setting.state ?? BY_OBJECTIVES,
    set: setting.state !== null,
  };
};

/**
 * One objective's line: its id, its description as the player reads it, and the state it is shown in, which is the
 * state a new game starts it in until the author picks another.
 * @param {TrackedQuest} quest The quest.
 * @param {TrackedObjective} objective The objective.
 * @param {QuestSetting} setting What the preview sets of the quest.
 * @returns {PreviewRow} The line.
 */
const objectiveRowOf = (quest: TrackedQuest, objective: TrackedObjective, setting: QuestSetting): PreviewRow =>
{
  const state = setting.objectives.get(objective.id);
  return {
    label: String(objective.id),
    detail: shownText(objective.description),
    choice: {
      id: String(objective.id),
      label: `Show objective ${objective.id} of quest ${quest.key} as`,
      options: STATE_OPTIONS,
      value: state ?? objective.state,
      set: state !== undefined,
    },
  };
};

/**
 * One quest's entry: the name the player sees, or its key where it shows none, its key beneath, its own choice, and a line
 * for each of its objectives.
 * @param {TrackedQuest} quest The quest.
 * @param {GamePreview} preview The window's preview.
 * @returns {PreviewEntry} The entry.
 */
const questEntryOf = (quest: TrackedQuest, preview: GamePreview): PreviewEntry =>
{
  const setting = questSettingOf(preview, quest.key);
  const name = shownNameOf(quest);
  return {
    key: quest.key,
    title: name === '' ? quest.key : name,
    detail: quest.key,
    choice: questChoiceOf(quest, setting),
    rows: quest.objectives.map(objective => objectiveRowOf(quest, objective, setting)),
  };
};

/**
 * Works out what the preview sets of a quest once one of its choices changes: the quest's own state, or back to where its
 * objectives put it; or one objective's state, an objective put back in the state a new game starts it in being left as a
 * new game has it.
 * @param {GamePreview} preview The window's preview, as it stands.
 * @param {string} key The quest's key.
 * @param {string} choice The choice that changed: the quest's own, or an objective's id.
 * @param {string} option The value picked.
 * @returns {JsonValue | undefined} The quest's new value, or undefined once nothing of it is set.
 */
const chooseQuestState = (preview: GamePreview, key: string, choice: string, option: string): JsonValue | undefined =>
{
  const setting = questSettingOf(preview, key);
  if (choice === QUEST_CHOICE)
  {
    return writeQuestSetting({ ...setting, state: isQuestState(option) ? option : null });
  }

  const objectives = new Map(setting.objectives);
  const objectiveId = Number(choice);
  if (isQuestState(option) && option !== NEW_GAME_STATE)
  {
    objectives.set(objectiveId, option);
  }
  else
  {
    objectives.delete(objectiveId);
  }

  return writeQuestSetting({ ...setting, objectives });
};

/**
 * Where each quest stands, as a kind of state the preview sets: listed in the Switches & Variables window as every quest
 * the game tracks, by the name the player sees and its key, each opening onto its objectives, with a state to show the
 * quest in and one for each objective; counted in the chip as "1 quest set". A quest left alone keeps the state a new
 * game starts it in.
 * @param {QuestLog} log The quests a new game tracks.
 * @returns {PreviewKindDefinition} The kind.
 */
const questPreviewKind = (log: QuestLog): PreviewKindDefinition =>
{
  return {
    id: QUEST_STATES_KIND,
    title: 'Quests',
    nouns: { one: 'quest', many: 'quests', state: 'set' },
    searchHint: 'Find a quest by name or key',
    noMatch: 'No quest has that name or key.',
    entries: preview => [ ...log.values() ].map(quest => questEntryOf(quest, preview)),
    choose: chooseQuestState,
  };
};

export { BY_OBJECTIVES, chooseQuestState, QUEST_CHOICE, questEntryOf, questPreviewKind, STATE_WORDS };
