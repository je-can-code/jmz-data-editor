import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { areTextLines, lineTexts, textLines, withParameters } from './commandShape.ts';

/**
 * The code of Script, which holds the first line of code.
 */
const SCRIPT_CODE = 355;

/**
 * The code of each further line of a script.
 */
const SCRIPT_LINE_CODE = 655;

/**
 * A Script command read for editing: its code, one entry per line. The first line lives in the command itself
 * and the rest in the lines after it, which the engine joins back together before running them.
 */
type ScriptModel = {
  readonly lines: readonly string[];
};

/**
 * Reads a Script command and its lines.
 * @param {RmmzEventCommand} command The Script command.
 * @param {readonly RmmzEventCommand[]} continuation The 655 lines after it.
 * @returns {ScriptModel | null} The model, or null when the command is not MZ-shaped.
 */
const parseScript = (command: RmmzEventCommand, continuation: readonly RmmzEventCommand[]): ScriptModel | null =>
{
  const { code, parameters } = command;
  const [ first ] = parameters;
  if (code !== SCRIPT_CODE
    || parameters.length !== 1
    || typeof first !== 'string'
    || areTextLines(continuation, SCRIPT_LINE_CODE) === false)
  {
    return null;
  }

  return { lines: [ first, ...lineTexts(continuation) ] };
};

/**
 * Writes a script back as the command and its lines. A script always keeps its first line, even when empty,
 * since the command itself holds it.
 * @param {RmmzEventCommand} command The command as it stood.
 * @param {readonly RmmzEventCommand[]} continuation Its lines as they stood.
 * @param {ScriptModel} model The code it should now hold.
 * @returns {{ command: RmmzEventCommand, continuation: RmmzEventCommand[] }} The command and its lines.
 */
const writeScript = (
  command: RmmzEventCommand,
  continuation: readonly RmmzEventCommand[],
  model: ScriptModel,
): { command: RmmzEventCommand; continuation: RmmzEventCommand[] } =>
{
  const [ first = '', ...rest ] = model.lines;
  return {
    command: withParameters(command, [ first ]),
    continuation: textLines(SCRIPT_LINE_CODE, command.indent, rest, continuation),
  };
};

/**
 * Joins a script's lines into the code a code box shows.
 * @param {readonly string[]} lines The lines.
 * @returns {string} The code.
 */
const scriptToText = (lines: readonly string[]): string =>
{
  return lines.join('\n');
};

/**
 * Splits a code box's code into lines; an empty box is one empty line, since a script always has its first.
 * @param {string} text The code.
 * @returns {string[]} The lines.
 */
const textToScript = (text: string): string[] =>
{
  return text.split('\n');
};

export { parseScript, SCRIPT_CODE, SCRIPT_LINE_CODE, scriptToText, textToScript, writeScript };
export type { ScriptModel };
