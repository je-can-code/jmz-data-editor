import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { SeasonOffer } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { PageTest } from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { ShownPages } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { TIME_PAGES_ID, timeModule, timePageCondition } from '../../../../src/mapEditor/modules/time/timeModule.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * While J-TIME is enabled, its module offers every map view the clock, starting at the game's own starting time, naming
 * each part of the day as the game does, and offering its four seasons, the game starting in the one its starting month
 * falls in, each named with the date it brings. It adds J-TIME's page tags to the game's page rule, read and judged as
 * the plugin reads and judges them at the window's clock: its time of day, on the date its season moves the start to,
 * the starting date itself until a season is picked. So a map shows each event's page as a fresh save would at the
 * clock's time and date. A page carrying no time tag is never held back; one carrying only date tags (a day, a month, a
 * year, a season) never changes as the hour moves, and one carrying only tags of the time of day never changes as the
 * season does. Each page says when it shows in the tags' own words. Without J-TIME, there is no clock and no page is
 * held back by time.
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

  it('offers the four seasons, the game starting in the one its starting month falls in, each named with the date it brings', () =>
  {
    // Arrange.
    const registry = registryOver(time(true));

    // Act.
    const seasons = registry.clockOffer()?.seasons as SeasonOffer;

    // Assert: Winter for December, the start itself, and each other season on the 16th after it.
    expect([ seasons.names, seasons.startsIn, [ 0, 1, 2, 3 ].map(seasons.dateWords) ])
      .toStrictEqual([
        [ 'Spring', 'Summer', 'Autumn', 'Winter' ],
        3,
        [ 'March 16, 2027', 'June 16, 2027', 'September 16, 2027', 'December 16, 2026' ],
      ]);
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
      expect([ test.followsClock, test.followsDate, held ])
        .toStrictEqual([ false, true, [ true, true ] ]);
    });

    it('follows the date for a page reading any part of it, and never for one asking only the time of day', () =>
    {
      // Arrange: pages each carrying one kind of tag, those of the time of day first, then those reading the date.
      const pages = [
        [ '<minutePage:30>', '<hourPage:18>', '<timeOfDayPage:night>', '<timeRangePage:4:00-16:00>', '<minuteRangePage:10-50>', '<hourRangePage:18-5>' ],
        [ '<dayPage:16>', '<monthPage:6>', '<yearPage:2027>', '<seasonOfYearPage:summer>' ],
        [ '<dayRangePage:10-20>', '<monthRangePage:6-8>', '<yearRangePage:2027-2028>', '<fullDateRangePage:[0,0,1,6,2027]-[0,0,30,6,2027]>' ],
      ].flat();

      // Act.
      const follows = pages.map(line => (timePageCondition(START).read(commented([ line ])) as PageTest).followsDate);

      // Assert.
      expect(follows)
        .toStrictEqual([ false, false, false, false, false, false, true, true, true, true, true, true, true, true ]);
    });

    it('judges every date and season tag on the date the clock\'s season moves to, a near miss on each side holding on neither', () =>
    {
      // Arrange: each tag reading the date, at noon in Summer, which moves Chef Adventure's start to 16 June 2027: a tag
      // naming that date's day, month, year or season, or a span around it, then one either side of it.
      const tags = [
        [ '<dayPage:16>', '<dayPage:15>', '<dayPage:17>' ],
        [ '<monthPage:6>', '<monthPage:5>', '<monthPage:7>' ],
        [ '<yearPage:2027>', '<yearPage:2026>', '<yearPage:2028>' ],
        [ '<seasonOfYearPage:summer>', '<seasonOfYearPage:spring>', '<seasonOfYearPage:autumn>' ],
        [ '<dayRangePage:10-20>', '<dayRangePage:1-15>', '<dayRangePage:17-20>' ],
        [ '<monthRangePage:6-8>', '<monthRangePage:3-5>', '<monthRangePage:7-9>' ],
        [ '<yearRangePage:2027-2028>', '<yearRangePage:2026-2027>', '<yearRangePage:2028-2030>' ],
        [
          '<fullDateRangePage:[0,0,16,6,2027]-[59,23,16,6,2027]>',
          '<fullDateRangePage:[0,0,15,6,2027]-[59,23,15,6,2027]>',
          '<fullDateRangePage:[0,0,17,6,2027]-[59,23,17,6,2027]>',
        ],
      ];

      // Act.
      const held = tags.map(lines => lines.map(line => (timePageCondition(START).read(commented([ line ])) as PageTest).holds({ timeOfDay: 720, season: 1 })));

      // Assert.
      expect(held)
        .toStrictEqual([
          [ true, false, false ],
          [ true, false, false ],
          [ true, false, false ],
          [ true, false, false ],
          [ true, false, false ],
          [ true, false, false ],
          [ true, false, false ],
          [ true, false, false ],
        ]);
    });

    it('judges the date\'s tags on the starting date until a season is picked, and on each season\'s own date after', () =>
    {
      // Arrange: a page shown only in 2027, and one only in Autumn.
      const in2027 = timePageCondition(START).read(commented([ '<yearPage:2027>' ])) as PageTest;
      const inAutumn = timePageCondition(START).read(commented([ '<seasonOfYearPage:autumn>' ])) as PageTest;

      // Act: no season picked, then Spring, Autumn and Winter, at noon.
      const held = [ null, 0, 2, 3 ].map(season => [ in2027.holds({ timeOfDay: 720, season }), inAutumn.holds({ timeOfDay: 720, season }) ]);

      // Assert: Winter is the start's own season, so it brings the starting date back.
      expect(held)
        .toStrictEqual([ [ false, false ], [ true, false ], [ true, true ], [ false, false ] ]);
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

  it('shows a page tagged for Summer once the clock is in Summer, and leaves a time-torch alone as the season moves', () =>
  {
    // Arrange: a stall closed on its first page and open in Summer on its second, and a time-torch, read by the rule over
    // J-TIME's module at 14:00 on the starting date, in Winter.
    const registry = registryOver(time(true));
    const pages = new ShownPages({ save: { party: [ 1, 2 ] }, conditions: registry.pageConditions() }, 840);
    const stall = event(12, [ commented([]), commented([ '<seasonOfYearPage:summer>' ]) ]);
    const torch = event(54, [ commented([]), commented([ '<light:[4, #ffbb73, 40, flicker]>', '<hourRangePage:18-5>' ]) ]);
    const winter = [ pages.shownPage(stall), pages.shownPage(torch) ];

    // Act: Summer picked, then Autumn.
    const summer = [ pages.setSeason(1), pages.shownPage(stall) ];
    const autumn = [ pages.setSeason(2), pages.shownPage(stall) ];

    // Assert: the stall opened in Summer and closed again in Autumn, and the torch kept its page throughout.
    expect([ winter, summer, autumn, pages.shownPage(torch) ])
      .toStrictEqual([
        [ { index: 0, faded: false }, { index: 0, faded: false } ],
        [ [ 12 ], { index: 1, faded: false } ],
        [ [ 12 ], { index: 0, faded: false } ],
        { index: 0, faded: false },
      ]);
  });
});
