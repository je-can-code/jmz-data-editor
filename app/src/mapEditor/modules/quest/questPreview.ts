import { isJsonObject, type JsonObject, type JsonValue } from '../../core/model/json.ts';
import { previewKey, type GamePreview, type PreviewKey } from '../../core/preview/GamePreview.ts';
import type { TrackedObjective, TrackedQuest } from './questLog.ts';
import type { QuestState } from './questTags.ts';

/**
 * The kind of preview state J-OMNI-Quests' module keeps what the author sets of each quest under, by the quest's key.
 */
const QUEST_STATES_KIND = 'quest.states';

/**
 * Every state a quest or an objective can be in, in J-OMNI-Quests' own order (OmniQuest.States, OmniObjective.States).
 */
const QUEST_STATES: readonly QuestState[] = [ 'inactive', 'active', 'completed', 'failed', 'missed' ];

/**
 * The state a new game starts every quest and every objective in, which an objective is never set to: an objective left
 * there is left as a new game has it.
 */
const NEW_GAME_STATE: QuestState = 'inactive';

/**
 * What the preview sets of one quest: a state of the quest's own, which holds whatever its objectives say, or null to
 * leave the quest where its objectives put it; and each objective set, by id, none of them left as a new game has it.
 */
type QuestSetting = {
  readonly state: QuestState | null;
  readonly objectives: ReadonlyMap<number, QuestState>;
};

/**
 * What the preview sets of a quest it leaves alone: nothing, so the quest keeps the state a new game starts it in.
 */
const NOTHING_SET: QuestSetting = { state: null, objectives: new Map() };

/**
 * Reports whether a value names a state J-OMNI-Quests has, as the preview keeps it.
 * @param {unknown} value The value.
 * @returns {boolean} True for one of the five states.
 */
const isQuestState = (value: unknown): value is QuestState =>
{
  return typeof value === 'string' && (QUEST_STATES as readonly string[]).includes(value);
};

/**
 * Reports whether a key names an objective by an id the config can give one: a whole number from 0.
 * @param {string} key The key.
 * @returns {boolean} True for such an id.
 */
const isObjectiveId = (key: string): boolean =>
{
  return /^\d+$/u.test(key);
};

/**
 * Reads what the preview sets of one quest, keeping whatever of it is a state the plugin has, so a record left by an older
 * or broken session never stops the editor: anything else, an objective named by no id, and an objective set to the
 * state a new game starts it in all read as nothing set.
 * @param {JsonValue | undefined} value The quest's value in the preview, or undefined while it sets nothing of the quest.
 * @returns {QuestSetting} What it sets.
 */
const readQuestSetting = (value: JsonValue | undefined): QuestSetting =>
{
  if (isJsonObject(value) === false)
  {
    return NOTHING_SET;
  }

  const { state, objectives } = value;
  const kept = isJsonObject(objectives)
    ? Object.entries(objectives).flatMap(([ id, objectiveState ]) =>
    {
      const keep = isObjectiveId(id) && isQuestState(objectiveState) && objectiveState !== NEW_GAME_STATE;
      return keep ? [ [ Number(id), objectiveState ] as const ] : [];
    })
    : [];
  return { state: isQuestState(state) ? state : null, objectives: new Map(kept) };
};

/**
 * Writes what the preview sets of one quest as the value it keeps, the quest's own state first and then its objectives in
 * order of their ids, such as {@code { state: 'completed', objectives: { 1: 'active' } }}.
 * @param {QuestSetting} setting What it sets.
 * @returns {JsonValue | undefined} The value, or undefined once it sets nothing, which leaves the quest as a new game has
 * it.
 */
const writeQuestSetting = (setting: QuestSetting): JsonValue | undefined =>
{
  const objectives = [ ...setting.objectives ].sort(([ left ], [ right ]) => left - right);
  if (setting.state === null && objectives.length === 0)
  {
    return undefined;
  }

  // each part is written only while it sets something, so the value says no more than it means.
  const value: JsonObject = {};
  if (setting.state !== null)
  {
    value['state'] = setting.state;
  }

  if (objectives.length > 0)
  {
    value['objectives'] = Object.fromEntries(objectives.map(([ id, state ]) => [ String(id), state ]));
  }

  return value;
};

/**
 * Reads what a preview sets of one quest.
 * @param {GamePreview} preview The preview.
 * @param {string} questKey The quest's key.
 * @returns {QuestSetting} What it sets; nothing, for a quest it leaves alone.
 */
