import { describe, expect, it } from 'vitest';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventConditions } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { conditionWords, meetsOnFreshSave, NO_PARTY, type FreshSave } from '../../../../src/mapEditor/core/pageRule/freshSave.ts';

/*
 * A page's own conditions, judged as Game_Event#meetsConditions judges them on a new game: every switch and self switch
 * off, every variable 0, no item held, and the starting party in the party. So a page waiting for a switch, a self
 * switch or an item never holds; one waiting for a variable to reach a value holds only when that value is 0 or less;
 * one waiting for an actor holds only while that actor starts in the party. A page waiting for nothing always holds.
 * Whatever a page keeps in a condition it does not wait for, as MZ keeps it, counts for nothing.
 *
 * The same conditions read as an author would say them, in the order MZ lists them, so a panel can say when a page
 * shows: switches, a variable, a self switch, an item, an actor.
 */
describe('freshSave', () =>
{
  /**
   * Chef Adventure's new game: Jerald and Rupert.
   */
  const SAVE: FreshSave = { party: [ 1, 2 ] };

  /**
   * A page's conditions, waiting for nothing unless told otherwise.
   * @param {Partial<RmmzEventConditions>} overrides What the page waits for.
   * @returns {RmmzEventConditions} The conditions.
   */
  const waitingFor = (overrides: Partial<RmmzEventConditions> = {}): RmmzEventConditions =>
  {
    return { ...createEventPage().conditions, ...overrides };
  };

  describe('meetsOnFreshSave', () =>
  {
    it('holds a page waiting for nothing, whatever its unused conditions keep', () =>
    {
      // Arrange: switch 4, variable 13 at 80, self switch D, item 5 and actor 3 all kept, none waited for.
      const conditions = waitingFor({ switch1Id: 4, variableId: 13, variableValue: 80, selfSwitchCh: 'D', itemId: 5, actorId: 3 });

      // Act.
      const met = meetsOnFreshSave(conditions, SAVE);

      // Assert.
      expect(met)
        .toBe(true);
    });

    it('never holds a page waiting for its first switch', () =>
    {
      // Arrange.
      const conditions = waitingFor({ switch1Valid: true, switch1Id: 4 });

      // Act.
      const met = meetsOnFreshSave(conditions, SAVE);

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('never holds a page waiting for its second switch', () =>
    {
      // Arrange.
      const conditions = waitingFor({ switch2Valid: true, switch2Id: 9 });

      // Act.
      const met = meetsOnFreshSave(conditions, SAVE);

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('never holds a page waiting for a self switch', () =>
    {
      // Arrange.
      const conditions = waitingFor({ selfSwitchValid: true, selfSwitchCh: 'A' });

      // Act.
      const met = meetsOnFreshSave(conditions, SAVE);

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('never holds a page waiting for an item', () =>
    {
      // Arrange.
      const conditions = waitingFor({ itemValid: true, itemId: 5 });

      // Act.
      const met = meetsOnFreshSave(conditions, SAVE);

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('holds a page waiting for a variable only while what it waits for is 0 or less', () =>
    {
      // Arrange: variable 13 at 1, at 0, and at -3.
      const pages = [ 1, 0, -3 ].map(variableValue => waitingFor({ variableValid: true, variableId: 13, variableValue }));

      // Act.
      const met = pages.map(conditions => meetsOnFreshSave(conditions, SAVE));

      // Assert.
      expect(met)
        .toStrictEqual([ false, true, true ]);
    });

    it('holds a page waiting for an actor only while that actor starts in the party', () =>
    {
      // Arrange: Rupert, who starts in the party; actor 3, who does not; and Rupert again in a project starting with
      // nobody.
      const rupert = waitingFor({ actorValid: true, actorId: 2 });
      const stranger = waitingFor({ actorValid: true, actorId: 3 });

      // Act.
      const met = [ meetsOnFreshSave(rupert, SAVE), meetsOnFreshSave(stranger, SAVE), meetsOnFreshSave(rupert, NO_PARTY) ];

      // Assert.
      expect(met)
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('conditionWords', () =>
  {
    it('says nothing of a page waiting for nothing', () =>
    {
      // Arrange: values kept in every condition, none waited for.
      const conditions = waitingFor({ switch1Id: 4, switch2Id: 9, variableId: 13, variableValue: 80 });

      // Act.
      const words = conditionWords(conditions);

      // Assert.
      expect(words)
        .toStrictEqual([]);
    });

    it('names one switch, either of the two, and two switches together', () =>
    {
      // Arrange: the first alone, the second alone, and both.
      const pages = [
        waitingFor({ switch1Valid: true, switch1Id: 4, switch2Id: 9 }),
        waitingFor({ switch1Id: 4, switch2Valid: true, switch2Id: 9 }),
        waitingFor({ switch1Valid: true, switch1Id: 4, switch2Valid: true, switch2Id: 9 }),
      ];

      // Act.
      const words = pages.map(conditionWords);

      // Assert.
      expect(words)
        .toStrictEqual([ [ 'while switch 4 is on' ], [ 'while switch 9 is on' ], [ 'while switches 4 and 9 are on' ] ]);
    });

    it('names a switch waited for twice once', () =>
    {
      // Arrange.
      const conditions = waitingFor({ switch1Valid: true, switch1Id: 4, switch2Valid: true, switch2Id: 4 });

      // Act.
      const words = conditionWords(conditions);

      // Assert.
      expect(words)
        .toStrictEqual([ 'while switch 4 is on' ]);
    });

    it('names everything a page waits for in the order MZ lists it', () =>
    {
      // Arrange: a page waiting for one of each.
      const conditions = waitingFor({
        switch1Valid: true,
        switch1Id: 25,
        variableValid: true,
        variableId: 13,
        variableValue: 70,
        selfSwitchValid: true,
        selfSwitchCh: 'B',
        itemValid: true,
        itemId: 5,
        actorValid: true,
        actorId: 3,
      });

      // Act.
      const words = conditionWords(conditions);

      // Assert.
      expect(words)
        .toStrictEqual([
          'while switch 25 is on',
          'once variable 13 reaches 70',
          'while self switch B is on',
          'while the party holds item 5',
          'while actor 3 is in the party',
        ]);
    });
  });
});
