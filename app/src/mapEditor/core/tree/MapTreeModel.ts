import { cloneJson } from '../model/json.ts';
import type { RmmzMapInfo } from '../model/rmmzTypes.ts';

/**
 * The rows of {@code data/MapInfos.json}: index is the map id, index 0 is null, and the slot of every deleted map
 * stays null rather than closing up, so no other map's id ever moves.
 */
type MapInfoRows = readonly (RmmzMapInfo | null)[];

/**
 * The map id the top of the tree hangs from. No map has it; a top-level map's parent id is 0.
 */
const TREE_ROOT = 0;

/**
 * The map tree as an ordered structure: every map's row, and each map's children in the order the tree shows them.
 *
 * The file keeps that order as numbers, and MZ keeps them as one count down the whole tree: the first map shown is
 * order 1, the next one down (a child, a sibling, whatever comes next) order 2, and so on, with no gaps. Every
 * shipped MapInfos.json holds exactly that. So edits happen on the lists here, where inserting or moving a map is
 * a list operation, and {@link toRows} numbers the whole tree afresh, which keeps the file the way MZ writes it.
 *
 * It works on copies: nothing here reaches back into the rows it was built from.
 */
class MapTreeModel
{
  #rows = new Map<number, RmmzMapInfo>();

  #children = new Map<number, number[]>();

  #parents = new Map<number, number>();

  #length: number;

