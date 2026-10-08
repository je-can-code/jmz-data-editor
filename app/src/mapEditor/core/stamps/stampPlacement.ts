import { blueprintLinkOf } from '../blueprints/blueprintLink.ts';
import { blockedCells, eventCellsOf, isOnMap, newEventIds, type EventMap } from '../events/eventPlacement.ts';
import { rewireGroupReferences } from '../events/eventReferences.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
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
 * cells they land on, the id each of those had in the stamp, and what of the stamp it would leave out; or why it cannot
 * go there at all.
 */
type StampPlan =
  | {
    readonly ok: true;
    readonly tiles: readonly CellChange[];
    readonly tilesPlaced: boolean;
    readonly events: readonly RmmzMapEvent[];
    readonly sourceIds: readonly number[];
    readonly tilesLeftOut: boolean;
    readonly eventsLeftOut: number;
  }
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
 *   a stamp landing any such event on a map that may hold no link is refused whole, with the map's reason.
 * @param {StampTarget} map The map, as it stands.
 * @param {Stamp} stamp The stamp.
 * @param {StampPlacement} placement Where it goes and how.
 * @returns {StampPlan} What would change, or why it cannot go there.
 */
const planStamp = (map: StampTarget, stamp: Stamp, placement: StampPlacement): StampPlan =>
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

  if (linkRefusal !== null && landing.some(event => blueprintLinkOf(event.note) !== null))
  {
    return { ok: false, message: `This stamp holds copies of blueprints, which can't go here: ${linkRefusal}.` };
  }

  const cells = landing.map(event => landingOf(event, at));
  const blocked = blockedCells(map, cells, new Set());
  if (blocked.length > 0)
  {
    return { ok: false, message: blockedMessage(blocked.length, landing.length) };
  }

  // the copies' references to one another follow them to their new ids.
  const ids = newEventIds(map, landing.length);
  const newIds = new Map(landing.map((event, index) => [ event.id, ids[index] ]));
  const events = landing.map((event, index) => ({
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
    sourceIds: landing.map(event => event.id),
    tilesLeftOut,
    eventsLeftOut: stamp.events.length - landing.length,
  };
};

/**
 * Words what a placement left out, for the author: the tiles of another tileset, and the events past the map's edge.
 * @param {Extract<StampPlan, { ok: true }>} plan The placement.
 * @returns {string[]} One line per thing left out; none when everything went down.
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

  return notes;
};

/**
 * Puts down what a placement was worked out to do, as one step in the map's history: the tiles first, then each event.
 * What placing a stamp and placing a blueprint both end with.
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
  });

  return { ok: true, step, eventIds: plan.events.map(event => event.id), notes: leftOutNotes(plan) };
};

/**
 * Places a stamp on a map as one step in its history, as {@link planStamp} works it out, from this map or any other.
 * The step is named for what went down, after the verb: "Stamp 20 by 15 tiles and 3 events", "Paste event".
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
  const plan = planStamp(hub.map(mapDocumentKey(mapId)), stamp, placement);
  if (plan.ok === false)
  {
    return plan;
  }

  return commitStampPlan(hub, mapId, plan, `${verb} ${contentsPhrase(plan.tilesPlaced ? stamp : null, plan.events.length)}`);
};

/**
 * Takes away, as one step in the map's history, what a stamp was just captured from: the events it copied, wherever
 * they stand now, and, for a stamp of tiles, every layer it carries emptied over the cells it was copied from, with the
 * autotiles around the hole reshaped. What a cut does once its stamp is safely kept.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map the stamp was captured from.
 * @param {Stamp} stamp The stamp, just captured from that map.
 * @param {number} mode The map's tileset mode.
 * @returns {StampOutcome} The step, with nothing left to select.
 */
const cutStampSource = (hub: DocumentHub, mapId: number, stamp: Stamp, mode: number): StampOutcome =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
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
  const step = hub.edit(label, [ mapHistoryKey(mapId) ], tx =>
  {
    tx.tiles(key, withReshapes(map, writes, mode));
    held.forEach(({ id }) => tx.apply(key, map.removeEventPatch(id)));
  });

  return { ok: true, step, eventIds: [], notes: [] };
};

export { commitStampPlan, cutStampSource, placeStamp, planStamp };
export type { StampOutcome, StampPlacement, StampPlan, StampTarget };
