import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { activePageOf, pageHolds, readEvent, type PageCondition, type PageRule } from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { objectiveOf, questOf, waitsOnObjective } from '../../../../src/mapEditor/modules/quest/questConditions.ts';
import { newGameQuestLog, type QuestLog } from '../../../../src/mapEditor/modules/quest/questLog.ts';
import { questModule } from '../../../../src/mapEditor/modules/quest/questModule.ts';
import { readQuestTags } from '../../../../src/mapEditor/modules/quest/questTags.ts';
import { timeModule } from '../../../../src/mapEditor/modules/time/timeModule.ts';
import { readPluginEntries } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * J-OMNI-Quests' page condition, held against every quest-gated page the game ships.
 *
 * Every page on every shipped map carrying one of the plugin's page tags is read under the condition the editor shows
 * Chef Adventure by: J-OMNI-Quests' module switched on over the game's own js/plugins.js and config.quest.json, as the
 * game works out a new game's quests. Each such page answers, whether it holds on a fresh save and when it shows, one
 * entry per tag, and reading and judging never throws, whatever a page holds.
 *
 * The shape the game ships most answers as the game does. A quest-giver keeps a blank first page and offers its first
 * quest on its second, waiting for that quest to be inactive, which every quest is on a fresh save: so it shows the
 * offer, or its blank first page while the offer waits on a switch too, which no fresh save has on.
 *
 * And every page can be seen further along the story: each page waiting on quests and objectives the game has, whose
 * own conditions a preview can meet, holds once the preview sets what it waits for, whichever shape its tags take.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * One shipped event and where it lives.
 */
type ShippedEvent = {
  readonly where: string;
  readonly event: RmmzMapEvent;
};

/**
 * Reads every event on every shipped map with a page carrying a quest tag.
 * @param {string} root The project root.
 * @returns {ShippedEvent[]} The events, in map and id order.
 */
const readQuestGatedEvents = (root: string): ShippedEvent[] =>
{
  return listMapFiles(root).flatMap(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    return map.events.flatMap(event =>
    {
      const gated = event !== null && event.pages.some(page => readQuestTags(page).length > 0);
      return gated ? [ { where: `${file.replace('.json', '')}#${event.id}`, event } ] : [];
    });
  });
};

/**
 * Builds the rule the editor shows the game by: J-OMNI-Quests' and J-TIME's modules switched on over the game's own
 * js/plugins.js, handed the game's own config.quest.json, and the game's starting party, as the server reads it.
 * @param {string} root The project root.
 * @returns {PageRule} The rule.
 */
const gameRule = (root: string): PageRule =>
{
  const plugins = readPluginEntries(readFileSync(`${root}/js/plugins.js`, 'utf8'));
  const registry = new PluginModuleRegistry(new CommandCatalog());
  registry.activate([ timeModule, questModule ], plugins, new Map([ [ 'quest', readDataFile(root, 'config.quest.json') as JsonValue ] ]));
  const system = readDataFile(root, 'System.json') as { partyMembers: number[] };
  const actors = readDataFile(root, 'Actors.json') as (object | null)[];
  const party = system.partyMembers.filter(actorId => actors[actorId] !== null && actors[actorId] !== undefined);
  return { save: { party }, conditions: registry.pageConditions() };
};

/**
 * Reports whether an event is a quest-giver as the game ships them: a first page carrying no quest tag, and a second
 * page offering a quest, waiting only for that quest to be inactive.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for one.
 */
const isQuestGiver = (event: RmmzMapEvent): boolean =>
{
  const [ first, offer ] = event.pages;
  const offered = offer === undefined ? [] : readQuestTags(offer);
  return readQuestTags(first).length === 0
    && offered.length === 1
    && offered[0].objectiveId === -1
    && offered[0].state === 'inactive';
};

/**
 * Reports whether a page waits on a switch.
 * @param {RmmzEventPage} page The page.
 * @returns {boolean} True when either switch condition is set.
 */
const waitsOnSwitch = (page: RmmzEventPage): boolean =>
{
  return page.conditions.switch1Valid || page.conditions.switch2Valid;
};

/**
 * Reports whether a preview can bring a page to show: its own conditions wait for nothing a preview never sets (a self
 * switch, an item, an actor outside the starting party), and its tags name only quests and objectives the game has.
 * @param {RmmzEventPage} page The page.
 * @param {QuestLog} log The quests a new game tracks.
 * @param {readonly number[]} party The starting party.
 * @returns {boolean} True when a preview can.
 */
const canBeShown = (page: RmmzEventPage, log: QuestLog, party: readonly number[]): boolean =>
{
  const { conditions } = page;
  const settled = conditions.selfSwitchValid === false
    && conditions.itemValid === false
    && (conditions.actorValid === false || party.includes(conditions.actorId));
  return settled && readQuestTags(page).every(tag =>
  {
    const quest = questOf(tag, log);
    return quest !== null && (waitsOnObjective(tag) === false || objectiveOf(tag, quest) !== null);
  });
};

/**
 * Builds the preview setting what a page's own conditions wait for: its switches on and its variable at the page's value.
 * @param {RmmzEventPage} page The page.
 * @returns {GamePreview} The preview.
 */
