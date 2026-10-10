import type { BlueprintSpot } from '../blueprints/blueprintUses.ts';
import { cloneJson, jsonEquals, type JsonValue } from '../model/json.ts';
import type { PatchPath } from '../model/patches.ts';
import type { RmmzMap, RmmzMapInfo } from '../model/rmmzTypes.ts';
import { MapTreeModel, TREE_ROOT, type MapInfoRows } from './MapTreeModel.ts';

/**
 * Where maps land in the tree: under a parent, in front of one of its children or after the last.
 */
type TreePlace = {
  /**
   * The parent's map id, or {@link TREE_ROOT} for the top level.
   */
  readonly parentId: number;

  /**
   * The child to land in front of, or null for the end.
   */
  readonly beforeId: number | null;
};

/**
 * A map a plan brings into being, with the file it starts with, and the placements of blueprints its tiles hold, which a
 * copy of a map holds as its original did; a brand new map holds none.
 */
type CreatedMap = {
  readonly mapId: number;
  readonly content: RmmzMap;
  readonly spots: readonly BlueprintSpot[];
};

/**
 * One tree operation, worked out but not yet done: the rows the tree holds afterwards, the map files it creates
 * and the ones it removes, and the maps to select once it lands. The map tree's service turns it into one undoable
 * step.
 */
type TreePlan = {
  readonly label: string;
  readonly rows: (RmmzMapInfo | null)[];
  readonly created: readonly CreatedMap[];
  readonly removed: readonly number[];
  readonly selection: readonly number[];
};

/**
 * A map on the clipboard, as it was when copied: its name and file, the placements of blueprints its tiles held then,
 * and the copied map it hung from when that one was copied too, so a copied branch pastes as the same branch.
 */
type CopiedMap = {
  readonly sourceId: number;
  readonly parentSourceId: number | null;
  readonly name: string;
  readonly content: RmmzMap;
  readonly spots: readonly BlueprintSpot[];
};

/**
 * A map to duplicate, with its file as it stands, and the placements of blueprints its tiles hold; none, left out.
 */
type DuplicateSource = {
  readonly mapId: number;
  readonly content: RmmzMap;
  readonly spots?: readonly BlueprintSpot[];
};

/**
 * One value to write into the map tree's file: a whole row, or one field of a row.
 */
type RowPatch = {
  readonly path: PatchPath;
  readonly value: JsonValue | undefined;
};

/**
 * An operation the tree cannot do, worded for the author.
 */
class TreePlanError extends Error
{
  /**
   * @param {string} message What cannot be done, and why.
   */
  constructor(message: string)
  {
    super(message);
    this.name = 'TreePlanError';
  }
}

/**
 * How big a new map starts, as MZ makes it.
 */
const NEW_MAP_WIDTH = 17;
const NEW_MAP_HEIGHT = 13;

/**
 * How many layers a map file holds: four of tiles, then shadows, then regions.
 */
const MAP_LAYERS = 6;

/**
 * Names a new map the way MZ does, from its id.
 * @param {number} mapId The map id.
 * @returns {string} The name, such as {@code MAP012}.
 */
const defaultMapName = (mapId: number): string =>
{
  return `MAP${String(mapId).padStart(3, '0')}`;
};

/**
 * Builds the file of a brand new map, as MZ writes one: empty tiles, no events, silent music, and nothing else set.
 * @param {number} tilesetId The tileset it draws with.
 * @returns {RmmzMap} The file.
 */
const newMapContent = (tilesetId: number): RmmzMap =>
{
  const silence = { name: '', pan: 0, pitch: 100, volume: 90 };
  return {
    autoplayBgm: false,
    autoplayBgs: false,
    battleback1Name: '',
    battleback2Name: '',
    bgm: { ...silence },
    bgs: { ...silence },
    disableDashing: false,
    displayName: '',
    encounterList: [],
    encounterStep: 30,
    height: NEW_MAP_HEIGHT,
    note: '',
    parallaxLoopX: false,
    parallaxLoopY: false,
    parallaxName: '',
    parallaxShow: true,
    parallaxSx: 0,
    parallaxSy: 0,
    scrollType: 0,
    specifyBattleback: false,
    tilesetId,
    width: NEW_MAP_WIDTH,
    data: new Array(NEW_MAP_WIDTH * NEW_MAP_HEIGHT * MAP_LAYERS).fill(0),
    events: [],
  };
};

