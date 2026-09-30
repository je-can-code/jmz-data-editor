import type { RmmzEventCommand } from '../model/rmmzTypes.ts';

/**
 * The codes of a comment's first line and the lines continuing it.
 */
const COMMENT_CODE = 108;
const COMMENT_LINE_CODE = 408;

/**
 * The codes of Show Choices and of the end of its block.
 */
const SHOW_CHOICES_CODE = 102;
const END_CHOICES_CODE = 404;

/**
 * KMS_AreaEvent's tag, as the plugin itself matches it: a trigger area so many tiles wide and high, anchored at the
 * event's own tile.
 */
const AREA_EVENT_TAG = /<(?:エリアイベント|AreaEvent)\s*[:\s]\s*(\d+)\s*x\s*(\d+)>/iu;

/**
 * A trigger area a comment gives its event, and whether the plugin will ever see it.
 */
type AreaEventTag = {
  readonly width: number;
  readonly height: number;

  /**
   * KMS_AreaEvent reads only the comments at the very top of a page, before any other command, so a tag anywhere
   * else does nothing.
   */
  readonly effective: boolean;
};

/**
 * Reports whether a Show Choices runs straight on from the one before it, which HIME_LargeChoices merges into one
 * list of choices: the end of one block followed at once by the next, at the same indent. The editor shows the two
 * as separate blocks and never puts anything between them on its own, so the merge survives every save.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {number} index The Show Choices command's index.
 * @returns {boolean} True when it joins the choices above it.
 */
const joinsChoicesAbove = (list: readonly RmmzEventCommand[], index: number): boolean =>
{
  const command = list[index];
  const before = list[index - 1];
  return command !== undefined
    && before !== undefined
    && command.code === SHOW_CHOICES_CODE
    && before.code === END_CHOICES_CODE
    && before.indent === command.indent;
};

/**
 * Reads the trigger area a comment gives its event, if it gives one: the first tag across the comment's lines.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {number} index The comment's first line.
 * @returns {AreaEventTag | null} The area, or null when the command is not a comment or holds no tag.
 */
const areaEventTag = (list: readonly RmmzEventCommand[], index: number): AreaEventTag | null =>
{
  if (list[index]?.code !== COMMENT_CODE)
  {
    return null;
  }

  // the comment's lines, first and continuing, are read in turn, as the plugin reads them.
  let end = index + 1;
  while (list[end]?.code === COMMENT_LINE_CODE)
  {
    end += 1;
  }

  const match = list.slice(index, end)
    .map(line => AREA_EVENT_TAG.exec(String(line.parameters[0] ?? '')))
    .find(found => found !== null);
  if (match === undefined || match === null)
  {
    return null;
  }

  const [ , width, height ] = match;
  const effective = list.slice(0, index).every(command => command.code === COMMENT_CODE || command.code === COMMENT_LINE_CODE);
  return { width: Math.max(Number(width), 1), height: Math.max(Number(height), 1), effective };
};

export { areaEventTag, joinsChoicesAbove };
export type { AreaEventTag };
