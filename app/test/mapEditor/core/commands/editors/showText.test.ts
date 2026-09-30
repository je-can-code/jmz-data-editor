import { describe, expect, it } from 'vitest';
import {
  linesToText,
  parseShowText,
  textToLines,
  writeShowText,
} from '../../../../../src/mapEditor/core/commands/editors/showText.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * Show Text is a command (face, window, position, speaker) followed by one line command per line of text. The
 * editor reads both into one model and writes both back, and owes the game three things: no cap on the lines
 * (this game's message window holds more than MZ's four), each surviving line keeps its own layout, and a
 * command shaped any way MZ never writes reads as null, so the editor leaves it untouched instead of guessing.
 */
describe('show text', () =>
{
  /**
   * Builds a Show Text command.
   * @param {unknown[]} parameters Its parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const showText = (parameters: unknown[]): RmmzEventCommand => ({ code: 101, indent: 1, parameters: parameters as never });

  /**
   * Builds a line of text.
   * @param {string} text The text.
   * @returns {RmmzEventCommand} The line.
   */
  const line = (text: string): RmmzEventCommand => ({ code: 401, indent: 1, parameters: [ text ] });

  describe('parseShowText', () =>
  {
    it('reads the face, window, position, speaker and every line, past four', () =>
    {
      // Arrange.
      const lines = [ 'one', 'two', 'three', 'four', 'five' ].map(line);

      // Act.
      const model = parseShowText(showText([ 'face_je', 3, 1, 2, 'JE' ]), lines);

      // Assert.
      expect(model)
        .toStrictEqual({ faceName: 'face_je', faceIndex: 3, background: 1, position: 2, speakerName: 'JE', lines: [ 'one', 'two', 'three', 'four', 'five' ] });
    });

    it('reads a message with no lines at all', () =>
    {
      // Arrange: a face-only message.

      // Act.
      const model = parseShowText(showText([ '', 0, 0, 2, '' ]), []);

      // Assert.
      expect(model?.lines)
        .toStrictEqual([]);
    });

    it('refuses a command MZ never writes: short parameters, wrong types, or another code', () =>
    {
      // Arrange: each differs from a valid command in one way.
      const shapes = [
        showText([ 'face_je', 3, 1, 2 ]),
        showText([ 'face_je', '3', 1, 2, '' ]),
        showText([ 'face_je', 3, 1, 2, null ]),
        { ...showText([ 'face_je', 3, 1, 2, '' ]), code: 105 },
      ];

      // Act.
      const models = shapes.map(shape => parseShowText(shape, []));

      // Assert.
      expect(models)
        .toStrictEqual([ null, null, null, null ]);
    });

    it('refuses lines that are not single lines of text', () =>
    {
      // Arrange: a line of another code, and a line holding two values.
      const command = showText([ '', 0, 0, 2, '' ]);

      // Act.
      const models = [
        parseShowText(command, [ line('fine'), { code: 405, indent: 1, parameters: [ 'scroll' ] } ]),
        parseShowText(command, [ { code: 401, indent: 1, parameters: [ 'a', 'b' ] } ]),
      ];

      // Assert.
      expect(models)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('writeShowText', () =>
  {
    it('writes the settings and reuses each existing line, keeping keys it carried', () =>
    {
      // Arrange: the first line carries a key a tool added.
      const command = { ...showText([ 'face_je', 3, 1, 2, 'JE' ]), collapsed: true };
      const lines = [ { ...line('old one'), extra: 1 } as RmmzEventCommand, line('old two') ];
      const model = { faceName: 'face_rp', faceIndex: 0, background: 2, position: 0, speakerName: 'RP', lines: [ 'new one', 'new two', 'new three' ] };

      // Act.
      const written = writeShowText(command, lines, model);

      // Assert: the third line is new, at the command's indent.
      expect(JSON.stringify(written))
        .toBe(JSON.stringify({
          command: { code: 101, indent: 1, parameters: [ 'face_rp', 0, 2, 0, 'RP' ], collapsed: true },
          continuation: [
            { code: 401, indent: 1, parameters: [ 'new one' ], extra: 1 },
            { code: 401, indent: 1, parameters: [ 'new two' ] },
            { code: 401, indent: 1, parameters: [ 'new three' ] },
          ],
        }));
    });

    it('drops the lines past the new text', () =>
    {
      // Arrange.
      const command = showText([ '', 0, 0, 2, '' ]);
      const model = { faceName: '', faceIndex: 0, background: 0, position: 2, speakerName: '', lines: [ 'only' ] };

      // Act.
      const written = writeShowText(command, [ line('a'), line('b'), line('c') ], model);

      // Assert.
      expect(written.continuation)
        .toStrictEqual([ line('only') ]);
    });
  });

  describe('linesToText and textToLines', () =>
  {
    it('join lines with line breaks and split them back, keeping a trailing empty line', () =>
    {
      // Arrange.
      const lines = [ 'first', '', 'third', '' ];

      // Act.
      const text = linesToText(lines);
      const back = textToLines(text);

      // Assert.
      expect([ text, back ])
        .toStrictEqual([ 'first\n\nthird\n', [ 'first', '', 'third', '' ] ]);
    });

    it('read an empty text box as no lines', () =>
    {
      // Arrange: nothing typed.

      // Act.
      const lines = textToLines('');

      // Assert.
      expect(lines)
        .toStrictEqual([]);
    });
  });
});
