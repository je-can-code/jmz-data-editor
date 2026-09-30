import { describe, expect, it } from 'vitest';
import { CLIPBOARD_FORMAT, readClipboard, writeClipboard } from '../../../../src/mapEditor/core/commandList/commandClipboard.ts';
import { cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * Copied commands travel on the system clipboard as JSON, so they paste across maps, windows and copies of the
 * editor. The clipboard owes a paste two things: text it did not write is recognised as not being commands (a
 * paste of ordinary text into the list does nothing), and commands that claim to be commands but do not read as
 * whole units (half a block, a stray end) are refused whole, so a paste can never break the list it lands in.
 * Indents travel relative, so a block copied from deep inside another pastes at any depth.
 */
describe('commandClipboard', () =>
{
  describe('writeClipboard', () =>
  {
    it('writes marked JSON with the indents made relative', () =>
    {
      // Arrange: a loop copied from inside a branch.
      const commands = [ cmd(112, 1), cmd(113, 2), cmd(0, 2), cmd(413, 1) ];

      // Act.
      const text = writeClipboard(commands);

      // Assert.
      expect(JSON.parse(text))
        .toStrictEqual({ format: CLIPBOARD_FORMAT, version: 1, commands: [ cmd(112, 0), cmd(113, 1), cmd(0, 1), cmd(413, 0) ] });
    });
  });

  describe('readClipboard', () =>
  {
    it('reads back what it wrote', () =>
    {
      // Arrange.
      const commands = [ { ...cmd(111, 3, [ 0, 1, 0 ]), collapsed: true }, cmd(0, 4), cmd(412, 3), cmd(230, 3, [ 5 ]) ];

      // Act.
      const read = readClipboard(writeClipboard(commands), MZ_STRUCTURE);

      // Assert.
      expect(read)
        .toStrictEqual({ ok: true, commands: [ { ...cmd(111, 0, [ 0, 1, 0 ]), collapsed: true }, cmd(0, 1), cmd(412, 0), cmd(230, 0, [ 5 ]) ] });
    });

    it('sees ordinary text, other JSON and a wrong marker as not commands', () =>
    {
      // Arrange.
      const texts = [ 'hello', '[1, 2]', JSON.stringify({ format: 'other', commands: [] }), '' ];

      // Act.
      const reads = texts.map(text => readClipboard(text, MZ_STRUCTURE));

      // Assert.
      expect(reads.map(read => (read.ok ? 'ok' : read.reason)))
        .toStrictEqual([ 'not-commands', 'not-commands', 'not-commands', 'not-commands' ]);
    });

    it('refuses marked text of another version, with no commands, or with something that is not a command', () =>
    {
      // Arrange.
      const texts = [
        JSON.stringify({ format: CLIPBOARD_FORMAT, version: 2, commands: [ cmd(230, 0, [ 5 ]) ] }),
        JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands: [] }),
        JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands: 'no' }),
        JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands: [ { code: 230, indent: -1, parameters: [] } ] }),
        JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands: [ { code: 'x', indent: 0, parameters: [] } ] }),
        JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands: [ { code: 230, indent: 0 } ] }),
        JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands: [ 5 ] }),
      ];

      // Act.
      const reads = texts.map(text => readClipboard(text, MZ_STRUCTURE));

      // Assert.
      expect(reads.map(read => (read.ok ? 'ok' : read.reason)))
        .toStrictEqual([ 'broken', 'broken', 'broken', 'broken', 'broken', 'broken', 'broken' ]);
    });

    it('refuses half a block and a stray end', () =>
    {
      // Arrange: a branch with no end, and a list end in the middle.
      const halves = [
        [ cmd(111, 0, [ 0, 1, 0 ]), cmd(230, 1, [ 5 ]), cmd(0, 1) ],
        [ cmd(230, 0, [ 5 ]), cmd(0, 0), cmd(230, 0, [ 6 ]) ],
      ];

      // Act.
      const reads = halves.map(commands => readClipboard(JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, commands }), MZ_STRUCTURE));

      // Assert.
      expect(reads.map(read => (read.ok ? 'ok' : read.reason)))
        .toStrictEqual([ 'broken', 'broken' ]);
    });
  });
});
