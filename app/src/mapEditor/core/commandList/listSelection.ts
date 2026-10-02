import type { CommandBody, CommandNode } from './commandTree.ts';
import type { ListRow } from './listRows.ts';

/**
 * Which units are selected, by the index of each one's first command, and where a Shift range starts from.
 */
type ListSelection = {
  readonly selected: readonly number[];
  readonly anchor: number | null;
};

/**
 * The keys held while clicking.
 */
type ClickModifiers = {
  readonly shift: boolean;
  readonly toggle: boolean;
};

/**
 * Nothing selected.
 */
const EMPTY_SELECTION: ListSelection = { selected: [], anchor: null };

/**
 * Finds the unit a row selects: a line itself, and the whole block for any of a block's rows. A body's end row
 * selects nothing.
 * @param {ListRow} row The row.
 * @returns {CommandNode | null} The unit, or null.
 */
const nodeOfRow = (row: ListRow): CommandNode | null =>
{
  return row.kind === 'terminator'
    ? null
    : row.node;
};

/**
 * Lists the bodies a unit sits in, innermost first, up to the whole list.
 * @param {CommandNode} node The unit.
 * @returns {CommandBody[]} The bodies.
 */
const bodiesAround = (node: CommandNode): CommandBody[] =>
{
  const bodies: CommandBody[] = [];
  let body: CommandBody | null = node.parent;
  while (body !== null)
  {
    bodies.push(body);
    body = body.owner?.block.parent ?? null;
  }

  return bodies;
};

/**
 * Finds the unit of a body that holds another unit, at any depth: the unit itself when it sits in that body.
 * @param {CommandNode} node The unit.
 * @param {CommandBody} body The body.
 * @returns {CommandNode | null} The holding unit, or null when the unit is not under that body.
 */
const liftInto = (node: CommandNode, body: CommandBody): CommandNode | null =>
{
  let current: CommandNode = node;
  for (;;)
  {
    if (current.parent === body)
    {
      return current;
    }

    const { owner } = current.parent;
    if (owner === null)
    {
      return null;
    }

    current = owner.block;
  }
};

/**
 * Lists the units from one to another, both included, as a Shift click takes them: within the innermost body
 * holding both, each lifted to the unit of that body it sits in.
 * @param {CommandNode} from Where the range starts.
 * @param {CommandNode} to Where it ends.
 * @returns {CommandNode[]} The units, in list order.
 */
const nodesBetween = (from: CommandNode, to: CommandNode): CommandNode[] =>
{
  const toBodies = new Set(bodiesAround(to));
  const shared = bodiesAround(from).find(body => toBodies.has(body)) as CommandBody;
  const first = liftInto(from, shared) as CommandNode;
  const last = liftInto(to, shared) as CommandNode;
  const [ low, high ] = [ shared.nodes.indexOf(first), shared.nodes.indexOf(last) ].sort((left, right) => left - right);
  return shared.nodes.slice(low, high + 1);
};

/**
 * Works out the selection after a click on a unit: alone by default, added or taken away with the toggle key (Ctrl
 * or Cmd), and a range from the anchor with Shift.
 * @param {ListSelection} selection The selection before.
 * @param {CommandNode} node The unit clicked.
 * @param {ClickModifiers} modifiers The keys held.
 * @param {(start: number) => CommandNode | null} nodeAt Finds a unit by its first command, for the anchor.
 * @returns {ListSelection} The selection after.
 */
const clickSelection = (
  selection: ListSelection,
  node: CommandNode,
  modifiers: ClickModifiers,
  nodeAt: (start: number) => CommandNode | null,
): ListSelection =>
{
  const anchorNode = selection.anchor === null
    ? null
    : nodeAt(selection.anchor);
  if (modifiers.shift && anchorNode !== null)
  {
    return { selected: nodesBetween(anchorNode, node).map(each => each.start), anchor: selection.anchor };
  }

  if (modifiers.toggle)
  {
    const selected = selection.selected.includes(node.start)
      ? selection.selected.filter(start => start !== node.start)
      : [ ...selection.selected, node.start ].sort((left, right) => left - right);
    return { selected, anchor: node.start };
  }

  return { selected: [ node.start ], anchor: node.start };
};

/**
 * Finds the selected units that still exist.
 * @param {ListSelection} selection The selection.
 * @param {(start: number) => CommandNode | null} nodeAt Finds a unit by its first command.
 * @returns {CommandNode[]} The units, in list order.
 */
const selectedNodes = (selection: ListSelection, nodeAt: (start: number) => CommandNode | null): CommandNode[] =>
{
  return selection.selected
    .map(start => nodeAt(start))
    .filter((node): node is CommandNode => node !== null)
    .sort((left, right) => left.start - right.start);
};

export { clickSelection, EMPTY_SELECTION, nodeOfRow, nodesBetween, selectedNodes };
export type { ClickModifiers, ListSelection };
