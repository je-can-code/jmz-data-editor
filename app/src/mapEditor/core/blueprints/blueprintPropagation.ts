import type { CommitCheck, DocumentHub } from '../history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../history/historyKeys.ts';
import type { Transaction } from '../history/Transaction.ts';
import { blueprintMapKey, mapDocumentKey, TILESETS_KEY } from '../model/documentKeys.ts';
import type { TilesetsDocument } from '../model/JsonDocument.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { Patch } from '../model/patches.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { Stamp } from '../stamps/stamp.ts';
import { TilesetMode } from '../tiles/autotileShapes.ts';
import type { CommentTagDefinition } from './blueprintFields.ts';
import { blueprintStampOf, type BlueprintContent } from './blueprintMaps.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn, savedBlueprintOf } from './blueprints.ts';
import { blueprintChangesIn, type BlueprintStepChange } from './blueprintSteps.ts';
import { readableUses, spotsOnMap, type BlueprintSpot } from './blueprintUses.ts';
import type { CopyMaps } from './copyMaps.ts';
import { copyPatches } from './copyPatches.ts';
import { changesNothing, copiesOf, planCopiesOnMap, type MapCopyPlan } from './copyPlans.ts';

/**
 * What the propagation check reads with.
 */
type PropagationContext = {
  /**
   * The window's documents.
   */
  readonly hub: DocumentHub;

  /**
   * The maps a blueprint's change may reach, as their files hold them.
   */
  readonly maps: Pick<CopyMaps, 'readiness' | 'mapsWithCopies' | 'file' | 'fileSpots' | 'noteDrift'>;

  /**
   * The tags the active modules read from comments as fields.
   */
  readonly tags: () => readonly CommentTagDefinition[];
};

/**
 * Why a blueprint's change is refused in a window not holding the blueprints: it could neither keep the change nor know
 * what the blueprint held.
 */
const BLUEPRINTS_NOT_HELD = 'The blueprints aren\'t open in this window, so a blueprint can\'t change here.';

/**
 * Why one step may change one blueprint at most: each reaches its own copies, planned against the maps as they stand.
 */
const ONE_BLUEPRINT_AT_A_TIME = 'Change one blueprint at a time.';

/**
 * Why a blueprint's change waits while the blueprints wait for a choice about changes made elsewhere: writing the change
 * would put this window's blueprints over the other copy before the author chose.
 */
const BLUEPRINTS_CONFLICTED = 'The blueprints are waiting for a choice about changes made elsewhere, so a blueprint can\'t change until then.';

/**
 * Why a blueprint's tab takes no change while it waits for a choice between its own changes, not yet written, and the
 * version of the blueprint found on disk (see BlueprintMapFollower).
 */
const BLUEPRINT_MAP_CONFLICTED = 'This blueprint changed on disk while a change to it here was not yet written, so it can\'t change until you choose which to keep.';

/**
 * Why a blueprint's tab takes no change while it shows the blueprint otherwise than the blueprints keep it: its next edit
 * would write the older blueprint back over the newer one.
 */
const BLUEPRINT_MAP_STALE = 'This blueprint changed since its tab showed it, so it can\'t change here; close its tab and open it again.';

/**
 * Reads a tileset's mode from the window's tilesets: the autotile shapes read it.
 * @param {DocumentHub} hub The window's documents.
 * @param {number} tilesetId The tileset.
 * @returns {number} Its mode, or Area's while the window does not hold the tilesets or no such tileset.
 */
const modeOf = (hub: DocumentHub, tilesetId: number): number =>
{
  if (hub.has(TILESETS_KEY) === false)
  {
    return TilesetMode.area;
  }

  const tileset = (hub.document(TILESETS_KEY) as TilesetsDocument).tileset(tilesetId);
  return tileset === null ? TilesetMode.area : tileset.mode;
};

/**
 * Lists events in id order, whatever order they came in.
 * @param {readonly RmmzMapEvent[]} events The events.
 * @returns {RmmzMapEvent[]} The same events, by id.
 */
