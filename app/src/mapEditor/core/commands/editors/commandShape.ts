import { cloneJson, type JsonValue } from '../../model/json.ts';
import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';

/**
 * The code MZ writes at the end of every block body: an empty command one indent deeper than the block.
 */
const BODY_END_CODE = 0;

/**
 * Builds a command from another with new parameters, keeping every other key it had ({@code collapsed}, and any a
 * tool added) where it had it. The server writes command lists back byte for byte, so key order is part of what
 * a command is.
 * @param {RmmzEventCommand} command The command as it stands.
 * @param {readonly JsonValue[]} parameters Its new parameters.
 * @returns {RmmzEventCommand} The rebuilt command.
 */
const withParameters = (command: RmmzEventCommand, parameters: readonly JsonValue[]): RmmzEventCommand =>
{
  // assigning over an existing key leaves it in place, so the copy keeps the original's layout.
  return { ...cloneJson(command), parameters: cloneJson([ ...parameters ]) };
};

/**
 * Builds a command from another at a new indent, with new parameters.
 * @param {RmmzEventCommand} command The command as it stands.
 * @param {number} indent Its new indent.
 * @param {readonly JsonValue[]} parameters Its new parameters.
 * @returns {RmmzEventCommand} The rebuilt command.
 */
const withIndentAndParameters = (
  command: RmmzEventCommand,
  indent: number,
  parameters: readonly JsonValue[],
): RmmzEventCommand =>
{
  return { ...withParameters(command, parameters), indent };
};

/**
 * Builds a new command in the shape MZ writes: code, indent, then parameters.
 * @param {number} code The command code.
 * @param {number} indent Its indent.
 * @param {readonly JsonValue[]} parameters Its parameters.
 * @returns {RmmzEventCommand} The command.
 */
const createCommand = (code: number, indent: number, parameters: readonly JsonValue[]): RmmzEventCommand =>
{
  return { code, indent, parameters: cloneJson([ ...parameters ]) };
};

/**
 * Builds the empty command that closes a block body.
 * @param {number} blockIndent The indent of the block the body belongs to.
 * @returns {RmmzEventCommand} The closing command, one indent deeper.
 */
const bodyEnd = (blockIndent: number): RmmzEventCommand =>
{
  return createCommand(BODY_END_CODE, blockIndent + 1, []);
};

/**
 * Builds the single-text lines that continue a command (Show Text's 401s, Script's 655s), reusing the lines it
 * already had so each keeps its own layout, and making new ones for anything past them.
 * @param {number} code The code of the lines.
 * @param {number} indent The indent of the command they continue.
 * @param {readonly string[]} texts One text per line.
 * @param {readonly RmmzEventCommand[]} originals The lines the command had before.
 * @returns {RmmzEventCommand[]} The lines.
 */
const textLines = (
  code: number,
  indent: number,
  texts: readonly string[],
  originals: readonly RmmzEventCommand[],
): RmmzEventCommand[] =>
{
  return texts.map((text, index) =>
  {
    const original = originals.at(index);
    if (original === undefined || original.code !== code)
    {
      return createCommand(code, indent, [ text ]);
    }

    // anything a line carried past its text stays with it.
    return withIndentAndParameters(original, indent, [ text, ...original.parameters.slice(1) ]);
  });
};

/**
 * Reports whether every line holds exactly one string, as Show Text's and Script's lines do.
 * @param {readonly RmmzEventCommand[]} lines The lines.
 * @param {number} code The code each must have.
 * @returns {boolean} True when all are single-text lines of that code.
 */
const areTextLines = (lines: readonly RmmzEventCommand[], code: number): boolean =>
{
  return lines.every(line => line.code === code
    && line.parameters.length === 1
    && typeof line.parameters[0] === 'string');
};

/**
 * Reads the text of single-text lines.
 * @param {readonly RmmzEventCommand[]} lines Lines that {@link areTextLines} accepted.
 * @returns {string[]} Their texts.
 */
const lineTexts = (lines: readonly RmmzEventCommand[]): string[] =>
{
  return lines.map(line => line.parameters[0] as string);
};

/**
 * Reports whether a value is a whole number, which every id, index and enum in a command is.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True for an integer.
 */
const isWholeNumber = (value: JsonValue | undefined): value is number =>
{
  return typeof value === 'number' && Number.isInteger(value);
};

/**
 * Reports whether a value is a finite number.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True for a number.
 */
const isNumber = (value: JsonValue | undefined): value is number =>
{
  return typeof value === 'number' && Number.isFinite(value);
};

export {
  areTextLines,
  BODY_END_CODE,
  bodyEnd,
  createCommand,
  isNumber,
  isWholeNumber,
  lineTexts,
  textLines,
  withIndentAndParameters,
  withParameters,
};
