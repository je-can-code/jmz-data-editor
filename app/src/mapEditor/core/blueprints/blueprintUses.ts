import { BLUEPRINT_USES } from '../editorData/editorData.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { blueprintHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { Transaction } from '../history/Transaction.ts';
import { editorDataDocumentKey, type EditorDataDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { isJsonObject, type JsonObject, type JsonValue } from '../model/json.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import { clipRect } from '../tools/geometry.ts';
import type { BlueprintCopyCount, BlueprintCopyCounter, BlueprintCopyCounts } from './blueprintCopies.ts';
import { isBlueprintId } from './blueprintLink.ts';

/**
 * The record of where blueprints are placed: {@code <project>/jmz-editor/blueprint-uses.json}, held in its stored form, the
 * record under {@code data} beside the shape's version. Per map, by id, and per blueprint on it, by its id, every cell a
 * placement of the blueprint's tiles had its top-left corner put down at, and for a placement cut off by the map's edge,
 * the part of the blueprint that went down, counted from the blueprint's own corner:
 *
 * <pre>
 * {
 *   "maps": {
 *     "16": {
 *       "k3x9q2mf": [ { "x": 4, "y": 7 }, { "x": 18, "y": 3, "placed": { "x": 0, "y": 0, "width": 2, "height": 6 } } ]
 *     },
 *     "102": {
 *       "k3x9q2mf": [ { "x": 40, "y": 41 } ]
 *     }
 *   }
 * }
 * </pre>
 *
 * A placement's tiles carry nothing saying which blueprint they came from, so this is the only way back to them, and it
 * holds nothing more than that: how many placements there are falls out of it, and how big each is comes from its
 * blueprint. A placement's events are never here; each one's note already names its blueprint, and travels with it. A
 * record written before placements said the part placed reads as every placement whole.
 *
 * Each map's placements are written whole, in one order (blueprints by id, then each one's placements row by row), so the
 * file reads the same whoever wrote it, and an edit to one map's placements never moves another's: undoing a placement on
 * one map is never held up by a placement on another since. The record describes the maps on disk, so it is kept
 * alongside them (see editorData's keptAlongside): a map's part reaches the disk only with that map's own file, merged into
 * the record there, which is the keeper's work (see blueprintUsesKeeper.ts).
 */
const BLUEPRINT_USES_DOCUMENT: EditorDataDocumentKey = editorDataDocumentKey(BLUEPRINT_USES.name);

/**
 * The part of a blueprint one placement put down, counted from the blueprint's own top-left corner: all of it but what the
 * map's edge cut off.
 */
type PlacedPart = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * One placement of a blueprint's tiles on a map: the blueprint, and the cell its top-left corner was put down at, which
 * may lie past the map's top or left edge when the placement hangs over it; and, for a placement the map's edge cut off,
 * the part that went down. A placement without one went down whole, or was recorded before the part was.
 */
type BlueprintSpot = {
  readonly blueprintId: string;
  readonly x: number;
  readonly y: number;
  readonly placed?: PlacedPart;
};

/**
 * One placement somewhere in the project: a spot, and the map it is on.
 */
type PlacedSpot = BlueprintSpot & { readonly mapId: number };

/**
 * What the record's map keys look like: a map's id, written as the file writes numbers.
 */
const MAP_KEY_PATTERN = /^[1-9][0-9]*$/u;

/**
 * Says a record does not hold what a record holds, naming where.
 * @param {string} where Where, such as "map 16".
 * @returns {Error} The error.
 */
const unreadable = (where: string): Error =>
{
  return new Error(`the saved blueprint placements hold something under ${where} that is not a placement`);
};

/**
 * Reads the part of a blueprint a placement put down: a rectangle inside the blueprint, from its corner, at least one tile
 * each way.
 * @param {string} mapKey The map's key in the record, for the error.
 * @param {JsonValue} saved What the placement keeps under {@code placed}.
 * @returns {PlacedPart} The part.
 * @throws {Error} When it is not such a rectangle.
 */
const readPlacedPart = (mapKey: string, saved: JsonValue): PlacedPart =>
{
  const values = isJsonObject(saved)
    ? [ saved['x'], saved['y'], saved['width'], saved['height'] ]
    : [];
  if (values.length !== 4 || values.every(value => Number.isInteger(value)) === false)
  {
    throw unreadable(`map ${mapKey}`);
  }

  const [ x, y, width, height ] = values as number[];
  if (x < 0 || y < 0 || width < 1 || height < 1)
  {
    throw unreadable(`map ${mapKey}`);
  }

  return { x, y, width, height };
};

/**
 * Reads one blueprint's spots on one map.
 * @param {string} mapKey The map's key in the record.
 * @param {string} blueprintId The blueprint's id.
 * @param {JsonValue} saved What is kept there.
 * @returns {BlueprintSpot[]} The spots.
 * @throws {Error} When it is not a list of cells.
 */
const readSpotList = (mapKey: string, blueprintId: string, saved: JsonValue): BlueprintSpot[] =>
{
  if (Array.isArray(saved) === false || isBlueprintId(blueprintId) === false)
  {
    throw unreadable(`map ${mapKey}`);
  }

  return saved.map(cell =>
  {
    const x = isJsonObject(cell) ? cell['x'] : undefined;
    const y = isJsonObject(cell) ? cell['y'] : undefined;
    if (Number.isInteger(x) === false || Number.isInteger(y) === false)
    {
      throw unreadable(`map ${mapKey}`);
    }

    // a placement keeps its part only when the map's edge cut some of it off.
    const { placed } = cell as JsonObject;
    return placed === undefined
      ? { blueprintId, x: x as number, y: y as number }
      : { blueprintId, x: x as number, y: y as number, placed: readPlacedPart(mapKey, placed) };
  });
};

/**
 * Reads every spot one map's entry holds.
 * @param {string} mapKey The map's key in the record.
 * @param {JsonValue} saved The entry.
 * @returns {BlueprintSpot[]} The spots, as the entry lists them.
 * @throws {Error} When it is not an entry of placements.
 */
const readMapEntry = (mapKey: string, saved: JsonValue): BlueprintSpot[] =>
{
  if (isJsonObject(saved) === false)
  {
    throw unreadable(`map ${mapKey}`);
  }

  return Object.entries(saved).flatMap(([ blueprintId, spots ]) => readSpotList(mapKey, blueprintId, spots));
};

/**
 * Reads every placement out of the record's data. Anything that is not a record of placements is refused loudly rather
 * than read as no placements, since writing over it would lose it.
 * @param {JsonValue | undefined} data The record's data, as the editor-data client loads it.
 * @returns {PlacedSpot[]} Every placement, by map id, each map's in the record's order.
 * @throws {Error} When the data is not a record of placements.
 */
const readUses = (data: JsonValue | undefined): PlacedSpot[] =>
{
  const maps = isJsonObject(data) ? data['maps'] : undefined;
  if (isJsonObject(maps) === false)
  {
    throw new Error('the saved blueprint placements are not a record of placements');
  }

  return Object.entries(maps).flatMap(([ mapKey, entry ]) =>
  {
    if (MAP_KEY_PATTERN.test(mapKey) === false)
    {
      throw unreadable(`"${mapKey}"`);
    }

    const mapId = Number(mapKey);
    return readMapEntry(mapKey, entry).map(spot => ({ ...spot, mapId }));
  });
};

/**
 * Reads every map's placements out of the record in its stored form, as its file holds it: what the record's keeper keeps
 * of the file on disk.
 * @param {JsonValue} stored The record, its version and its data.
 * @returns {Map<number, BlueprintSpot[]>} Each map's placements, by map id; a map with none is left out.
 * @throws {Error} When it is not a record of placements.
 */
const placementsByMap = (stored: JsonValue): Map<number, BlueprintSpot[]> =>
{
  const byMap = new Map<number, BlueprintSpot[]>();
  readUses(isJsonObject(stored) ? stored['data'] : undefined).forEach(({ mapId, ...spot }) =>
  {
    byMap.set(mapId, [ ...byMap.get(mapId) ?? [], spot ]);
  });

  return byMap;
};

/**
 * Finds the record a window holds, when it is one: what every edit keeping placements in step reads and writes. A window
 * not holding it, or holding a file that is not a record of placements, leaves the record as it is, and the Blueprints
 * section says why it could not be read.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @returns {EditorDocument | null} The record, or null when the window holds none it can read.
 */
const readableUses = (hub: Pick<DocumentHub, 'has' | 'document'>): EditorDocument | null =>
{
  if (hub.has(BLUEPRINT_USES_DOCUMENT) === false)
  {
    return null;
  }

  const document = hub.document(BLUEPRINT_USES_DOCUMENT);
  try
  {
    readUses(document.valueAt([ 'data' ]));
  }
  catch
  {
    return null;
  }

  return document;
};

/**
 * Lists every placement the record holds.
 * @param {EditorDocument} document The record, in its stored form.
 * @returns {PlacedSpot[]} The placements, by map id.
 */
const usesOf = (document: EditorDocument): PlacedSpot[] =>
{
  return readUses(document.valueAt([ 'data' ]));
};

/**
 * Reads the placements one map's entry holds, as the record keeps it.
 * @param {number} mapId The map.
 * @param {JsonValue | undefined} entry The entry, or undefined for a map with none.
 * @returns {BlueprintSpot[]} The placements, none for a map with no entry.
 */
const spotsOfEntry = (mapId: number, entry: JsonValue | undefined): BlueprintSpot[] =>
{
  return entry === undefined
    ? []
    : readMapEntry(String(mapId), entry);
};

/**
 * Lists the placements the record holds on one map.
 * @param {EditorDocument} document The record, in its stored form.
 * @param {number} mapId The map.
 * @returns {BlueprintSpot[]} The placements, none for a map with no entry.
 */
const spotsOnMap = (document: EditorDocument, mapId: number): BlueprintSpot[] =>
{
  return spotsOfEntry(mapId, document.valueAt([ 'data', 'maps', String(mapId) ]));
};

/**
 * Lists every placement of one blueprint the record holds.
 * @param {EditorDocument} document The record, in its stored form.
 * @param {string} blueprintId The blueprint.
 * @returns {PlacedSpot[]} Its placements, by map id, then row by row.
 */
const spotsOfBlueprint = (document: EditorDocument, blueprintId: string): PlacedSpot[] =>
{
  return usesOf(document)
    .filter(spot => spot.blueprintId === blueprintId)
    .sort((left, right) => left.mapId - right.mapId || left.y - right.y || left.x - right.x);
};

/**
 * Reports whether two spots are one placement: the same blueprint at the same cell, whatever part of it went down, since
 * the same blueprint put down twice at one cell is one placement, the second painting over the first.
 * @param {BlueprintSpot} left One spot.
 * @param {BlueprintSpot} right The other.
 * @returns {boolean} True when they are the same.
 */
const sameSpot = (left: BlueprintSpot, right: BlueprintSpot): boolean =>
{
  return left.blueprintId === right.blueprintId && left.x === right.x && left.y === right.y;
};

/**
 * Names a spot whole, its part placed included, so two spots read the same exactly when the record would write them the
 * same: what tells a placement changed from one left as it was.
 * @param {BlueprintSpot} spot The spot.
 * @returns {string} The name, such as {@code aa22@4,7} or {@code aa22@-1,0:1,0,2x3}.
 */
const placementKey = (spot: BlueprintSpot): string =>
{
  const { blueprintId, x, y, placed } = spot;
  return placed === undefined
    ? `${blueprintId}@${x},${y}`
    : `${blueprintId}@${x},${y}:${placed.x},${placed.y},${placed.width}x${placed.height}`;
};

/**
 * Reports whether two spots are written the same, their parts placed included.
 * @param {BlueprintSpot} left One spot.
 * @param {BlueprintSpot} right The other.
 * @returns {boolean} True when they are.
 */
const samePlacement = (left: BlueprintSpot, right: BlueprintSpot): boolean =>
{
  return placementKey(left) === placementKey(right);
};

/**
 * Finds the cells a placement's tiles went down on, counted on its map: the part of its blueprint it put down, from its
 * corner, or the whole blueprint for one that went down whole. Cells the map no longer holds, since it shrank, are among
 * them; nothing ever adds cells the edge once cut off, however the map grows.
 * @param {MapCell & { placed?: PlacedPart }} spot The placement's corner, and its part placed when it has one.
 * @param {{ width: number, height: number }} size The size of its blueprint.
 * @returns {CellRect} The cells.
 */
const cellsPlaced = (spot: MapCell & { readonly placed?: PlacedPart }, size: { readonly width: number; readonly height: number }): CellRect =>
{
  const part = spot.placed ?? { x: 0, y: 0, width: size.width, height: size.height };
  return { x: spot.x + part.x, y: spot.y + part.y, width: part.width, height: part.height };
};

/**
 * Works out what a placement holds once its corner stands where the spot says, on a map of a size: of the cells it held,
 * the ones the map holds there. Placing a blueprint over the map's edge, moving a piece of a map partly past it, and a
 * resize that cuts a placement each leave it holding less; nothing gives it back cells it lost. A placement holding its
 * whole blueprint keeps no part at all, as one recorded before parts were does.
 * @param {BlueprintSpot} spot The placement, its corner where it now stands.
 * @param {{ width: number, height: number }} size The size of its blueprint.
 * @param {{ width: number, height: number }} map The map's size.
 * @returns {BlueprintSpot | null} The placement with the part it holds, or null when none of it is on the map.
 */
const placedOn = (
  spot: BlueprintSpot,
  size: { readonly width: number; readonly height: number },
  map: { readonly width: number; readonly height: number },
): BlueprintSpot | null =>
{
  const onMap = clipRect(cellsPlaced(spot, size), map.width, map.height);
  if (onMap === null)
  {
    return null;
  }

  // the part is counted from the blueprint's corner, which is the placement's own.
  const { blueprintId, x, y } = spot;
  const placed = { x: onMap.x - x, y: onMap.y - y, width: onMap.width, height: onMap.height };
  const whole = placed.x === 0 && placed.y === 0 && placed.width === size.width && placed.height === size.height;
  return whole
    ? { blueprintId, x, y }
    : { blueprintId, x, y, placed };
};

/**
 * Orders spots the way the record writes them: by blueprint id, then row by row.
 * @param {BlueprintSpot} left One spot.
 * @param {BlueprintSpot} right The other.
 * @returns {number} Below zero to put the left first.
 */
const recordOrder = (left: BlueprintSpot, right: BlueprintSpot): number =>
{
  if (left.blueprintId !== right.blueprintId)
  {
    return left.blueprintId < right.blueprintId ? -1 : 1;
  }

  return left.y - right.y || left.x - right.x;
};

/**
 * Writes one spot as the record keeps it: its corner, and its part placed when it has one.
 * @param {BlueprintSpot} spot The spot.
 * @returns {JsonObject} The spot as written.
 */
const spotJson = (spot: BlueprintSpot): JsonObject =>
{
  const { x, y, placed } = spot;
  return placed === undefined
    ? { x, y }
    : { x, y, placed: { x: placed.x, y: placed.y, width: placed.width, height: placed.height } };
};

/**
 * Builds one map's entry from its spots: each blueprint under its id, its spots row by row, each spot once, since the same
 * blueprint put down twice at one cell is one placement, the second painting over the first.
 * @param {readonly BlueprintSpot[]} spots The map's spots, in any order.
 * @returns {JsonObject | undefined} The entry, or undefined for a map with none, which has no entry.
 */
const mapEntryOf = (spots: readonly BlueprintSpot[]): JsonObject | undefined =>
{
  const distinct = spots.filter((spot, index) => spots.findIndex(other => sameSpot(other, spot)) === index);
  if (distinct.length === 0)
  {
    return undefined;
  }

  const entry: JsonObject = {};
  [ ...distinct ].sort(recordOrder).forEach(spot =>
  {
    const kept = (entry[spot.blueprintId] ?? []) as JsonValue[];
    entry[spot.blueprintId] = [ ...kept, spotJson(spot) ];
  });

  return entry;
};

/**
 * Reports whether two lists of a map's spots are written the same: the same placements, whatever order they come in.
 * @param {readonly BlueprintSpot[]} left One list.
 * @param {readonly BlueprintSpot[]} right The other.
 * @returns {boolean} True when the record would write both alike.
 */
const sameSpots = (left: readonly BlueprintSpot[], right: readonly BlueprintSpot[]): boolean =>
{
  return JSON.stringify(mapEntryOf(left) ?? null) === JSON.stringify(mapEntryOf(right) ?? null);
};

/**
 * Changes the placements on one map inside an open transaction, so the change is part of whatever step made it and undoes
 * with it: the map's spots, as the record holds them, are handed to the change, and what it hands back is written whole.
 * A change that leaves the spots as they were adds nothing to the step. A window that holds no record it can read changes
 * nothing here (see {@link readableUses}).
 * @param {Transaction} tx The open transaction.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @param {(spots: BlueprintSpot[]) => readonly BlueprintSpot[]} change Works out the map's spots from what they are.
 */
const changeMapSpots = (
  tx: Transaction,
  hub: Pick<DocumentHub, 'has' | 'document'>,
  mapId: number,
  change: (spots: BlueprintSpot[]) => readonly BlueprintSpot[],
): void =>
{
  const document = readableUses(hub);
  if (document !== null)
  {
    tx.set(BLUEPRINT_USES_DOCUMENT, [ 'data', 'maps', String(mapId) ], mapEntryOf(change(spotsOnMap(document, mapId))));
  }
};

/**
 * Adds placements to a map's record inside an open transaction. One put down at a cell already recorded takes the place of
 * the one there, painting over it as it does, and its part placed with it.
 * @param {Transaction} tx The open transaction.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @param {readonly BlueprintSpot[]} added The placements.
 */
const recordSpots = (tx: Transaction, hub: Pick<DocumentHub, 'has' | 'document'>, mapId: number, added: readonly BlueprintSpot[]): void =>
{
  if (added.length > 0)
  {
    changeMapSpots(tx, hub, mapId, spots => [ ...spots.filter(spot => added.some(each => sameSpot(each, spot)) === false), ...added ]);
  }
};

/**
 * Takes placements out of a map's record inside an open transaction.
 * @param {Transaction} tx The open transaction.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @param {readonly BlueprintSpot[]} removed The placements.
 */
const forgetSpots = (tx: Transaction, hub: Pick<DocumentHub, 'has' | 'document'>, mapId: number, removed: readonly BlueprintSpot[]): void =>
{
  if (removed.length > 0)
  {
    changeMapSpots(tx, hub, mapId, spots => spots.filter(spot => removed.some(each => sameSpot(each, spot)) === false));
  }
};

/**
 * Adds each placement of a blueprint's tiles to a count of its copies: one placement is one more copy, on its map, as one
 * of its events placed is.
 * @param {BlueprintCopyCount | undefined} count The blueprint's event copies, or undefined for none.
 * @param {readonly PlacedSpot[]} spots The blueprint's placements.
 * @returns {BlueprintCopyCount | undefined} The count with them, or undefined when there is still nothing to count.
 */
const withPlacedCopies = (count: BlueprintCopyCount | undefined, spots: readonly PlacedSpot[]): BlueprintCopyCount | undefined =>
{
  if (spots.length === 0)
  {
    return count;
  }

  const perMap = new Map<number, number>((count?.maps ?? []).map(({ mapId, copies }) => [ mapId, copies ]));
  spots.forEach(({ mapId }) => perMap.set(mapId, (perMap.get(mapId) ?? 0) + 1));
  const maps = [ ...perMap ].sort(([ left ], [ right ]) => left - right).map(([ mapId, copies ]) => ({ mapId, copies }));
  return { total: maps.reduce((sum, each) => sum + each.copies, 0), maps };
};

/**
 * Counts every blueprint's copies across the project with its placements in: the copies of its events, as the counter
 * counts them from the maps' notes, and each placement of its tiles the record holds. Without a record to read, nothing
 * can say how many placements there are, so the count is still being made.
 * @param {BlueprintCopyCounts} counts The event copies, as the counter has them.
 * @param {readonly PlacedSpot[] | null} spots Every placement the record holds, or null while no record can be read.
 * @returns {BlueprintCopyCounts} The counts with every placement in.
 */
const countsWithPlacements = (counts: BlueprintCopyCounts, spots: readonly PlacedSpot[] | null): BlueprintCopyCounts =>
{
  if (spots === null)
  {
    return { state: counts.state === 'counted' ? 'counting' : counts.state, byBlueprint: counts.byBlueprint };
  }

  const blueprintIds = new Set([ ...counts.byBlueprint.keys(), ...spots.map(spot => spot.blueprintId) ]);
  const byBlueprint = new Map<string, BlueprintCopyCount>();
  blueprintIds.forEach(blueprintId =>
  {
    const own = spots.filter(spot => spot.blueprintId === blueprintId);
    byBlueprint.set(blueprintId, withPlacedCopies(counts.byBlueprint.get(blueprintId), own) as BlueprintCopyCount);
  });

  return { state: counts.state, byBlueprint };
};

/**
 * Finds how many copies one blueprint has across the project, placements of its tiles included, once that can be told:
 * what a delete, and an undo or a redo that would take a blueprint away, must know before going ahead. While its event
 * copies are still being counted, or cannot be, or no record of placements can be read, it cannot.
 * @param {Pick<BlueprintCopyCounter, 'countOf'>} copies The window's count of event copies.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents, the record among them.
 * @param {string} blueprintId The blueprint.
 * @returns {BlueprintCopyCount | null} The count, none for a blueprint not used anywhere; null while it cannot be told.
 */
const usedCopiesOf = (
  copies: Pick<BlueprintCopyCounter, 'countOf'>,
  hub: Pick<DocumentHub, 'has' | 'document'>,
  blueprintId: string,
): BlueprintCopyCount | null =>
{
  const events = copies.countOf(blueprintId);
  const document = readableUses(hub);
  if (events === null || document === null)
  {
    return null;
  }

  return withPlacedCopies(events, spotsOfBlueprint(document, blueprintId)) as BlueprintCopyCount;
};

/**
 * Forgets one placement of a blueprint, as one step in the blueprint's own history: what the author does once a placement
 * is no longer where it was, and is not coming back, so nothing will ever repaint it and it no longer keeps the blueprint
 * from being deleted. The map's tiles are left as they are. A placement the record no longer holds changes nothing. The
 * record's keeper takes it off the disk at once, and nothing else of its map with it.
 * @param {DocumentHub} hub The window's documents; the blueprints and the record must be held.
 * @param {{ id: string, name: string }} blueprint The blueprint, by its id and its name.
 * @param {PlacedSpot} spot The placement.
 * @returns {HistoryStep | null} The step, or null when the record no longer held it.
 */
const forgetPlacement = (hub: DocumentHub, blueprint: { readonly id: string; readonly name: string }, spot: PlacedSpot): HistoryStep | null =>
{
  return hub.edit(`Forget a copy of "${blueprint.name}"`, [ blueprintHistoryKey(blueprint.id) ], tx =>
  {
    forgetSpots(tx, hub, spot.mapId, [ spot ]);
  });
};

export {
  BLUEPRINT_USES_DOCUMENT,
  cellsPlaced,
  changeMapSpots,
  countsWithPlacements,
  forgetPlacement,
  forgetSpots,
  mapEntryOf,
  placedOn,
  placementKey,
  placementsByMap,
  readableUses,
  readUses,
  recordSpots,
  sameSpot,
  samePlacement,
  sameSpots,
  spotJson,
  spotsOfBlueprint,
  spotsOfEntry,
  spotsOnMap,
  usedCopiesOf,
  usesOf,
};
export type { BlueprintSpot, PlacedPart, PlacedSpot };
