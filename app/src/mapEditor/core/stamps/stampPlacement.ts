import { blueprintLinkOf, withoutBlueprintLink } from '../blueprints/blueprintLink.ts';
import { liveBlueprintsIn, type LiveBlueprint } from '../blueprints/blueprints.ts';
import { BLUEPRINT_EVENTS_ADDED, BLUEPRINT_EVENTS_REMOVED } from '../blueprints/blueprintShape.ts';
import { forgetSpots, placedOn, readableUses, recordSpots, type BlueprintSpot } from '../blueprints/blueprintUses.ts';
import { blockedCells, eventCellsOf, isOnMap, newEventIds, type EventMap } from '../events/eventPlacement.ts';
import { rewireGroupReferences } from '../events/eventReferences.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { isBlueprintMapId, mapDocumentKey } from '../model/documentKeys.ts';
import { cloneJson } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';
import { reshapeCarried, withReshapes, type CellPosition } from '../tiles/autotileRefresh.ts';
import type { Shaping } from '../tiles/layering.ts';
import { cellIndex, TileDraft, type CellChange, type TileGrid } from '../tiles/tileGrid.ts';
import { clipRect } from '../tools/geometry.ts';
import { contentsPhrase, type Stamp, type StampTiles } from './stamp.ts';

/**
 * Where a stamp goes, and how.
 */
type StampPlacement = {
  /**
   * The cell the stamp's top-left corner lands on; the stamp may hang past any edge of the map from there.
   */
  readonly at: MapCell;

  /**
   * Whether autotiles are reshaped where the stamp meets its new surroundings, or every tile goes down exactly as it
   * was copied and nothing around it is touched (Shift held).
   */
  readonly shaping: Shaping;

  /**
   * The map's tileset mode, which the autotile shapes read.
   */
  readonly mode: number;

  /**
   * Why the map may hold no copy of a blueprint, or null when it may: a map whose events a plugin copies while the game
   * runs, notes and all, such as J-ABS's action map, never holds a link (see blueprintPlacement's link gate). A stamp
   * whose events are copies of a blueprint is refused there whole, as placing the blueprint itself is.
   */
  readonly linkRefusal: string | null;
};

/**
 * What a stamp is placed on: a map's size, tileset, tile data and events. A map document is one.
 */
type StampTarget = TileGrid & EventMap & { readonly tilesetId: number };

/**
 * What placing a stamp would do: the cells it would change, the events it would place, with their fresh ids and the
 * cells they land on, the id each of those had in the stamp, the placements of blueprints it would record where its
 * tiles land, what of the stamp it would leave out, and how many of its events, and of the placements its tiles hold, go
 * down plain for naming a blueprint no longer there; or why it cannot go there at all.
 */
type StampPlan =
  | {
    readonly ok: true;
    readonly tiles: readonly CellChange[];
    readonly tilesPlaced: boolean;
    readonly events: readonly RmmzMapEvent[];
    readonly sourceIds: readonly number[];
    readonly spots: readonly BlueprintSpot[];
    readonly tilesLeftOut: boolean;
    readonly eventsLeftOut: number;
    readonly deadLinks: number;
    readonly deadSpots: number;
  }
  | { readonly ok: false; readonly message: string };

/**
 * A stamp's events with every dead link taken out, and how many there were; or why one could not lose its link cleanly.
 */
type DeadLinksOut =
  | { readonly ok: true; readonly events: readonly RmmzMapEvent[]; readonly deadLinks: number }
  | { readonly ok: false; readonly message: string };

/**
 * What placing a stamp came to: the step it recorded (null when it changed nothing), the events it placed, which take
 * the selection, and what it left out, in words for the author; or why it was refused. A refused stamp changes nothing.
 */
type StampOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null; readonly eventIds: readonly number[]; readonly notes: readonly string[] }
  | { readonly ok: false; readonly message: string };

/**
 * Reads where an event of a stamp lands with the stamp's corner on a cell.
 * @param {RmmzMapEvent} event The stamp's event, standing inside the stamp.
 * @param {MapCell} at Where the stamp's corner lands.
 * @returns {MapCell} The cell on the map.
 */
const landingOf = (event: RmmzMapEvent, at: MapCell): MapCell =>
{
  return { x: at.x + event.x, y: at.y + event.y };
};

