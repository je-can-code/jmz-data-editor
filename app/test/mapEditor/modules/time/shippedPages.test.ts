import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { activePageOf, readEvent, type PageRule } from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { timeModule } from '../../../../src/mapEditor/modules/time/timeModule.ts';
import { readTimeTags } from '../../../../src/mapEditor/modules/time/timeTags.ts';
import { readPluginEntries } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * The page rule, held against every event the game ships.
 *
 * Every event on every shipped map is read under the rule the editor shows Chef Adventure by: the engine's own
 * conditions on a fresh save, the starting party Jerald and Rupert, and J-TIME's page tags judged from the game's own
 * js/plugins.js, its starting date included. At every hour tried, each event's answer is a page it has, or none, and
 * reading and judging never throws, whatever a page holds.
 *
 * Two shapes the game ships by the hundred answer as the game does. A time-torch, cold on its first page and lit on its
 * second from 18:00 to 05:00, shows its cold page through the afternoon and its lit page by night, either side of
 * midnight. A night creature out from 16:00 to 04:00 on its only page shows nothing by day, which the editor draws faded,
 * and its page by night.
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
 * Reads every event on every shipped map.
 * @param {string} root The project root.
 * @returns {ShippedEvent[]} The events, in map and id order.
 */
const readShippedEvents = (root: string): ShippedEvent[] =>
{
  return listMapFiles(root).flatMap(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    return map.events.flatMap(event => (event === null ? [] : [ { where: `${file.replace('.json', '')}#${event.id}`, event } ]));
  });
};

/**
 * Builds the rule the editor shows the game by: J-TIME's module switched on over the game's own js/plugins.js, and the
 * game's starting party, as the server reads it.
 * @param {string} root The project root.
 * @returns {PageRule} The rule.
 */
const gameRule = (root: string): PageRule =>
{
  const plugins = readPluginEntries(readFileSync(`${root}/js/plugins.js`, 'utf8'));
  const registry = new PluginModuleRegistry(new CommandCatalog());
  registry.activate([ timeModule ], plugins);
  const system = readDataFile(root, 'System.json') as { partyMembers: number[] };
  const actors = readDataFile(root, 'Actors.json') as (object | null)[];
  const party = system.partyMembers.filter(actorId => actors[actorId] !== null && actors[actorId] !== undefined);
  return { save: { party }, conditions: registry.pageConditions() };
};

/**
 * The hours tried, in minutes past midnight: midnight, the small hours, the end of the night's span and the minute
 * before it, morning, noon, the game's 14:00 start, the evening's turn and the minutes about 18:00, and the last
 * minute of the day.
 */
const HOURS = [ 0, 120, 239, 240, 299, 300, 480, 720, 840, 959, 960, 1079, 1080, 1081, 1320, 1439 ];

const shipped: ShippedEvent[] = project === null ? [] : readShippedEvents(project);

const rule: PageRule | null = project === null ? null : gameRule(project);

/**
 * Reports whether an event is a time-torch as the game ships them: a first page with no time tag, and a second page
 * lit from 18:00 to 05:00, and nothing else gating either.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for one.
 */
const isTimeTorch = (event: RmmzMapEvent): boolean =>
{
  const [ cold, lit ] = event.pages;
  return event.pages.length === 2
    && readTimeTags(cold).length === 0
    && readTimeTags(lit).map(tag => `${tag.kind} ${tag.captures.join('-')}`).join() === 'HourRange 18-5'
    && [ cold, lit ].every(page => page.conditions.switch1Valid === false && page.conditions.selfSwitchValid === false);
};

/**
 * Reports whether an event is a night creature as the game ships them: one page, out from 16:00 to 04:00, and nothing
 * else gating it.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for one.
 */
const isNightCreature = (event: RmmzMapEvent): boolean =>
{
  const [ only ] = event.pages;
  return event.pages.length === 1
    && readTimeTags(only).map(tag => `${tag.kind} ${tag.captures.join('-')}`).join() === 'TimeRange 16-00-4-00'
    && only.conditions.switch1Valid === false && only.conditions.variableValid === false;
};

describe.skipIf(project === null)('the page rule over every shipped event', () =>
{
  it('answers a page each event has, or none, for every event on every shipped map at every hour, never throwing', () =>
  {
    // Arrange: the game's rule, and every shipped event.
    const pageRule = rule as PageRule;

    // Act.
    const strays = shipped.flatMap(({ where, event }) =>
    {
      const reading = readEvent(event, pageRule);
      return HOURS.flatMap(timeOfDay =>
      {
        const active = activePageOf(reading, { timeOfDay });
        return Number.isInteger(active) && active >= -1 && active < event.pages.length ? [] : [ `${where} at ${timeOfDay}: ${active}` ];
      });
    });

    // Assert: thousands of events read, none answering anything but a page it has or none.
    expect([ shipped.length > 7000, strays ])
      .toStrictEqual([ true, [] ]);
  });

  it('shows every time-torch cold through the afternoon and lit by night, either side of midnight', () =>
  {
    // Arrange: the game's time-torches.
    const pageRule = rule as PageRule;
    const torches = shipped.filter(({ event }) => isTimeTorch(event));

    // Act: at 14:00, 17:59, 18:01, 22:00, 02:00 and 05:00.
    const shown = new Set(torches.map(({ event }) =>
    {
      const reading = readEvent(event, pageRule);
      return [ 840, 1079, 1081, 1320, 120, 300 ].map(timeOfDay => activePageOf(reading, { timeOfDay })).join();
    }));

    // Assert: hundreds of torches, every one of them alike.
    expect([ torches.length > 250, [ ...shown ] ])
      .toStrictEqual([ true, [ '0,0,1,1,1,0' ] ]);
  });

  it('shows every night creature only from 16:00 to 04:00, and nothing by day', () =>
  {
    // Arrange: the game's night creatures.
    const pageRule = rule as PageRule;
    const creatures = shipped.filter(({ event }) => isNightCreature(event));

    // Act: at 14:00, 16:01, 22:00, 03:59 and 04:01.
    const shown = new Set(creatures.map(({ event }) =>
    {
      const reading = readEvent(event, pageRule);
      return [ 840, 961, 1320, 239, 241 ].map(timeOfDay => activePageOf(reading, { timeOfDay })).join();
    }));

    // Assert.
    expect([ creatures.length > 20, [ ...shown ] ])
      .toStrictEqual([ true, [ '-1,0,0,0,-1' ] ]);
  });
});
