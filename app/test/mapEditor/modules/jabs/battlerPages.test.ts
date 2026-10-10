import { describe, expect, it } from 'vitest';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { battlerPagesOf, followedPage, followedPageNote } from '../../../../src/mapEditor/modules/jabs/battlerPages.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * A battler's quick panel shows the page a new game shows the event with, as the map does, so what the author changes is
 * what the game will fight; when that page makes no battler, or none shows, it shows the event's first battler page; and
 * an author can pick another battler page, which it then shows. Whichever it shows, it says so, and when that page shows,
 * unless the event has one page alone and there is nothing else it could be.
 */
describe('battlerPages', () =>
{
  /**
   * A battler page naming an enemy.
   * @param {number} enemyId The enemy.
   * @param {Partial<RmmzEventPage>} overrides Anything else on the page.
   * @returns {RmmzEventPage} The page.
   */
  const battler = (enemyId: number, overrides: Partial<RmmzEventPage> = {}): RmmzEventPage => page([ command(108, [ `<enemyId:${enemyId}>` ]) ], overrides);

  /**
   * A page naming no enemy.
   * @returns {RmmzEventPage} The page.
   */
  const plain = (): RmmzEventPage => page([ command(108, [ '<sight:4>' ]) ]);

  /**
   * Words when a page shows: "while switch 12 is on" for a page waiting for switch 12, nothing for any other.
   * @param {RmmzEventPage} shown The page.
   * @returns {string[]} The words.
   */
  const words = (shown: RmmzEventPage): string[] => (shown.conditions.switch1Valid ? [ `while switch ${shown.conditions.switch1Id} is on` ] : []);

  /**
   * Conditions waiting for switch 12.
   * @returns {Partial<RmmzEventPage>} The page's conditions.
   */
  const onSwitch12 = (): Partial<RmmzEventPage> => ({ conditions: { ...page([]).conditions, switch1Valid: true, switch1Id: 12 } });

  describe('battlerPagesOf', () =>
  {
    it('lists the pages naming an enemy, and no other', () =>
    {
      // Arrange.
      const shifter = event(1, [ battler(5), plain(), battler(7) ]);

      // Act.
      const pages = battlerPagesOf(shifter);

      // Assert.
      expect(pages)
        .toStrictEqual([ 0, 2 ]);
    });
  });

  describe('followedPage', () =>
  {
    it('follows the page a new game shows when it makes a battler', () =>
    {
      // Arrange.
      const shifter = event(1, [ battler(5), plain(), battler(7) ]);

      // Act.
      const followed = followedPage(shifter, 2, null);

      // Assert.
      expect(followed)
        .toStrictEqual({ pageIndex: 2, battlerPages: [ 0, 2 ], shown: 2, picked: false });
    });

    it('shows the first battler page when the page a new game shows makes none, or none shows', () =>
    {
      // Arrange.
      const ambush = event(1, [ plain(), battler(5), battler(7) ]);

      // Act.
      const followed = [ followedPage(ambush, 0, null), followedPage(ambush, -1, null) ];

      // Assert.
      expect(followed.map(each => each?.pageIndex))
        .toStrictEqual([ 1, 1 ]);
    });

    it('shows the page picked while it still makes a battler, and the followed page once it does not', () =>
    {
      // Arrange.
      const shifter = event(1, [ battler(5), plain(), battler(7) ]);

      // Act.
      const followed = [ followedPage(shifter, 0, 2), followedPage(shifter, 0, 1), followedPage(shifter, 0, 0) ];

      // Assert: picking the page a new game shows is following it.
      expect(followed.map(each => [ each?.pageIndex, each?.picked ]))
        .toStrictEqual([ [ 2, true ], [ 0, false ], [ 0, false ] ]);
    });

    it('follows nothing on an event with no battler page', () =>
    {
      // Arrange.
      const lamp = event(1, [ plain() ]);

      // Act.
      const followed = followedPage(lamp, 0, null);

      // Assert.
      expect(followed)
        .toBeNull();
    });
  });

  describe('followedPageNote', () =>
  {
    it('says nothing for a battler of one page, and names the page a new game shows on a battler of several', () =>
    {
      // Arrange.
      const lone = event(1, [ battler(5) ]);
      const pair = event(2, [ battler(5), battler(7) ]);

      // Act.
      const notes = [
        followedPageNote(lone, followedPage(lone, 0, null) as NonNullable<ReturnType<typeof followedPage>>, words),
        followedPageNote(pair, followedPage(pair, 1, null) as NonNullable<ReturnType<typeof followedPage>>, words),
      ];

      // Assert.
      expect(notes)
        .toStrictEqual([ null, 'Page 2, the page a new game shows.' ]);
    });

    it('says when the page shown shows, and which a new game shows instead, for a page picked or fallen back to', () =>
    {
      // Arrange: a battler shown only once switch 12 is on, behind a page that makes none; and a pair, its second picked.
      const ambush = event(1, [ plain(), battler(5, onSwitch12()) ]);
      const hidden = event(2, [ battler(5, onSwitch12()) ]);
      const pair = event(3, [ battler(5), battler(7, onSwitch12()) ]);

      // Act.
      const notes = [
        followedPageNote(ambush, followedPage(ambush, 0, null) as NonNullable<ReturnType<typeof followedPage>>, words),
        followedPageNote(hidden, followedPage(hidden, -1, null) as NonNullable<ReturnType<typeof followedPage>>, words),
        followedPageNote(pair, followedPage(pair, 0, 1) as NonNullable<ReturnType<typeof followedPage>>, words),
      ];

      // Assert.
      expect(notes)
        .toStrictEqual([
          'Page 2, shown while switch 12 is on. A new game shows page 1, which is no battler.',
          'Page 1, shown while switch 12 is on. A new game shows none of its pages.',
          'Page 2, shown while switch 12 is on. A new game shows page 1.',
        ]);
    });
  });
});
