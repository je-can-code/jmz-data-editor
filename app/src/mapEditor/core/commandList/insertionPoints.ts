import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import { isBodyInside, type CommandBody, type CommandNode, type CommandTree } from './commandTree.ts';
import type { ListRow } from './listRows.ts';

/**
 * A place commands can go: a body, and how many of its units come before the place. Everything that adds or moves
 * commands (a paste, a drop, a new command from the search) lands at one of these, so a command always lands inside
 * a body, at that body's indent, and never between a block's branches.
 *
 * Two shapes the game reads across units are kept whole too. Show Choices blocks sitting back to back are one choice
 * window to HIME_LargeChoices, so no place falls between them. And KMS_AreaEvent reads an event's area from the
 * comments at the very top of a page, stopping at the first command that is not one, so nothing but a comment ever
 * lands above the comment holding the area.
 */
type InsertionPoint = {
  readonly body: CommandBody;
  readonly position: number;
};

/**
 * The code of Show Choices, whose back-to-back blocks HIME_LargeChoices shows as one choice window.
 */
const SHOW_CHOICES_CODE = 102;

/**
 * The codes of a comment's first line and of its further lines, both of which KMS_AreaEvent reads.
 */
const COMMENT_CODES: ReadonlySet<number> = new Set([ 108, 408 ]);

/**
 * The area tag exactly as KMS_AreaEvent matches it, in either of its names: {@code <areaEvent:5x2>}.
 */
const AREA_EVENT_TAG = /<(?:エリアイベント|AreaEvent)\s*[:\s]\s*\d+\s*x\s*\d+>/iu;

/**
 * Reports whether a unit is a Show Choices block.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandNode | undefined} node The unit, or undefined past either end of its body.
 * @returns {boolean} True when it is one.
 */
const isChoicesBlock = (list: readonly RmmzEventCommand[], node: CommandNode | undefined): boolean =>
{
  return node !== undefined && node.kind === 'block' && list[node.start].code === SHOW_CHOICES_CODE;
};

/**
 * Reports whether a place sits inside a run of Show Choices blocks that HIME_LargeChoices merges: between two of
 * them, back to back in one body. Anything landing there would split one choice window into two.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {InsertionPoint} point The place.
 * @returns {boolean} True when it splits a run.
 */
const splitsChoiceRun = (list: readonly RmmzEventCommand[], point: InsertionPoint): boolean =>
{
  const { body, position } = point;
  return isChoicesBlock(list, body.nodes[position - 1]) && isChoicesBlock(list, body.nodes[position]);
};

/**
 * Moves a place out of a merged Show Choices run, to before its first block or after its last, so the run moves
 * and takes additions as the one unit the game shows it as. A place outside every run stays as it is.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {InsertionPoint} point The place.
 * @param {-1 | 1} step Which way to leave the run: -1 to before it, 1 to after it.
 * @returns {InsertionPoint} The place, outside every run.
 */
const outOfChoiceRun = (list: readonly RmmzEventCommand[], point: InsertionPoint, step: -1 | 1): InsertionPoint =>
{
  const { body } = point;
  let { position } = point;
  while (splitsChoiceRun(list, { body, position }))
  {
    position += step;
  }

  return position === point.position
    ? point
    : { body, position };
};

/**
 * Reports whether a command is a comment line, the only kind KMS_AreaEvent reads past on its way to the area.
 * @param {RmmzEventCommand} command The command.
 * @returns {boolean} True for a comment's first line or a further line.
 */
const isComment = (command: RmmzEventCommand): boolean =>
{
  return COMMENT_CODES.has(command.code);
};

/**
 * Finds how many of the list's top units must stay first for its area tag to keep working: every unit through the
 * comment holding the tag, when that comment sits in the run of comments the page opens with. The game reads the
 * area from those comments alone, so a command that is not a comment landing above the tag stops it working.
 * @param {CommandTree} tree The list's tree.
 * @returns {number} How many top units to keep first; 0 when the page opens with no area tag.
 */
const areaTagFloor = (tree: CommandTree): number =>
{
  const { list, root } = tree;
  const firstOther = root.nodes.findIndex(node => isComment(list[node.start]) === false);
  const opening = firstOther === -1
    ? root.nodes
    : root.nodes.slice(0, firstOther);
  const tagged = opening.findIndex(node => list.slice(node.start, node.end).some(command =>
    isComment(command) && AREA_EVENT_TAG.test(String(command.parameters[0] ?? ''))));
  return tagged + 1;
};

