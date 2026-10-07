import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PluginModule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { PageCondition, PageTest } from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { ShownPages } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { newGameQuestLog } from '../../../../src/mapEditor/modules/quest/questLog.ts';
import { QUEST_PAGES_ID, questModule, questPageCondition } from '../../../../src/mapEditor/modules/quest/questModule.ts';
import { timeModule } from '../../../../src/mapEditor/modules/time/timeModule.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * While J-OMNI-Quests is enabled, its module adds the plugin's page tags to the game's page rule, judged as the plugin
 * judges them against every quest and objective in the state a new game starts it in, worked out from the project's
 * config.quest.json: so a map shows each event's page as a fresh save would. On a fresh save every quest and every
 * objective is inactive, so a page waiting for one to be inactive shows, and a page waiting for one to be under way,
 * done, failed or missed does not; a quest-giver shows the page offering its first quest. A page carrying no quest tag
 * is never held back. Quests never move with the clock, so moving it judges no quest-gated page again. Each page says
 * when it shows in the author's words, after its own conditions and any other plugin's, wherever the editor says when a
 * page shows.
 *
 * A config that cannot be read is said over every map view, and every page waiting on a quest is held back, as though
 * the game had no quest at all. Without J-OMNI-Quests, no page is held back by a quest.
 *
 * While it is enabled the module also lets the preview set where each quest stands, and every quest-gated page is judged
 * at the window's preview: whatever it sets of a quest, by each shape the tag takes, and a new game's state everywhere
 * else. A page names the quests it reads, so a change to one quest judges again the events reading that quest and no
 * other, however alike their keys, and never an event reading no quest at all.
 */