const ownConditionsMet = (page: RmmzEventPage): GamePreview =>
{
  const { conditions } = page;
  const switches = [ conditions.switch1Valid ? [ conditions.switch1Id ] : [], conditions.switch2Valid ? [ conditions.switch2Id ] : [] ].flat();
  const withSwitches = switches.reduce((preview, switchId) => preview.withSwitch(switchId, true), GamePreview.FRESH);
  return conditions.variableValid
    ? withSwitches.withVariable(conditions.variableId, conditions.variableValue)
    : withSwitches;
};

/**
 * Sets in a preview each quest or objective a page's tags name, in the state each tag waits for: an objective's state
 * for a tag naming one, and the quest's own state for a tag naming none.
 * @param {RmmzEventPage} page The page.
 * @param {GamePreview} preview The preview to set them in.
 * @returns {GamePreview} The preview with them set.
 */
const questsMet = (page: RmmzEventPage, preview: GamePreview): GamePreview =>
{
  // each quest's setting gathers every tag naming it.
  const settings = new Map<string, { state?: string; objectives: Record<string, string> }>();
  readQuestTags(page).forEach(tag =>
  {
    const setting = settings.get(tag.written) ?? { objectives: {} };
    if (waitsOnObjective(tag))
    {
      setting.objectives[String(tag.objectiveId)] = tag.state;
    }
    else
    {
      setting.state = tag.state;
    }

    settings.set(tag.written, setting);
  });
  return [ ...settings ].reduce((each, [ key, setting ]) => each.with('quest.states', key, setting as JsonValue), preview);
};

const shipped: ShippedEvent[] = project === null ? [] : readQuestGatedEvents(project);

const rule: PageRule | null = project === null ? null : gameRule(project);

describe.skipIf(project === null)('J-OMNI-Quests\' page condition over every shipped quest-gated page', () =>
{
  it('answers every quest-gated page the game ships, whether it holds and when it shows, never throwing', () =>
  {
    // Arrange: the module's condition, and every shipped page carrying a quest tag.
    const condition = (rule as PageRule).conditions.find(each => each.id === 'quest.pages') as PageCondition;
    const pages = shipped.flatMap(({ where, event }) => event.pages
      .map((page, index) => ({ where: `${where} page ${index + 1}`, page, tags: readQuestTags(page).length }))
      .filter(each => each.tags > 0));

    // Act.
    const strays = pages.flatMap(({ where, page, tags }) =>
    {
      const test = condition.read(page);
      const answered = test !== null
        && typeof test.holds({ timeOfDay: 840 }) === 'boolean'
        && test.followsClock === false
        && test.words.length === tags
        && test.words.every(words => words.startsWith('while '));
      return answered ? [] : [ where ];
    });

    // Assert: some two hundred pages read, every one of them answering.
    expect([ pages.length > 200, strays ])
      .toStrictEqual([ true, [] ]);
  });

  it('shows every quest-giver offering its first quest, or its blank first page while the offer waits on a switch', () =>
  {
    // Arrange: the game's quest-givers.
    const pageRule = rule as PageRule;
    const givers = shipped.filter(({ event }) => isQuestGiver(event));

    // Act: each giver's page on a fresh save at 14:00, beside whether its offer waits on a switch.
    const shown = new Set(givers.map(({ event }) => `${waitsOnSwitch(event.pages[1])}:${activePageOf(readEvent(event, pageRule), { timeOfDay: 840 })}`));

    // Assert: well over a dozen givers, every one of them alike.
    expect([ givers.length > 15, [ ...shown ].sort() ])
      .toStrictEqual([ true, [ 'false:1', 'true:0' ] ]);
  });

  it('shows every quest-gated page a preview can bring about once it sets what the page waits for', () =>
  {
    // Arrange: J-OMNI-Quests' condition alone, so no hour stands in the way; the quests a new game tracks; and every
    // shipped page a preview can bring to show.
    const pageRule = rule as PageRule;
    const condition = pageRule.conditions.find(each => each.id === 'quest.pages') as PageCondition;
    const questsOnly: PageRule = { save: pageRule.save, conditions: [ condition ] };
    const log = newGameQuestLog(readDataFile(project as string, 'config.quest.json') as JsonValue);
    const pages = shipped.flatMap(({ where, event }) => event.pages
      .map((page, index) => ({ where: `${where} page ${index + 1}`, event, index, page }))
      .filter(({ page }) => readQuestTags(page).length > 0 && canBeShown(page, log, pageRule.save.party)));

    // Act: each page judged with its own conditions met and every quest as a new game has it, then with its quests set
    // as its tags wait for them too.
    const answers = pages.map(({ where, event, index, page }) =>
    {
      const reading = readEvent(event, questsOnly).pages[index];
      const own = ownConditionsMet(page);
      return { where, before: pageHolds(reading, { timeOfDay: 840, preview: own }), after: pageHolds(reading, { timeOfDay: 840, preview: questsMet(page, own) }) };
    });

    // Assert: over two hundred pages (207 on 2026-10-07), every one shown once its quests are set, and most of them (188)
    // shown only then, the rest being offers a fresh save already shows.
    const strays = answers.filter(answer => answer.after === false).map(answer => answer.where);
    const broughtOn = answers.filter(answer => answer.before === false && answer.after).length;
    expect([ pages.length > 200, strays, broughtOn > 150 ])
      .toStrictEqual([ true, [], true ]);
  });
});
