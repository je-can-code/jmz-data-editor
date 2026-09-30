import { describe, expect, it } from 'vitest';
import type { CommandCatalogEntry, CommandField } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { BUILT_IN_ENTRIES } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import {
  addContinuationLine,
  applyFieldChange,
  applyLineFieldChange,
  formValues,
  parametersFromDefaults,
  readFieldValue,
  removeContinuationLine,
  writeFieldValue,
  writeParameter,
  type CommandDraft,
} from '../../../../src/mapEditor/core/commands/fieldValues.ts';
import { cmd } from '../../support/commandFixtures.ts';

/*
 * A generated form reads each input's value out of a command and writes it back when the author changes it. That
 * round trip is where a careless editor loses data, so the module owes three promises. Writing the value already
 * there changes nothing, and hands back the very same command, which is how an untouched row saves exactly as it
 * came. Writing a new value changes only that input's parameter or lines and keeps every other key, `collapsed`
 * included. And text that runs over several lines (Show Text's 401s, a comment's 408s) reads as one text and
 * writes back one line per line, reusing the lines already there.
 *
 * On top of that, a change that brings other inputs into view starts them at their defaults, because whatever
 * their parameter held belonged to the input shown there before.
 */
describe('fieldValues', () =>
{
  /**
   * Finds a built-in entry by code.
   * @param {number} code The code.
   * @returns {CommandCatalogEntry} The entry.
   */
  const entryOf = (code: number): CommandCatalogEntry => BUILT_IN_ENTRIES.find(entry => entry.code === code) as CommandCatalogEntry;

  /**
   * Finds a field of an entry.
   * @param {number} code The entry's code.
   * @param {string} key The field.
   * @returns {CommandField} The field.
   */
  const fieldOf = (code: number, key: string): CommandField => entryOf(code).fields.find(field => field.key === key) as CommandField;

  /**
   * A Show Text with two lines, the second carrying an extra key a careless writer would drop.
   * @returns {CommandDraft} The draft.
   */
  const showText = (): CommandDraft => ({
    command: cmd(101, 1, [ '', 0, 0, 2, 'Harold' ]),
    continuation: [ cmd(401, 1, [ 'Hello.' ]), { ...cmd(401, 1, [ 'Again.' ]), collapsed: false } ],
  });

  describe('readFieldValue', () =>
  {
    it('reads a field from its parameter', () =>
    {
      // Arrange.
      const draft = showText();

      // Act.
      const value = readFieldValue(draft, fieldOf(101, 'speaker'));

      // Assert.
      expect(value)
        .toBe('Harold');
    });

    it('reads text on the continuation lines as one text', () =>
    {
      // Arrange.
      const draft = showText();

      // Act.
      const value = readFieldValue(draft, fieldOf(101, 'text'));

      // Assert.
      expect(value)
        .toBe('Hello.\nAgain.');
    });

    it('reads text starting on the command itself', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(108, 0, [ 'first' ]), continuation: [ cmd(408, 0, [ 'second' ]) ] };

      // Act.
      const value = readFieldValue(draft, fieldOf(108, 'text'));

      // Assert.
      expect(value)
        .toBe('first\nsecond');
    });

    it('reads a line that is not text as its text', () =>
    {
      // Arrange: a line holding a number where text belongs, and one holding nothing.
      const draft: CommandDraft = { command: cmd(101, 0, []), continuation: [ cmd(401, 0, [ 5 ]), cmd(401, 0, []) ] };

      // Act.
      const value = readFieldValue(draft, fieldOf(101, 'text'));

      // Assert.
      expect(value)
        .toBe('5\n');
    });

    it('reads a missing parameter as undefined', () =>
    {
      // Arrange: a timer stopped the short way, with no seconds.
      const draft: CommandDraft = { command: cmd(124, 0, [ 1 ]), continuation: [] };

      // Act.
      const value = readFieldValue(draft, fieldOf(124, 'seconds'));

      // Assert.
      expect(value)
        .toBeUndefined();
    });
  });

  describe('formValues', () =>
  {
    it('reads every field of an entry by key', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(121, 0, [ 3, 5, 1 ]), continuation: [] };

      // Act.
      const values = formValues(entryOf(121), draft);

      // Assert.
      expect(values)
        .toStrictEqual({ start: 3, end: 5, value: 1 });
    });
  });

  describe('writeFieldValue', () =>
  {
    it('hands back the same draft when the value is already there', () =>
    {
      // Arrange.
      const draft = showText();

      // Act.
      const written = [ writeFieldValue(draft, fieldOf(101, 'speaker'), 'Harold'), writeFieldValue(draft, fieldOf(101, 'text'), 'Hello.\nAgain.', 401) ];

      // Assert.
      expect([ written[0] === draft, written[1] === draft ])
        .toStrictEqual([ true, true ]);
    });

    it('writes only the field\'s parameter, keeping the command\'s other keys', () =>
    {
      // Arrange: a branch MZ folded shut.
      const draft: CommandDraft = { command: { ...cmd(111, 0, [ 0, 1, 0 ]), collapsed: true }, continuation: [] };

      // Act.
      const written = writeFieldValue(draft, fieldOf(111, 'switchValue'), 1);

      // Assert.
      expect([ written.command, draft.command.parameters ])
        .toStrictEqual([ { code: 111, indent: 0, parameters: [ 0, 1, 1 ], collapsed: true }, [ 0, 1, 0 ] ]);
    });

    it('stores a value as text for a field kept as text, and a structured value as its JSON', () =>
    {
      // Arrange: a plugin command's arguments, which MZ keeps as text.
      const count: CommandField = { key: 'count', label: 'Count', param: [ 3, 'count' ], kind: 'number', storage: 'string' };
      const ids: CommandField = { key: 'ids', label: 'Ids', param: [ 3, 'ids' ], kind: 'list', storage: 'string' };
      const draft: CommandDraft = { command: cmd(357, 0, [ 'p', 'c', 'C', { count: '1', ids: '[]' } ]), continuation: [] };

      // Act.
      const written = writeFieldValue(writeFieldValue(draft, count, 5), ids, [ '1', '2' ]);

      // Assert.
      expect(written.command.parameters[3])
        .toStrictEqual({ count: '5', ids: '["1","2"]' });
    });

    it('sees text equal to the stored number as no change', () =>
    {
      // Arrange.
      const count: CommandField = { key: 'count', label: 'Count', param: [ 3, 'count' ], kind: 'number', storage: 'string' };
      const draft: CommandDraft = { command: cmd(357, 0, [ 'p', 'c', 'C', { count: '5' } ]), continuation: [] };

      // Act.
      const written = writeFieldValue(draft, count, 5);

      // Assert.
      expect(written === draft)
        .toBe(true);
    });

    it('builds the containers a path passes through, filling gaps in a list with nulls', () =>
    {
      // Arrange.
      const field: CommandField = { key: 'quest', label: 'Quest', param: [ 3, 'questKey' ], kind: 'text' };
      const draft: CommandDraft = { command: cmd(357, 0, [ 'p' ]), continuation: [] };

      // Act.
      const written = writeFieldValue(draft, field, 'main-001');

      // Assert.
      expect(written.command.parameters)
        .toStrictEqual([ 'p', null, null, { questKey: 'main-001' } ]);
    });

    it('writes text one line per continuation line, reusing each line and making new ones', () =>
    {
      // Arrange.
      const draft = showText();

      // Act.
      const written = writeFieldValue(draft, fieldOf(101, 'text'), 'Hi.\nAgain!\nBye.', 401);

      // Assert: the second line kept its extra key; the third is new, at the command's indent.
      expect(written.continuation)
        .toStrictEqual([
          { code: 401, indent: 1, parameters: [ 'Hi.' ] },
          { code: 401, indent: 1, parameters: [ 'Again!' ], collapsed: false },
          { code: 401, indent: 1, parameters: [ 'Bye.' ] },
        ]);
    });

    it('writes an empty text as no lines at all', () =>
    {
      // Arrange.
      const draft = showText();

      // Act.
      const written = writeFieldValue(draft, fieldOf(101, 'text'), '', 401);

      // Assert.
      expect([ written.continuation, written.command === draft.command ])
        .toStrictEqual([ [], true ]);
    });

    it('writes text starting on the command itself, the rest on continuation lines', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(108, 0, [ 'old' ]), continuation: [ cmd(408, 0, [ 'gone' ]) ] };

      // Act.
      const written = writeFieldValue(draft, fieldOf(108, 'text'), 'new', 408);

      // Assert.
      expect([ written.command.parameters, written.continuation ])
        .toStrictEqual([ [ 'new' ], [] ]);
    });

    it('refuses to grow text on a command that has no continuation lines', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(108, 0, [ 'one' ]), continuation: [] };

      // Act.
      const write = () => writeFieldValue(draft, fieldOf(108, 'text'), 'one\ntwo');

      // Assert.
      expect(write)
        .toThrow('code 108 has no continuation lines to hold more text');
    });
  });

  describe('writeParameter', () =>
  {
    it('refuses a field with nowhere to live', () =>
    {
      // Arrange.

      // Act.
      const write = () => writeParameter([ 1 ], [], 2);

      // Assert.
      expect(write)
        .toThrow('a field needs a parameter to live in');
    });

    it('refuses to address a list by key', () =>
    {
      // Arrange: parameter 0 is a list, and the path asks it for a key.

      // Act.
      const write = () => writeParameter([ [ 1, 2 ] ], [ 0, 'key' ], 2);

      // Assert.
      expect(write)
        .toThrow('cannot write step key into [1,2]');
    });
  });

  describe('applyFieldChange', () =>
  {
    it('starts a field the change brought into view at its default, and leaves the others alone', () =>
    {
      // Arrange: a direct transfer, about to be switched to variables.
      const draft: CommandDraft = { command: cmd(201, 0, [ 0, 2, 16, 12, 8, 1 ]), continuation: [] };

      // Act.
      const changed = applyFieldChange(entryOf(201), draft, 'designation', 1);

      // Assert: the map, x and y slots now hold variable 1; direction and fade are untouched.
      expect(changed.command.parameters)
        .toStrictEqual([ 1, 1, 1, 1, 8, 1 ]);
    });

    it('keeps starting fields until nothing new shows', () =>
    {
      // Arrange: a constant operand, switched to game data, which shows its kind, whose default shows an item.
      const draft: CommandDraft = { command: cmd(122, 0, [ 1, 1, 0, 0, 7 ]), continuation: [] };

      // Act.
      const changed = applyFieldChange(entryOf(122), draft, 'operand', 3);

      // Assert.
      expect(changed.command.parameters)
        .toStrictEqual([ 1, 1, 0, 3, 0, 1 ]);
    });

    it('hands back the same draft when nothing changes', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(121, 0, [ 3, 5, 1 ]), continuation: [] };

      // Act.
      const changed = applyFieldChange(entryOf(121), draft, 'value', 1);

      // Assert.
      expect(changed === draft)
        .toBe(true);
    });

    it('rebuilds lines that only mirror the command', () =>
    {
      // Arrange: a move route of one step, with its one line.
      const route = { list: [ { code: 1 }, { code: 0 } ], repeat: false, skippable: false, wait: true };
      const draft: CommandDraft = { command: cmd(205, 2, [ -1, route ]), continuation: [ cmd(505, 2, [ { code: 1 } ]) ] };

      // Act.
      const changed = applyFieldChange(entryOf(205), draft, 'steps', [ { code: 2 }, { code: 3 }, { code: 0 } ]);

      // Assert.
      expect(changed.continuation)
        .toStrictEqual([ cmd(505, 2, [ { code: 2 } ]), cmd(505, 2, [ { code: 3 } ]) ]);
    });

    it('refuses a field the entry does not have', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(121, 0, [ 3, 5, 1 ]), continuation: [] };

      // Act.
      const change = () => applyFieldChange(entryOf(121), draft, 'ghost', 1);

      // Assert.
      expect(change)
        .toThrow('core:121 has no field "ghost"');
    });
  });

  describe('applyLineFieldChange', () =>
  {
    /**
     * A shop with a second item on a 605 line.
     * @returns {CommandDraft} The draft.
     */
    const shop = (): CommandDraft => ({
      command: cmd(302, 0, [ 0, 45, 0, 0, false ]),
      continuation: [ cmd(605, 0, [ 0, 46, 1, 300 ]), cmd(605, 0, [ 0, 47, 0, 0 ]) ],
    });

    it('changes one line, starting what the change brought into view', () =>
    {
      // Arrange.
      const draft = shop();

      // Act.
      const changed = applyLineFieldChange(entryOf(302), draft, 1, 'goodType', 1);

      // Assert: the second line now sells weapon 1; the first line and the command are untouched.
      expect([ changed.continuation[1].parameters, changed.continuation[0] === draft.continuation[0], changed.command === draft.command ])
        .toStrictEqual([ [ 1, 1, 0, 0 ], true, true ]);
    });

    it('hands back the same draft when the line already holds the value', () =>
    {
      // Arrange.
      const draft = shop();

      // Act.
      const changed = applyLineFieldChange(entryOf(302), draft, 0, 'price', 300);

      // Assert.
      expect(changed === draft)
        .toBe(true);
    });

    it('refuses a line that is not there', () =>
    {
      // Arrange.
      const draft = shop();

      // Act.
      const change = () => applyLineFieldChange(entryOf(302), draft, 5, 'price', 1);

      // Assert.
      expect(change)
        .toThrow('core:302 has no line 5');
    });

    it('refuses a continuation field the entry does not have', () =>
    {
      // Arrange: Show Text's lines have no fields of their own.
      const draft = showText();

      // Act.
      const change = () => applyLineFieldChange(entryOf(101), draft, 0, 'goodType', 1);

      // Assert.
      expect(change)
        .toThrow('core:101 has no field "goodType"');
    });
  });

  describe('parametersFromDefaults', () =>
  {
    it('writes each field\'s default where the field lives, leaving text on lines out', () =>
    {
      // Arrange.
      const fields = entryOf(101).fields;

      // Act.
      const parameters = parametersFromDefaults(fields);

      // Assert.
      expect(parameters)
        .toStrictEqual([ '', 0, 0, 2, '' ]);
    });
  });

  describe('addContinuationLine', () =>
  {
    it('adds a line at the end, each of its fields at its default', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(302, 3, [ 0, 45, 0, 0, false ]), continuation: [] };

      // Act.
      const added = addContinuationLine(entryOf(302), draft);

      // Assert: an item, the first one, at the standard price, at the shop's indent.
      expect(added.continuation)
        .toStrictEqual([ cmd(605, 3, [ 0, 1, 0, 0 ]) ]);
    });

    it('refuses a command with no continuation lines', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(121, 0, [ 1, 1, 0 ]), continuation: [] };

      // Act.
      const add = () => addContinuationLine(entryOf(121), draft);

      // Assert.
      expect(add)
        .toThrow('core:121 has no continuation lines');
    });
  });

  describe('removeContinuationLine', () =>
  {
    it('removes exactly the one line', () =>
    {
      // Arrange.
      const draft = showText();

      // Act.
      const removed = removeContinuationLine(draft, 0);

      // Assert.
      expect(removed.continuation.map(line => line.parameters[0]))
        .toStrictEqual([ 'Again.' ]);
    });
  });
});
