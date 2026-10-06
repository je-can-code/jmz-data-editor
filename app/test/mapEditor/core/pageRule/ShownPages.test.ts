import { describe, expect, it, vi } from 'vitest';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PageCondition, PageMoment, PageRule } from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import { ShownPages } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * The page each event on a map shows at the window's clock. With a rule, it is the game's own page on a fresh save at
 * the clock's time, and an event no page holds for draws its first page faded; without one, every event shows its first
 * page, as MZ's own editor shows it, and nothing is faded.
 *
 * Every event is read once and remembered: until whoever draws it says it changed, or it is put back in its slot as
 * another object, or the rule changes. Moving the clock judges again only the events read so far whose pages ask
 * something the clock can change, answering those now showing another page; an event the clock cannot change is never
 * read again for it, and the clock standing still judges nothing at all.
 */
describe('ShownPages', () =>
{
  /**
   * How often the stand-in hours have read a page, and judged one at a moment, so a test can tell what was done again.
   */
  const reads = { count: 0, judged: 0 };

  /**
   * A stand-in for a plugin's hours: a comment {@code <open:FROM-TO>} keeps a page to the minutes from FROM up to but
   * not including TO.
   */
  const OPEN_HOURS: PageCondition = {
    id: 'test.open',
    read: shown =>
    {
      reads.count += 1;
      const line = shown.list.map(each => String(each.parameters[0] ?? '')).find(text => text.startsWith('<open:'));
      if (line === undefined)
      {
        return null;
      }

      const [ from, to ] = line.slice('<open:'.length, -1).split('-').map(Number);
      const holds = (moment: PageMoment) =>
      {
        reads.judged += 1;
        return moment.timeOfDay >= from && moment.timeOfDay < to;
      };
      return { followsClock: true, holds, words: [] };
    },
  };

  /**
   * A rule over Chef Adventure's starting party, with the stand-in hours.
   */
  const RULE: PageRule = { save: { party: [ 1, 2 ] }, conditions: [ OPEN_HOURS ] };

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
   * A lamp: unlit on its first page, lit from 18:00 to midnight on its second.
   * @param {number} id The event id.
   * @returns {RmmzMapEvent} The lamp.
   */
  const lamp = (id: number): RmmzMapEvent => event(id, [ commented([]), commented([ '<open:1080-1440>' ]) ]);

  /**
   * A guard on watch from 06:00 to 18:00 on his only page, so gone by night.
   * @param {number} id The event id.
   * @returns {RmmzMapEvent} The guard.
   */
  const guard = (id: number): RmmzMapEvent => event(id, [ commented([ '<open:360-1080>' ]) ]);

  /**
   * A sign, which nothing about the clock changes.
   * @param {number} id The event id.
   * @returns {RmmzMapEvent} The sign.
   */
  const sign = (id: number): RmmzMapEvent => event(id, [ commented([ 'a sign' ]), commented([], { switch1Valid: true, switch1Id: 4 }) ]);

  describe('without a rule', () =>
  {
    it('shows every event\'s first page, never faded, and answers no page for an event with none', () =>
    {
      // Arrange: a lamp at night would show its lit page under the game's rule; an event with no pages.
      const pages = new ShownPages(null, 1320);

      // Act.
      const shown = [ pages.shownPage(lamp(1)), pages.activePage(lamp(1)), pages.activePage(event(2, [])) ];

      // Assert.
      expect(shown)
        .toStrictEqual([ { index: 0, faded: false }, 0, -1 ]);
    });
  });

  describe('with a rule', () =>
  {
    it('shows the page the game shows at the clock\'s time, and the first page faded while none holds', () =>
    {
      // Arrange: at 22:00, a lamp lit, a guard gone, and a sign showing its first page.
      const pages = new ShownPages(RULE, 1320);

      // Act.
      const shown = [ lamp(1), guard(2), sign(3) ].map(each => [ pages.shownPage(each), pages.activePage(each) ]);

      // Assert.
      expect(shown)
        .toStrictEqual([ [ { index: 1, faded: false }, 1 ], [ { index: 0, faded: true }, -1 ], [ { index: 0, faded: false }, 0 ] ]);
    });

    it('answers which events now show another page as the clock moves, judging only those the clock can change', () =>
    {
      // Arrange: a lamp, a guard and a sign read at noon, the readings counted from then.
      const pages = new ShownPages(RULE, 720);
      const events = [ lamp(1), guard(2), sign(3) ];
      events.forEach(each => pages.shownPage(each));
      reads.count = 0;

      // Act: 18:00, when the lamp lights and the guard leaves; then 19:00, which turns nothing.
      const turned = [ pages.setTime(1080), pages.setTime(1140) ];

      // Assert: no page read again, and only the two of them ever judged again.
      expect([ turned, reads.count, pages.followingClock, events.map(each => pages.activePage(each)) ])
        .toStrictEqual([ [ [ 1, 2 ], [] ], 0, 2, [ 1, -1, 0 ] ]);
    });

    it('judges nothing when the clock does not move', () =>
    {
      // Arrange: a lamp read at 18:00, its judgements counted from then.
      const pages = new ShownPages(RULE, 1080);
      pages.shownPage(lamp(1));
      reads.judged = 0;

      // Act: 18:00 again, then 19:00, which judges the lamp's lit page once.
      const turned = pages.setTime(1080);
      const still = reads.judged;
      pages.setTime(1140);

      // Assert.
      expect([ turned, still, reads.judged ])
        .toStrictEqual([ [], 0, 1 ]);
    });

    it('reads an event again once told it changed, and every event once told the list did', () =>
    {
      // Arrange: a lamp and a guard read at noon.
      const pages = new ShownPages(RULE, 720);
      const shownLamp = lamp(1);
      const shownGuard = guard(2);
      [ shownLamp, shownGuard ].forEach(each => pages.shownPage(each));
      reads.count = 0;

      // Act: the lamp changes, and is asked about with the guard; then the list changes, and both are asked about.
      pages.forget(1);
      [ shownLamp, shownGuard ].forEach(each => pages.shownPage(each));
      const afterOne = reads.count;
      pages.forget(null);
      [ shownLamp, shownGuard ].forEach(each => pages.shownPage(each));

      // Assert: the lamp's two pages read once; then both events' three pages.
      expect([ afterOne, reads.count ])
        .toStrictEqual([ 2, 5 ]);
    });

    it('reads an event put back in its slot as another object, and stops following one that no longer asks the clock anything', () =>
    {
      // Arrange: a lamp read at noon, then put back as a lamp with no hours, as a paste of a plain sign would.
      const pages = new ShownPages(RULE, 720);
      pages.shownPage(lamp(1));
      const replaced = { ...sign(1) };

      // Act.
      const shown = pages.shownPage(replaced);

      // Assert.
      expect([ shown, pages.followingClock, pages.setTime(1320) ])
        .toStrictEqual([ { index: 0, faded: false }, 0, [] ]);
    });

    it('forgets every event under the old rule when the rule changes', () =>
    {
      // Arrange: at 22:00 a lamp read lit; then a rule with no plugin conditions, under which its last page holds.
      const pages = new ShownPages(RULE, 1320);
      const shownLamp = lamp(1);
      const before = pages.activePage(shownLamp);
      const plain: PageRule = { save: RULE.save, conditions: [] };

      // Act.
      pages.setRule(plain);

      // Assert.
      expect([ before, pages.rule, pages.followingClock, pages.activePage(guard(2)) ])
        .toStrictEqual([ 1, plain, 0, 0 ]);
    });

    it('starts at midnight with no rule unless told otherwise', () =>
    {
      // Arrange: the table as a renderer makes it before anything is handed over, then given the rule.
      const pages = new ShownPages();
      const before = pages.rule;
      pages.setRule(RULE);

      // Act: a lamp open from 18:00 to midnight, at midnight.
      const active = pages.activePage(lamp(1));

      // Assert.
      expect([ before, active ])
        .toStrictEqual([ null, 0 ]);
    });
  });

  it('never reads an event for the clock without a rule', () =>
  {
    // Arrange: the hours watched, and no rule.
    const read = vi.spyOn(OPEN_HOURS, 'read');
    const pages = new ShownPages(null, 720);
    pages.shownPage(lamp(1));

    // Act.
    const turned = pages.setTime(1320);
    read.mockRestore();

    // Assert.
    expect([ turned, read.mock.calls.length ])
      .toStrictEqual([ [], 0 ]);
  });
});