  /**
   * @param {MapInfoRows} rows The file's rows; copied.
   */
  constructor(rows: MapInfoRows)
  {
    this.#length = Math.max(rows.length, 1);
    rows.forEach((row, id) =>
    {
      if (row !== null && id > 0)
      {
        this.#rows.set(id, cloneJson(row));
      }
    });

    // group every map under its parent, in the order the file numbers them; a parent the tree lacks counts as the top.
    const byOrder = [ ...this.#rows.values() ].sort((left, right) => left.order - right.order || left.id - right.id);
    byOrder.forEach(row =>
    {
      const parentId = this.#rows.has(row.parentId) ? row.parentId : TREE_ROOT;
      this.#childList(parentId).push(row.id);
      this.#parents.set(row.id, parentId);
    });
  }

  /**
   * Reports whether a map is in the tree.
   * @param {number} mapId The map id.
   * @returns {boolean} True when it has a row.
   */
  has(mapId: number): boolean
  {
    return this.#rows.has(mapId);
  }

  /**
   * Reads a map's row.
   * @param {number} mapId The map id.
   * @returns {RmmzMapInfo | null} A copy of the row, or null when the map is not in the tree.
   */
  row(mapId: number): RmmzMapInfo | null
  {
    const row = this.#rows.get(mapId);
    return row === undefined
      ? null
      : cloneJson(row);
  }

  /**
   * Lists a map's children in the order the tree shows them.
   * @param {number} parentId The parent's id, or {@link TREE_ROOT} for the top level.
   * @returns {readonly number[]} Their ids.
   */
  children(parentId: number): readonly number[]
  {
    return [ ...this.#children.get(parentId) ?? [] ];
  }

  /**
   * Finds the map a map hangs from.
   * @param {number} mapId The map id.
   * @returns {number} The parent's id, {@link TREE_ROOT} for a top-level map.
   */
  parentOf(mapId: number): number
  {
    return this.#parents.get(mapId) ?? TREE_ROOT;
  }

  /**
   * Lists every map below one, in the order the tree shows them.
   * @param {number} mapId The map id, or {@link TREE_ROOT} for the whole tree.
   * @returns {number[]} Their ids; the map itself is not included.
   */
  descendants(mapId: number): number[]
  {
    return this.children(mapId).flatMap(child => [ child, ...this.descendants(child) ]);
  }

  /**
   * Lists every map in the order the tree shows them, top to bottom with every branch open.
   * @returns {number[]} Their ids.
   */
  preorder(): number[]
  {
    return this.descendants(TREE_ROOT);
  }

  /**
   * Reports whether one map is another or sits anywhere below it, which is where it can never be moved.
   * @param {number} mapId The map that might be inside.
   * @param {number} ancestorId The map that might contain it.
   * @returns {boolean} True when {@code mapId} is {@code ancestorId} or one of its descendants.
   */
  isWithin(mapId: number, ancestorId: number): boolean
  {
    return mapId === ancestorId || this.descendants(ancestorId).includes(mapId);
  }

  /**
   * Narrows a selection to the maps not already inside another selected map, in tree order: moving or deleting a
   * map takes its branch with it, so a selected map inside a selected branch is already on its way.
   * @param {readonly number[]} mapIds The selection.
   * @returns {number[]} The outermost selected maps, top to bottom.
   */
  outermost(mapIds: readonly number[]): number[]
  {
    const selected = new Set(mapIds.filter(id => this.has(id)));
    return this.preorder().filter(id => selected.has(id) && this.#hasSelectedAncestor(id, selected) === false);
  }

  /**
   * Finds the lowest ids no map uses: free slots first, then past the end of the file, as MZ numbers new maps.
   * @param {number} count How many ids are needed.
   * @param {ReadonlySet<number>} skip Ids to pass over even when free, such as ones whose file already exists.
   * @returns {number[]} The ids, lowest first.
   */
  freeIds(count: number, skip: ReadonlySet<number> = new Set()): number[]
  {
    const ids: number[] = [];
    for (let id = 1; ids.length < count; id++)
    {
      if (this.#rows.has(id) === false && skip.has(id) === false)
      {
        ids.push(id);
      }
    }

    return ids;
  }

  /**
   * Puts a new map into the tree.
   * @param {RmmzMapInfo} row Its row; the id must be free, and the parent and order are set from where it lands.
   * @param {number} parentId Where it hangs, {@link TREE_ROOT} for the top level.
   * @param {number | null} beforeId The sibling it goes in front of, or null for the end.
   */
  insert(row: RmmzMapInfo, parentId: number, beforeId: number | null): void
  {
    if (this.#rows.has(row.id) || row.id < 1)
    {
      throw new Error(`map ${row.id} is already in the tree`);
    }

    // the parent must already be there, which also keeps a new map from hanging under itself.
    if (parentId !== TREE_ROOT)
    {
      this.#requireRow(parentId);
    }

    this.#rows.set(row.id, cloneJson(row));
    this.#length = Math.max(this.#length, row.id + 1);
    this.#place(row.id, parentId, beforeId);
  }

  /**
   * Moves a map, with its whole branch, to a new place.
   * @param {number} mapId The map.
   * @param {number} parentId Where it hangs now, {@link TREE_ROOT} for the top level; never inside its own branch.
   * @param {number | null} beforeId The sibling it goes in front of, or null for the end.
   */
  move(mapId: number, parentId: number, beforeId: number | null): void
  {
    if (parentId !== TREE_ROOT && this.isWithin(parentId, mapId))
    {
      throw new Error(`map ${mapId} cannot move inside its own branch`);
    }

    this.#detach(mapId);
    this.#place(mapId, parentId, beforeId);
  }

  /**
   * Takes a map and its whole branch out of the tree.
   * @param {number} mapId The map.
   * @returns {number[]} Every map removed, the map first, then its branch in tree order.
   */
  remove(mapId: number): number[]
  {
    const removed = [ mapId, ...this.descendants(mapId) ];
    this.#detach(mapId);
    removed.forEach(id =>
    {
      this.#rows.delete(id);
      this.#children.delete(id);
      this.#parents.delete(id);
    });

    return removed;
  }

  /**
   * Renames a map.
   * @param {number} mapId The map.
   * @param {string} name The new name.
   */
  rename(mapId: number, name: string): void
  {
    const row = this.#requireRow(mapId);
    row.name = name;
  }

  /**
   * Writes the tree back as the file's rows: every map's parent set from where it hangs and its order numbered
   * down the whole tree, and a null in every slot no map uses.
   * @returns {(RmmzMapInfo | null)[]} The rows, index 0 null.
   */
  toRows(): (RmmzMapInfo | null)[]
  {
    const rows: (RmmzMapInfo | null)[] = new Array(this.#length).fill(null);
    this.preorder().forEach((id, position) =>
    {
      rows[id] = { ...cloneJson(this.#requireRow(id)), parentId: this.parentOf(id), order: position + 1 };
    });

    return rows;
  }

  /**
   * Finds the row a change needs, refusing a map the tree does not hold.
   * @param {number} mapId The map.
   * @returns {RmmzMapInfo} The live row.
   */
  #requireRow(mapId: number): RmmzMapInfo
  {
    const row = this.#rows.get(mapId);
    if (row === undefined)
    {
      throw new Error(`map ${mapId} is not in the tree`);
    }

    return row;
  }

  /**
   * Finds or starts the list of a parent's children.
   * @param {number} parentId The parent.
   * @returns {number[]} The live list.
   */
  #childList(parentId: number): number[]
  {
    let list = this.#children.get(parentId);
    if (list === undefined)
    {
      list = [];
      this.#children.set(parentId, list);
    }

    return list;
  }

  /**
   * Hangs a map under a parent, in front of a sibling or at the end.
   * @param {number} mapId The map.
   * @param {number} parentId The parent.
   * @param {number | null} beforeId The sibling, or null for the end.
   */
  #place(mapId: number, parentId: number, beforeId: number | null): void
  {
    if (parentId !== TREE_ROOT)
    {
      this.#requireRow(parentId);
    }

    const list = this.#childList(parentId);
    const index = beforeId === null
      ? -1
      : list.indexOf(beforeId);
    this.#parents.set(mapId, parentId);

    // a sibling that is not there means the end, never a guess at somewhere in the middle.
    if (index < 0)
    {
      list.push(mapId);
      return;
    }

    list.splice(index, 0, mapId);
  }

  /**
   * Unhooks a map from its parent's list, leaving its own branch hanging from it.
   * @param {number} mapId The map.
   */
  #detach(mapId: number): void
  {
    this.#requireRow(mapId);
    const list = this.#children.get(this.parentOf(mapId)) ?? [];
    const index = list.indexOf(mapId);
    if (index >= 0)
    {
      list.splice(index, 1);
    }
  }

  /**
   * Reports whether any map above one is in a selection.
   * @param {number} mapId The map.
   * @param {ReadonlySet<number>} selected The selection.
   * @returns {boolean} True when an ancestor is selected.
   */
  #hasSelectedAncestor(mapId: number, selected: ReadonlySet<number>): boolean
  {
    let parentId = this.parentOf(mapId);
    while (parentId !== TREE_ROOT)
    {
      if (selected.has(parentId))
      {
        return true;
      }

      parentId = this.parentOf(parentId);
    }

    return false;
  }
}

export { MapTreeModel, TREE_ROOT };
export type { MapInfoRows };
