import { describe, expect, it } from 'vitest';
import type { CommandFieldKind } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { PAGE_GONE_MESSAGE, targetHistory } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import {
  CONDITION_KINDS,
  describePageConditions,
  encodeConditionChange,
  readPageConditions,
  setPageCondition,
  type ConditionChange,
  type IdConditionKind,
} from '../../../../src/mapEditor/core/eventWindow/pageConditions.ts';
import type { RmmzEventConditions } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { eventWindowHub, eventWindowMap, expectedMap, heldMap, markedPage, TARGET } from '../../support/eventWindowFixtures.ts';

/*
 * A page's conditions are six things it can wait for: two switches, a variable at or above a value, a self switch, an
 * item in the inventory and an actor in the party. The window reads them as six rows in MZ's order, each on or off and
 * keeping its values while off (as MZ keeps them), and every change the author makes writes exactly one field of the
 * page's conditions: the condition's own on-off flag, its own id, the variable's value, or the self switch's letter.
 * That one-field promise is the whole contract, because the fields sit side by side with near-identical names, so
 * every encoding is checked against its nearest neighbour: the first switch against the second, the variable's id
 * against its value, the item against the actor. A value a condition cannot hold (an id below 1, a value that is not a
 * whole number the game holds exactly, a fifth self switch) is refused, changing nothing; a variable's value has no
 * smaller cap than that. Each change is one step in the event's own history.
 */