/**
 * Plans a stamp's tiles going down with its corner on a cell: every carried layer written exactly as copied, the part
 * past the map's edge dropped, and then, unless Shift is held, the autotiles along the stamp's edge and around it
 * reshaped to their new neighbours, while a tile inside keeps the shape it was copied in for as long as its neighbours
 * call for what its old ones did (see {@link StampTiles.calledFor}).
 * @param {TileGrid} grid The map as it stands.
 * @param {Stamp} stamp The stamp, which holds tiles.
 * @param {StampPlacement} placement Where it goes and how.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const planStampTiles = (grid: TileGrid, stamp: Stamp, placement: StampPlacement): CellChange[] =>
{
  const { layers, values, calledFor } = stamp.tiles as StampTiles;
  const { width, height } = stamp;
  const { at, shaping, mode } = placement;
  const draft = new TileDraft(grid);
  const changed: CellPosition[] = [];
  for (let dy = 0; dy < height; dy++)
  {
    for (let dx = 0; dx < width; dx++)
    {
      // what falls past the map's edge is dropped, as a brush hanging over it paints only what lands.
      const x = at.x + dx;
      const y = at.y + dy;
      if (isOnMap({ x, y }, grid) === false)
      {
        continue;
      }

      layers.forEach((z, layerIndex) => draft.setTile(x, y, z, values[(layerIndex * height + dy) * width + dx]));
      changed.push([ x, y ]);
    }
  }

  if (shaping === 'auto')
  {
    reshapeCarried(draft, changed, mode, (x, y, z) =>
    {
      // only a tile the stamp carried onto this layer of this cell remembers what its old neighbours called for.
      const dx = x - at.x;
      const dy = y - at.y;
      const layerIndex = layers.indexOf(z);
      if (dx < 0 || dy < 0 || dx >= width || dy >= height || layerIndex < 0)
      {
        return null;
      }

      return calledFor[(layerIndex * height + dy) * width + dx];
    });
  }

  return draft.changes();
};

/**
 * Says why a stamp cannot go where it was asked, when nothing in it lands on the map: tiles of another tileset alone,
 * or nothing on the map at all.
 * @param {boolean} tilesLeftOut Whether its tiles belong to another tileset.
 * @param {number} events How many events the stamp holds.
 * @returns {string} The words.
 */
const nothingLandsMessage = (tilesLeftOut: boolean, events: number): string =>
{
  return tilesLeftOut && events === 0
    ? 'This stamp was copied from a map with another tileset, so its tiles cannot go on this one.'
    : 'Nothing in the stamp lands on the map there.';
};

/**
 * Words how many of a stamp's events would land on others, for a refusal.
 * @param {number} blocked How many would.
 * @param {number} landing How many events land on the map in all.
 * @returns {string} The words.
 */
const blockedMessage = (blocked: number, landing: number): string =>
{
  return landing === 1
    ? 'The stamp\'s event would land on another event.'
    : `${blocked} of the stamp's ${landing} events would land on other events.`;
};

/**
 * Takes the link out of every event copied off a copy of a blueprint that is no longer there, deleted or its save
 * undone, so the event goes down as a plain one rather than naming nothing: its link's line goes, and the rest of its
 * note stays byte for byte. A link to a blueprint still there stays, and so does every link while the blueprints are not
 * held, since none can be told dead then. A note that could not lose its link cleanly refuses the stamp, as every note
 * the editor writes in place is refused rather than read otherwise.
 * @param {readonly RmmzMapEvent[]} events The stamp's events going down.
 * @param {LiveBlueprint | null} liveBlueprint Whether a blueprint is still there, or null while the window does not hold
 * the blueprints.
 * @returns {DeadLinksOut} The events, each with its dead link out, and how many there were; or why one could not lose it.
 */
const withDeadLinksOut = (events: readonly RmmzMapEvent[], liveBlueprint: LiveBlueprint | null): DeadLinksOut =>
{
  const placing: RmmzMapEvent[] = [];
  let deadLinks = 0;
  for (const event of events)
  {
    const link = blueprintLinkOf(event.note);
    if (link === null || liveBlueprint === null || liveBlueprint(link.blueprintId))
    {
      placing.push(event);
      continue;
    }

    try
    {
      // spreading keeps the event's own key order, so the note stays where its file put it.
      placing.push({ ...event, note: withoutBlueprintLink(event.note) });
      deadLinks += 1;
    }
    catch (error)
    {
      return { ok: false, message: `This stamp can't be placed: in ${event.name}'s note, ${(error as Error).message}.` };
    }
  }

  return { ok: true, events: placing, deadLinks };
};