/**
 * Builds the row of a map entering the tree, in the shape MZ gives new rows. Where it hangs and its order are set
 * when the tree is numbered.
 * @param {number} mapId The map id.
 * @param {string} name Its name in the tree.
 * @returns {RmmzMapInfo} The row.
 */
const newMapRow = (mapId: number, name: string): RmmzMapInfo =>
{
  return { id: mapId, expanded: false, name, order: 0, parentId: TREE_ROOT, scrollX: 0, scrollY: 0, quick: false };
};

/**
 * Quotes a map's name for a step's label.
 * @param {MapTreeModel} tree The tree.
 * @param {number} mapId The map.
 * @returns {string} The quoted name.
 */
const quoted = (tree: MapTreeModel, mapId: number): string =>
{
  return `"${tree.row(mapId)?.name ?? defaultMapName(mapId)}"`;
};

/**
 * Names a step on one map or several: the map's name alone, or how many.
 * @param {string} verb What the step does, such as "Move".
 * @param {MapTreeModel} tree The tree the maps are named from.
 * @param {readonly number[]} mapIds The maps.
 * @returns {string} The label.
 */
const labelFor = (verb: string, tree: MapTreeModel, mapIds: readonly number[]): string =>
{
  return mapIds.length === 1
    ? `${verb} ${quoted(tree, mapIds[0])}`
    : `${verb} ${mapIds.length} maps`;
};

/**
 * Refuses a parent that is not in the tree.
 * @param {MapTreeModel} tree The tree.
 * @param {number} parentId The parent, or {@link TREE_ROOT}.
 */
const requireParent = (tree: MapTreeModel, parentId: number): void =>
{
  if (parentId !== TREE_ROOT && tree.has(parentId) === false)
  {
    throw new TreePlanError(`Map ${parentId} is not in the tree.`);
  }
};

/**
 * Works out a new map: the lowest free id, a row named the way MZ names new maps, hung last under its parent.
 * @param {MapInfoRows} rows The tree as it stands.
 * @param {number} parentId The map it goes under, or {@link TREE_ROOT} for the top level.
 * @param {RmmzMap} content The file it starts with.
 * @param {ReadonlySet<number>} skip Free ids not to use, such as ones whose file already exists.
 * @returns {TreePlan} The plan.
 */
const planCreate = (rows: MapInfoRows, parentId: number, content: RmmzMap, skip: ReadonlySet<number> = new Set()): TreePlan =>
{
  const tree = new MapTreeModel(rows);
  requireParent(tree, parentId);

  const [ mapId ] = tree.freeIds(1, skip);
  tree.insert(newMapRow(mapId, defaultMapName(mapId)), parentId, null);
  return {
    label: `Create ${quoted(tree, mapId)}`,
    rows: tree.toRows(),
    created: [ { mapId, content: cloneJson(content), spots: [] } ],
    removed: [],
    selection: [ mapId ],
  };
};

/**
 * Works out a rename. The name is trimmed, and an empty one is refused, since a map with no name cannot be found in
 * the tree.
 * @param {MapInfoRows} rows The tree as it stands.
 * @param {number} mapId The map.
 * @param {string} name The new name.
 * @returns {TreePlan} The plan; its rows equal the old ones when the name did not change.
 */
const planRename = (rows: MapInfoRows, mapId: number, name: string): TreePlan =>
{
  const tree = new MapTreeModel(rows);
  const trimmed = name.trim();
  if (tree.has(mapId) === false)
  {
    throw new TreePlanError(`Map ${mapId} is not in the tree.`);
  }

  if (trimmed === '')
  {
    throw new TreePlanError('A map needs a name.');
  }

  const label = `Rename ${quoted(tree, mapId)} to "${trimmed}"`;
  tree.rename(mapId, trimmed);
  return { label, rows: tree.toRows(), created: [], removed: [], selection: [ mapId ] };
};

/**
 * Works out a move: every selected map, with its branch, lands at the place in the order the tree showed them. A
 * map inside another selected map simply travels with it. Moving a map inside its own branch is refused.
 * @param {MapInfoRows} rows The tree as it stands.
 * @param {readonly number[]} mapIds The maps to move.
 * @param {TreePlace} place Where they land.
 * @returns {TreePlan} The plan; its rows equal the old ones when nothing moved.
 */