describe('pageConditions', () =>
{
  describe('readPageConditions', () =>
  {
    it('reads the six conditions in MZ\'s order, each with its values, on or off', () =>
    {
      // Arrange: page 2's ids and value carry its mark; switch 2 and the self switch are on.
      const conditions: RmmzEventConditions = { ...markedPage(2).conditions, switch2Valid: true, selfSwitchValid: true, selfSwitchCh: 'C' };

      // Act.
      const rows = readPageConditions(conditions);

      // Assert.
      expect(rows)
        .toStrictEqual([
          { kind: 'switch1', enabled: false, id: 2 },
          { kind: 'switch2', enabled: true, id: 12 },
          { kind: 'variable', enabled: false, id: 2, value: 6 },
          { kind: 'selfSwitch', enabled: true, letter: 'C' },
          { kind: 'item', enabled: false, id: 2 },
          { kind: 'actor', enabled: false, id: 2 },
        ]);
    });
  });

  describe('encodeConditionChange', () =>
  {
    it('turns each condition on and off through its own flag alone', () =>
    {
      // Arrange: every condition, turned on.
      const changes: ConditionChange[] = CONDITION_KINDS.map(kind => ({ kind, part: 'enabled', value: true }));

      // Act.
      const writes = changes.map(encodeConditionChange);

      // Assert.
      expect(writes)
        .toStrictEqual([
          { ok: true, field: 'switch1Valid', value: true },
          { ok: true, field: 'switch2Valid', value: true },
          { ok: true, field: 'variableValid', value: true },
          { ok: true, field: 'selfSwitchValid', value: true },
          { ok: true, field: 'itemValid', value: true },
          { ok: true, field: 'actorValid', value: true },
        ]);
    });

    it('picks each condition\'s switch, variable or row through its own id alone', () =>
    {
      // Arrange.
      const kinds: IdConditionKind[] = [ 'switch1', 'switch2', 'variable', 'item', 'actor' ];

      // Act.
      const writes = kinds.map(kind => encodeConditionChange({ kind, part: 'id', value: 7 }));

      // Assert.
      expect(writes)
        .toStrictEqual([
          { ok: true, field: 'switch1Id', value: 7 },
          { ok: true, field: 'switch2Id', value: 7 },
          { ok: true, field: 'variableId', value: 7 },
          { ok: true, field: 'itemId', value: 7 },
          { ok: true, field: 'actorId', value: 7 },
        ]);
    });

    it('writes a variable\'s value and a self switch\'s letter to their own fields', () =>
    {
      // Arrange.
      const changes: ConditionChange[] = [ { kind: 'variable', part: 'value', value: -40 }, { kind: 'selfSwitch', part: 'letter', value: 'D' } ];

      // Act.
      const writes = changes.map(encodeConditionChange);

      // Assert.
      expect(writes)
        .toStrictEqual([ { ok: true, field: 'variableValue', value: -40 }, { ok: true, field: 'selfSwitchCh', value: 'D' } ]);
    });

    it('takes ids from 1, and as a value any whole number the game holds exactly, either way, with no smaller cap', () =>
    {
      // Arrange: each the edge of what a condition can hold, and a value well past a hundred million.
      const changes: ConditionChange[] = [
        { kind: 'switch1', part: 'id', value: 1 },
        { kind: 'variable', part: 'value', value: Number.MAX_SAFE_INTEGER },
        { kind: 'variable', part: 'value', value: -Number.MAX_SAFE_INTEGER },
        { kind: 'variable', part: 'value', value: 123_456_789_012 },
        { kind: 'selfSwitch', part: 'letter', value: 'A' },
      ];

      // Act.
      const writes = changes.map(encodeConditionChange);

      // Assert.
      expect(writes)
        .toStrictEqual([
          { ok: true, field: 'switch1Id', value: 1 },
          { ok: true, field: 'variableValue', value: 9_007_199_254_740_991 },
          { ok: true, field: 'variableValue', value: -9_007_199_254_740_991 },
          { ok: true, field: 'variableValue', value: 123_456_789_012 },
          { ok: true, field: 'selfSwitchCh', value: 'A' },
        ]);
    });

    it('refuses an id below 1 or not whole, a value the game cannot hold exactly or not whole, and any letter but A to D', () =>
    {
      // Arrange: each just past the edge.
      const changes: ConditionChange[] = [
        { kind: 'switch1', part: 'id', value: 0 },
        { kind: 'actor', part: 'id', value: 2.5 },
        { kind: 'variable', part: 'value', value: 9_007_199_254_740_992 },
        { kind: 'variable', part: 'value', value: -9_007_199_254_740_992 },
        { kind: 'variable', part: 'value', value: 1.5 },
        { kind: 'variable', part: 'value', value: Number.POSITIVE_INFINITY },
        { kind: 'variable', part: 'value', value: Number.NaN },
        { kind: 'selfSwitch', part: 'letter', value: 'E' },
        { kind: 'selfSwitch', part: 'letter', value: 'a' },
      ];

      // Act.
      const refused = changes.map(encodeConditionChange);

      // Assert.
      const value = 'A variable condition waits for a whole number between -9,007,199,254,740,991 and 9,007,199,254,740,991.';
      expect(refused.map(each => (each.ok ? 'written' : each.message)))
        .toStrictEqual([
          'Pick one from the list.',
          'Pick one from the list.',
          value,
          value,
          value,
          value,
          value,
          'A self switch is A, B, C or D.',
          'A self switch is A, B, C or D.',
        ]);
    });
  });

  describe('setPageCondition', () =>
  {
    it('turns on the first switch of one page alone, as one step that one undo takes back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = setPageCondition(hub, TARGET, 1, { kind: 'switch1', part: 'enabled', value: true });
      const changed = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert: the second switch, the other pages and the neighbouring events never changed.
      expect([ outcome.ok && outcome.step?.label, outcome.ok && outcome.page, changed, heldMap(hub) ])
        .toStrictEqual([
          'Turn on switch condition (page 2)',
          1,
          expectedMap(event =>
          {
            event.pages[1].conditions.switch1Valid = true;
          }),
          eventWindowMap(),
        ]);
    });

    it('picks the second switch without touching the first', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcome = setPageCondition(hub, TARGET, 0, { kind: 'switch2', part: 'id', value: 44 });

      // Assert.
      expect([ outcome.ok && outcome.step?.label, heldMap(hub) ])
        .toStrictEqual([
          'Change second switch condition (page 1)',
          expectedMap(event =>
          {
            event.pages[0].conditions.switch2Id = 44;
          }),
        ]);
    });

    it('sets the value a variable must reach without touching which variable it is', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      setPageCondition(hub, TARGET, 2, { kind: 'variable', part: 'value', value: 120 });

      // Assert.
      expect(heldMap(hub))
        .toStrictEqual(expectedMap(event =>
        {
          event.pages[2].conditions.variableValue = 120;
        }));
    });

    it('picks the item without touching the actor, and turns the actor off without touching the item', () =>
    {
      // Arrange: the actor condition on, to turn off.
      const hub = eventWindowHub();
      setPageCondition(hub, TARGET, 0, { kind: 'actor', part: 'enabled', value: true });

      // Act.
      setPageCondition(hub, TARGET, 0, { kind: 'item', part: 'id', value: 300 });
      const off = setPageCondition(hub, TARGET, 0, { kind: 'actor', part: 'enabled', value: false });

      // Assert.
      expect([ off.ok && off.step?.label, heldMap(hub) ])
        .toStrictEqual([
          'Turn off actor condition (page 1)',
          expectedMap(event =>
          {
            event.pages[0].conditions.itemId = 300;
          }),
        ]);
    });

    it('picks the self switch letter alone', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      setPageCondition(hub, TARGET, 1, { kind: 'selfSwitch', part: 'letter', value: 'B' });

      // Assert.
      expect(heldMap(hub))
        .toStrictEqual(expectedMap(event =>
        {
          event.pages[1].conditions.selfSwitchCh = 'B';
        }));
    });

    it('records nothing when the condition already holds the value', () =>
    {
      // Arrange: page 1's first switch is 1 already.
      const hub = eventWindowHub();

      // Act.
      const outcome = setPageCondition(hub, TARGET, 0, { kind: 'switch1', part: 'id', value: 1 });

      // Assert.
      expect([ outcome, hub.history(targetHistory(TARGET)).rows ])
        .toStrictEqual([ { ok: true, step: null, page: 0 }, [] ]);
    });

    it('refuses a value the condition cannot hold, and a page that has gone, changing and recording nothing', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcomes = [
        setPageCondition(hub, TARGET, 0, { kind: 'selfSwitch', part: 'letter', value: 'Z' }),
        setPageCondition(hub, TARGET, 3, { kind: 'switch1', part: 'enabled', value: true }),
      ];

      // Assert.
      expect([ outcomes, heldMap(hub), hub.history(targetHistory(TARGET)).rows ])
        .toStrictEqual([
          [ { ok: false, message: 'A self switch is A, B, C or D.' }, { ok: false, message: PAGE_GONE_MESSAGE } ],
          eventWindowMap(),
          [],
        ]);
    });
  });

  describe('describePageConditions', () =>
  {
    it('words each condition the page waits for, with names where the project has them', () =>
    {
      // Arrange: every condition on; switch 12 and actor 2 have no name.
      const conditions: RmmzEventConditions = {
        ...markedPage(2).conditions,
        switch1Valid: true,
        switch2Valid: true,
        variableValid: true,
        selfSwitchValid: true,
        selfSwitchCh: 'B',
        itemValid: true,
        actorValid: true,
      };
      const known: Readonly<Record<string, string>> = { 'switch:2': 'Intro Done', 'variable:2': 'Gold Found', 'item:2': 'Potion', 'actor:2': '' };
      const names = (kind: CommandFieldKind, id: number): string | null => known[`${kind}:${id}`] ?? null;

      // Act.
      const lines = describePageConditions(conditions, names);

      // Assert.
      expect(lines)
        .toStrictEqual([
          'Switch #0002 Intro Done is ON',
          'Switch #0012 is ON',
          'Variable #0002 Gold Found is 6 or more',
          'Self switch B is ON',
          '#2 Potion is in the inventory',
          '#2 is in the party',
        ]);
    });

    it('says nothing for a page that waits for nothing', () =>
    {
      // Arrange.
      const { conditions } = markedPage(1);

      // Act.
      const lines = describePageConditions(conditions, () => 'Named');

      // Assert.
      expect(lines)
        .toStrictEqual([]);
    });
  });
});