/**
 * Reports whether commands landing at a place keep the page's area tag working: anywhere below it, anywhere but
 * the list's own top level, or anywhere at all when every command landing is a comment.
 * @param {CommandTree} tree The list's tree.
 * @param {InsertionPoint} point The place.
 * @param {readonly RmmzEventCommand[]} commands What lands there.
 * @returns {boolean} True when the area tag keeps working.
 */
const keepsAreaTag = (tree: CommandTree, point: InsertionPoint, commands: readonly RmmzEventCommand[]): boolean =>
{
  return point.body !== tree.root
    || point.position >= areaTagFloor(tree)
    || commands.every(isComment);
};

/**
 * Settles where commands really land once it is known what they are: a place that would push the page's area tag
 * out of the comments it opens with moves to just below the tag's comment, and every other place stays.
 * @param {CommandTree} tree The list's tree.
 * @param {InsertionPoint} point The place asked for.
 * @param {readonly RmmzEventCommand[]} commands What lands there.
 * @returns {InsertionPoint} Where they land.
 */
const settleInsertion = (tree: CommandTree, point: InsertionPoint, commands: readonly RmmzEventCommand[]): InsertionPoint =>
{
  return keepsAreaTag(tree, point, commands)
    ? point
    : { body: tree.root, position: areaTagFloor(tree) };
};

/**
 * Finds the list index a point inserts at: before the unit at its position, or at the body's end.
 * @param {InsertionPoint} point The point.
 * @returns {number} The index.
 */
const insertionIndex = (point: InsertionPoint): number =>
{
  const { body, position } = point;
  const node = body.nodes[position];
  if (node !== undefined)
  {
    return node.start;
  }

  return body.terminator ?? body.end;
};

/**
 * Finds the place right after a unit, in the body it sits in.
 * @param {CommandNode} node The unit.
 * @returns {InsertionPoint | null} The place, or null for a unit outside every body's list (after the list's end).
 */
const pointAfterNode = (node: CommandNode): InsertionPoint | null =>
{
  const position = node.parent.nodes.indexOf(node);
  return position < 0
    ? null
    : { body: node.parent, position: position + 1 };
};

/**
 * Finds the place right after a unit, or after the whole merged Show Choices run the unit belongs to, so nothing
 * put after it (a duplicate's copies) can split the run.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandNode} node The unit.
 * @returns {InsertionPoint | null} The place, or null for a unit outside every body's list (after the list's end).
 */
const pointAfterUnit = (list: readonly RmmzEventCommand[], node: CommandNode): InsertionPoint | null =>
{
  const after = pointAfterNode(node);
  return after === null
    ? null
    : outOfChoiceRun(list, after, 1);
};

/**
 * Finds the place right before a unit, in the body it sits in.
 * @param {CommandNode} node The unit.
 * @returns {InsertionPoint | null} The place, or null for a unit outside every body's list.
 */
const pointBeforeNode = (node: CommandNode): InsertionPoint | null =>
{
  const position = node.parent.nodes.indexOf(node);
  return position < 0
    ? null
    : { body: node.parent, position };
};

/**
 * Finds the place in the gap just below a row, exactly as the gap sits: below a line or a closer is the place after
 * its unit. Below an open head is the top of the body under it, and below a folded one its end, since that body is
 * hidden. Below a body's end row is still that body's end. Below the opener of Show Choices, which has no body of
 * its own, there is nowhere, since its first choice follows; folded shut, the whole block is one row and the place
 * below it follows the block.
 * @param {ListRow} row The row.
 * @returns {InsertionPoint | null} The place, or null when the gap below the row takes nothing.
 */
const placeBelowRow = (row: ListRow): InsertionPoint | null =>
{
  switch (row.kind)
  {
    case 'line':
    case 'closer':
      return row.node === null
        ? null
        : pointAfterNode(row.node);
    case 'terminator':
      return { body: row.body, position: row.body.nodes.length };
    default:
    {
      const body = row.segment?.body ?? null;
      if (body === null)
      {
        return row.kind === 'opener' && row.folded && row.node !== null
          ? pointAfterNode(row.node)
          : null;
      }

      return row.folded
        ? { body, position: body.nodes.length }
        : { body, position: 0 };
    }
  }
};

/**
 * Finds the place commands go when added below a row (as the focus falls back to when its own row takes nothing):
 * the gap below it, or, when that gap lies inside a merged Show Choices run, the place after the whole run.
 * @param {ListRow} row The row.
 * @param {readonly RmmzEventCommand[]} list The list the row shows.
 * @returns {InsertionPoint | null} The place, or null when the gap below the row takes nothing.
 */
