import type { BlockSegment, CommandBlockNode, CommandBody, CommandNode, CommandTree } from './commandTree.ts';

/**
 * What a row stands for.
 *
 * - {@code line}: a command, with the lines continuing it shown inside the row.
 * - {@code opener}: the command opening a block.
 * - {@code branch}: a branch inside a block, such as a choice or an else.
 * - {@code closer}: the command closing a block.
 * - {@code terminator}: the empty command ending a body, shown as the place to add a command there.
 */
type ListRowKind = 'line' | 'opener' | 'branch' | 'closer' | 'terminator';

/**
 * One visible row of a command list.
 */
type ListRow = {
  readonly kind: ListRowKind;

  /**
   * The command the row shows.
   */
  readonly index: number;

  /**
   * One past the commands the row shows: past a line's continuation, or just past the command itself.
   */
  readonly end: number;

  readonly indent: number;

  /**
   * The unit the row belongs to: the line, or the block for its opener, branches and closer. For a terminator,
   * the block whose body it ends, or null at the list's own end.
   */
  readonly node: CommandNode | null;

  /**
   * The body the row sits in; for a terminator, the body it ends.
   */
  readonly body: CommandBody;

  /**
   * For an opener or a branch, its segment.
   */
  readonly segment: BlockSegment | null;

  /**
   * Whether the row can fold what is under it.
   */
  readonly foldable: boolean;

  /**
   * Whether it is folded now.
   */
  readonly folded: boolean;

  /**
   * How many commands its fold hides; 0 when it is open or cannot fold.
   */
  readonly hidden: number;
};

/**
 * Reports whether the row at a command index is folded shut.
 */
type FoldState = (index: number) => boolean;

/**
 * Lays out the rows of a body: each unit's rows, then the body's terminator.
 * @param {CommandBody} body The body.
 * @param {FoldState} isFolded Which heads are folded.
 * @param {ListRow[]} rows Filled in.
 */
const layOutBody = (body: CommandBody, isFolded: FoldState, rows: ListRow[]): void =>
{
  body.nodes.forEach(node => layOutNode(node, isFolded, rows));
  if (body.terminator !== null)
  {
    rows.push({
      kind: 'terminator',
      index: body.terminator,
      end: body.terminator + 1,
      indent: body.indent,
      node: body.owner?.block ?? null,
      body,
      segment: body.owner,
      foldable: false,
      folded: false,
      hidden: 0,
    });
  }
};

/**
 * Lays out a block whose opener has no body of its own (Show Choices, a battle with outcomes): its opener folds the
 * whole block, and folded, the block is that one row.
 * @param {CommandBlockNode} node The block.
 * @param {FoldState} isFolded Which heads are folded.
 * @param {ListRow[]} rows Filled in.
 * @returns {boolean} True when the block is folded and nothing more of it shows.
 */
const layOutWholeFold = (node: CommandBlockNode, isFolded: FoldState, rows: ListRow[]): boolean =>
{
  const [ opener ] = node.segments;
  const folded = isFolded(opener.head);
  rows.push({
    kind: 'opener',
    index: opener.head,
    end: opener.head + 1,
    indent: node.indent,
    node,
    body: node.parent,
    segment: opener,
    foldable: true,
    folded,
    hidden: folded ? node.end - node.start - 1 : 0,
  });
  return folded;
};

/**
 * Lays out one segment's head and, unless it is folded, the body under it.
 * @param {CommandBlockNode} node The block.
 * @param {BlockSegment} segment The segment.
 * @param {boolean} isOpener Whether it is the opener's segment.
 * @param {FoldState} isFolded Which heads are folded.
 * @param {ListRow[]} rows Filled in.
 */
const layOutSegment = (node: CommandBlockNode, segment: BlockSegment, isOpener: boolean, isFolded: FoldState, rows: ListRow[]): void =>
{
  const { body } = segment;
  const folded = body !== null && isFolded(segment.head);
  rows.push({
    kind: isOpener ? 'opener' : 'branch',
    index: segment.head,
    end: segment.head + 1,
    indent: node.indent,
    node,
    body: node.parent,
    segment,
    foldable: body !== null,
    folded,
    hidden: folded && body !== null ? body.end - body.start : 0,
  });
  if (body !== null && folded === false)
  {
    layOutBody(body, isFolded, rows);
  }
};

/**
 * Lays out a unit's rows.
 * @param {CommandNode} node The unit.
 * @param {FoldState} isFolded Which heads are folded.
 * @param {ListRow[]} rows Filled in.
 */
const layOutNode = (node: CommandNode, isFolded: FoldState, rows: ListRow[]): void =>
{
  if (node.kind === 'line')
  {
    rows.push({
      kind: 'line',
      index: node.start,
      end: node.end,
      indent: node.indent,
      node,
      body: node.parent,
      segment: null,
      foldable: false,
      folded: false,
      hidden: 0,
    });
    return;
  }

  const [ opener, ...branches ] = node.segments;
  if (opener.body === null)
  {
    if (layOutWholeFold(node, isFolded, rows))
    {
      return;
    }
  }
  else
  {
    layOutSegment(node, opener, true, isFolded, rows);
  }

  branches.forEach(segment => layOutSegment(node, segment, false, isFolded, rows));
  rows.push({
    kind: 'closer',
    index: node.closer,
    end: node.closer + 1,
    indent: node.indent,
    node,
    body: node.parent,
    segment: null,
    foldable: false,
    folded: false,
    hidden: 0,
  });
};

/**
 * Lays out the rows a list shows: every unit in order, the lines continuing a command inside its row, and each
 * body's end as a row of its own, where a command can be added. A folded head hides what is under it.
 * @param {CommandTree} tree The list, read as a tree.
 * @param {FoldState} isFolded Which heads are folded.
 * @returns {ListRow[]} The rows, top to bottom.
 */
const buildListRows = (tree: CommandTree, isFolded: FoldState): ListRow[] =>
{
  const rows: ListRow[] = [];
  layOutBody(tree.root, isFolded, rows);
  tree.trailing.forEach(node => layOutNode(node, isFolded, rows));
  return rows;
};

/**
 * Reports whether a command starts folded: MZ remembers a branch somebody folded shut with {@code collapsed}.
 * @param {{ collapsed?: boolean } | undefined} command The command.
 * @returns {boolean} True when MZ left it folded.
 */
const startsFolded = (command: { collapsed?: boolean } | undefined): boolean =>
{
  return command?.collapsed === true;
};

export { buildListRows, startsFolded };
export type { FoldState, ListRow, ListRowKind };