const planMove = (rows: MapInfoRows, mapIds: readonly number[], place: TreePlace): TreePlan =>
{
  const tree = new MapTreeModel(rows);
  requireParent(tree, place.parentId);
  const moving = tree.outermost(mapIds);
  if (moving.length === 0)
  {
    throw new TreePlanError('Pick a map to move.');
  }

  if (moving.some(id => place.parentId !== TREE_ROOT && tree.isWithin(place.parentId, id)))
  {
    throw new TreePlanError('A map cannot move inside itself.');
  }

  // landing in front of a map that is itself moving means landing in front of the next one that stays, and in
  // front of a map that is not there at all means the end.
  const siblings = tree.children(place.parentId);
  const found = place.beforeId === null
    ? -1
    : siblings.indexOf(place.beforeId);
  const from = found < 0
    ? siblings.length
    : found;
  const beforeId = siblings.slice(from).find(id => moving.includes(id) === false) ?? null;

  const label = labelFor('Move', tree, moving);
  moving.forEach(id => tree.move(id, place.parentId, beforeId));
  return { label, rows: tree.toRows(), created: [], removed: [], selection: moving };
};

/**
 * Works out a delete: every selected map goes with its whole branch, as in MZ, and every one of their files with it.
 * @param {MapInfoRows} rows The tree as it stands.
 * @param {readonly number[]} mapIds The maps to delete.
 * @returns {TreePlan} The plan.
 */
const planDelete = (rows: MapInfoRows, mapIds: readonly number[]): TreePlan =>
{
  const tree = new MapTreeModel(rows);
  const outermost = tree.outermost(mapIds);
  if (outermost.length === 0)
  {
    throw new TreePlanError('Pick a map to delete.');
  }

  const inside = outermost.flatMap(id => tree.descendants(id)).length;
  const label = inside === 0
    ? labelFor('Delete', tree, outermost)
    : `${labelFor('Delete', tree, outermost)} and ${inside === 1 ? '1 map' : `${inside} maps`} inside`;
  const removed = outermost.flatMap(id => tree.remove(id));
  return { label, rows: tree.toRows(), created: [], removed, selection: [] };
};

/**
 * Captures maps for the clipboard, in tree order, each with its file, the placements of blueprints its tiles hold, and
 * the copied map it hung from.
 * @param {MapInfoRows} rows The tree as it stands.
 * @param {readonly number[]} mapIds The maps to copy.
 * @param {ReadonlyMap<number, RmmzMap>} contents Each map's file as it stands.
 * @param {ReadonlyMap<number, readonly BlueprintSpot[]>} spots Each map's placements; a map left out holds none.
 * @returns {CopiedMap[]} The copies.
 */
const copyMaps = (
  rows: MapInfoRows,
  mapIds: readonly number[],
  contents: ReadonlyMap<number, RmmzMap>,
  spots: ReadonlyMap<number, readonly BlueprintSpot[]> = new Map(),
): CopiedMap[] =>
{
  const tree = new MapTreeModel(rows);
  const selected = new Set(mapIds);
  return tree.preorder()
    .filter(id => selected.has(id))
    .map(id =>
    {
      const content = contents.get(id);
      if (content === undefined)
      {
        throw new TreePlanError(`Map ${id} has no file to copy.`);
      }

      // the nearest copied map above this one is what its copy hangs from.
      let parentId = tree.parentOf(id);
      while (parentId !== TREE_ROOT && selected.has(parentId) === false)
      {
        parentId = tree.parentOf(parentId);
      }

      return {
        sourceId: id,
        parentSourceId: parentId === TREE_ROOT ? null : parentId,
        name: tree.row(id)?.name ?? defaultMapName(id),
        content: cloneJson(content),
        spots: [ ...spots.get(id) ?? [] ],
      };
    });
};

/**
 * Works out a paste: each copied map becomes a new map with the lowest free id, its name, file and placements of
 * blueprints as copied, hung last under the place's parent, or under the copy of the copied map it hung from.
 * @param {MapInfoRows} rows The tree as it stands.
 * @param {readonly CopiedMap[]} copies The clipboard's maps, in the order they were copied.
 * @param {number} parentId Where they land, or {@link TREE_ROOT} for the top level.
 * @param {ReadonlySet<number>} skip Free ids not to use.
 * @returns {TreePlan} The plan.
 */
