import type { JsonValue } from '../../core/model/json.ts';
import type { ModuleNotice } from '../../core/modules/PluginModule.ts';
import type { QuestState } from './questTags.ts';

/**
 * The name the server serves J-OMNI-Quests' config under, from {@code data/config.quest.json}.
 */
const QUEST_CONFIG = 'quest';

/**
 * The id of the notice J-OMNI-Quests' module shows while its config cannot be read.
 */
const QUEST_CONFIG_NOTICE_ID = 'quest.config';

/**
 * What the notice says first: what the failure means on the map, and the file to fix.
 */
const HELD_BACK_UNTIL_FIXED = 'Pages waiting on a quest never show until data/config.quest.json is fixed.';

/**
 * What the notice says last: the config is read again whenever the file changes on disk, so fixing it clears this.
 */
const CLEARS_ONCE_FIXED = 'This clears as soon as the file is fixed.';

/**
 * How a quest's name begins when it only divides the list in the editor, as J_QUEST_PluginMetadata.classifyQuests
 * recognises one: the game leaves such a quest out entirely.
 */
const DIVIDER_PREFIXES: readonly string[] = [ '__', '==', '--' ];

/**
 * One objective as the server serves it, as far as the game's tracking reads it.
 */
type ServedObjective = {
  readonly id: number;
};

/**
 * One quest as the server serves it ({@code server/internal/models/plugins/quest.go}), as far as the game's tracking and
 * the editor's words read it: read strictly, so a field the file leaves out comes back empty, and its objectives null.
 */
type ServedQuest = {
  readonly name: string;
  readonly key: string;
  readonly objectives: readonly ServedObjective[] | null;
};

/**
 * J-OMNI-Quests' config as the server serves it, as far as the game's tracking reads it: the quests come back null when
 * the file leaves them out.
 */
type QuestConfig = {
  readonly quests: readonly ServedQuest[] | null;
};

/**
 * One objective as the game tracks it (TrackedOmniObjective): its id and its state.
 */
type TrackedObjective = {
  readonly id: number;
  readonly state: QuestState;
};

/**
 * One quest as the game tracks it (TrackedOmniQuest): its key, the name the config gives it, its state, and its
 * objectives, ordered by id.
 */
type TrackedQuest = {
  readonly key: string;
  readonly name: string;
  readonly state: QuestState;
  readonly objectives: readonly TrackedObjective[];
};

/**
 * Every quest the game tracks, by key, as Game_Party keeps its questopedia cache.
 */
type QuestLog = ReadonlyMap<string, TrackedQuest>;

/**
 * Reports whether a quest only divides the list in the editor, which the game leaves out.
 * @param {string} name The quest's name.
 * @returns {boolean} True for a divider.
 */
const isDivider = (name: string): boolean =>
{
  return DIVIDER_PREFIXES.some(prefix => name.startsWith(prefix));
};

/**
 * Tracks one quest as a new game starts it, as Game_Party#toTrackedOmniQuest does: the quest inactive, and every one of
 * its objectives inactive, ordered by id as TrackedOmniQuest orders them.
 * @param {ServedQuest} quest The quest as the config lists it.
 * @returns {TrackedQuest} The quest as the new game tracks it.
 */
const trackedOnNewGame = (quest: ServedQuest): TrackedQuest =>
{
  const objectives = [ ...(quest.objectives ?? []) ]
    .sort((left, right) => left.id - right.id)
    .map(objective => ({ id: objective.id, state: 'inactive' as const }));
  return { key: quest.key, name: quest.name, state: 'inactive', objectives };
};

/**
 * Works out every quest a new game tracks, and the state each starts in, exactly as J-OMNI-Quests does from the project's
 * config: J_QUEST_PluginMetadata.classifyQuests leaves out the dividers, and Game_Party#populateQuestopediaTrackings
 * tracks each quest left, by key, a later quest taking the key of an earlier one, every quest and every objective
 * inactive. Nothing starts a quest before a new game's first event runs, so this is what a fresh save holds. A project
 * without the file tracks no quest at all: the game cannot start without it, and {@link questConfigNotice} says so over
 * the map.
 * @param {JsonValue | null} config The config as the server served it, or null when the project has none.
 * @returns {QuestLog} The quests, by key.
 */
const newGameQuestLog = (config: JsonValue | null): QuestLog =>
{
  if (config === null)
  {
    return new Map();
  }

  // the server read the file into its model, so the shape is the model's.
  const { quests } = config as unknown as QuestConfig;
  const kept = (quests ?? []).filter(quest => isDivider(quest.name) === false);
  return new Map(kept.map(quest => [ quest.key, trackedOnNewGame(quest) ]));
};

/**
 * Says what is wrong when the config cannot be read, so pages held back for want of any quest are never mistaken for the
 * game's own: the file is missing, is not JSON, or holds a field the strict read refuses, in the server's words where it
 * gave any. Nothing is said of a config that was read.
 * @param {JsonValue | null} config The config as the server served it, or null when it could not be read.
 * @param {string | undefined} problem Why it could not be read, or undefined when nothing said why.
 * @returns {ModuleNotice | null} The notice, or null when the config was read.
 */
const questConfigNotice = (config: JsonValue | null, problem: string | undefined): ModuleNotice | null =>
{
  if (config !== null)
  {
    return null;
  }

  const why = problem === undefined
    ? 'It was not read.'
    : `It could not be read: ${problem}.`;
  return { id: QUEST_CONFIG_NOTICE_ID, title: HELD_BACK_UNTIL_FIXED, detail: `${why} ${CLEARS_ONCE_FIXED}` };
};

export { newGameQuestLog, QUEST_CONFIG, QUEST_CONFIG_NOTICE_ID, questConfigNotice };
export type { QuestConfig, QuestLog, ServedObjective, ServedQuest, TrackedObjective, TrackedQuest };