/**
 * Works out the placements of blueprints a stamp's tiles record where they land, once its tiles are placed: each one its
 * tiles hold, moved to where the stamp's corner lands, as long as some of it lands on the map, keeping as its part placed
 * the cells the map holds there, since the stamp's tiles past the edge are dropped. One of a blueprint no longer there,
 * deleted or its save undone, goes down plain, as a copy of its events does; while the window does not hold the
 * blueprints, none can be told gone, and each is recorded as it is.
 * @param {Stamp} stamp The stamp, whose tiles are placed.
 * @param {MapCell} at Where its corner lands.
 * @param {TileGrid} map The map, for its size.
 * @param {LiveBlueprint | null} liveBlueprint Whether a blueprint is still there, or null while the window does not hold
 * the blueprints.
 * @returns {{ spots: BlueprintSpot[], dead: number }} The placements to record, and how many went down plain.
 */
const landingSpots = (
  stamp: Stamp,
  at: MapCell,
  map: TileGrid,
  liveBlueprint: LiveBlueprint | null,
): { spots: BlueprintSpot[]; dead: number } =>
{
  const spots: BlueprintSpot[] = [];
  let dead = 0;
  (stamp.spots ?? []).forEach(({ blueprintId, x, y, width, height, placed }) =>
  {
    const corner = { blueprintId, x: at.x + x, y: at.y + y };
    const landed = placedOn(placed === undefined ? corner : { ...corner, placed }, { width, height }, map);
    if (landed === null)
    {
      return;
    }

    if (liveBlueprint !== null && liveBlueprint(blueprintId) === false)
    {
      dead += 1;
      return;
    }

    spots.push(landed);
  });

  return { spots, dead };
};

/**
 * Works out a stamp going down on a map with its top-left corner on a cell. Everything is placed as an independent
 * copy; nothing links it to the stamp or to what the stamp was copied from.
 *
 * - Tiles go down on the layers they were copied from, past the map's edge dropped, with the autotiles around them
 *   reshaped (see {@link planStampTiles}). Tiles copied from a map with another tileset are left out, since their ids
 *   draw that tileset's pictures, and only the events go down.
 * - Events go down where they stood inside the stamp, with fresh ids past the end of this map's list, in the order they
 *   were copied: never an id the map uses, and never an empty slot a delete left, which something may still name. Their
 *   commands naming one another name the copies; those naming anything else stay as they are. An event that would land
 *   past the map's edge is left out, as the tiles there are.
 * - A stamp that would land any of its events on a tile another event holds is refused whole, as MZ never stacks two
 *   events on one tile; so is one of which nothing at all would land on the map.
 * - Events copied off copies of a blueprint carry their links along, so they are copies of it too, as their notes say;
 *   a stamp landing any such event on a map that may hold no link is refused whole, with the map's reason. A copy of a
 *   blueprint no longer there goes down as a plain event instead, its dead link taken out (see {@link withDeadLinksOut}),
 *   which a map that may hold no link takes too.
 * - Tiles copied off a placement of a blueprint, the whole of it, carry the placement along, recorded again where they
 *   land (see {@link landingSpots}); like a copy of its events, it is refused whole on a map that may hold no link.
 * @param {StampTarget} map The map, as it stands.
 * @param {Stamp} stamp The stamp.
 * @param {StampPlacement} placement Where it goes and how.
 * @param {LiveBlueprint | null} liveBlueprint Whether a blueprint a copy names is still there, or null while the window
 * does not hold the blueprints, when every link goes down as it is.
 * @returns {StampPlan} What would change, or why it cannot go there.
 */
