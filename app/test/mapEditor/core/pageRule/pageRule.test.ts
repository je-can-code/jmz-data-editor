import { describe, expect, it, vi } from 'vitest';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  activePageOf,
  pageWordsOf,
  readEvent,
  type PageCondition,
  type PageMoment,
  type PageRule,
} from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * The page an event shows is the game's own: from the last page down, the first whose own conditions hold on a fresh
 * save and whose every plugin condition holds at the moment. A page whose own conditions fail is never asked anything
 * by a plugin, and an event no page holds for shows nothing. Each event is read once, so judging it at another moment
 * reads nothing again, and it says whether any of its pages asks something the clock can change, which is the only
 * kind of event worth judging again as the clock moves. A page also reads as words: what its own conditions wait for,
 * then what each plugin's condition asks.
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
   * The rule over Chef Adventure's starting party with both stand-ins.
   */
  const RULE: PageRule = { save: { party: [ 1, 2 ] }, conditions: [ OPEN_HOURS, SEALED ] };

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
      expect(reading.pages.map(each => [ each.meets, each.tests.map(test => test.words) ]))
        .toStrictEqual([ [ true, [] ], [ false, [ [ 'from 300 to 600' ] ] ], [ true, [ [ 'never' ] ] ] ]);
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
