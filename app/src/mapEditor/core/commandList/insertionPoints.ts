import { isBodyInside, type CommandBody, type CommandNode, type CommandTree } from './commandTree.ts';
import type { ListRow } from './listRows.ts';

/**
 * A place commands can go: a body, and how many of its units come before the place. Everything that adds or moves
 * commands (a paste, a drop, a new command from the search) lands at one of these, so a command always lands inside
 * a body, at that body's indent, and never between a block's branches.
 */
type InsertionPoint = {
  readonly body: CommandBody;
  readonly position: number;
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
 * Finds the place in the gap just below a row.
 *
 * Below a line or a closer is the place after its unit. Below an open head is the top of the body under it, and
 * below a folded one its end, since that body is hidden. Below a body's end row is still that body's end. Below the
 * opener of Show Choices, which has no body of its own, there is nowhere, since its first choice follows; folded
 * shut, the whole block is one row and the place below it follows the block.
 * @param {ListRow} row The row.
 * @returns {InsertionPoint | null} The place, or null when the gap below the row takes nothing.
 */
const pointBelowRow = (row: ListRow): InsertionPoint | null =>
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
 * Finds the place in a gap between rows: gap 0 is above the first row, gap n below row n - 1.
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
    : pointBelowRow(row);
};

/**
 * Finds the place a row stands for when commands are added "at" it, the way MZ inserts above the selected line:
 * before a unit's row, or at the end of the body a terminator row ends. Branch and closer rows take nothing, since
 * nothing can go between a block's parts.
 * @param {ListRow} row The row.
 * @returns {InsertionPoint | null} The place, or null for a row that takes nothing.
 */
const pointAtRow = (row: ListRow): InsertionPoint | null =>
{
  if (row.kind === 'terminator')
  {
    return { body: row.body, position: row.body.nodes.length };
  }

  if ((row.kind === 'line' || row.kind === 'opener') && row.node !== null)
  {
    return pointBeforeNode(row.node);
  }

  return null;
};

/**
 * Reports whether units may be dropped at a place: never inside one of the units being moved.
 * @param {InsertionPoint} point The place.
 * @param {readonly CommandNode[]} moving The units being moved.
 * @returns {boolean} True when the drop may land there.
 */
const canDropAt = (point: InsertionPoint, moving: readonly CommandNode[]): boolean =>
{
  return moving.every(node => isBodyInside(point.body, node) === false);
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
 * gap takes nothing (between a block's parts, or inside what is being moved), the nearest gap that does is used,
 * below first, so the marker never sits somewhere the drop would not land.
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
    if (point !== null && canDropAt(point, moving))
    {
      return { gap: candidate, point };
    }
  }

  return null;
};

export {
  canDropAt,
  dropTargetAt,
  insertionIndex,
  pointAfterNode,
  pointAtRow,
  pointBeforeNode,
  pointBelowRow,
  pointOfGap,
};
export type { DropTarget, InsertionPoint };