const planStamp = (map: StampTarget, stamp: Stamp, placement: StampPlacement, liveBlueprint: LiveBlueprint | null): StampPlan =>
{
  const { at, linkRefusal } = placement;
  const tilesFit = stamp.tiles !== null && stamp.tilesetId === map.tilesetId;
  const tilesLeftOut = stamp.tiles !== null && tilesFit === false;
  const tilesPlaced = tilesFit && clipRect({ x: at.x, y: at.y, width: stamp.width, height: stamp.height }, map.width, map.height) !== null;
  const landing = stamp.events.filter(event => isOnMap(landingOf(event, at), map));
  if (tilesPlaced === false && landing.length === 0)
  {
    return { ok: false, message: nothingLandsMessage(tilesLeftOut, stamp.events.length) };
  }

  const unlinked = withDeadLinksOut(landing, liveBlueprint);
  if (unlinked.ok === false)
  {
    return unlinked;
  }

  // only links to blueprints still there make copies, and only tiles placed carry their placements.
  const placing = unlinked.events;
  const landed = tilesPlaced ? landingSpots(stamp, at, map, liveBlueprint) : { spots: [], dead: 0 };
  if (linkRefusal !== null && (placing.some(event => blueprintLinkOf(event.note) !== null) || landed.spots.length > 0))
  {
    return { ok: false, message: `This stamp holds copies of blueprints, which can't go here: ${linkRefusal}.` };
  }

  const cells = placing.map(event => landingOf(event, at));
  const blocked = blockedCells(map, cells, new Set());
  if (blocked.length > 0)
  {
    return { ok: false, message: blockedMessage(blocked.length, placing.length) };
  }

  // the copies' references to one another follow them to their new ids.
  const ids = newEventIds(map, placing.length);
  const newIds = new Map(placing.map((event, index) => [ event.id, ids[index] ]));
  const events = placing.map((event, index) => ({
    ...rewireGroupReferences(cloneJson(event), newIds),
    id: ids[index],
    x: cells[index].x,
    y: cells[index].y,
  }));

  return {
    ok: true,
    tiles: tilesPlaced ? planStampTiles(map, stamp, placement) : [],
    tilesPlaced,
    events,
    sourceIds: placing.map(event => event.id),
    spots: landed.spots,
    tilesLeftOut,
    eventsLeftOut: stamp.events.length - placing.length,
    deadLinks: unlinked.deadLinks,
    deadSpots: landed.dead,
  };
};

/**
 * What the author hears when a stamp's tiles held copies of blueprints the window had no record to keep in.
 */
const UNRECORDED_SPOTS_NOTE = 'The stamp\'s tiles held copies of blueprints, which went down as plain tiles, since where blueprints are placed can\'t be read.';

/**
 * Words what a placement left out or changed, for the author: the tiles of another tileset, the events past the map's
 * edge, and the copies of blueprints no longer there, which went down as plain events.
 * @param {Extract<StampPlan, { ok: true }>} plan The placement.
 * @returns {string[]} One line per thing; none when everything went down as it was.
 */
const leftOutNotes = (plan: Extract<StampPlan, { ok: true }>): string[] =>
{
  const notes: string[] = [];
  if (plan.tilesLeftOut)
  {
    notes.push('This map uses another tileset, so only the stamp\'s events went down.');
  }

  if (plan.eventsLeftOut === 1)
  {
    notes.push('One of the stamp\'s events fell past the map\'s edge and was left out.');
  }
  else if (plan.eventsLeftOut > 1)
  {
    notes.push(`${plan.eventsLeftOut} of the stamp's events fell past the map's edge and were left out.`);
  }

  if (plan.deadLinks === 1)
  {
    notes.push('One of the stamp\'s events was a copy of a blueprint that no longer exists, so it went down as a plain event.');
  }
  else if (plan.deadLinks > 1)
  {
    notes.push(`${plan.deadLinks} of the stamp's events were copies of blueprints that no longer exist, so they went down as plain events.`);
  }

  if (plan.deadSpots > 0)
  {
    notes.push('The stamp\'s tiles held a copy of a blueprint that no longer exists, so they went down as plain tiles.');
  }

  return notes;
};

/**
 * Puts down what a placement was worked out to do, as one step in the map's history: the tiles first, then each event,
 * then the placements of blueprints its tiles record, so one undo takes the record back with the tiles. What placing a
 * stamp and placing a blueprint both end with.
 * @param {DocumentHub} hub The window's documents; the map must be held, as it was when the plan was made.
 * @param {number} mapId The map.
 * @param {Extract<StampPlan, { ok: true }>} plan The placement, worked out against the map as it stands.
 * @param {string} label What the history panel calls the step.
 * @returns {StampOutcome} The step, the events placed and what was left out.
 */
const commitStampPlan = (hub: DocumentHub, mapId: number, plan: Extract<StampPlan, { ok: true }>, label: string): StampOutcome =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  const step = hub.edit(label, [ mapHistoryKey(mapId) ], tx =>
  {
    // the tiles first, then each event, its patch built against the list as the one before left it.
    tx.tiles(key, plan.tiles);
    plan.events.forEach(event => tx.apply(key, map.placeEventPatch(event)));
    recordSpots(tx, hub, mapId, plan.spots);
  });

  return { ok: true, step, eventIds: plan.events.map(event => event.id), notes: leftOutNotes(plan) };
};

