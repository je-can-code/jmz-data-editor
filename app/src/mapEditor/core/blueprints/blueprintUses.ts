import { BLUEPRINT_USES, saveEditorDocument, type EditorDataSaveOutcome } from '../editorData/editorData.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { blueprintHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { Transaction } from '../history/Transaction.ts';
import { editorDataDocumentKey, parseDocumentKey, type EditorDataDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { isJsonObject, type JsonObject, type JsonValue } from '../model/json.ts';
import type { BlueprintCopyCount, BlueprintCopyCounter, BlueprintCopyCounts } from './blueprintCopies.ts';
import { isBlueprintId } from './blueprintLink.ts';

/**
 * The record of where blueprints are placed: {@code <project>/jmz-editor/blueprint-uses.json}, held in its stored form, the
 * record under {@code data} beside the shape's version. Per map, by id, and per blueprint on it, by its id, every cell a
 * placement of the blueprint's tiles had its top-left corner put down at:
 *
 * <pre>
 * {
 *   "maps": {
 *     "16": {
 *       "k3x9q2mf": [ { "x": 4, "y": 7 }, { "x": 12, "y": 3 } ]
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
 * blueprint. A placement's events are never here; each one's note already names its blueprint, and travels with it.
 *
 * Each map's placements are written whole, in one order (blueprints by id, then each one's placements row by row), so the
 * file reads the same whoever wrote it, and an edit to one map's placements never moves another's: undoing a placement on
 * one map is never held up by a placement on another since.
 */
const BLUEPRINT_USES_DOCUMENT: EditorDataDocumentKey = editorDataDocumentKey(BLUEPRINT_USES.name);

/**
 * One placement of a blueprint's tiles on a map: the blueprint, and the cell its top-left corner was put down at, which
 * may lie past the map's top or left edge when the placement hangs over it.
 */
type BlueprintSpot = {
  readonly blueprintId: string;
  readonly x: number;
  readonly y: number;
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
 * What the author calls the record, in the plural, in what saving it says.
 */
const USES_WORDS = 'blueprint placements';

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

    return { blueprintId, x: x as number, y: y as number };
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
 * Lists the placements the record holds on one map.
 * @param {EditorDocument} document The record, in its stored form.
 * @param {number} mapId The map.
 * @returns {BlueprintSpot[]} The placements, none for a map with no entry.
 */
const spotsOnMap = (document: EditorDocument, mapId: number): BlueprintSpot[] =>
{
  const entry = document.valueAt([ 'data', 'maps', String(mapId) ]);
  return entry === undefined
    ? []
    : readMapEntry(String(mapId), entry);
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
 * Reports whether two spots are one placement: the same blueprint at the same cell.
 * @param {BlueprintSpot} left One spot.
 * @param {BlueprintSpot} right The other.
 * @returns {boolean} True when they are the same.
 */
const sameSpot = (left: BlueprintSpot, right: BlueprintSpot): boolean =>
{
  return left.blueprintId === right.blueprintId && left.x === right.x && left.y === right.y;
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
  [ ...distinct ].sort(recordOrder).forEach(({ blueprintId, x, y }) =>
  {
    const kept = (entry[blueprintId] ?? []) as JsonValue[];
    entry[blueprintId] = [ ...kept, { x, y } ];
  });

  return entry;
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
 * Adds placements to a map's record inside an open transaction; one already recorded is recorded once.
 * @param {Transaction} tx The open transaction.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @param {readonly BlueprintSpot[]} added The placements.
 */
const recordSpots = (tx: Transaction, hub: Pick<DocumentHub, 'has' | 'document'>, mapId: number, added: readonly BlueprintSpot[]): void =>
{
  if (added.length > 0)
  {
    changeMapSpots(tx, hub, mapId, spots => [ ...spots, ...added ]);
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
 * from being deleted. The map's tiles are left as they are. A placement the record no longer holds changes nothing.
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

/**
 * Writes the record to disk: nothing when nothing is unsaved, and nothing while it waits for the author's choice about
 * changes made elsewhere, which writing it would put this copy over (see {@link saveEditorDocument}).
 * @param {DocumentHub} hub The window's documents; the record must be held.
 * @returns {Promise<EditorDataSaveOutcome>} Settles once the file is written, or at once when there is nothing to write or
 * the write is held back; rejects when the write itself fails.
 */
const saveBlueprintUses = (hub: DocumentHub): Promise<EditorDataSaveOutcome> =>
{
  return saveEditorDocument(hub, BLUEPRINT_USES_DOCUMENT, USES_WORDS);
};

/**
 * Keeps the record on disk in step with the maps it describes: it is written whenever a map's file or the map tree's is
 * written, from this window or another, so what the record says of the maps on disk is what they hold. A placement, a
 * resize or a move of tiles changes the record in the same step as the map, and stays unsaved with the map until the map
 * is saved; the map tree writes its changes at once, the record with them. A record waiting for the author's choice about
 * changes made elsewhere is held back, and the author hears why, as they do when a write fails. One write at a time: a
 * save heard while one is on its way writes once more after it.
 * @param {DocumentHub} hub The window's documents.
 * @param {(message: string) => void} onProblem Tells the author why the record was not written.
 * @returns {() => void} Stops keeping it.
 */
const keepUsesWithMaps = (hub: DocumentHub, onProblem: (message: string) => void): (() => void) =>
{
  let writing = false;
  let again = false;

  /**
   * Writes the record once it has anything unsaved, or once more after the write on its way.
   */
  const write = (): void =>
  {
    if (writing)
    {
      again = true;
      return;
    }

    if (hub.has(BLUEPRINT_USES_DOCUMENT) === false || hub.isDirty(BLUEPRINT_USES_DOCUMENT) === false)
    {
      return;
    }

    writing = true;
    saveBlueprintUses(hub)
      .then(
        outcome =>
        {
          if (outcome.ok === false)
          {
            onProblem(outcome.message);
          }
        },
        (error: unknown) =>
        {
          onProblem(`The ${USES_WORDS} could not be saved: ${error instanceof Error ? error.message : String(error)}`);
        },
      )
      .finally(() =>
      {
        writing = false;
        if (again)
        {
          again = false;
          write();
        }
      });
  };

  return hub.subscribe(event =>
  {
    const kind = event.type === 'saved' ? parseDocumentKey(event.document).kind : null;
    if (kind === 'map' || kind === 'mapinfos')
    {
      write();
    }
  });
};

export {
  BLUEPRINT_USES_DOCUMENT,
  changeMapSpots,
  countsWithPlacements,
  forgetPlacement,
  forgetSpots,
  keepUsesWithMaps,
  mapEntryOf,
  readableUses,
  readUses,
  recordSpots,
  sameSpot,
  saveBlueprintUses,
  spotsOfBlueprint,
  spotsOnMap,
  usedCopiesOf,
  usesOf,
};
export type { BlueprintSpot, PlacedSpot };
