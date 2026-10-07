import { tokenizeMessage } from '../../core/commands/editors/messageText.ts';
import { objectiveOf, questOf, waitsOnObjective } from './questConditions.ts';
import type { QuestLog, TrackedQuest } from './questLog.ts';
import type { QuestTag } from './questTags.ts';

/**
 * Reads the name a quest shows the player: its name as the config writes it, less the escape codes the game draws as
 * colours and the like rather than as letters, such as the colour around "Water Entity" in "Deal with the \C[1]Water
 * Entity\C[0]".
 * @param {TrackedQuest} quest The quest.
 * @returns {string} The name as shown, or an empty string when the config gives it none.
 */
const shownNameOf = (quest: TrackedQuest): string =>
{
  return tokenizeMessage(quest.name)
    .flatMap(token => (token.kind === 'text' ? [ token.text ] : []))
    .join('')
    .trim();
};

/**
 * Words the quest a tag names: by the name the player sees, in quotes, or by its key where it has no name, or where the
 * game tracks no quest by that key.
 * @param {QuestTag} tag The tag.
 * @param {TrackedQuest | null} quest The quest it names, or null when the game tracks none by that key.
 * @returns {string} The words, such as {@code "Herbalist Delivery"} or {@code quest herbalist_delivery}.
 */
const questWords = (tag: QuestTag, quest: TrackedQuest | null): string =>
{
  const name = quest === null ? '' : shownNameOf(quest);
  return name === ''
    ? `quest ${tag.written}`
    : `"${name}"`;
};

/**
 * Words what a tag names that the game does not have, which keeps its page from ever showing: a quest the game tracks
 * none of, or an objective its quest lacks.
 * @param {QuestTag} tag The tag.
 * @param {TrackedQuest | null} quest The quest it names, or null when the game tracks none by that key.
 * @returns {string} The words, such as {@code  (no such quest)}, or an empty string when the game has all it names.
 */
const missingWords = (tag: QuestTag, quest: TrackedQuest | null): string =>
{
  if (quest === null)
  {
    return ' (no such quest)';
  }

  return waitsOnObjective(tag) && objectiveOf(tag, quest) === null
    ? ' (no such objective)'
    : '';
};

/**
 * Words when a quest tag holds, as an author would say it, so a panel can say when a page shows: "while \"Herbalist
 * Delivery\" is active", "while objective 2 of \"Herbalist Delivery\" is completed". A quest or an objective the game
 * does not have is named as the tag writes it, and said to be missing.
 * @param {QuestTag} tag The tag.
 * @param {QuestLog} log The quests the game tracks.
 * @returns {string} The words.
 */
const questTagWords = (tag: QuestTag, log: QuestLog): string =>
{
  const quest = questOf(tag, log);
  const named = questWords(tag, quest);
  const subject = waitsOnObjective(tag)
    ? `objective ${tag.objectiveId} of ${named}`
    : named;
  return `while ${subject} is ${tag.state}${missingWords(tag, quest)}`;
};

export { questTagWords, shownNameOf };