const planPaste = (rows: MapInfoRows, copies: readonly CopiedMap[], parentId: number, skip: ReadonlySet<number> = new Set()): TreePlan =>
{
  const tree = new MapTreeModel(rows);
  requireParent(tree, parentId);
  if (copies.length === 0)
  {
    throw new TreePlanError('Nothing is copied.');
  }

  const ids = tree.freeIds(copies.length, skip);
  const newIdOf = new Map(copies.map((copy, index) => [ copy.sourceId, ids[index] ]));
  copies.forEach((copy, index) =>
  {
    const copiedParent = copy.parentSourceId === null
      ? undefined
      : newIdOf.get(copy.parentSourceId);
    tree.insert(newMapRow(ids[index], copy.name), copiedParent ?? parentId, null);
  });

  return {
    label: copies.length === 1 ? `Paste "${copies[0].name}"` : `Paste ${copies.length} maps`,
    rows: tree.toRows(),
    created: copies.map((copy, index) => ({ mapId: ids[index], content: cloneJson(copy.content), spots: [ ...copy.spots ] })),
    removed: [],
    selection: ids,
  };
};

/**
 * Works out a duplicate: every selected map gets one copy, named as it is, with its file and its placements of
 * blueprints as they stand, right after it under the same parent.
 * @param {MapInfoRows} rows The tree as it stands.
 * @param {readonly DuplicateSource[]} sources The maps to duplicate, with their files.
 * @param {ReadonlySet<number>} skip Free ids not to use.
 * @returns {TreePlan} The plan.
 */
const planDuplicate = (rows: MapInfoRows, sources: readonly DuplicateSource[], skip: ReadonlySet<number> = new Set()): TreePlan =>
{
  const tree = new MapTreeModel(rows);
  const order = tree.preorder();
  const known = sources
    .filter(source => tree.has(source.mapId))
    .sort((left, right) => order.indexOf(left.mapId) - order.indexOf(right.mapId));
  if (known.length === 0)
  {
    throw new TreePlanError('Pick a map to duplicate.');
  }

  const label = labelFor('Duplicate', tree, known.map(source => source.mapId));
  const ids = tree.freeIds(known.length, skip);
  known.forEach((source, index) =>
  {
    // the copy lands in front of whatever followed the original, which is right after it.
    const parentId = tree.parentOf(source.mapId);
    const siblings = tree.children(parentId);
    const next = siblings[siblings.indexOf(source.mapId) + 1] ?? null;
    tree.insert(newMapRow(ids[index], tree.row(source.mapId)?.name ?? defaultMapName(source.mapId)), parentId, next);
  });

  return {
    label,
    rows: tree.toRows(),
    created: known.map((source, index) => ({ mapId: ids[index], content: cloneJson(source.content), spots: [ ...source.spots ?? [] ] })),
    removed: [],
    selection: ids,
  };
};

/**
 * Lists the writes that turn one version of the tree's rows into another: a whole row where a map enters or leaves
 * (a slot past the end is appended, in id order), and each changed field where a map stays. Field by field is what
 * lets a rename and a move of the same map undo independently.
 * @param {MapInfoRows} before The rows as they stand.
 * @param {MapInfoRows} after The rows as a plan leaves them.
 * @returns {RowPatch[]} The writes, in id order.
 */
const rowPatches = (before: MapInfoRows, after: MapInfoRows): RowPatch[] =>
{
  const patches: RowPatch[] = [];
  for (let id = 1; id < Math.max(before.length, after.length); id++)
  {
    const old = before[id] ?? null;
    const next = after[id] ?? null;
    if (old === null || next === null)
    {
      // a slot that stays empty past the old end still has to exist for the ids after it.
      if (old !== next || id >= before.length)
      {
        patches.push({ path: [ id ], value: next as unknown as JsonValue });
      }

      continue;
    }

    const oldRow = old as unknown as Record<string, JsonValue>;
    const nextRow = next as unknown as Record<string, JsonValue>;
    const keys = [ ...new Set([ ...Object.keys(oldRow), ...Object.keys(nextRow) ]) ];
    keys
      .filter(key => jsonEquals(oldRow[key], nextRow[key]) === false)
      .forEach(key => patches.push({ path: [ id, key ], value: nextRow[key] }));
  }

  return patches;
};

export {
  copyMaps,
  defaultMapName,
  newMapContent,
  newMapRow,
  planCreate,
  planDelete,
  planDuplicate,
  planMove,
  planPaste,
  planRename,
  rowPatches,
  TreePlanError,
};
export type { CopiedMap, CreatedMap, DuplicateSource, RowPatch, TreePlace, TreePlan };
