import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { PageTest } from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { ShownPages } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { TIME_PAGES_ID, timeModule, timePageCondition } from '../../../../src/mapEditor/modules/time/timeModule.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * While J-TIME is enabled, its module offers every map view the clock, starting at the game's own starting time and
 * naming each part of the day as the game does, and adds J-TIME's page tags to the game's page rule, read and judged as
 * the plugin reads and judges them at the window's clock on the game's starting date: so a map shows each event's page
 * as a fresh save would at the clock's time. A page carrying no time tag is never held back; one carrying only date
 * tags (a day, a month, a year, a season) never changes as the clock moves, and one carrying any other tag may. Each
 * page says when it shows in the tags' own words. Without J-TIME, there is no clock and no page is held back by time.
 */
describe('timeModule', () =>
{
  /**
   * J-TIME as Chef Adventure's js/plugins.js lists it: a new game at 14:00:00 on 16 December 2026.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const time = (status: boolean): PluginsJsEntry => ({
    name: 'j/time/J-TIME',
    status,
    description: '',
    parameters: { useRealTime: 'false', startingSecond: '0', startingMinute: '0', startingHour: '14', startingDay: '16', startingMonth: '12', startingYear: '2026' },
  });

  /**
   * A registry with J-TIME's module switched on over J-TIME as listed.
   * @param {PluginsJsEntry} plugin J-TIME.
   * @returns {PluginModuleRegistry} The registry.
   */
  const registryOver = (plugin: PluginsJsEntry): PluginModuleRegistry =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registry.activate([ timeModule ], [ plugin ]);
    return registry;
  };

  /**
   * A page holding comments.
   * @param {string[]} comments The comment lines.
   * @returns {RmmzEventPage} The page.
   */
  const commented = (comments: string[]): RmmzEventPage => page(comments.map(text => command(108, [ text ])));

  /**
   * Chef Adventure's starting date, as the module reads it.
   */
  const START = { seconds: 0, days: 16, months: 12, years: 2026 };

  it('offers the clock at the game\'s starting time, naming the parts of the day as the game does, while J-TIME is enabled', () =>
  {
    // Arrange.
    const registry = registryOver(time(true));

    // Act.
    const offer = registry.clockOffer();

    // Assert.
    expect([ offer?.startsAt, offer?.partOfDay(1320), offer?.partOfDay(840) ])
      .toStrictEqual([ 840, 'Night', 'Afternoon' ]);
  });

  it('adds J-TIME\'s page tags to the page rule while J-TIME is enabled, and offers nothing while it is not', () =>
  {
    // Arrange.
    const registries = [ registryOver(time(true)), registryOver(time(false)) ];

    // Act.
    const added = registries.map(registry => [ registry.isActive('time'), registry.clockOffer() === null, registry.pageConditions().map(condition => condition.id) ]);

    // Assert.
    expect(added)
      .toStrictEqual([ [ true, false, [ TIME_PAGES_ID ] ], [ false, true, [] ] ]);
  });

  describe('timePageCondition', () =>
  {
    it('asks nothing of a page carrying no time tag', () =>
    {
      // Arrange: a lamp's unlit page, holding only a light's tag.
      const shown = commented([ '<light:[4]>' ]);

      // Act.
      const test = timePageCondition(START).read(shown);

      // Assert.
      expect(test)
        .toBeNull();
    });

    it('holds a page while every time tag it carries holds at the clock\'s time on the starting date, and says when', () =>
    {
      // Arrange: a lamp lit from 18:00 to 05:00 in Winter, which the 16th of December is.
      const test = timePageCondition(START).read(commented([ '<hourRangePage:18-5>', '<seasonOfYearPage:winter>' ])) as PageTest;

      // Act: at 14:00, 22:00 and 02:00.
      const held = [ 840, 1320, 120 ].map(timeOfDay => test.holds({ timeOfDay }));

      // Assert.
      expect([ held, test.words, test.followsClock ])
        .toStrictEqual([ [ false, true, true ], [ 'from 18:00 to 05:00', 'in Winter' ], true ]);
    });

    it('never follows the clock for a page carrying only date tags, which the clock cannot change', () =>
    {
      // Arrange: a page shown only in Winter, on the 16th, in 2026.
      const test = timePageCondition(START).read(commented([ '<seasonOfYearPage:winter>', '<dayPage:16>', '<yearPage:2026>', '<monthPage:12>' ])) as PageTest;

      // Act.
      const held = [ 0, 720 ].map(timeOfDay => test.holds({ timeOfDay }));

      // Assert.
      expect([ test.followsClock, held ])
        .toStrictEqual([ false, [ true, true ] ]);
    });
  });

  it('shows Chef Adventure\'s lamps lit and its night kappa only by night, through the page rule, with the starting party', () =>
  {
    // Arrange: a time-torch, unlit on page 1 and lit from 18:00 to 05:00 on page 2; and a kappa out from 16:00 to 04:00
    // on its only page; read by the rule over J-TIME's module, at 14:00.
    const registry = registryOver(time(true));
    const pages = new ShownPages({ save: { party: [ 1, 2 ] }, conditions: registry.pageConditions() }, 840);
    const torch = event(54, [ commented([]), commented([ '<light:[4, #ffbb73, 40, flicker]>', '<hourRangePage:18-5>' ]) ]);
    const kappa = event(39, [ commented([ '<timeRangePage:16:00-4:00>' ]) ]);
    const noon = [ pages.shownPage(torch), pages.shownPage(kappa) ];

    // Act: the clock moved to 22:00.
    const turned = pages.setTime(1320);

    // Assert.
    expect([ noon, turned, pages.shownPage(torch), pages.shownPage(kappa) ])
      .toStrictEqual([
        [ { index: 0, faded: false }, { index: 0, faded: true } ],
        [ 54, 39 ],
        { index: 1, faded: false },
        { index: 0, faded: false },
      ]);
  });
});