const eventsById = (events: readonly RmmzMapEvent[]): RmmzMapEvent[] =>
{
  return [ ...events ].sort((left, right) => left.id - right.id);
};

/**
 * Reports whether a blueprint's tab, just before an edit, showed its blueprint as the blueprints keep it: the same size
 * and tileset, the same values on the layers it carries, and the same events, whatever order the stamp lists them in.
 * @param {MapDocument} map The tab.
 * @param {BlueprintContent} before What the tab showed just before the edit.
 * @param {Stamp} stamp The blueprint's stamp as the blueprints keep it.
 * @returns {boolean} True when it did.
 */
const showedBlueprint = (map: MapDocument, before: BlueprintContent, stamp: Stamp): boolean =>
{
  if (map.width !== stamp.width || map.height !== stamp.height || map.tilesetId !== stamp.tilesetId)
  {
    return false;
  }

  const tilesMatch = before.tiles === null || stamp.tiles === null
    ? before.tiles === stamp.tiles
    : jsonEquals(before.tiles.layers, stamp.tiles.layers) && jsonEquals(before.tiles.values, stamp.tiles.values);
  return tilesMatch && jsonEquals(eventsById(before.events), eventsById(stamp.events));
};

/**
 * Finds a copy a plan changes, as the map or its file holds it now.
 * @param {MapDocument} map The map, or its file.
 * @param {number} eventId The copy.
 * @returns {RmmzMapEvent} The copy.
 * @throws {Error} When the map holds no such event, since a plan only ever changes the copies it found there.
 */
const copyOn = (map: MapDocument, eventId: number): RmmzMapEvent =>
{
  const copy = map.event(eventId);
  if (copy === null)
  {
    throw new Error(`Map ${map.mapId} holds no event ${eventId}, though a change was planned for it there`);
  }

  return copy;
};

/**
 * Builds the patches that make a plan on a map or its file: the cells it changes first, then the fields of each copy it
 * changes, each against what stands there now and as narrow as the field (see copyPatches), so taking the change back
 * later asks only whether those very fields, or those very cells, were changed since.
 * @param {MapDocument} map The map, or its file.
 * @param {MapCopyPlan} plan The plan.
 * @returns {Patch[]} The patches, in the order they go.
 */
const patchesFor = (map: MapDocument, plan: MapCopyPlan): Patch[] =>
{
  const tiles = plan.tiles.length === 0 ? [] : [ map.tilesPatch(plan.tiles) ];
  return [ ...tiles, ...plan.events.flatMap(event => copyPatches(copyOn(map, event.id), event)) ];
};

/**
 * Lists the copies a change was planned for on a map: every copy there of an event the change touched.
 * @param {BlueprintStepChange} change The change.
 * @param {MapDocument} map The map, or its file.
 * @returns {number[]} The copies' ids.
 */
const copiesReached = (change: BlueprintStepChange, map: MapDocument): number[] =>
{
  const touched = new Set(change.events.map(event => event.before.id));
  return copiesOf(map.events, change.blueprintId).filter(copy => touched.has(copy.link.eventId)).map(copy => copy.event.id);
};

/**
 * Carries a blueprint's change to one map held here: the map takes the change in place, on top of whatever unsaved
 * edits it holds, and joins the step's histories; while it holds unsaved edits, its file, which differs, is planned
 * apart, and the step says what the file takes instead, when that is anything else.
 * @param {Transaction} transaction The edit, still open.
 * @param {PropagationContext} context What the check reads with.
 * @param {{ change: BlueprintStepChange, stamp: Stamp, mapId: number }} reach The change, the blueprint's stamp before
 * it, and the map.
 */