describe('questModule', () =>
{
  /**
   * J-OMNI-Quests as Chef Adventure's js/plugins.js lists it.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const quests = (status: boolean): PluginsJsEntry => ({ name: 'j/omni/ext/J-OMNI-Quests', status, description: '', parameters: { 'parentConfig': '', 'menu-switch': '101' } });

  /**
   * J-TIME as Chef Adventure's js/plugins.js lists it: a new game at 14:00:00 on 16 December 2026.
   */
  const TIME: PluginsJsEntry = {
    name: 'j/time/J-TIME',
    status: true,
    description: '',
    parameters: { useRealTime: 'false', startingSecond: '0', startingMinute: '0', startingHour: '14', startingDay: '16', startingMonth: '12', startingYear: '2026' },
  };

  /**
   * The project's quests as the server serves them: a delivery with objectives 0 to 2, and its sequel with objective 7.
   */
  const CONFIG = {
    quests: [
      {
        name: 'Herbalist Delivery',
        key: 'herbalist_delivery',
        objectives: [ { id: 0, description: 'Pick the herbs.' }, { id: 1, description: 'Carry them to town.' }, { id: 2, description: 'Hand them over.' } ],
      },
      { name: 'Herbalist Delivery II', key: 'herbalist_delivery_2', objectives: [ { id: 7, description: 'Rest.' } ] },
    ],
    tags: [],
    categories: [],
  } as unknown as JsonValue;

  /**
   * A page holding comments.
   * @param {string[]} comments The comment lines.
   * @returns {RmmzEventPage} The page.
   */
  const commented = (comments: string[]): RmmzEventPage => page(comments.map(text => command(108, [ text ])));

  /**
   * A registry with the given modules switched on over the given plugins, handed the quest config as given.
   * @param {PluginModule[]} modules The modules.
   * @param {PluginsJsEntry[]} plugins The plugins.
   * @param {JsonValue | null} config The quest config, or null for one that could not be read.
   * @param {string | undefined} problem Why it could not be read.
   * @returns {PluginModuleRegistry} The registry.
   */
  const registryOver = (modules: PluginModule[], plugins: PluginsJsEntry[], config: JsonValue | null = CONFIG, problem?: string): PluginModuleRegistry =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    const problems = problem === undefined ? new Map<string, string>() : new Map([ [ 'quest', problem ] ]);
    registry.activate(modules, plugins, new Map([ [ 'quest', config ] ]), problems);
    return registry;
  };

  it('adds its page tags to the page rule while J-OMNI-Quests is enabled, and nothing while it is not', () =>
  {
    // Arrange.
    const registries = [ registryOver([ questModule ], [ quests(true) ]), registryOver([ questModule ], [ quests(false) ]) ];

    // Act.
    const added = registries.map(registry => [ registry.isActive('quest'), registry.pageConditions().map(condition => condition.id), registry.notices() ]);

    // Assert.
    expect(added)
      .toStrictEqual([ [ true, [ QUEST_PAGES_ID ], [] ], [ false, [], [] ] ]);
  });

  it('lets the preview set where each quest stands while J-OMNI-Quests is enabled, and not while it is not', () =>
  {
    // Arrange.
    const registries = [ registryOver([ questModule ], [ quests(true) ]), registryOver([ questModule ], [ quests(false) ]) ];

    // Act.
    const kinds = registries.map(registry => registry.previewKinds().map(kind => [ kind.id, kind.entries(GamePreview.FRESH).map(entry => entry.key) ]));

    // Assert: listing the quests the page condition reads.
    expect(kinds)
      .toStrictEqual([ [ [ 'quest.states', [ 'herbalist_delivery', 'herbalist_delivery_2' ] ] ], [] ]);
  });

  describe('questPageCondition', () =>
  {
    it('asks nothing of a page carrying no quest tag', () =>
    {
      // Arrange: a quest-giver's first page, holding only a light.
      const shown = commented([ '<light:[2]>' ]);

      // Act.
      const test = questPageCondition(newGameQuestLog(CONFIG)).read(shown);

      // Assert.
      expect(test)
        .toBeNull();
    });

    it('holds a page on a fresh save while what it waits on is to be inactive, never following the clock, and says when', () =>
    {
      // Arrange: a page offering the delivery, waiting for it to be inactive; and one waiting for objective 2 to be.
      const condition = questPageCondition(newGameQuestLog(CONFIG));
      const pages = [ commented([ '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ]), commented([ '<pageQuestCondition:[herbalist_delivery, 2, inactive]>' ]) ];

      // Act.
      const tests = pages.map(shown => condition.read(shown) as PageTest);

      // Assert: both hold at any hour, neither follows the clock.
      expect(tests.map(test => [ test.holds({ timeOfDay: 840 }), test.holds({ timeOfDay: 1320 }), test.followsClock, test.words ]))
        .toStrictEqual([
          [ true, true, false, [ 'while "Herbalist Delivery" is inactive' ] ],
          [ true, true, false, [ 'while objective 2 of "Herbalist Delivery" is inactive' ] ],
        ]);
    });

    it('holds back on a fresh save a page waiting for a quest or an objective to be under way, done, failed or missed', () =>
    {
      // Arrange: the delivery active; objective 2 active, then in each later state; the delivery completed.
      const condition = questPageCondition(newGameQuestLog(CONFIG));
      const lines = [
        '<pageQuestCondition:[herbalist_delivery]>',
        '<pageQuestCondition:[herbalist_delivery, 2]>',
        '<pageQuestCondition:[herbalist_delivery, 2, completed]>',
        '<pageQuestCondition:[herbalist_delivery, 2, failed]>',
        '<pageQuestCondition:[herbalist_delivery, 2, missed]>',
        '<pageQuestCondition:[herbalist_delivery, -1, completed]>',
      ];

      // Act.
      const held = lines.map(line => (condition.read(commented([ line ])) as PageTest).holds({ timeOfDay: 840 }));

      // Assert.
      expect(held)
        .toStrictEqual([ false, false, false, false, false, false ]);
    });

    it('holds back a page waiting on a quest the game does not track, or an objective another quest has, saying so', () =>
    {
      // Arrange: objective 7 is the sequel's, and the third quest is none of the project's.
      const condition = questPageCondition(newGameQuestLog(CONFIG));
      const pages = [ commented([ '<pageQuestCondition:[herbalist_delivery, 7, inactive]>' ]), commented([ '<pageQuestCondition:[herbalist_delivery_3, -1, inactive]>' ]) ];

      // Act.
      const tests = pages.map(shown => condition.read(shown) as PageTest);

      // Assert.
      expect(tests.map(test => [ test.holds({ timeOfDay: 840 }), test.words ]))
        .toStrictEqual([
          [ false, [ 'while objective 7 of "Herbalist Delivery" is inactive (no such objective)' ] ],
          [ false, [ 'while quest herbalist_delivery_3 is inactive (no such quest)' ] ],
        ]);
    });

    it('names the quests the game tracks that a page reads, each once, and none it does not track', () =>
    {
      // Arrange: a page waiting on the delivery twice, on its sequel, and on a quest the game does not track.
      const condition = questPageCondition(newGameQuestLog(CONFIG));
      const shown = commented([
        '<pageQuestCondition:[herbalist_delivery, -1, inactive]>',
        '<pageQuestCondition:[herbalist_delivery, 1]>',
        '<pageQuestCondition:[herbalist_delivery_2]>',
        '<pageQuestCondition:[herbalist_delivery_3]>',
      ]);

      // Act.
      const test = condition.read(shown) as PageTest;

      // Assert.
      expect(test.reads)
        .toStrictEqual([ 'quest.states:herbalist_delivery', 'quest.states:herbalist_delivery_2' ]);
    });

    it('holds a page at the preview by each shape of the tag, and none of them on a fresh save', () =>
    {
      // Arrange: the four shapes, each asked at a preview setting what one of them waits for: objective 1 under way,
      // objective 2 under way, objective 2 completed, and the delivery completed of its own.
      const condition = questPageCondition(newGameQuestLog(CONFIG));
      const tests = [
        '<pageQuestCondition:[herbalist_delivery]>',
        '<pageQuestCondition:[herbalist_delivery, 2]>',
        '<pageQuestCondition:[herbalist_delivery, 2, completed]>',
        '<pageQuestCondition:[herbalist_delivery, -1, completed]>',
      ].map(line => condition.read(commented([ line ])) as PageTest);
      const previews = [
        { objectives: { 1: 'active' } },
        { objectives: { 2: 'active' } },
        { objectives: { 2: 'completed' } },
        { state: 'completed' },
      ].map(value => GamePreview.FRESH.with('quest.states', 'herbalist_delivery', value));

      // Act.
      const held = tests.map(test => [ ...previews.map(preview => test.holds({ timeOfDay: 840, preview })), test.holds({ timeOfDay: 840 }) ]);

      // Assert: the quest under way, objective 2 under way, objective 2 completed, the quest completed; down, each at the
      // four previews and then on a fresh save.
      expect(held)
        .toStrictEqual([
          [ true, true, true, false, false ],
          [ false, true, false, false, false ],
          [ false, false, true, false, false ],
          [ false, false, false, true, false ],
        ]);
    });
  });

  it('judges again only the events whose pages read a quest the preview changed, and shows each its new page', () =>
  {
    // Arrange: a giver of the delivery, offering it and then waiting on objective 1; a giver of the sequel, whose key
    // differs only by a suffix, alike; and a lamp reading no quest. Every page's quest test notes its event when asked.
    const condition = questPageCondition(newGameQuestLog(CONFIG));
    const owners = new Map<RmmzEventPage, number>();
    const asked = new Set<number>();
    const noting: PageCondition = {
      id: condition.id,
      read: shown =>
      {
        const test = condition.read(shown);
        return test === null
          ? null
          : {
            ...test,
            holds: moment =>
            {
              asked.add(owners.get(shown) as number);
              return test.holds(moment);
            },
          };
      },
    };
    const giver = (id: number, key: string) => event(id, [ commented([]), commented([ `<pageQuestCondition:[${key}, -1, inactive]>` ]), commented([ `<pageQuestCondition:[${key}, 1]>` ]) ]);
    const events = [ giver(1, 'herbalist_delivery'), giver(2, 'herbalist_delivery_2'), event(3, [ commented([ '<light:[2]>' ]) ]) ];
    events.forEach(each => each.pages.forEach(shown => owners.set(shown, each.id)));
    const pages = new ShownPages({ save: { party: [ 1, 2 ] }, conditions: [ noting ] }, 840);
    const before = events.map(each => pages.shownPage(each).index);
    asked.clear();

    // Act: objective 1 of the delivery under way.
    const turned = pages.setPreview(GamePreview.FRESH.with('quest.states', 'herbalist_delivery', { objectives: { 1: 'active' } }));

    // Assert: only the delivery's giver asked again, and moved on to the objective's page; the sequel's still offering.
    expect([ before, [ ...asked ], turned, events.map(each => pages.shownPage(each).index) ])
      .toStrictEqual([ [ 1, 1, 0 ], [ 1 ], [ 1 ], [ 2, 1, 0 ] ]);
  });

  it('says over the map when the config cannot be read, and holds back every page waiting on a quest', () =>
  {
    // Arrange: the server refused the file.
    const registry = registryOver([ questModule ], [ quests(true) ], null, 'data/config.quest.json: unexpected end of JSON input');
    const [ condition ] = registry.pageConditions();

    // Act.
    const test = condition.read(commented([ '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ])) as PageTest;

    // Assert.
    expect([ registry.notices().map(notice => notice.id), test.holds({ timeOfDay: 840 }) ])
      .toStrictEqual([ [ 'quest.config' ], false ]);
  });

  it('shows a quest-giver offering its first quest on a fresh save, and judges it again at no hour the clock moves to', () =>
  {
    // Arrange: a quest-giver as the game ships them: a blank first page; its offer, waiting for the delivery to be
    // inactive; the delivery under way at objective 1; and the sequel's offer, once the delivery is completed.
    const registry = registryOver([ questModule ], [ quests(true) ]);
    const pages = new ShownPages({ save: { party: [ 1, 2 ] }, conditions: registry.pageConditions() }, 840);
    const giver = event(52, [
      commented([]),
      commented([ '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ]),
      commented([ '<pageQuestCondition:[herbalist_delivery, 1]>' ]),
      commented([ '<pageQuestCondition:[herbalist_delivery_2, -1, inactive]>', '<pageQuestCondition:[herbalist_delivery, -1, completed]>' ]),
    ]);
    const shown = pages.shownPage(giver);

    // Act: the clock moved to 22:00.
    const turned = pages.setTime(1320);

    // Assert: the offer, by day and by night, with nothing following the clock.
    expect([ shown, turned, pages.followingClock, pages.shownPage(giver) ])
      .toStrictEqual([ { index: 1, faded: false }, [], 0, { index: 1, faded: false } ]);
  });

  it('says when a page shows after its own conditions and J-TIME\'s, to every module that asks', () =>
  {
    // Arrange: a module writing down the words its context gives, beside J-TIME's and J-OMNI-Quests' modules; and a page
    // waiting on switch 24, shown from 18:00 to 05:00, while the delivery is inactive.
    let pageWords: ((shown: RmmzEventPage) => readonly string[]) | null = null;
    const listener: PluginModule = {
      id: 'listener',
      title: 'Listener',
      plugins: [],
      register: (_contributions, { pageWords: given }) =>
      {
        pageWords = given;
      },
    };
    registryOver([ listener, timeModule, questModule ], [ TIME, quests(true) ]);
    const shown = {
      ...commented([ '<hourRangePage:18-5>', '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ]),
      conditions: { ...page([]).conditions, switch1Valid: true, switch1Id: 24 },
    };

    // Act.
    const words = (pageWords as unknown as (page: RmmzEventPage) => readonly string[])(shown);

    // Assert.
    expect(words)
      .toStrictEqual([ 'while switch 24 is on', 'from 18:00 to 05:00', 'while "Herbalist Delivery" is inactive' ]);
  });
});
