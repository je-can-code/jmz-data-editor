import { describe, expect, it, vi } from 'vitest';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  activePageOf,
  pageHolds,
  pageWordsOf,
  readEvent,
  type PageCondition,
  type PageMoment,
  type PageRule,
} from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * The page an event shows is the game's own: from the last page down, the first whose own conditions hold at the
 * moment's preview (a fresh save wherever the preview sets nothing) and whose every plugin condition holds at the
 * moment. A page whose own conditions fail is never asked anything by a plugin, and an event no page holds for shows
 * nothing. Each event is read once, so judging it at another moment reads nothing again, and it says whether any of its
 * pages asks something the clock can change, whether any reads the date the clock's season moves, and which pieces of
 * preview state any of them reads: those are the only events worth judging again as the clock moves, its season
 * changes or the preview changes. A plugin condition is handed the moment whole, its season included. A page also reads
 * as words: what its own conditions wait for, then what each plugin's condition asks.
 */
describe('pageRule', () =>
{
  /**
   * A stand-in for a plugin's hours: a comment {@code <open:FROM-TO>} keeps a page to the minutes from FROM up to but
   * not including TO.
   */
  const OPEN_HOURS: PageCondition = {
    id: 'test.open',
    read: shown =>
    {
      const line = shown.list.map(each => String(each.parameters[0] ?? '')).find(text => text.startsWith('<open:'));
      if (line === undefined)
      {
        return null;
      }

      const [ from, to ] = line.slice('<open:'.length, -1).split('-').map(Number);
      return { followsClock: true, holds: (moment: PageMoment) => moment.timeOfDay >= from && moment.timeOfDay < to, words: [ `from ${from} to ${to}` ] };
    },
  };

  /**
   * A stand-in for a condition the clock never changes: a comment {@code <sealed>} keeps a page shut.
   */
  const SEALED: PageCondition = {
    id: 'test.sealed',
    read: shown => (shown.list.some(each => each.parameters[0] === '<sealed>')
      ? { followsClock: false, holds: () => false, words: [ 'never' ] }
      : null),
  };

  /**
   * A stand-in for a module's own kind of preview state: a comment {@code <quest:KEY>} keeps a page to the moments whose
   * preview sets that quest under the kind {@code test.quests}.
   */
  const QUESTS: PageCondition = {
    id: 'test.quests',
    read: shown =>
    {
      const line = shown.list.map(each => String(each.parameters[0] ?? '')).find(text => text.startsWith('<quest:'));
      if (line === undefined)
      {
        return null;
      }

      const key = line.slice('<quest:'.length, -1);
      return {
        followsClock: false,
        reads: [ `test.quests:${key}` ],
        holds: (moment: PageMoment) => moment.preview?.value('test.quests', key) === 'done',
        words: [ `once ${key} is done` ],
      };
    },
  };

  /**
   * A stand-in for a plugin's calendar: a comment {@code <summer>} keeps a page to the moments whose clock is in season
   * 1, which reads the date the season moves.
   */
  const IN_SUMMER: PageCondition = {
    id: 'test.summer',
    read: shown => (shown.list.some(each => each.parameters[0] === '<summer>')
      ? { followsClock: false, followsDate: true, holds: (moment: PageMoment) => moment.season === 1, words: [ 'in Summer' ] }
      : null),
  };

  /**
   * The rule over Chef Adventure's starting party with the stand-ins.
   */
  const RULE: PageRule = { save: { party: [ 1, 2 ] }, conditions: [ OPEN_HOURS, SEALED, QUESTS, IN_SUMMER ] };

  /**
   * A page with comments, waiting for nothing of its own unless told otherwise.
   * @param {string[]} comments The comment lines.
   * @param {Partial<RmmzEventPage['conditions']>} conditions What it waits for.
   * @returns {RmmzEventPage} The page.
   */
  const commented = (comments: string[], conditions: Partial<RmmzEventPage['conditions']> = {}): RmmzEventPage =>
  {
    return page(comments.map(text => command(108, [ text ])), { conditions: { ...createEventPage().conditions, ...conditions } });
  };

  /**
   * Noon, in minutes past midnight.
   */
  const NOON: PageMoment = { timeOfDay: 720 };

  describe('readEvent', () =>
  {
    it('reads each page\'s own conditions and what it asks of each plugin', () =>
    {
      // Arrange: a page waiting for nothing; one waiting for switch 4 and asking for the morning; one sealed.
      const shown = event(1, [ commented([]), commented([ '<open:300-600>' ], { switch1Valid: true, switch1Id: 4 }), commented([ '<sealed>' ]) ]);

      // Act.
      const reading = readEvent(shown, RULE);

      // Assert.
      expect(reading.pages.map(each => [ each.own.switches, each.tests.map(test => test.words) ]))
        .toStrictEqual([ [ [], [] ], [ [ 4 ], [ [ 'from 300 to 600' ] ] ], [ [], [ [ 'never' ] ] ] ]);
    });

    it('lists every piece of preview state its pages read: their switches, their variable and what their plugin conditions read', () =>
    {
      // Arrange: a page waiting for switches 24 and 147; one waiting for variable 74; one waiting on a quest; one waiting
      // for nothing.
      const shown = event(1, [
        commented([], { switch1Valid: true, switch1Id: 24, switch2Valid: true, switch2Id: 147 }),
        commented([], { variableValid: true, variableId: 74, variableValue: 99 }),
        commented([ '<quest:CHEF_01>' ]),
        commented([]),
      ]);

      // Act.
      const reading = readEvent(shown, RULE);

      // Assert.
      expect([ ...reading.reads ])
        .toStrictEqual([ 'switch:24', 'switch:147', 'variable:74', 'test.quests:CHEF_01' ]);
    });

    it('reads no preview state for a page waiting for something no preview sets', () =>
    {
      // Arrange: a page waiting for switch 74 and a self switch, and asking about a quest.
      const shown = event(1, [ commented([ '<quest:CHEF_01>' ], { switch1Valid: true, switch1Id: 74, selfSwitchValid: true }) ]);

      // Act.
      const reading = readEvent(shown, RULE);

      // Assert.
      expect(reading.reads.size)
        .toBe(0);
    });

    it('follows the clock when any page asks something the clock can change, and not otherwise', () =>
    {
      // Arrange: a lamp open by night on its second page; a sealed door; a plain sign.
      const events = [
        event(1, [ commented([]), commented([ '<open:1080-1440>' ]) ]),
        event(2, [ commented([ '<sealed>' ]) ]),
        event(3, [ commented([ 'a sign' ]) ]),
      ];

      // Act.
      const follows = events.map(each => readEvent(each, RULE).followsClock);

      // Assert.
      expect(follows)
        .toStrictEqual([ true, false, false ]);
    });

    it('follows the date when any page reads it, and not for pages asking only the hour, or nothing', () =>
    {
      // Arrange: a stall open in Summer on its second page; a lamp open by night; a plain sign.
      const events = [
        event(1, [ commented([]), commented([ '<summer>' ]) ]),
        event(2, [ commented([]), commented([ '<open:1080-1440>' ]) ]),
        event(3, [ commented([ 'a sign' ]) ]),
      ];

      // Act.
      const follows = events.map(each => readEvent(each, RULE).followsDate);

      // Assert.
      expect(follows)
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('pageHolds', () =>
  {
    it('holds a page whose own conditions and every plugin condition hold, page by page, whichever the game shows', () =>
    {
      // Arrange: a page waiting for nothing; one open at noon; one open at noon but sealed; one open at noon that also
      // waits for switch 4; one open only by night.
      const reading = readEvent(event(1, [
        commented([]),
        commented([ '<open:600-800>' ]),
        commented([ '<open:600-800>', '<sealed>' ]),
        commented([ '<open:600-800>' ], { switch1Valid: true, switch1Id: 4 }),
        commented([ '<open:1080-1440>' ]),
      ]), RULE);

      // Act.
      const held = reading.pages.map(each => pageHolds(each, NOON));

      // Assert.
      expect(held)
        .toStrictEqual([ true, true, false, false, false ]);
    });

    it('judges a page\'s own conditions at the moment\'s preview, and a fresh save without one', () =>
    {
      // Arrange: a page open at noon that waits for switch 4, at noon with no preview, with switch 4 on, and with switch
      // 40 on.
      const reading = readEvent(event(1, [ commented([ '<open:600-800>' ], { switch1Valid: true, switch1Id: 4 }) ]), RULE);
      const moments: PageMoment[] = [
        NOON,
        { ...NOON, preview: GamePreview.FRESH.withSwitch(4, true) },
        { ...NOON, preview: GamePreview.FRESH.withSwitch(40, true) },
      ];

      // Act.
      const held = moments.map(moment => pageHolds(reading.pages[0], moment));

      // Assert.
      expect(held)
        .toStrictEqual([ false, true, false ]);
    });

    it('hands the moment\'s preview to a plugin condition reading its own kind of state', () =>
    {
      // Arrange: a page waiting on a quest, with the quest done and with it not.
      const reading = readEvent(event(1, [ commented([ '<quest:CHEF_01>' ]) ]), RULE);
      const done = GamePreview.FRESH.with('test.quests', 'CHEF_01', 'done');

      // Act.
      const held = [ pageHolds(reading.pages[0], { ...NOON, preview: done }), pageHolds(reading.pages[0], NOON) ];

      // Assert.
      expect(held)
        .toStrictEqual([ true, false ]);
    });

    it('hands the moment\'s season to a plugin condition reading the date', () =>
    {
      // Arrange: a page open in Summer, at noon in Summer, in Autumn, and with no season picked.
      const reading = readEvent(event(1, [ commented([ '<summer>' ]) ]), RULE);
      const moments: PageMoment[] = [ { ...NOON, season: 1 }, { ...NOON, season: 2 }, NOON ];

      // Act.
      const held = moments.map(moment => pageHolds(reading.pages[0], moment));

      // Assert.
      expect(held)
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('activePageOf', () =>
  {
    it('shows the last page whose conditions hold, from the last page down', () =>
    {
      // Arrange: two pages waiting for nothing, then one waiting for a switch a new game has off.
      const reading = readEvent(event(1, [ commented([]), commented([]), commented([], { switch1Valid: true, switch1Id: 4 }) ]), RULE);

      // Act.
      const active = activePageOf(reading, NOON);

      // Assert: page 2, not page 1, and not page 3.
      expect(active)
        .toBe(1);
    });

    it('falls back past a page whose plugin condition fails at the moment to the page before it', () =>
    {
      // Arrange: an unlit lamp, then its lit page open from 18:00 to midnight.
      const reading = readEvent(event(1, [ commented([]), commented([ '<open:1080-1440>' ]) ]), RULE);

      // Act: at noon, then at 22:00.
      const active = [ activePageOf(reading, NOON), activePageOf(reading, { timeOfDay: 1320 }) ];

      // Assert.
      expect(active)
        .toStrictEqual([ 0, 1 ]);
    });

    it('wants every plugin condition on a page to hold', () =>
    {
      // Arrange: a page open at noon but also sealed, over a page waiting for nothing.
      const reading = readEvent(event(1, [ commented([]), commented([ '<open:600-800>', '<sealed>' ]) ]), RULE);

      // Act.
      const active = activePageOf(reading, NOON);

      // Assert.
      expect(active)
        .toBe(0);
    });

    it('asks a plugin nothing about a page whose own conditions fail', () =>
    {
      // Arrange: a page open at noon that also waits for switch 4, its hours watched.
      const reading = readEvent(event(1, [ commented([ '<open:600-800>' ], { switch1Valid: true, switch1Id: 4 }) ]), RULE);
      const holds = vi.spyOn(reading.pages[0].tests[0], 'holds');

      // Act.
      const active = activePageOf(reading, NOON);

      // Assert.
      expect([ active, holds.mock.calls.length ])
        .toStrictEqual([ -1, 0 ]);
    });

    it('shows a later page once the preview turns its switch on, and goes back when it is off again', () =>
    {
      // Arrange: a villager, then the page waiting for switch 147 that replaces him once the vampire is gone.
      const reading = readEvent(event(1, [ commented([]), commented([], { switch1Valid: true, switch1Id: 147 }) ]), RULE);
      const on = GamePreview.FRESH.withSwitch(147, true);

      // Act: on a fresh save, with switch 147 on, then with it off again.
      const active = [ NOON, { ...NOON, preview: on }, { ...NOON, preview: on.withSwitch(147, false) } ].map(moment => activePageOf(reading, moment));

      // Assert.
      expect(active)
        .toStrictEqual([ 0, 1, 0 ]);
    });

    it('shows no page once the preview sets a variable below what every page waits for', () =>
    {
      // Arrange: a page waiting for variable 74 to reach 0, which a fresh save meets.
      const reading = readEvent(event(1, [ commented([], { variableValid: true, variableId: 74, variableValue: 0 }) ]), RULE);

      // Act: on a fresh save, then with variable 74 at -5.
      const active = [ activePageOf(reading, NOON), activePageOf(reading, { ...NOON, preview: GamePreview.FRESH.withVariable(74, -5) }) ];

      // Assert.
      expect(active)
        .toStrictEqual([ 0, -1 ]);
    });

    it('shows no page when none holds, and none for an event with no pages', () =>
    {
      // Arrange: a ghost waiting for switch 4; an event with no pages at all.
      const readings = [ readEvent(event(1, [ commented([], { switch1Valid: true, switch1Id: 4 }) ]), RULE), readEvent(event(2, []), RULE) ];

      // Act.
      const active = readings.map(reading => activePageOf(reading, NOON));

      // Assert.
      expect(active)
        .toStrictEqual([ -1, -1 ]);
    });
  });

  describe('pageWordsOf', () =>
  {
    it('says what a page\'s own conditions wait for, then what each plugin\'s condition asks of it', () =>
    {
      // Arrange: a page waiting for switch 44, open from 240 to 960, and sealed.
      const shown = commented([ '<open:240-960>', '<sealed>' ], { switch1Valid: true, switch1Id: 44 });

      // Act.
      const words = pageWordsOf(shown, RULE.conditions);

      // Assert.
      expect(words)
        .toStrictEqual([ 'while switch 44 is on', 'from 240 to 960', 'never' ]);
    });

    it('says nothing of a page asking nothing', () =>
    {
      // Arrange: a page holding a comment no plugin reads.
      const shown = commented([ 'a sign' ]);

      // Act.
      const words = pageWordsOf(shown, RULE.conditions);

      // Assert.
      expect(words)
        .toStrictEqual([]);
    });
  });
});