const pointBelowRow = (row: ListRow, list: readonly RmmzEventCommand[]): InsertionPoint | null =>
{
  const place = placeBelowRow(row);
  return place === null
    ? null
    : outOfChoiceRun(list, place, 1);
};

/**
 * Finds the place in a gap between rows, exactly where the gap is: gap 0 is above the first row, gap n below row
 * n - 1. A drop marks the gap it lands in, so this never moves off the gap; {@link canDropAt} refuses one that
 * cannot take the drop.
 * @param {CommandTree} tree The list's tree.
 * @param {readonly ListRow[]} rows The visible rows.
 * @param {number} gap The gap.
 * @returns {InsertionPoint | null} The place, or null when the gap takes nothing.
 */
const pointOfGap = (tree: CommandTree, rows: readonly ListRow[], gap: number): InsertionPoint | null =>
{
  if (gap <= 0)
  {
    return { body: tree.root, position: 0 };
  }

  const row = rows[gap - 1];
  return row === undefined
    ? null
    : placeBelowRow(row);
};

/**
 * Finds the place a row stands for when commands are added "at" it, the way MZ inserts above the selected line:
 * before a unit's row, or at the end of the body a terminator row ends. A later block of a merged Show Choices run
 * stands for the place before the whole run, since the run is one choice window. Branch and closer rows take
 * nothing, since nothing can go between a block's parts.
 * @param {ListRow} row The row.
 * @param {readonly RmmzEventCommand[]} list The list the row shows.
 * @returns {InsertionPoint | null} The place, or null for a row that takes nothing.
 */
const pointAtRow = (row: ListRow, list: readonly RmmzEventCommand[]): InsertionPoint | null =>
{
  if (row.kind === 'terminator')
  {
    return { body: row.body, position: row.body.nodes.length };
  }

  const place = (row.kind === 'line' || row.kind === 'opener') && row.node !== null
    ? pointBeforeNode(row.node)
    : null;
  return place === null
    ? null
    : outOfChoiceRun(list, place, -1);
};

/**
 * Reports whether units may be dropped at a place: never inside one of the units being moved, never between the
 * blocks of a merged Show Choices run, and never above the page's area tag unless every unit moved is a comment.
 * @param {CommandTree} tree The list's tree.
 * @param {InsertionPoint} point The place.
 * @param {readonly CommandNode[]} moving The units being moved.
 * @returns {boolean} True when the drop may land there.
 */
const canDropAt = (tree: CommandTree, point: InsertionPoint, moving: readonly CommandNode[]): boolean =>
{
  const commands = moving.flatMap(node => tree.list.slice(node.start, node.end));
  return moving.every(node => isBodyInside(point.body, node) === false)
    && splitsChoiceRun(tree.list, point) === false
    && keepsAreaTag(tree, point, commands);
};

/**
 * Where a drag would land: the gap between rows to mark, and the place it stands for.
 */
type DropTarget = {
  readonly gap: number;
  readonly point: InsertionPoint;
};

/**
 * Finds where a drag over a row lands. The pointer's half of the row picks the gap above or below it; when that
 * gap takes nothing (between a block's parts, inside what is being moved, inside a merged Show Choices run, or above
 * the page's area tag), the nearest gap that does is used, below first, so the marker never sits somewhere the drop
 * would not land.
 * @param {CommandTree} tree The list's tree.
 * @param {readonly ListRow[]} rows The visible rows.
 * @param {number} rowIndex The row under the pointer.
 * @param {boolean} upperHalf Whether the pointer is in the row's upper half.
 * @param {readonly CommandNode[]} moving The units being moved.
 * @returns {DropTarget | null} Where it lands, or null when nowhere near takes it.
 */
const dropTargetAt = (
  tree: CommandTree,
  rows: readonly ListRow[],
  rowIndex: number,
  upperHalf: boolean,
  moving: readonly CommandNode[],
): DropTarget | null =>
{
  const gap = upperHalf
    ? rowIndex
    : rowIndex + 1;
  const candidates = [ gap, gap + 1, gap - 1 ].filter(each => each >= 0 && each <= rows.length);
  for (const candidate of candidates)
  {
    const point = pointOfGap(tree, rows, candidate);
    if (point !== null && canDropAt(tree, point, moving))
    {
      return { gap: candidate, point };
    }
  }

  return null;
};

export {
  areaTagFloor,
  canDropAt,
  dropTargetAt,
  insertionIndex,
  pointAfterNode,
  pointAfterUnit,
  pointAtRow,
  pointBeforeNode,
  pointBelowRow,
  pointOfGap,
  settleInsertion,
  splitsChoiceRun,
};
export type { DropTarget, InsertionPoint };