const reachHeldMap = (
  transaction: Transaction,
  context: PropagationContext,
  reach: { readonly change: BlueprintStepChange; readonly stamp: Stamp; readonly mapId: number },
): void =>
{
  const { hub, maps } = context;
  const { change, stamp, mapId } = reach;
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  const uses = readableUses(hub);
  const spots = uses === null ? [] : spotsOnMap(uses, mapId).filter(spot => spot.blueprintId === change.blueprintId);
  const plan = planCopiesOnMap({ change, stamp, ground: map, spots, mode: modeOf(hub, map.tilesetId), tags: context.tags() });
  maps.noteDrift(mapId, copiesReached(change, map), plan.drifted);
  const own = patchesFor(map, plan);
  own.forEach(patch => transaction.apply(key, patch));

  // a map without unsaved edits holds what its file does, which takes the very same patches.
  const onFile = hub.isDirty(key) ? fileVersionOf(context, reach) : own;
  if (jsonEquals(onFile as unknown as JsonValue, own as unknown as JsonValue) === false)
  {
    transaction.fileVersion(key, onFile);
  }

  // the map joins the step whenever the change reached it, in the map itself or in its file alone, and its copies follow
  // the blueprint, so undoing the step later leaves any of them changed since as they stand.
  if (changesNothing(plan) === false || onFile.length > 0)
  {
    transaction.join([ mapHistoryKey(mapId) ]);
    transaction.markFollower(key);
  }
};

/**
 * Plans what the file of a map held here with unsaved edits takes for a change, apart from the map: against the file as
 * it stands, with the placements the file holds.
 * @param {PropagationContext} context What the check reads with.
 * @param {{ change: BlueprintStepChange, stamp: Stamp, mapId: number }} reach The change, the blueprint's stamp before
 * it, and the map.
 * @returns {Patch[]} The patches the file takes, in the order they go.
 */
const fileVersionOf = (
  context: PropagationContext,
  reach: { readonly change: BlueprintStepChange; readonly stamp: Stamp; readonly mapId: number },
): Patch[] =>
{
  const { hub, maps } = context;
  const { change, stamp, mapId } = reach;
  const file = maps.file(mapId);
  if (file === null)
  {
    throw new Error(`the file of Map ${mapId} is not known, though the change was let through`);
  }

  return patchesFor(file, planCopiesOnMap({
    change,
    stamp,
    ground: file,
    spots: maps.fileSpots(mapId, change.blueprintId),
    mode: modeOf(hub, file.tilesetId),
    tags: context.tags(),
  }));
};

/**
 * Carries a blueprint's change to one map nobody has open: planned against its file, and written through to it, joining
 * the step to the map's history, where the map finds the step once it is opened.
 * @param {Transaction} transaction The edit, still open.
 * @param {PropagationContext} context What the check reads with.
 * @param {{ change: BlueprintStepChange, stamp: Stamp, mapId: number }} reach The change, the blueprint's stamp before
 * it, and the map.
 */
const reachFile = (
  transaction: Transaction,
  context: PropagationContext,
  reach: { readonly change: BlueprintStepChange; readonly stamp: Stamp; readonly mapId: number },
): void =>
{
  const { hub, maps } = context;
  const { change, stamp, mapId } = reach;
  const file = maps.file(mapId);
  if (file === null)
  {
    throw new Error(`the file of Map ${mapId} is not known, though the change was let through`);
  }

  const spots: BlueprintSpot[] = maps.fileSpots(mapId, change.blueprintId);
  const plan = planCopiesOnMap({ change, stamp, ground: file, spots, mode: modeOf(hub, file.tilesetId), tags: context.tags() });
  maps.noteDrift(mapId, copiesReached(change, file), plan.drifted);
  const key = mapDocumentKey(mapId);
  patchesFor(file, plan).forEach(patch => transaction.writeThrough(key, patch));
  if (changesNothing(plan) === false)
  {
    transaction.join([ mapHistoryKey(mapId) ]);
    transaction.markFollower(key);
  }
};

