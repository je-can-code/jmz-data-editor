import { describe, expect, it } from 'vitest';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventConditions } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { conditionWords, NO_PARTY, ownWaitsHold, ownWaitsOf, type FreshSave } from '../../../../src/mapEditor/core/pageRule/freshSave.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';

/*
 * A page's own conditions, judged as Game_Event#meetsConditions judges them on a new game seen as far along the story as
 * the author's preview asks: the switches the preview turns on are on and every other switch is off; the variables it
 * sets read their values and every other variable reads 0; no self switch is ever on and no item ever held, since a new
 * game has neither and a preview sets neither; and the starting party is in the party.
 *
 * So on a fresh save a page waiting for a switch, a self switch or an item never holds, one waiting for a variable to
 * reach a value holds only when that value is 0 or less, and one waiting for an actor holds only while that actor starts
 * in the party. Under a preview a page waiting for a switch holds once the preview turns that very switch on, and never
 * for a neighbour of it; one waiting for two switches wants both; one waiting for a variable holds once the variable is
 * at the page's value or above. A page waiting for nothing always holds. Whatever a page keeps in a condition it does
 * not wait for, as MZ keeps it, counts for nothing.
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

  /**
   * Judges a page's own conditions on Chef Adventure's new game, at a preview.
   * @param {RmmzEventConditions} conditions The page's conditions.
   * @param {GamePreview} preview The preview; a fresh save's unless another is given.
   * @returns {boolean} True when they hold.
   */
  const holds = (conditions: RmmzEventConditions, preview?: GamePreview): boolean =>
  {
    return ownWaitsHold(ownWaitsOf(conditions, SAVE), preview);
  };

  describe('ownWaitsOf', () =>
  {
    it('reads the switches a page waits for, each of its two alone and both together', () =>
    {
      // Arrange: the first alone, the second alone, and both; switch 9 kept in the first page's unused second switch.
      const pages = [
        waitingFor({ switch1Valid: true, switch1Id: 4, switch2Id: 9 }),
        waitingFor({ switch1Id: 4, switch2Valid: true, switch2Id: 9 }),
        waitingFor({ switch1Valid: true, switch1Id: 4, switch2Valid: true, switch2Id: 9 }),
      ];

      // Act.
      const switches = pages.map(conditions => ownWaitsOf(conditions, SAVE).switches);

      // Assert.
      expect(switches)
        .toStrictEqual([ [ 4 ], [ 9 ], [ 4, 9 ] ]);
    });

    it('reads the variable a page waits for and the least it must read, and none for a page waiting for none', () =>
    {
      // Arrange: variable 13 waited for at 80; variable 13 at 80 kept, but not waited for.
      const pages = [ waitingFor({ variableValid: true, variableId: 13, variableValue: 80 }), waitingFor({ variableId: 13, variableValue: 80 }) ];

      // Act.
      const variables = pages.map(conditions => ownWaitsOf(conditions, SAVE).variable);

      // Assert.
      expect(variables)
        .toStrictEqual([ { id: 13, atLeast: 80 }, null ]);
    });

    it('settles a page waiting for nothing a preview sets, unless it waits for a self switch, an item, or an actor not in the party', () =>
    {
      // Arrange: a page waiting for switch 4 alone; one waiting for self switch A; one for item 5; one for Rupert, who
      // starts in the party; one for actor 3, who does not.
      const pages = [
        waitingFor({ switch1Valid: true, switch1Id: 4 }),
        waitingFor({ selfSwitchValid: true, selfSwitchCh: 'A' }),
        waitingFor({ itemValid: true, itemId: 5 }),
        waitingFor({ actorValid: true, actorId: 2 }),
        waitingFor({ actorValid: true, actorId: 3 }),
      ];

      // Act.
      const settled = pages.map(conditions => ownWaitsOf(conditions, SAVE).settled);

      // Assert.
      expect(settled)
        .toStrictEqual([ true, false, false, true, false ]);
    });
  });

  describe('ownWaitsHold', () =>
  {
    it('holds a page waiting for nothing, whatever its unused conditions keep', () =>
    {
      // Arrange: switch 4, variable 13 at 80, self switch D, item 5 and actor 3 all kept, none waited for.
      const conditions = waitingFor({ switch1Id: 4, variableId: 13, variableValue: 80, selfSwitchCh: 'D', itemId: 5, actorId: 3 });

      // Act.
      const met = holds(conditions);

      // Assert.
      expect(met)
        .toBe(true);
    });

    it('never holds a page waiting for its first switch on a fresh save', () =>
    {
      // Arrange.
      const conditions = waitingFor({ switch1Valid: true, switch1Id: 4 });

      // Act.
      const met = holds(conditions);

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('never holds a page waiting for its second switch on a fresh save', () =>
    {
      // Arrange.
      const conditions = waitingFor({ switch2Valid: true, switch2Id: 9 });

      // Act.
      const met = holds(conditions);

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('holds a page waiting for a switch once the preview turns that switch on', () =>
    {
      // Arrange: a page waiting for switch 74 on its first switch, another on its second.
      const pages = [ waitingFor({ switch1Valid: true, switch1Id: 74 }), waitingFor({ switch2Valid: true, switch2Id: 74 }) ];
      const preview = GamePreview.FRESH.withSwitch(74, true);

      // Act.
      const met = pages.map(conditions => holds(conditions, preview));

      // Assert.
      expect(met)
        .toStrictEqual([ true, true ]);
    });

    it('never wakes a page waiting for another switch, however near its number', () =>
    {
      // Arrange: switch 74 on, and pages waiting for switch 47, 73 and 75.
      const preview = GamePreview.FRESH.withSwitch(74, true);
      const pages = [ 47, 73, 75 ].map(switch1Id => waitingFor({ switch1Valid: true, switch1Id }));

      // Act.
      const met = pages.map(conditions => holds(conditions, preview));

      // Assert.
      expect(met)
        .toStrictEqual([ false, false, false ]);
    });

    it('holds a page waiting for two switches only while both are on', () =>
    {
      // Arrange: a page waiting for switches 24 and 147, with neither on, each alone, and both.
      const conditions = waitingFor({ switch1Valid: true, switch1Id: 24, switch2Valid: true, switch2Id: 147 });
      const previews = [
        GamePreview.FRESH,
        GamePreview.FRESH.withSwitch(24, true),
        GamePreview.FRESH.withSwitch(147, true),
        GamePreview.FRESH.withSwitch(24, true).withSwitch(147, true),
      ];

      // Act.
      const met = previews.map(preview => holds(conditions, preview));

      // Assert.
      expect(met)
        .toStrictEqual([ false, false, false, true ]);
    });

    it('never holds a page waiting for a self switch, whatever the preview sets', () =>
    {
      // Arrange: self switch A waited for beside switch 4, with switch 4 on.
      const conditions = waitingFor({ selfSwitchValid: true, selfSwitchCh: 'A', switch1Valid: true, switch1Id: 4 });

      // Act.
      const met = holds(conditions, GamePreview.FRESH.withSwitch(4, true));

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('never holds a page waiting for an item, whatever the preview sets', () =>
    {
      // Arrange: item 5 waited for beside variable 13 at 1, with variable 13 at 1.
      const conditions = waitingFor({ itemValid: true, itemId: 5, variableValid: true, variableId: 13, variableValue: 1 });

      // Act.
      const met = holds(conditions, GamePreview.FRESH.withVariable(13, 1));

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('holds a page waiting for a variable on a fresh save only while what it waits for is 0 or less', () =>
    {
      // Arrange: variable 13 at 1, at 0, and at -3.
      const pages = [ 1, 0, -3 ].map(variableValue => waitingFor({ variableValid: true, variableId: 13, variableValue }));

      // Act.
      const met = pages.map(conditions => holds(conditions));

      // Assert.
      expect(met)
        .toStrictEqual([ false, true, true ]);
    });

    it('holds a page waiting for a variable once the preview sets it at the page\'s value or above, and not below', () =>
    {
      // Arrange: a page waiting for variable 74 to reach 99, with variable 74 at 98, 99 and 100.
      const conditions = waitingFor({ variableValid: true, variableId: 74, variableValue: 99 });
      const previews = [ 98, 99, 100 ].map(value => GamePreview.FRESH.withVariable(74, value));

      // Act.
      const met = previews.map(preview => holds(conditions, preview));

      // Assert.
      expect(met)
        .toStrictEqual([ false, true, true ]);
    });

    it('never holds a page waiting for a variable that the preview leaves at 0 while it sets a neighbour', () =>
    {
      // Arrange: variable 74 at 99, and a page waiting for variable 47 to reach 99.
      const conditions = waitingFor({ variableValid: true, variableId: 47, variableValue: 99 });

      // Act.
      const met = holds(conditions, GamePreview.FRESH.withVariable(74, 99));

      // Assert.
      expect(met)
        .toBe(false);
    });

    it('stops holding a page waiting for a variable at 0 or less once the preview sets it below', () =>
    {
      // Arrange: a page waiting for variable 13 to reach 0, which a fresh save meets, with variable 13 at -1.
      const conditions = waitingFor({ variableValid: true, variableId: 13, variableValue: 0 });

      // Act.
      const met = [ holds(conditions), holds(conditions, GamePreview.FRESH.withVariable(13, -1)) ];

      // Assert.
      expect(met)
        .toStrictEqual([ true, false ]);
    });

    it('wants a page\'s switch and its variable together', () =>
    {
      // Arrange: a page waiting for switch 74 and variable 74 at 99, with the switch alone, the variable alone, and both.
      const conditions = waitingFor({ switch1Valid: true, switch1Id: 74, variableValid: true, variableId: 74, variableValue: 99 });
      const previews = [
        GamePreview.FRESH.withSwitch(74, true),
        GamePreview.FRESH.withVariable(74, 99),
        GamePreview.FRESH.withSwitch(74, true).withVariable(74, 99),
      ];

      // Act.
      const met = previews.map(preview => holds(conditions, preview));

      // Assert.
      expect(met)
        .toStrictEqual([ false, false, true ]);
    });

    it('holds a page waiting for an actor only while that actor starts in the party', () =>
    {
      // Arrange: Rupert, who starts in the party; actor 3, who does not; and Rupert again in a project starting with
      // nobody.
      const rupert = waitingFor({ actorValid: true, actorId: 2 });
      const stranger = waitingFor({ actorValid: true, actorId: 3 });

      // Act.
      const met = [ holds(rupert), holds(stranger), ownWaitsHold(ownWaitsOf(rupert, NO_PARTY)) ];

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