const questSettingOf = (preview: GamePreview, questKey: string): QuestSetting =>
{
  return readQuestSetting(preview.value(QUEST_STATES_KIND, questKey));
};

/**
 * Names a quest as a piece of preview state, as a page reading the quest names what it reads, so a change to anything the
 * preview sets of that quest judges the page again, and a change to any other quest never does.
 * @param {string} questKey The quest's key.
 * @returns {PreviewKey} The key, such as {@code quest.states:cecil-001}.
 */
const questPreviewKey = (questKey: string): PreviewKey =>
{
  return previewKey(QUEST_STATES_KIND, questKey);
};

/**
 * Works out the state a quest's objectives put it in, as J-OMNI-Quests' TrackedOmniQuest#refreshState works it out
 * whenever one of them changes: failed once any objective fails; inactive while every one is, as with none at all; active
 * while any one is under way; missed once every one is missed; completed once every one is completed or missed. With
 * some done or missed and the rest not yet begun, none under way, the plugin leaves the quest as it was, and a quest only
 * ever gets there by being progressed while it is under way, so it is under way still.
 * @param {readonly QuestState[]} states Its objectives' states.
 * @returns {QuestState} The quest's state.
 */
const stateOfObjectives = (states: readonly QuestState[]): QuestState =>
{
  // a failed objective fails the quest, whatever the others say.
  if (states.some(state => state === 'failed'))
  {
    return 'failed';
  }

  // a quest none of whose objectives has begun is still waiting to be found.
  if (states.every(state => state === NEW_GAME_STATE))
  {
    return 'inactive';
  }

  // one objective under way keeps the quest under way.
  if (states.some(state => state === 'active'))
  {
    return 'active';
  }

  // a quest whose every objective went by is missed, judged before completion, which a missed objective counts toward.
  if (states.every(state => state === 'missed'))
  {
    return 'missed';
  }

  // every objective finished one way or the other completes the quest; anything else is a quest partway through.
  return states.every(state => state === 'completed' || state === 'missed')
    ? 'completed'
    : 'active';
};

/**
 * Shows a quest's objectives as the preview sets them: each set one in its state, and every other as the log has it.
 * @param {TrackedQuest} quest The quest, as the log tracks it.
 * @param {QuestSetting} setting What the preview sets of it.
 * @returns {TrackedObjective[]} The objectives, in the log's order.
 */
const objectivesAt = (quest: TrackedQuest, setting: QuestSetting): TrackedObjective[] =>
{
  return quest.objectives.map(objective =>
  {
    const state = setting.objectives.get(objective.id);
    return state === undefined ? objective : { ...objective, state };
  });
};

/**
 * Works out where a quest's objectives put it at a preview, leaving any state of its own aside: the state the log gives
 * it while the preview sets none of its objectives, and otherwise the state its objectives as set put it in.
 * @param {TrackedQuest} quest The quest, as the log tracks it.
 * @param {QuestSetting} setting What the preview sets of it.
 * @returns {QuestState} The state its objectives put it in.
 */
const followedStateOf = (quest: TrackedQuest, setting: QuestSetting): QuestState =>
{
  // objectives set for ids the quest no longer has change nothing.
  const touched = quest.objectives.some(objective => setting.objectives.has(objective.id));
  return touched
    ? stateOfObjectives(objectivesAt(quest, setting).map(objective => objective.state))
    : quest.state;
};

/**
 * Shows a quest as a preview sets it, for judging what a page asks of it: its objectives as the preview sets them, and
 * the quest in the state of its own the preview gives it, or else where its objectives put it. A quest the preview leaves
 * alone is the quest as the log tracks it, a new game's.
 * @param {TrackedQuest} quest The quest, as the log tracks it.
 * @param {GamePreview} preview The preview.
 * @returns {TrackedQuest} The quest as the preview shows it.
 */
const questAt = (quest: TrackedQuest, preview: GamePreview): TrackedQuest =>
{
  const setting = questSettingOf(preview, quest.key);
  if (setting.state === null && setting.objectives.size === 0)
  {
    return quest;
  }

  return { ...quest, state: setting.state ?? followedStateOf(quest, setting), objectives: objectivesAt(quest, setting) };
};

export {
  followedStateOf,
  isQuestState,
  NEW_GAME_STATE,
  questAt,
  questPreviewKey,
  QUEST_STATES,
  QUEST_STATES_KIND,
  questSettingOf,
  readQuestSetting,
  stateOfObjectives,
  writeQuestSetting,
};
export type { QuestSetting };
