import { parseShowText, SHOW_TEXT_CODE, type ShowTextModel } from '../commands/editors/showText.ts';
import type { RmmzEventCommand, RmmzEventImage, RmmzEventPage } from '../model/rmmzTypes.ts';

/**
 * The code of the empty command every command list ends with.
 */
const LIST_END_CODE = 0;

/**
 * The commands that carry on over the lines after them, and the code of those lines: Show Text's text, a
 * comment's further lines, Set Movement Route's steps, Script's further lines and a plugin command's arguments.
 */
const CONTINUATION_OF: Readonly<Record<number, number>> = {
  101: 401,
  108: 408,
  205: 505,
  355: 655,
  357: 657,
};

/**
 * Every code that only ever continues another command.
 */
const CONTINUATION_CODES: ReadonlySet<number> = new Set(Object.values(CONTINUATION_OF));

/**
 * One command at the top of a page, with the lines that carry it on.
 */
type CommandUnit = {
  /**
   * Where the command sits in the page's list.
   */
  readonly index: number;

  /**
   * The command itself.
   */
  readonly command: RmmzEventCommand;

  /**
   * The lines carrying it on, such as Show Text's text; empty for a command that has none.
   */
  readonly lines: readonly RmmzEventCommand[];
};

/**
 * One Show Text on a page: where it sits, how many text lines follow it, and what it says.
 */
type PageMessage = {
  /**
   * Where the Show Text command sits in the page's list.
   */
  readonly index: number;

  /**
   * The Show Text command.
   */
  readonly command: RmmzEventCommand;

  /**
   * Its text lines, as they stand.
   */
  readonly lines: readonly RmmzEventCommand[];

  /**
   * What it says, read for editing.
   */
  readonly model: ShowTextModel;
};

/**
 * Reports whether a page runs nothing at all: its list holds only the empty command that ends every list.
 * @param {RmmzEventPage} page The page.
 * @returns {boolean} True for a page with no commands.
 */
const isEmptyPage = (page: RmmzEventPage): boolean =>
{
  return page.list.every(command => command.code === LIST_END_CODE);
};

/**
 * Reports whether a page shows a picture on the map: a character sheet cell or a tile.
 * @param {RmmzEventImage} image The page's image.
 * @returns {boolean} True when it shows something.
 */
const hasGraphic = (image: RmmzEventImage): boolean =>
{
  return image.tileId > 0 || image.characterName !== '';
};

/**
 * Finds where a command's continuation lines stop: just past the last line carrying it on, or just past the
 * command itself when it has none. The list's closing empty command is never counted as a line.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} index Where the command sits.
 * @returns {number} The index after its last line.
 */
const continuationEnd = (list: readonly RmmzEventCommand[], index: number): number =>
{
  const lineCode = CONTINUATION_OF[list[index].code];
  let end = index + 1;
  while (lineCode !== undefined && end < list.length - 1 && list[end].code === lineCode)
  {
    end += 1;
  }

  return end;
};

/**
 * Reports whether a command can start a unit at the top of a list: anything but the closing empty command and the
 * lines that only ever carry another command on. Either one out of place means the list is not one MZ would write.
 * @param {RmmzEventCommand} command The command.
 * @returns {boolean} True when it can start a unit.
 */
const startsUnit = (command: RmmzEventCommand): boolean =>
{
  return command.code !== LIST_END_CODE && CONTINUATION_CODES.has(command.code) === false;
};

/**
 * Reports whether a list ends the way MZ ends every list: with the empty command at the top level.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @returns {boolean} True when it does.
 */
const endsList = (list: readonly RmmzEventCommand[]): boolean =>
{
  const last = list.at(-1);
  return last !== undefined && last.code === LIST_END_CODE && last.indent === 0;
};

/**
 * Reads a page that holds no blocks: every command at the top level, each continuation line right after the
 * command it carries on, and the empty command last. A branch or a choice puts commands deeper than the top level,
 * so a page holding one reads as null; the kinds built on this never have to reason about what runs only sometimes.
 * @param {readonly RmmzEventCommand[]} list The page's command list.
 * @returns {CommandUnit[] | null} The commands in order, the closing empty command left out, or null when the page
 * holds a block or is not shaped the way MZ writes a list.
 */
const readFlatUnits = (list: readonly RmmzEventCommand[]): CommandUnit[] | null =>
{
  if (endsList(list) === false || list.some(command => command.indent !== 0))
  {
    return null;
  }

  const units: CommandUnit[] = [];
  let index = 0;
  while (index < list.length - 1)
  {
    const command = list[index];
    if (startsUnit(command) === false)
    {
      return null;
    }

    const end = continuationEnd(list, index);
    units.push({ index, command, lines: list.slice(index + 1, end) });
    index = end;
  }

  return units;
};

/**
 * Reads a unit as a Show Text, when it is one shaped the way MZ writes it.
 * @param {CommandUnit} unit The unit.
 * @returns {PageMessage | null} The message, or null for anything else.
 */
const readMessage = (unit: CommandUnit): PageMessage | null =>
{
  if (unit.command.code !== SHOW_TEXT_CODE)
  {
    return null;
  }

  const model = parseShowText(unit.command, unit.lines);
  return model === null
    ? null
    : { index: unit.index, command: unit.command, lines: unit.lines, model };
};

/**
 * Reads a page that does nothing but talk: one Show Text after another at the top level, and nothing else.
 * @param {RmmzEventPage} page The page.
 * @returns {PageMessage[] | null} Its messages in order, or null when the page does anything besides talk, or
 * does not talk at all.
 */
const readTextPage = (page: RmmzEventPage): PageMessage[] | null =>
{
  const units = readFlatUnits(page.list);
  if (units === null || units.length === 0)
  {
    return null;
  }

  const messages = units.map(readMessage);
  return messages.every(message => message !== null)
    ? messages as PageMessage[]
    : null;
};

export {
  CONTINUATION_OF,
  continuationEnd,
  endsList,
  hasGraphic,
  isEmptyPage,
  LIST_END_CODE,
  readFlatUnits,
  readMessage,
  readTextPage,
  startsUnit,
};
export type { CommandUnit, PageMessage };