/**
 * Builds the check that makes every change to a blueprint reach every copy of it, as part of the same step (see
 * DocumentHub's addCommitCheck), whatever tool made the change: a stroke in the blueprint's tab, an event moved or edited
 * there, an event of it edited in its own window. Asked after the check keeping a blueprint to its shape.
 *
 * The blueprint's new stamp goes into the blueprints, so its file and its copies never part; the step joins the
 * blueprint's history, so the blueprint's tab undoes it, whichever history it began in. Then each map its copies stand on
 * takes the change by the field model (see planCopiesOnMap): a map held here in place, joining the step to its history,
 * its file planned apart while it holds unsaved edits; a map nobody has open written through to its file. Maps holding a
 * plugin's patterns are never among them. A copy drifted too far, and a placement no longer where it was, are left as they
 * are, and noted for the where-used list.
 *
 * A change waits, refused with why, while what it would be planned against is not known yet: the plugins, the copies'
 * count, a map it reaches; while the blueprints wait for a choice about changes made elsewhere; and while the blueprint's
 * tab waits for a choice about a version of it found on disk (see BlueprintMapFollower). A window not holding the
 * blueprints refuses it; so does a step changing two blueprints at once; and so does a tab that showed the blueprint
 * otherwise than the blueprints keep it, since its edit would write the older blueprint back over the newer one. Every
 * other edit passes untouched.
 * @param {PropagationContext} context The window's documents, its maps a change may reach, and the modules' tags.
 * @returns {CommitCheck} The check.
 */
const blueprintPropagationCheck = (context: PropagationContext): CommitCheck =>
{
  const { hub, maps } = context;
  return transaction =>
  {
    const touchesBlueprint = transaction.entries.some(entry => entry.document.startsWith('blueprint-map:'));
    if (touchesBlueprint === false)
    {
      return null;
    }

    if (hub.has(BLUEPRINTS_DOCUMENT) === false)
    {
      return BLUEPRINTS_NOT_HELD;
    }

    if (hub.isConflicted(BLUEPRINTS_DOCUMENT))
    {
      return BLUEPRINTS_CONFLICTED;
    }

    const changes = blueprintChangesIn(hub, transaction.entries);
    if (changes.length > 1)
    {
      return ONE_BLUEPRINT_AT_A_TIME;
    }

    // a tab waiting for a choice about a version of its blueprint found on disk takes nothing until the author chooses.
    const [ change ] = changes;
    const tab = blueprintMapKey(change.blueprintId);
    if (hub.isConflicted(tab))
    {
      return BLUEPRINT_MAP_CONFLICTED;
    }

    const waiting = maps.readiness(change.blueprintId);
    if (waiting !== null)
    {
      return waiting;
    }

    const blueprint = blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), change.blueprintId);
    if (blueprint === null)
    {
      throw new Error(`the blueprints hold no blueprint ${change.blueprintId}, which a step changed`);
    }

    // a tab showing the blueprint otherwise than the blueprints keep it would write the older one back over the newer.
    const { stamp } = blueprint;
    if (showedBlueprint(hub.map(tab), change.before, stamp) === false)
    {
      return BLUEPRINT_MAP_STALE;
    }

    // the blueprints keep the blueprint as its map now stands, in the same step.
    const now = blueprintStampOf(hub.map(tab), stamp, modeOf(hub, stamp.tilesetId));
    transaction.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', change.blueprintId, 'stamp' ], savedBlueprintOf(blueprint.name, now)['stamp']);
    transaction.join([ blueprintHistoryKey(change.blueprintId) ]);

    maps.mapsWithCopies(change.blueprintId).forEach(mapId =>
    {
      const reach = { change, stamp, mapId };
      if (hub.has(mapDocumentKey(mapId)))
      {
        reachHeldMap(transaction, context, reach);
        return;
      }

      reachFile(transaction, context, reach);
    });

    return null;
  };
};

export {
  BLUEPRINT_MAP_CONFLICTED,
  BLUEPRINT_MAP_STALE,
  BLUEPRINTS_CONFLICTED,
  BLUEPRINTS_NOT_HELD,
  blueprintPropagationCheck,
  modeOf,
  ONE_BLUEPRINT_AT_A_TIME,
};
export type { PropagationContext };