/**
 * Places a stamp on a map as one step in its history, as {@link planStamp} works it out, from this map or any other,
 * telling copies of blueprints the window's blueprints no longer hold from copies of those still there. The step is
 * named for what went down, after the verb: "Stamp 20 by 15 tiles and 3 events", "Paste event". Placements its tiles
 * hold go down plain in a window holding no record of placements it can read, and the author is told. A blueprint opened
 * as a map takes a stamp's tiles but none of its events, since its events are fixed, so a stamp placing any there is
 * refused whole.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {Stamp} stamp The stamp.
 * @param {StampPlacement} placement Where it goes and how.
 * @param {string} verb What the history panel calls the step, before what went down: "Stamp" for the stamp tool's
 * click, "Paste" for a paste.
 * @returns {StampOutcome} The step, the events placed and what was left out, or why it was refused.
 */
const placeStamp = (hub: DocumentHub, mapId: number, stamp: Stamp, placement: StampPlacement, verb: string): StampOutcome =>
{
  const plan = planStamp(hub.map(mapDocumentKey(mapId)), stamp, placement, liveBlueprintsIn(hub));
  if (plan.ok === false)
  {
    return plan;
  }

  if (plan.events.length > 0 && isBlueprintMapId(mapId))
  {
    return { ok: false, message: BLUEPRINT_EVENTS_ADDED };
  }

  const outcome = commitStampPlan(hub, mapId, plan, `${verb} ${contentsPhrase(plan.tilesPlaced ? stamp : null, plan.events.length)}`);

  // a placement the tiles hold goes down plain while the window holds no record it can read to keep it in, which the
  // author hears, since nothing could find that copy again.
  return outcome.ok && plan.spots.length > 0 && readableUses(hub) === null
    ? { ...outcome, notes: [ ...outcome.notes, UNRECORDED_SPOTS_NOTE ] }
    : outcome;
};

/**
 * Takes away, as one step in the map's history, what a stamp was just captured from: the events it copied, wherever
 * they stand now, and, for a stamp of tiles, every layer it carries emptied over the cells it was copied from, with the
 * autotiles around the hole reshaped, and the placements of blueprints it holds whole forgotten there, since they now
 * travel with the stamp and are recorded again wherever it is pasted. What a cut does once its stamp is safely kept. A
 * cut taking events out of a blueprint opened as a map is refused, since its events are fixed; the stamp stays kept.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map the stamp was captured from.
 * @param {Stamp} stamp The stamp, just captured from that map.
 * @param {number} mode The map's tileset mode.
 * @returns {StampOutcome} The step, with nothing left to select, or why it was refused.
 */
const cutStampSource = (hub: DocumentHub, mapId: number, stamp: Stamp, mode: number): StampOutcome =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  if (isBlueprintMapId(mapId) && eventCellsOf(map, stamp.events.map(event => event.id)).length > 0)
  {
    return { ok: false, message: BLUEPRINT_EVENTS_REMOVED };
  }

  const writes: CellChange[] = [];
  const { tiles, origin, width, height } = stamp;
  const { x: left, y: top } = origin;
  if (tiles !== null)
  {
    for (let y = top; y < top + height; y++)
    {
      for (let x = left; x < left + width; x++)
      {
        tiles.layers.forEach(z => writes.push([ cellIndex(map.width, map.height, x, y, z), 0 ]));
      }
    }
  }

  const held = eventCellsOf(map, stamp.events.map(event => event.id));
  const label = `Cut ${contentsPhrase(tiles === null ? null : stamp, held.length)}`;
  const carried = (stamp.spots ?? []).map(({ blueprintId, x, y }) => ({ blueprintId, x: left + x, y: top + y }));
  const step = hub.edit(label, [ mapHistoryKey(mapId) ], tx =>
  {
    tx.tiles(key, withReshapes(map, writes, mode));
    held.forEach(({ id }) => tx.apply(key, map.removeEventPatch(id)));
    forgetSpots(tx, hub, mapId, carried);
  });

  return { ok: true, step, eventIds: [], notes: [] };
};

export { commitStampPlan, cutStampSource, placeStamp, planStamp };
export type { StampOutcome, StampPlacement, StampPlan, StampTarget };
