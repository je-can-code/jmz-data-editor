import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { areTextLines, isWholeNumber, lineTexts, textLines, withParameters } from './commandShape.ts';

/**
 * The code of Show Text.
 */
const SHOW_TEXT_CODE = 101;

/**
 * The code of each line of text that follows Show Text.
 */
const SHOW_TEXT_LINE_CODE = 401;

/**
 * A Show Text command read for editing: the face, the window's look and place, the speaker, and every line of
 * text. There is no cap on the lines; this game's message window holds more than MZ's four.
 */
type ShowTextModel = {
  /**
   * The face sheet in {@code img/faces}, or empty for no face.
   */
  readonly faceName: string;

  /**
   * Which of the sheet's eight faces, left to right and top to bottom from 0.
   */
  readonly faceIndex: number;

  /**
   * The window: 0 a window, 1 dimmed, 2 transparent.
   */
  readonly background: number;

  /**
   * Where the window sits: 0 top, 1 middle, 2 bottom.
   */
  readonly position: number;

  /**
   * The name shown above the text, or empty.
   */
  readonly speakerName: string;

  /**
   * The text, one entry per line.
   */
  readonly lines: readonly string[];
};

/**
 * Reads a Show Text command and its lines. Anything not shaped the way MZ writes it reads as null, so the editor
 * leaves it exactly as it is rather than guessing.
 * @param {RmmzEventCommand} command The Show Text command.
 * @param {readonly RmmzEventCommand[]} continuation The 401 lines after it.
 * @returns {ShowTextModel | null} The model, or null when the command is not MZ-shaped.
 */
const parseShowText = (command: RmmzEventCommand, continuation: readonly RmmzEventCommand[]): ShowTextModel | null =>
{
  const { code, parameters } = command;
  const [ faceName, faceIndex, background, position, speakerName ] = parameters;
  const shaped = code === SHOW_TEXT_CODE
    && parameters.length === 5
    && typeof faceName === 'string'
    && isWholeNumber(faceIndex)
    && isWholeNumber(background)
    && isWholeNumber(position)
    && typeof speakerName === 'string';
  if (shaped === false || areTextLines(continuation, SHOW_TEXT_LINE_CODE) === false)
  {
    return null;
  }

  return {
    faceName,
    faceIndex,
    background,
    position,
    speakerName,
    lines: lineTexts(continuation),
  };
};

/**
 * Writes a Show Text model back as the command and its lines, reusing the command's and lines' own layout.
 * @param {RmmzEventCommand} command The command as it stood.
 * @param {readonly RmmzEventCommand[]} continuation Its lines as they stood.
 * @param {ShowTextModel} model What they should now say.
 * @returns {{ command: RmmzEventCommand, continuation: RmmzEventCommand[] }} The command and its lines.
 */
const writeShowText = (
  command: RmmzEventCommand,
  continuation: readonly RmmzEventCommand[],
  model: ShowTextModel,
): { command: RmmzEventCommand; continuation: RmmzEventCommand[] } =>
{
  const { faceName, faceIndex, background, position, speakerName, lines } = model;
  return {
    command: withParameters(command, [ faceName, faceIndex, background, position, speakerName ]),
    continuation: textLines(SHOW_TEXT_LINE_CODE, command.indent, lines, continuation),
  };
};

/**
 * Joins lines into the text a text box shows.
 * @param {readonly string[]} lines The lines.
 * @returns {string} The text.
 */
const linesToText = (lines: readonly string[]): string =>
{
  return lines.join('\n');
};

/**
 * Splits a text box's text into lines. An empty box holds no lines at all.
 * @param {string} text The text.
 * @returns {string[]} The lines.
 */
const textToLines = (text: string): string[] =>
{
  return text === ''
    ? []
    : text.split('\n');
};

export {
  linesToText,
  parseShowText,
  SHOW_TEXT_CODE,
  SHOW_TEXT_LINE_CODE,
  textToLines,
  writeShowText,
};
export type { ShowTextModel };
