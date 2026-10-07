import type { QuestLog, TrackedObjective, TrackedQuest } from './questLog.ts';
import type { QuestTag } from './questTags.ts';

/**
 * Reports whether a tag waits on one of its quest's objectives rather than on the quest itself, as
 * Game_Event.questConditionalMet decides it: an objective's id, unless it is negative, which waits on the quest.
 * @param {QuestTag} tag The tag.
 * @returns {boolean} True when it waits on an objective.
 */
const waitsOnObjective = (tag: QuestTag): boolean =>
{
  return tag.objectiveId !== null && tag.objectiveId >= 0;
};

/**
 * Finds the quest a tag names in a log, as QuestManager.quest looks it up: by its key, exactly.
 * @param {QuestTag} tag The tag.
 * @param {QuestLog} log The quests the game tracks.
 * @returns {TrackedQuest | null} The quest, or null when the game tracks none by that key, where the game stops with an
 * error the moment it asks.
 */
const questOf = (tag: QuestTag, log: QuestLog): TrackedQuest | null =>
{
  return tag.key === null
    ? null
    : log.get(tag.key) ?? null;
};

/**
 * Finds the objective a tag names on its quest, as TrackedOmniQuest#isObjectiveInState finds it: the first by that id.
 * @param {QuestTag} tag The tag, waiting on an objective.
 * @param {TrackedQuest} quest Its quest.
 * @returns {TrackedObjective | null} The objective, or null when the quest has none by that id.
 */
const objectiveOf = (tag: QuestTag, quest: TrackedQuest): TrackedObjective | null =>
{
  return quest.objectives.find(objective => objective.id === tag.objectiveId) ?? null;
};

/**
 * Judges one tag against the quests the game tracks, as Game_Event.questConditionalMet does: an objective it names holds
 * while that objective is in the state the tag waits for, and an objective the quest lacks never does; otherwise the
 * quest itself must be in that state. A quest the game does not track stops the game with an error when it asks, and the
 * editor shows such a page as one that never holds rather than stopping.
 * @param {QuestTag} tag The tag.
 * @param {QuestLog} log The quests the game tracks, each in its state.
 * @returns {boolean} True when it holds.
 */
const questTagHolds = (tag: QuestTag, log: QuestLog): boolean =>
{
  const quest = questOf(tag, log);
  if (quest === null)
  {
    return false;
  }

  if (waitsOnObjective(tag) === false)
  {
    return quest.state === tag.state;
  }

  const objective = objectiveOf(tag, quest);
  return objective !== null && objective.state === tag.state;
};

/**
 * Judges a page's quest tags, as J-OMNI-Quests' alias of Game_Event#meetsConditions does: every tag must hold.
 * @param {readonly QuestTag[]} tags The page's tags.
 * @param {QuestLog} log The quests the game tracks, each in its state.
 * @returns {boolean} True when they all hold.
 */
const questTagsHold = (tags: readonly QuestTag[], log: QuestLog): boolean =>
{
  return tags.every(tag => questTagHolds(tag, log));
};

export { objectiveOf, questOf, questTagHolds, questTagsHold, waitsOnObjective };
