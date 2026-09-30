import type { RmmzMapInfo } from '../model/rmmzTypes.ts';
import { MapTreeModel, TREE_ROOT, type MapInfoRows } from './MapTreeModel.ts';
import { planDelete, TreePlanError, type TreePlace } from './treePlans.ts';

/**
 * One line of the tree panel: a map, how deep it sits, and whether it has a branch to open.
 */
type TreeLine = {
  readonly id: number;
  readonly name: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
};

/**
 * Where a dragged map would land relative to the row under the pointer: in front of it, inside it as its last
 * child, or after it.
 */
type DropZone = 'before' | 'inside' | 'after';

/**
 * What the tree asks before deleting maps: how many go, branches included, and the question in the author's words.
 */
type DeleteQuestion = {
  readonly count: number;
  readonly text: string;
};

/**
 * Lists the tree panel's lines: every map, top to bottom, skipping whatever sits inside a closed branch.
 * @param {MapInfoRows} rows The tree's rows.
 * @param {ReadonlySet<number>} expanded The maps whose branches are open.
 * @returns {TreeLine[]} The lines.
 */
const visibleTreeLines = (rows: MapInfoRows, expanded: ReadonlySet<number>): TreeLine[] =>
{
  const tree = new MapTreeModel(rows);
  const lines: TreeLine[] = [];

  /**
   * Adds a parent's children and, for each open one, its own branch.
   * @param {number} parentId The parent.
   * @param {number} depth How deep its children sit.
   */
  const walk = (parentId: number, depth: number): void =>
  {
    tree.children(parentId).forEach(id =>
    {
      const hasChildren = tree.children(id).length > 0;
      const open = hasChildren && expanded.has(id);
      lines.push({ id, name: tree.row(id)?.name ?? '', depth, hasChildren, expanded: open });
      if (open)
      {
        walk(id, depth + 1);
      }
    });
  };

  walk(TREE_ROOT, 0);
  return lines;
};

/**
 * Reads which branches MZ left open, to start the tree panel the way the project was last seen.
 * @param {MapInfoRows} rows The tree's rows.
 * @returns {number[]} The maps whose rows say they are expanded.
 */
const initiallyExpanded = (rows: MapInfoRows): number[] =>
{
  return rows
    .filter((row): row is RmmzMapInfo => row !== null && row.expanded)
    .map(row => row.id);
};

/**
 * Opens every branch above a map, so it can be seen and selected.
 * @param {MapInfoRows} rows The tree's rows.
 * @param {ReadonlySet<number>} expanded The open branches.
 * @param {readonly number[]} mapIds The maps to reveal.
 * @returns {Set<number>} The open branches, with every ancestor of the maps added.
 */
const revealMaps = (rows: MapInfoRows, expanded: ReadonlySet<number>, mapIds: readonly number[]): Set<number> =>
{
  const tree = new MapTreeModel(rows);
  const open = new Set(expanded);
  mapIds.forEach(id =>
  {
    let parentId = tree.parentOf(id);
    while (parentId !== TREE_ROOT)
    {
      open.add(parentId);
      parentId = tree.parentOf(parentId);
    }
  });

  return open;
};

/**
 * Selects every line between an anchor and a clicked line, inclusive, in the order shown: a Shift click.
 * @param {readonly TreeLine[]} lines The lines shown.
 * @param {number | null} anchorId The line the selection grew from, or null for none.
 * @param {number} targetId The line clicked.
 * @returns {number[]} The selection.
 */
const selectRange = (lines: readonly TreeLine[], anchorId: number | null, targetId: number): number[] =>
{
  const ids = lines.map(line => line.id);
  const to = ids.indexOf(targetId);
  const from = anchorId === null
    ? -1
    : ids.indexOf(anchorId);
  if (to < 0)
  {
    return [];
  }

  // an anchor no longer shown makes the click a plain one.
  if (from < 0)
  {
    return [ targetId ];
  }

  return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
};

/**
 * Adds a line to the selection, or takes it out when it is already in: a Ctrl click.
 * @param {readonly number[]} selection The selection.
 * @param {number} mapId The line clicked.
 * @returns {number[]} The new selection.
 */
const toggleSelection = (selection: readonly number[], mapId: number): number[] =>
{
  return selection.includes(mapId)
    ? selection.filter(id => id !== mapId)
    : [ ...selection, mapId ];
};

/**
 * Works out which part of a row the pointer is over: its top quarter lands a drop in front of it, its bottom
 * quarter after it, and the middle inside it.
 * @param {number} offsetY How far down the row the pointer is.
 * @param {number} height The row's height.
 * @returns {DropZone} The zone.
 */
const dropZoneAt = (offsetY: number, height: number): DropZone =>
{
  if (offsetY < height / 4)
  {
    return 'before';
  }

  return offsetY > (height * 3) / 4
    ? 'after'
    : 'inside';
};

/**
 * Turns a drop on a row into the place the dragged maps land.
 * @param {MapInfoRows} rows The tree's rows.
 * @param {number} targetId The row dropped on.
 * @param {DropZone} zone Which part of it.
 * @returns {TreePlace} The place.
 */
const dropPlace = (rows: MapInfoRows, targetId: number, zone: DropZone): TreePlace =>
{
  const tree = new MapTreeModel(rows);
  if (zone === 'inside')
  {
    return { parentId: targetId, beforeId: null };
  }

  const parentId = tree.parentOf(targetId);
  if (zone === 'before')
  {
    return { parentId, beforeId: targetId };
  }

  // after a row means in front of whatever follows it, or at the end.
  const siblings = tree.children(parentId);
  return { parentId, beforeId: siblings[siblings.indexOf(targetId) + 1] ?? null };
};

/**
 * Lists the maps a drag carries: the whole selection when the dragged row is part of it, the row alone otherwise,
 * the way file managers drag.
 * @param {readonly number[]} selection The selection.
 * @param {number} draggedId The row dragged.
 * @returns {number[]} The maps dragged.
 */
const draggedMaps = (selection: readonly number[], draggedId: number): number[] =>
{
  return selection.includes(draggedId)
    ? [ ...selection ]
    : [ draggedId ];
};

/**
 * Words the question the tree asks before deleting maps: what goes, by the name the delete's step will carry, and
 * how many maps that is once every branch is counted. The tree's history lives only as long as the window, so the
 * author sees the whole count before anything goes.
 * @param {MapInfoRows} rows The tree's rows.
 * @param {readonly number[]} mapIds The maps picked to delete.
 * @returns {DeleteQuestion | null} The question, or null when there is nothing to delete.
 */
const deleteQuestion = (rows: MapInfoRows, mapIds: readonly number[]): DeleteQuestion | null =>
{
  try
  {
    const plan = planDelete(rows, mapIds);
    const count = plan.removed.length;
    return { count, text: `${plan.label}? This removes ${count === 1 ? '1 map' : `${count} maps`}.` };
  }
  catch (error)
  {
    if (error instanceof TreePlanError)
    {
      return null;
    }

    throw error;
  }
};

export {
  deleteQuestion,
  draggedMaps,
  dropPlace,
  dropZoneAt,
  initiallyExpanded,
  revealMaps,
  selectRange,
  toggleSelection,
  visibleTreeLines,
};
export type { DeleteQuestion, DropZone, TreeLine };
