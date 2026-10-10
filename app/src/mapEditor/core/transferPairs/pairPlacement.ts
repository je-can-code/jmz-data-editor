import { MapEditorApiError } from '../api/MapEditorApi.ts';
import { BLUEPRINT_EVENTS_ADDED } from '../blueprints/blueprintShape.ts';
import { areaEventTag } from '../commandList/commandGuards.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { LandingGround } from '../locations/landingCheck.ts';
import { isBlueprintMapId, mapDocumentKey, type DocumentKey, type MapDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { cloneJson, type JsonValue } from '../model/json.ts';
import { MapDocument } from '../model/MapDocument.ts';
import type { Patch } from '../model/patches.ts';
import type { RmmzMap, RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import type { PairPlan, PlannedEnd } from './pairPlans.ts';
import { landingRefusalWords } from './pairWords.ts';

/**
 * What placing transfers needs from the window.
 */
type PlacementSources = {
  /**
   * The window's documents.
   */
  readonly hub: DocumentHub;

  /**
   * Lists the other live windows holding a document.
   */
  readonly holders: (key: DocumentKey) => readonly string[];

  /**
   * Holds a document here: another window's live copy when one holds it, the file otherwise.
   */
  readonly bring: (key: DocumentKey) => Promise<EditorDocument>;

  /**
   * Reads a map's file as it stands on disk; null for a window with no server, which reaches no file.
   */
  readonly readMap: ((mapId: number) => Promise<RmmzMap>) | null;

  /**
   * Reads a map to judge landings on, never to hold: the live copy when this window holds it, another window's, or the
   * file (see lookAtDocument).
   */
  readonly look: (mapId: number) => Promise<MapDocument>;

  /**
   * Makes a map ready to judge where the player lands, or says it cannot be, its tileset missing.
   */
  readonly groundOf: (map: MapDocument) => LandingGround | null;

  /**
   * Names a map for the author.
   */
  readonly mapName: (mapId: number) => string;
};

/**
 * One event a placement made: the map it stands on, and its id.
 */
type PlacedEvent = {
  readonly mapId: number;
  readonly eventId: number;
};

/**
 * What placing transfers came to: the step it recorded and the events it made, or why nothing was placed, in words for
 * the author.
 */
type PlacementOutcome =
  | { readonly ok: true; readonly step: HistoryStep; readonly placed: readonly PlacedEvent[] }
  | { readonly ok: false; readonly message: string };

/**
 * One map events are placed on, as the placement finds it: held here, or read from its file, which takes them written
 * through, since nobody has it open.
 */
type EndMap = {
  readonly mapId: number;
  readonly key: MapDocumentKey;
  readonly held: boolean;

  /**
   * The map as the author sees it: the document held here, or else the file.
   */
  readonly map: MapDocument;

  /**
   * The map's file where it differs from the map, as a held map's does while it holds unsaved edits, which the file
   * takes its own patches against; the file itself for a map nobody holds; or null when the file holds the map.
   */
  readonly file: MapDocument | null;
};

/**
 * Says why nothing was placed.
 * @param {string} message Why, in words for the author.
 * @returns {PlacementOutcome} The outcome.
 */
const refused = (message: string): PlacementOutcome =>
{
  return { ok: false, message };
};

/**
 * Copies a map, so what the placement tries on it never reaches the map itself.
 * @param {MapDocument} map The map.
 * @returns {MapDocument} The copy.
 */
const copyOf = (map: MapDocument): MapDocument =>
{
  return MapDocument.fromJson(mapDocumentKey(map.mapId), map.toJson());
};

/**
 * Reads the file of a map nobody holds, which the placement writes through, or says why it cannot be read.
 * @param {PlacementSources} sources The window.
 * @param {number} mapId The map.
 * @returns {Promise<MapDocument | string>} The file, or why it could not be read.
 */
const readEndFile = async (sources: PlacementSources, mapId: number): Promise<MapDocument | string> =>
{
  const name = sources.mapName(mapId);
  if (sources.readMap === null)
  {
    return `${name} isn't open, and there is no project server to read it from.`;
  }

  try
  {
    return MapDocument.fromJson(mapDocumentKey(mapId), await sources.readMap(mapId));
  }
  catch (error)
  {
    return error instanceof MapEditorApiError && error.status === 404
      ? `${name} has no file, so nothing can be placed on it.`
      : `${name} could not be read: ${String(error)}`;
  }
};

/**
 * Gathers what the placement needs that takes time to read: each map an end goes on that nobody here holds, brought in
 * from the window holding it or read from its file; the file of each held map holding unsaved edits that this window
 * lost track of; and each map a transfer lands on that no end goes on, looked at to judge the landing.
 * @param {PlacementSources} sources The window.
 * @param {PairPlan} plan The plan.
 * @returns {Promise<{ files: Map<number, MapDocument>, looked: Map<number, MapDocument> } | string>} The files read and
 * the maps looked at, by map id, or why something could not be read.
 */
const gather = async (sources: PlacementSources, plan: PairPlan): Promise<{ files: Map<number, MapDocument>; looked: Map<number, MapDocument> } | string> =>
{
  const { hub } = sources;
  const files = new Map<number, MapDocument>();
  const looked = new Map<number, MapDocument>();
  const endMaps = [ ...new Set(plan.ends.map(end => end.mapId)) ];
  for (const mapId of endMaps)
  {
    const key = mapDocumentKey(mapId);
    if (hub.has(key) === false && sources.holders(key).length > 0)
    {
      // a map another window holds comes here, so its unsaved edits stay its own and that window repeats the step.
      await sources.bring(key);
    }

    if (hub.has(key))
    {
      // a held map's file is what this window last knew of it; one it lost track of is read again.
      if (hub.isDirty(key) && hub.fileContent(key) === null)
      {
        files.set(mapId, MapDocument.fromJson(key, await hub.readFile(key) as unknown as RmmzMap));
      }

      continue;
    }

    const file = await readEndFile(sources, mapId);
    if (typeof file === 'string')
    {
      return file;
    }

    files.set(mapId, file);
  }

  // a one-way transfer lands on a map it places nothing on, which is only looked at.
  for (const mapId of new Set(plan.ends.map(end => end.destination.mapId)))
  {
    if (endMaps.includes(mapId) === false)
    {
      looked.set(mapId, await sources.look(mapId));
    }
  }

  return { files, looked };
};

/**
 * Finds a map an end goes on as it stands now: held here, with its file where that differs, or else its file, read before.
 * @param {DocumentHub} hub The window's documents.
 * @param {number} mapId The map.
 * @param {Map<number, MapDocument>} files The files read before.
 * @returns {EndMap | null} The map, or null when it is neither held nor read, having been let go of meanwhile.
 */
const endMapOf = (hub: DocumentHub, mapId: number, files: ReadonlyMap<number, MapDocument>): EndMap | null =>
{
  const key = mapDocumentKey(mapId);
  const read = files.get(mapId) ?? null;
  if (hub.has(key) === false)
  {
    return read === null ? null : { mapId, key, held: false, map: read, file: read };
  }

  // a held map's file differs from it only while it holds unsaved edits.
  const map = hub.map(key);
  const known = hub.fileContent(key);
  if (hub.isDirty(key) === false)
  {
    return { mapId, key, held: true, map, file: null };
  }

  return { mapId, key, held: true, map, file: known === null ? read : MapDocument.fromJson(key, known as unknown as RmmzMap) };
};

/**
 * Builds the events each map takes, with their ids: on each map, the first ids free both on the map and in its file, one
 * after another, so a file differing from its map never takes an event over one of its own, and neither ever takes an
 * empty slot a delete left, since something may still name that id.
 * @param {PairPlan} plan The plan.
 * @param {readonly EndMap[]} maps The maps the ends go on.
 * @returns {Map<PlannedEnd, RmmzMapEvent>} Each end's event.
 */
const eventsFor = (plan: PairPlan, maps: readonly EndMap[]): Map<PlannedEnd, RmmzMapEvent> =>
{
  const events = new Map<PlannedEnd, RmmzMapEvent>();
  maps.forEach(side =>
  {
    let next = Math.max(side.map.nextFreeEventId(), side.file === null ? 0 : side.file.nextFreeEventId());
    plan.ends.filter(end => end.mapId === side.mapId).forEach(end =>
    {
      events.set(end, end.eventFor(next));
      next += 1;
    });
  });

  return events;
};

/**
 * Reports whether two areas share a tile.
 * @param {CellRect} left One area.
 * @param {CellRect} right The other.
 * @returns {boolean} True when they overlap.
 */
const overlaps = (left: CellRect, right: CellRect): boolean =>
{
  return left.x < right.x + right.width && right.x < left.x + left.width && left.y < right.y + right.height && right.y < left.y + left.height;
};

/**
 * Lists the tiles an event covers: its own, and on any of its pages, the area J-Pixelistics' tag spreads it over, as a
 * map's edge exits are spread along their edge.
 * @param {RmmzMapEvent} event The event.
 * @returns {CellRect[]} The areas, its own tile first.
 */
const tilesCoveredBy = (event: RmmzMapEvent): CellRect[] =>
{
  const spread = event.pages.flatMap(page => page.list.flatMap((_command, index) =>
  {
    const tag = areaEventTag(page.list, index);
    return tag === null ? [] : [ { x: event.x, y: event.y, width: tag.width, height: tag.height } ];
  }));
  return [ { x: event.x, y: event.y, width: 1, height: 1 }, ...spread ];
};

/**
 * Says why an end cannot go where it is planned, or null when it can: its tiles must all lie on its map, no event may
 * stand on any of them, as MZ never stacks two events on one tile, nor spread over any of them, as an edge exit already
 * along the edge is, and no other end on the same map may share one.
 * @param {PlannedEnd} end The end.
 * @param {EndMap} side Its map.
 * @param {PairPlan} plan The plan, for the other ends.
 * @param {string} name Its map's name.
 * @returns {string | null} Why not, or null.
 */
const areaProblem = (end: PlannedEnd, side: EndMap, plan: PairPlan, name: string): string | null =>
{
  const { area } = end;
  const { map } = side;
  if (area.x < 0 || area.y < 0 || area.x + area.width > map.width || area.y + area.height > map.height)
  {
    return `That runs off ${name}, which is ${map.width} by ${map.height} tiles.`;
  }

  const events = map.eventIds().map(id => map.event(id) as RmmzMapEvent);
  const standing = events.find(event => overlaps(area, { x: event.x, y: event.y, width: 1, height: 1 }));
  if (standing !== undefined)
  {
    return `${standing.name === '' ? 'An event' : standing.name} (event ${standing.id}) already stands on ${standing.x}, ${standing.y} in ${name}.`;
  }

  const spread = events.find(event => tilesCoveredBy(event).some(covered => overlaps(area, covered)));
  if (spread !== undefined)
  {
    return `${spread.name === '' ? 'An event' : spread.name} (event ${spread.id}) already covers some of those tiles in ${name}.`;
  }

  const shared = plan.ends.some(other => other !== end && other.mapId === end.mapId && overlaps(area, other.area));
  return shared
    ? `Both ends would stand on the same tiles in ${name}.`
    : null;
};

/**
 * Says why the player cannot land where an end sends them, or null when they can: the map they land on is judged as it
 * will be once the ends are placed, a door standing in the way included.
 * @param {PlacementSources} sources The window.
 * @param {PlannedEnd} end The end.
 * @param {MapDocument} landsOn The map it sends them to, with every new event standing on it.
 * @returns {string | null} Why not, in words for the author, or null.
 */
const landingProblemOf = (sources: PlacementSources, end: PlannedEnd, landsOn: MapDocument): string | null =>
{
  const { mapId, x, y } = end.destination;
  const ground = sources.groundOf(landsOn);
  if (ground === null)
  {
    return `${sources.mapName(mapId)}'s tileset can't be read, so where the player lands there can't be checked.`;
  }

  const problem = ground.problemAt(x, y);
  return problem === null
    ? null
    : landingRefusalWords({ x, y }, sources.mapName(mapId), problem);
};

/**
 * Builds the maps as they will be once the events are placed, for judging landings: each map an end goes on, as the author
 * sees it, with its new events standing on it, and each map only looked at as it is.
 * @param {readonly EndMap[]} maps The maps the ends go on.
 * @param {Map<PlannedEnd, RmmzMapEvent>} events Each end's event.
 * @param {ReadonlyMap<number, MapDocument>} looked The maps only looked at.
 * @returns {Map<number, MapDocument>} The maps, by id.
 */
const mapsPlaced = (maps: readonly EndMap[], events: ReadonlyMap<PlannedEnd, RmmzMapEvent>, looked: ReadonlyMap<number, MapDocument>): Map<number, MapDocument> =>
{
  const placed = new Map(looked);
  maps.forEach(side =>
  {
    const copy = copyOf(side.map);
    [ ...events ].filter(([ end ]) => end.mapId === side.mapId).forEach(([ , event ]) => copy.apply(copy.placeEventPatch(event)));
    placed.set(side.mapId, copy);
  });

  return placed;
};

/**
 * Builds the patches putting an event into its slot on a map: where the slot lies past the end of the list, the slot is
 * made first, empty, and the event put in it after. Kept apart, an undo can take the event back out and leave its slot
 * empty, as it must once another event placed since stands further along the list: taking the slot away would give that
 * event another id.
 * @param {MapDocument} map The map, as the patches find it, which is left as it is.
 * @param {RmmzMapEvent} event The event; its id names the slot.
 * @returns {Patch[]} The patches, in order.
 */
const slotPatches = (map: MapDocument, event: RmmzMapEvent): Patch[] =>
{
  const { length } = map.valueAt([ 'events' ]) as JsonValue[];
  if (event.id < length)
  {
    return [ map.placeEventPatch(event) ];
  }

  const slots: Patch = { kind: 'splice', path: [ 'events' ], index: length, removed: [], inserted: new Array(event.id - length + 1).fill(null) };
  const placed: Patch = { kind: 'set', path: [ 'events', event.id ], before: null, after: cloneJson(event as unknown as JsonValue) };
  return [ slots, placed ];
};

/**
 * Builds the patches placing events on a file, each against the file as the one before left it.
 * @param {MapDocument} file The file, which is left as it is.
 * @param {readonly RmmzMapEvent[]} events The events.
 * @returns {Patch[]} The patches, in order.
 */
const filePatches = (file: MapDocument, events: readonly RmmzMapEvent[]): Patch[] =>
{
  const copy = copyOf(file);
  return events.flatMap(event =>
  {
    const patches = slotPatches(copy, event);
    patches.forEach(patch => copy.apply(patch));
    return patches;
  });
};

/**
 * Places every end as one step in the history of each map it goes on. A held map takes its events in place, and, while it
 * holds unsaved edits, records what its file takes instead, made against the file, so writing the step never saves those
 * edits; a map nobody holds takes them written through to its file. The step belongs to the first map's history, and
 * joins the others'.
 * @param {DocumentHub} hub The window's documents.
 * @param {PairPlan} plan The plan.
 * @param {readonly EndMap[]} maps The maps the ends go on, the first map's first.
 * @param {Map<PlannedEnd, RmmzMapEvent>} events Each end's event.
 * @returns {{ step: HistoryStep | null, refusal: string | null }} The step, or null with why a check refused it.
 */
const commit = (hub: DocumentHub, plan: PairPlan, maps: readonly EndMap[], events: ReadonlyMap<PlannedEnd, RmmzMapEvent>): { step: HistoryStep | null; refusal: string | null } =>
{
  // a check refusing the step says why through the hub alone.
  let refusal: string | null = null;
  const stop = hub.subscribe(event =>
  {
    if (event.type === 'refused')
    {
      refusal = event.message;
    }
  });

  try
  {
    const [ first, ...others ] = maps;
    const step = hub.edit(plan.label, [ mapHistoryKey(first.mapId) ], tx =>
    {
      maps.forEach(side =>
      {
        const placed = plan.ends.filter(end => end.mapId === side.mapId).map(end => events.get(end) as RmmzMapEvent);
        if (side.held === false)
        {
          filePatches(side.map, placed).forEach(patch => tx.writeThrough(side.key, patch));
          return;
        }

        placed.forEach(event => slotPatches(hub.map(side.key), event).forEach(patch => tx.apply(side.key, patch)));
        if (side.file !== null)
        {
          tx.fileVersion(side.key, filePatches(side.file, placed));
        }
      });
      tx.join(others.map(side => mapHistoryKey(side.mapId)));
    });
    return { step, refusal };
  }
  finally
  {
    stop();
  }
};

/**
 * Places a transfer, or a pair of them, as one step: every end goes on its map, or none does.
 *
 * Each end must fit on its map, on no other event's tile, and the player must be able to land where each sends them, the
 * maps judged as they will be with every new end standing on them; anything else refuses the whole placement with the
 * reason, and nothing changes. The map the transfer leaves from must be held here. A map the other end goes on is
 * changed in place when this window holds it; brought in first when another window holds it, so its unsaved edits stay
 * its own and that window repeats the step; and otherwise read from its file and written through, never opened. A held
 * map with unsaved edits records what its file takes apart from it, so the step reaches its file without them. Each new
 * event takes the first id free on its map and in its file.
 *
 * The step belongs to the history of every map it changes, so it undoes and redoes as one from either; a step reaching
 * two maps is written to both files at once (see PairWriter).
 * @param {PlacementSources} sources The window.
 * @param {PairPlan} plan What to place.
 * @returns {Promise<PlacementOutcome>} The step and the events placed, or why nothing was.
 */
const placeTransfers = async (sources: PlacementSources, plan: PairPlan): Promise<PlacementOutcome> =>
{
  const { hub } = sources;
  const endMaps = [ ...new Set(plan.ends.map(end => end.mapId)) ];
  if (endMaps.some(isBlueprintMapId))
  {
    return refused(BLUEPRINT_EVENTS_ADDED);
  }

  if (hub.has(mapDocumentKey(endMaps[0])) === false)
  {
    return refused(`${sources.mapName(endMaps[0])} isn't open here.`);
  }

  const gathered = await gather(sources, plan);
  if (typeof gathered === 'string')
  {
    return refused(gathered);
  }

  // whatever changed while the files were read, the maps are taken as they stand now, and nothing moves under a stroke.
  if (hub.isEditing())
  {
    return refused('Finish what is under way on the map first, then place the transfer.');
  }

  const maps = endMaps.map(mapId => endMapOf(hub, mapId, gathered.files));
  if (maps.some(side => side === null))
  {
    return refused('A map was closed while the transfer was being placed; place it again.');
  }

  const sides = maps as EndMap[];
  const events = eventsFor(plan, sides);
  for (const end of plan.ends)
  {
    const problem = areaProblem(end, sides.find(side => side.mapId === end.mapId) as EndMap, plan, sources.mapName(end.mapId));
    if (problem !== null)
    {
      return refused(problem);
    }
  }

  const placed = mapsPlaced(sides, events, gathered.looked);
  for (const end of plan.ends)
  {
    const problem = landingProblemOf(sources, end, placed.get(end.destination.mapId) as MapDocument);
    if (problem !== null)
    {
      return refused(problem);
    }
  }

  // every placement changes its maps, so a step the hub did not record is one a check refused, saying why.
  const { step, refusal } = commit(hub, plan, sides, events);
  if (step === null)
  {
    return refused(refusal as string);
  }

  return { ok: true, step, placed: plan.ends.map(end => ({ mapId: end.mapId, eventId: (events.get(end) as RmmzMapEvent).id })) };
};

export { placeTransfers };
export type { PlacedEvent, PlacementOutcome, PlacementSources };
