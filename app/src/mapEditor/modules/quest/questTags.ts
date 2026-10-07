import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';

/**
 * The states a quest or one of its objectives can be in, as J-OMNI-Quests' OmniQuest.States and OmniObjective.States
 * name them; both number them alike, so a tag asks the one list of either.
 */
type QuestState = 'inactive' | 'active' | 'completed' | 'failed' | 'missed';

/**
 * One quest condition a page carries, as J-OMNI-Quests' OmniConditional holds it once Game_Event.toQuestConditional has
 * read the tag: the quest, the objective if the tag names one, and the state it waits for.
 */
type QuestTag = {
  /**
   * The quest's key as the tag writes it, which names the quest wherever the game has none by that key.
   */
  readonly written: string;

  /**
   * The key the plugin looks the quest up by: the key as written, or null when the plugin reads what is written as a
   * number, or as true or false, which no quest's key ever is, so that the tag names no quest the game has.
   */
  readonly key: string | null;

  /**
   * The objective the tag waits on, by id, or null when it waits on the quest itself. Only the three-part shape can
   * write a negative id, which the plugin reads as waiting on the quest itself too.
   */
  readonly objectiveId: number | null;

  /**
   * The state the tag waits for: active, unless the tag names another.
   */
  readonly state: QuestState;
};

/**
 * J-OMNI-Quests' page tags (J.OMNI.EXT.QUEST.RegExp's EventQuest, EventQuestObjective and EventQuestObjectiveForState),
 * each exactly as the plugin declares it, in the order Game_Event.toQuestConditional tests them: a quest, an objective of
 * one, and an objective of one in a named state. Case never matters, one space may follow the colon and each comma, and
 * a key holds only letters, digits, underscores, dots and hyphens.
 *
 * <pre>
 * Structure:
 *  <pageQuestCondition:[QUEST_KEY]>
 *  <pageQuestCondition:[QUEST_KEY, OBJECTIVE_ID]>
 *  <pageQuestCondition:[QUEST_KEY, OBJECTIVE_ID, STATE]>
 *
 * Example:
 *  <pageQuestCondition:[herbalist_delivery, 2, completed]>
 *
 * Translation:
 *  The page shows only while objective 2 of the quest "herbalist_delivery" is completed.
 * </pre>
 */
const PAGE_QUEST_TAGS: readonly RegExp[] = [
  /<pageQuestCondition:[ ]?(\[[\w.-]+])>/i,
  /<pageQuestCondition:[ ]?(\[([\w.-]+),[ ]?\d+])>/i,
  /<pageQuestCondition:[ ]?(\[([\w.-]+),[ ]?(-?\d+),[ ]?(inactive|active|completed|failed|missed)])>/i,
];

/**
 * What a comment line must be before J-Base offers it to any plugin (J.BASE.RegExp.ParsableComment): one tag filling the
 * whole line, made only of these characters.
 */
const PARSABLE_COMMENT = /^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$/i;

/**
 * The command codes of a comment's first line and of each line after it (Game_Event.matchesControlCode).
 */
const COMMENT_CODES: readonly number[] = [ 108, 408 ];

/**
 * How J-Base's JsonMapper#parseArrayFromString splits a bracketed list: at each comma, with or without one space after it.
 */
const LIST_SEPARATOR = /, |,/;

/**
 * Reads the key a tag's quest is looked up by, as JsonMapper#parseString reads any token: true or false, in any case,
 * become yes and no, and anything parseFloat reads a number from at its start becomes that number. Only what is left
 * stays the text written, and only text can be a quest's key, so the others name no quest. A key admits no quotes, so
 * the quotes the mapper first peels off never arise.
 * @param {string} token The key as written.
 * @returns {string | null} The key, or null when the plugin reads it as anything but text.
 */
const lookupKeyOf = (token: string): string | null =>
{
  const lower = token.toLowerCase();
  if (lower === 'true' || lower === 'false')
  {
    return null;
  }

  return Number.isNaN(Number.parseFloat(token))
    ? token
    : null;
};

/**
 * Reads the quest condition one comment line carries, as Game_Event.toQuestConditional reads it: the first of the page
 * tags the line holds owns it, and its bracketed list is split and read the way JsonMapper#parseObject reads it, its
 * length deciding what the tag waits on: the quest being active, an objective being active, or an objective being in
 * the named state.
 * @param {string} text The line.
 * @returns {QuestTag | null} The condition, or null when the line carries no page tag.
 */
const readQuestTag = (text: string): QuestTag | null =>
{
  const match = PAGE_QUEST_TAGS.map(tag => tag.exec(text)).find(found => found !== null);
  if (match === undefined)
  {
    return null;
  }

  // the first capture is the whole bracketed list, as the plugin hands it to the mapper.
  const [ , list ] = match as RegExpExecArray;
  const [ written, objective, state ] = list.slice(1, -1).split(LIST_SEPARATOR);
  const key = lookupKeyOf(written);
  if (objective === undefined)
  {
    return { written, key, objectiveId: null, state: 'active' };
  }

  // the patterns admit only digits for the objective, and a minus only where a state follows.
  const objectiveId = Number.parseFloat(objective);
  return state === undefined
    ? { written, key, objectiveId, state: 'active' }
    : { written, key, objectiveId, state: state.toLowerCase() as QuestState };
};

/**
 * Reads every quest condition a page carries, as J-OMNI-Quests' alias of Game_Event#meetsConditions gathers them: from
 * the page's comment lines, first lines and later ones alike, each of which J-Base offers only when it is one tag filling
 * the whole line, in the order they are written. A line holding words besides its tag, a tag anywhere but a comment, or
 * the choice family's tags, which gate a Show Choices branch rather than a page, gate nothing here.
 * @param {RmmzEventPage} page The page.
 * @returns {QuestTag[]} The conditions, in order; empty for a page no quest holds back.
 */
const readQuestTags = (page: RmmzEventPage): QuestTag[] =>
{
  return page.list.flatMap(command =>
  {
    const [ text ] = command.parameters;
    if (COMMENT_CODES.includes(command.code) === false || typeof text !== 'string' || PARSABLE_COMMENT.test(text) === false)
    {
      return [];
    }

    const tag = readQuestTag(text);
    return tag === null ? [] : [ tag ];
  });
};

export { PAGE_QUEST_TAGS, readQuestTag, readQuestTags };
export type { QuestState, QuestTag };
