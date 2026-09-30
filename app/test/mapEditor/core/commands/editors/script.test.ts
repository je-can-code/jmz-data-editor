import { describe, expect, it } from 'vitest';
import {
  parseScript,
  scriptToText,
  textToScript,
  writeScript,
} from '../../../../../src/mapEditor/core/commands/editors/script.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * A Script command keeps its first line of code in itself and every further line in the lines after it; the
 * engine joins them back up before running them. The editor treats that as one block of code, and owes the game
 * a faithful split: the first line always stays in the command (even when empty), each further line becomes a
 * continuation line, and anything MZ would not have written reads as null so it is left alone.
 */
describe('script', () =>
{
  /**
   * Builds a Script command.
   * @param {unknown[]} parameters Its parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const script = (parameters: unknown[]): RmmzEventCommand => ({ code: 355, indent: 0, parameters: parameters as never });

  /**
   * Builds a further line of script.
   * @param {string} text The code.
   * @returns {RmmzEventCommand} The line.
   */
  const line = (text: string): RmmzEventCommand => ({ code: 655, indent: 0, parameters: [ text ] });

  describe('parseScript', () =>
  {
    it('reads the first line from the command and the rest from the lines after it', () =>
    {
      // Arrange.
      const command = script([ 'const a = 1;' ]);

      // Act.
      const model = parseScript(command, [ line('const b = 2;'), line('') ]);

      // Assert.
      expect(model)
        .toStrictEqual({ lines: [ 'const a = 1;', 'const b = 2;', '' ] });
    });

    it('refuses a command MZ never writes', () =>
    {
      // Arrange: extra parameters, a number, another code, and a further line of another code.
      const attempts = [
        parseScript(script([ 'a', 'b' ]), []),
        parseScript(script([ 3 ]), []),
        parseScript({ ...script([ 'a' ]), code: 356 }, []),
        parseScript(script([ 'a' ]), [ { code: 401, indent: 0, parameters: [ 'b' ] } ]),
      ];

      // Act: the attempts above.

      // Assert.
      expect(attempts)
        .toStrictEqual([ null, null, null, null ]);
    });
  });

  describe('writeScript', () =>
  {
    it('writes the first line into the command and the rest after it', () =>
    {
      // Arrange.
      const command = script([ 'old' ]);

      // Act.
      const written = writeScript(command, [ line('gone') ], { lines: [ 'one', 'two', 'three' ] });

      // Assert.
      expect(written)
        .toStrictEqual({ command: script([ 'one' ]), continuation: [ line('two'), line('three') ] });
    });

    it('keeps an empty first line in the command when the code is gone', () =>
    {
      // Arrange.
      const command = script([ 'old' ]);

      // Act.
      const written = writeScript(command, [ line('gone') ], { lines: [] });

      // Assert.
      expect(written)
        .toStrictEqual({ command: script([ '' ]), continuation: [] });
    });
  });

  describe('scriptToText and textToScript', () =>
  {
    it('join lines with line breaks, and read an empty box as one empty line', () =>
    {
      // Arrange.
      const lines = [ 'a();', 'b();' ];

      // Act.
      const results = [ scriptToText(lines), textToScript('a();\nb();'), textToScript('') ];

      // Assert.
      expect(results)
        .toStrictEqual([ 'a();\nb();', [ 'a();', 'b();' ], [ '' ] ]);
    });
  });
});
