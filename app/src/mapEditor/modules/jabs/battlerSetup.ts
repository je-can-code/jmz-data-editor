import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { EventEdit } from '../../core/eventKinds/quickFields.ts';
import type { Transaction } from '../../core/history/Transaction.ts';
import type { DocumentKey } from '../../core/model/documentKeys.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { PatchPath } from '../../core/model/patches.ts';
import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';
import type { BattlerChange, BattlerContext } from './battlerEdits.ts';
import { jabsDefaultsOf, type EnemyRecord, type JabsDefaults } from './battlerReading.ts';
import { motionDefaultsFrom } from './motionTags.ts';

/**
 * J-LevelMaster's file name, as js/plugins.js lists it: the plugin reading a J-ABS battler's level off its page.
 */
const LEVEL_PLUGIN = 'J-LevelMaster';

/**
 * J-Passive's file name, and its extension's, which gives a J-ABS battler the passives its page lists.
 */
const PASSIVE_PLUGIN = 'J-Passive';
const PASSIVE_AFFIX_PLUGIN = 'J-Passive-Affix';

/**
 * J-Motion's file name, as js/plugins.js lists it: the plugin reading a page's motions.
 */
const MOTION_PLUGIN = 'J-Motion';

/**
 * The name the server serves J-Motion's config under, config.motion.json.
 */
const MOTION_CONFIG = 'motion';

/**
 * What every battler panel and brush reads besides the map: J-ABS's defaults, which of the plugins reading a battler's
 * page beside J-ABS are on, the project's motion defaults, and words when a page shows.
 */
type BattlerSetup = {
  readonly defaults: JabsDefaults;

  /**
   * Whether J-LevelMaster is on, which reads a battler's level.
   */
  readonly levels: boolean;

  /**
   * Whether J-Passive and its affix extension are on, which give a battler the passives its page lists.
   */
  readonly passives: boolean;

  /**
   * Whether J-Motion is on, which gives a battler the motions its page declares.
   */
  readonly motions: boolean;
  readonly motionDefaults: (type: string, parameter: string) => JsonValue | undefined;

  /**
   * Words when a page shows, one entry for each thing it waits for, such as "while switch 4 is on".
   * @param {RmmzEventPage} page The page.
   * @returns {readonly string[]} The words; none for a page waiting for nothing.
   */
  readonly pageWords: (page: RmmzEventPage) => readonly string[];
};

/**
 * What a row of the battler panel is called in the history panel, after the verb.
 */
const ROW_WORDS: Readonly<Record<BattlerChange['row'], string>> = {
  enemy: 'enemy',
  level: 'level',
  moveSpeed: 'move speed',
  sight: 'sight',
  pursuit: 'pursuit',
  alertedSightBoost: 'alerted sight',
  alertedPursuitBoost: 'alerted pursuit',
  alertDuration: 'alert time',
  aiTraits: 'AI traits',
  aiRoles: 'AI roles',
  inanimate: 'inanimate',
  team: 'team',
  idle: 'idling',
  hpBar: 'HP bar',
  name: 'name',
  passives: 'passives',
  motion: 'motion',
};

/**
 * Builds what the battler panels and brush read, from the plugins J-ABS's module switched on beside and the configs it
 * read.
 * @param {ReadonlyMap<string, PluginsJsEntry>} plugins The enabled plugins, by file name.
 * @param {JsonValue | null} motionConfig config.motion.json, or null when it was not read.
 * @param {(page: RmmzEventPage) => readonly string[]} pageWords Words when a page shows.
 * @returns {BattlerSetup} The setup.
 */
const battlerSetupOf = (
  plugins: ReadonlyMap<string, PluginsJsEntry>,
  motionConfig: JsonValue | null,
  pageWords: (page: RmmzEventPage) => readonly string[],
): BattlerSetup =>
{
  return {
    defaults: jabsDefaultsOf(plugins.get('J-ABS')),
    levels: plugins.has(LEVEL_PLUGIN),
    passives: plugins.has(PASSIVE_PLUGIN) && plugins.has(PASSIVE_AFFIX_PLUGIN),
    motions: plugins.has(MOTION_PLUGIN),
    motionDefaults: motionDefaultsFrom(motionConfig),
    pageWords,
  };
};

/**
 * Builds what a change is read against, from the setup and the enemies as they stand.
 * @param {BattlerSetup} setup The setup.
 * @param {readonly (EnemyRecord | null)[]} enemies The enemies, by id.
 * @returns {BattlerContext} The context.
 */
const battlerContextOf = (setup: BattlerSetup, enemies: readonly (EnemyRecord | null)[]): BattlerContext =>
{
  return {
    enemyOf: enemyId => enemies[enemyId] ?? null,
    defaults: setup.defaults,
    motionDefaults: setup.motionDefaults,
  };
};

/**
 * Names a change for the history panel: a value given or taken out, a motion added, changed or taken off.
 * @param {BattlerChange} change The change.
 * @returns {string} Such as "Change battler sight", or "Clear battler sight".
 */
const battlerStepName = (change: BattlerChange): string =>
{
  if (change.row === 'motion')
  {
    if (change.motion === null)
    {
      return 'Add battler motion';
    }

    return change.value === null
      ? 'Remove battler motion'
      : 'Change battler motion';
  }

  return change.value === null
    ? `Clear battler ${ROW_WORDS[change.row]}`
    : `Change battler ${ROW_WORDS[change.row]}`;
};

/**
 * Applies one event's edits inside a transaction, each addressed inside the event, from where the event sits.
 * @param {Transaction} tx The open transaction.
 * @param {DocumentKey} key The map's document.
 * @param {PatchPath} eventPath Where the event sits in it, such as {@code ['events', 5]}.
 * @param {readonly EventEdit[]} edits The edits, in order.
 */
const applyBattlerEdits = (tx: Transaction, key: DocumentKey, eventPath: PatchPath, edits: readonly EventEdit[]): void =>
{
  edits.forEach(edit =>
  {
    const path = [ ...eventPath, ...edit.path ];
    if (edit.kind === 'set')
    {
      tx.set(key, path, edit.value);
      return;
    }

    tx.splice(key, path, edit.index, edit.deleteCount, edit.inserted);
  });
};

export { applyBattlerEdits, battlerContextOf, battlerSetupOf, battlerStepName, MOTION_CONFIG, MOTION_PLUGIN };
export type { BattlerSetup };
