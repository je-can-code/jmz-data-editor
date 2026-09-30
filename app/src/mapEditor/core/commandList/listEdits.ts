import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import type { CommandNode } from './commandTree.ts';
import { insertionIndex, type InsertionPoint } from './insertionPoints.ts';

/**
 * The one splice that turns a list into another: remove {@code deleteCount} commands at {@code index} and insert
 * {@code inserted} there. Every list edit becomes one of these, so it lands in history as one reversible patch.
 */
type ListSplice = {
  readonly index: number;
  readonly deleteCount: number;
  readonly inserted: readonly RmmzEventCommand[];
};

/**
 * Keeps only the outermost of some units, in list order: a unit inside another selected unit already moves,
 * copies and deletes with it.
 * @param {readonly CommandNode[]} nodes The units, in any order.
 * @returns {CommandNode[]} The outermost ones, by position.
 */
const outermostNodes = (nodes: readonly CommandNode[]): CommandNode[] =>
{
  const sorted = [ ...new Set(nodes) ].sort((left, right) => left.start - right.start || right.end - left.end);
  const kept: CommandNode[] = [];
  sorted.forEach(node =>
  {
    const last = kept[kept.length - 1];
    if (last === undefined || node.start >= last.end)
    {
      kept.push(node);
    }
  });

  return kept;
};

/**
 * Collects the commands of some units, in list order.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {readonly CommandNode[]} nodes The units.
 * @returns {RmmzEventCommand[]} Their commands.
 */
const commandsOfNodes = (list: readonly RmmzEventCommand[], nodes: readonly CommandNode[]): RmmzEventCommand[] =>
{
  return outermostNodes(nodes).flatMap(node => list.slice(node.start, node.end));
};

/**
 * Moves commands to another indent, keeping how they nest. Each command is copied; nothing it holds is shared
 * with a command that stays behind.
 * @param {readonly RmmzEventCommand[]} commands The commands.
 * @param {number} delta How far to move them; negative moves them out.
 * @returns {RmmzEventCommand[]} The moved copies.
 */
const reindent = (commands: readonly RmmzEventCommand[], delta: number): RmmzEventCommand[] =>
{
  return commands.map(command => ({ ...command, indent: command.indent + delta }));
};

/**
 * Moves commands so the shallowest of them sits at indent 0, the shape they travel in (copied, pasted, dragged).
 * @param {readonly RmmzEventCommand[]} commands The commands.
 * @returns {RmmzEventCommand[]} The moved copies.
 */
const toRelativeIndent = (commands: readonly RmmzEventCommand[]): RmmzEventCommand[] =>
{
  if (commands.length === 0)
  {
    return [];
  }

  const shallowest = Math.min(...commands.map(command => command.indent));
  return reindent(commands, -shallowest);
};

/**
 * Inserts commands at a place, moved to that place's indent.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {InsertionPoint} point The place.
 * @param {readonly RmmzEventCommand[]} commands The commands, at any indent.
 * @returns {RmmzEventCommand[]} The new list.
 */
const insertAt = (list: readonly RmmzEventCommand[], point: InsertionPoint, commands: readonly RmmzEventCommand[]): RmmzEventCommand[] =>
{
  const index = insertionIndex(point);
  const placed = reindent(toRelativeIndent(commands), point.body.indent);
  return [ ...list.slice(0, index), ...placed, ...list.slice(index) ];
};

/**
 * Removes some units.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {readonly CommandNode[]} nodes The units.
 * @returns {RmmzEventCommand[]} The new list.
 */
const removeNodes = (list: readonly RmmzEventCommand[], nodes: readonly CommandNode[]): RmmzEventCommand[] =>
{
  const gone = new Set(outermostNodes(nodes).flatMap(node => Array.from({ length: node.end - node.start }, (_, offset) => node.start + offset)));
  return list.filter((_, index) => gone.has(index) === false);
};

/**
 * Moves some units to a place, as a drag drops them, re-indented to fit it. The place must not lie inside any of
 * the units moved.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {readonly CommandNode[]} nodes The units.
 * @param {InsertionPoint} point The place, as the list stands before the move.
 * @returns {RmmzEventCommand[]} The new list.
 */
const moveNodes = (list: readonly RmmzEventCommand[], nodes: readonly CommandNode[], point: InsertionPoint): RmmzEventCommand[] =>
{
  const outer = outermostNodes(nodes);
  const index = insertionIndex(point);
  if (outer.some(node => index > node.start && index < node.end))
  {
    throw new Error('cannot move commands into themselves');
  }

  // everything removed above the place pulls it up by as many commands.
  const removedAbove = outer
    .filter(node => node.end <= index)
    .reduce((sum, node) => sum + node.end - node.start, 0);
  const moving = reindent(toRelativeIndent(commandsOfNodes(list, outer)), point.body.indent);
  const remaining = removeNodes(list, outer);
  const at = index - removedAbove;
  return [ ...remaining.slice(0, at), ...moving, ...remaining.slice(at) ];
};

/**
 * Copies some units right after the last of them, at its indent.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {readonly CommandNode[]} nodes The units.
 * @returns {RmmzEventCommand[]} The new list.
 */
const duplicateNodes = (list: readonly RmmzEventCommand[], nodes: readonly CommandNode[]): RmmzEventCommand[] =>
{
  const outer = outermostNodes(nodes);
  const last = outer[outer.length - 1];
  if (last === undefined)
  {
    return [ ...list ];
  }

  const copies = reindent(toRelativeIndent(commandsOfNodes(list, outer)), last.indent);
  return [ ...list.slice(0, last.end), ...copies, ...list.slice(last.end) ];
};

/**
 * Replaces a run of commands.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {number} start The first command replaced.
 * @param {number} end One past the last.
 * @param {readonly RmmzEventCommand[]} commands What goes in their place.
 * @returns {RmmzEventCommand[]} The new list.
 */
const replaceRange = (list: readonly RmmzEventCommand[], start: number, end: number, commands: readonly RmmzEventCommand[]): RmmzEventCommand[] =>
{
  return [ ...list.slice(0, start), ...commands, ...list.slice(end) ];
};

/**
 * Finds the smallest splice turning one list into another: whatever both start and end with stays, so an edit to
 * one command in a long list records just that command.
 * @param {readonly RmmzEventCommand[]} before The list as it is.
 * @param {readonly RmmzEventCommand[]} after The list as it should be.
 * @returns {ListSplice | null} The splice, or null when the lists are the same.
 */
const spliceBetween = (before: readonly RmmzEventCommand[], after: readonly RmmzEventCommand[]): ListSplice | null =>
{
  let start = 0;
  while (start < before.length && start < after.length && jsonEquals(before[start], after[start]))
  {
    start += 1;
  }

  if (start === before.length && start === after.length)
  {
    return null;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && jsonEquals(before[beforeEnd - 1], after[afterEnd - 1]))
  {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return { index: start, deleteCount: beforeEnd - start, inserted: after.slice(start, afterEnd) };
};

/**
 * Turns commands into the plain values a patch carries.
 * @param {readonly RmmzEventCommand[]} commands The commands.
 * @returns {JsonValue[]} The same commands, typed as JSON.
 */
const asJsonCommands = (commands: readonly RmmzEventCommand[]): JsonValue[] =>
{
  return commands as unknown as JsonValue[];
};

export {
  asJsonCommands,
  commandsOfNodes,
  duplicateNodes,
  insertAt,
  moveNodes,
  outermostNodes,
  reindent,
  removeNodes,
  replaceRange,
  spliceBetween,
  toRelativeIndent,
};
export type { ListSplice };
