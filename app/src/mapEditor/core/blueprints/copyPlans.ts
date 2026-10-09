import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { Stamp } from '../stamps/stamp.ts';
import type { CellChange, TileGrid } from '../tiles/tileGrid.ts';
import { rectContains } from '../tools/geometry.ts';
import type { CommentTagDefinition } from './blueprintFields.ts';
import { blueprintLinkOf, type BlueprintLink } from './blueprintLink.ts';
import type { BlueprintStepChange } from './blueprintSteps.ts';
import { cellsPlaced, type BlueprintSpot } from './blueprintUses.ts';
import { planCopyChange } from './copyChanges.ts';
import { followTiles, type BlueprintCellChange } from './copyTiles.ts';
import { checkPlacement, placementProblem } from './placementMatch.ts';

/**
 * One map as a blueprint's change is planned on it: its size, tile data and tileset, and its events in their slots by id.
 * A map document is one, and so is the file of a map nobody has open.
 */
type CopyGround = TileGrid & {
  readonly tilesetId: number;
  readonly events: readonly (RmmzMapEvent | null)[];
};

/**
 * One copy of a blueprint's event the change could not reach, and why, in words for the author.
 */
type DriftedCopy = {
  readonly eventId: number;
  readonly reason: string;
};

/**
 * One placement of a blueprint's tiles the change left as it was, since it is no longer where the record says, and why, in
 * words for the author.
 */
type LostPlacement = {
  readonly spot: BlueprintSpot;
  readonly reason: string;
};

/**
 * What a blueprint's change comes to on one map: the cells to write, with every autotile around them reshaped; every copy
 * of its events that changes, whole, its link written into its note; and the copies and placements it could not reach.
 * Nothing else of the map changes.
 */
type MapCopyPlan = {
  readonly tiles: readonly CellChange[];
  readonly events: readonly RmmzMapEvent[];
  readonly drifted: readonly DriftedCopy[];
  readonly lost: readonly LostPlacement[];
};

/**
 * What a change is planned on one map with.
 */
type CopyPlanInput = {
  /**
   * What the step did to the blueprint (see blueprintSteps).
   */
  readonly change: BlueprintStepChange;

  /**
   * The blueprint's stamp just before the change: what every placement still in place matches, and how far it reaches.
   */
  readonly stamp: Stamp;

  /**
   * The map.
   */
  readonly ground: CopyGround;

  /**
   * The placements of the blueprint's tiles on the map, as the record holds them for this very map: the map held here
   * with the record held here, or its file with the record's file.
   */
  readonly spots: readonly BlueprintSpot[];

  /**
   * The map's tileset mode, which the autotile shapes read.
   */
  readonly mode: number;

  /**
   * The tags the active modules read from comments as fields.
   */
  readonly tags: readonly CommentTagDefinition[];
};

/**
 * One copy of one of the blueprint's events on the map: the event, and its link.
 */
type MapCopy = {
  readonly event: RmmzMapEvent;
  readonly link: BlueprintLink;
};

/**
 * Finds every copy of one blueprint's events on a map: each event whose note links to it, in id order. A note that is
 * empty holds no link and needs no reading.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's events, by id.
 * @param {string} blueprintId The blueprint.
 * @returns {MapCopy[]} The copies.
 */
const copiesOf = (events: readonly (RmmzMapEvent | null)[], blueprintId: string): MapCopy[] =>
{
  return events.flatMap(event =>
  {
    if (event === null || event.note === '')
    {
      return [];
    }

    const link = blueprintLinkOf(event.note);
    return link !== null && link.blueprintId === blueprintId
      ? [ { event, link } ]
      : [];
  });
};

/**
 * Finds the copies one placement put down together, by the ids the blueprint knows them by: for each of the blueprint's
 * events, the copy of it standing exactly where the placement put it, the blueprint's event's place inside it added to
 * the placement's corner. Placing a blueprint rewires every command of its events naming another of them to that one's
 * copy (see stampPlacement's planStamp), so these are the ids a copy's commands name its own group by. A copy moved since
 * stands nowhere it was put, and is no longer known to the group; an event of the blueprint the map's edge cut off was
 * never put down.
 * @param {BlueprintSpot} spot The placement.
 * @param {readonly RmmzMapEvent[]} blueprintEvents The blueprint's events, where each stands inside it.
 * @param {readonly MapCopy[]} copies The copies of the blueprint's events on the map.
 * @returns {Map<number, number>} The copies' ids on the map, by the blueprint's ids.
 */
const groupOf = (spot: BlueprintSpot, blueprintEvents: readonly RmmzMapEvent[], copies: readonly MapCopy[]): Map<number, number> =>
{
  const group = new Map<number, number>();
  blueprintEvents.forEach(event =>
  {
    const x = spot.x + event.x;
    const y = spot.y + event.y;
    const found = copies.filter(copy => copy.link.eventId === event.id && copy.event.x === x && copy.event.y === y);
    if (found.length === 1)
    {
      group.set(event.id, found[0].event.id);
    }
  });

  return group;
};

/**
 * Works out which group a copy of one of the blueprint's events was placed with, if any: the group of the one placement
 * that put a copy of its event exactly where it stands. A copy two placements could have put there, or none, has no group
 * known, and its commands naming another of the blueprint's events read as its own choice (see planCopyChange).
 * @param {MapCopy} copy The copy.
 * @param {readonly Map<number, number>[]} groups Every placement's group, as {@link groupOf} finds them.
 * @returns {ReadonlyMap<number, number> | undefined} The group, or undefined when none is known.
 */
const groupFor = (copy: MapCopy, groups: readonly Map<number, number>[]): ReadonlyMap<number, number> | undefined =>
{
  const holding = groups.filter(group => group.get(copy.link.eventId) === copy.event.id);
  return holding.length === 1
    ? holding[0]
    : undefined;
};

/**
 * Plans the change to each copy of the blueprint's events on the map (see planCopyChange): every copy of an event the
 * change touched, with its group's ids where its placement is known, comes to a new event, nothing, or a reason it has
 * drifted too far for the change to reach it. Only blueprints with tiles have placements to know groups by.
 * @param {CopyPlanInput} input What the change is planned with.
 * @returns {{ events: RmmzMapEvent[], drifted: DriftedCopy[] }} The copies' new events, by id, and those drifted.
 */
const planEvents = (input: CopyPlanInput): { events: RmmzMapEvent[]; drifted: DriftedCopy[] } =>
{
  const { change, ground, spots, stamp, tags } = input;
  if (change.events.length === 0)
  {
    return { events: [], drifted: [] };
  }

  const copies = copiesOf(ground.events, change.blueprintId);
  const groups = stamp.tiles === null
    ? []
    : spots.map(spot => groupOf(spot, change.before.events, copies));
  const events: RmmzMapEvent[] = [];
  const drifted: DriftedCopy[] = [];
  change.events.forEach(eventChange =>
  {
    copies.filter(copy => copy.link.eventId === eventChange.before.id).forEach(copy =>
    {
      const references = groupFor(copy, groups);
      const planned = planCopyChange(eventChange, copy.event, references === undefined ? { tags } : { tags, references });
      if (planned.kind === 'changes')
      {
        events.push(planned.event);
      }
      else if (planned.kind === 'drifted')
      {
        drifted.push({ eventId: copy.event.id, reason: planned.reason });
      }
    });
  });

  return { events: events.sort((left, right) => left.id - right.id), drifted: drifted.sort((left, right) => left.eventId - right.eventId) };
};

/**
 * Keeps the tile changes that fall inside the part of the blueprint a placement put down: the rest were never on the map.
 * @param {readonly BlueprintCellChange[]} cells The changes, counted inside the blueprint.
 * @param {BlueprintSpot} spot The placement.
 * @param {Stamp} stamp The blueprint's stamp, for its size.
 * @returns {BlueprintCellChange[]} The changes inside the part placed.
 */
const cellsWentDown = (cells: readonly BlueprintCellChange[], spot: BlueprintSpot, stamp: Stamp): BlueprintCellChange[] =>
{
  const placed = cellsPlaced(spot, stamp);
  return cells.filter(cell => rectContains(placed, { x: spot.x + cell.dx, y: spot.y + cell.dy }));
};

/**
 * Plans the change to the blueprint's tiles on every placement of it on the map. Each placement is first checked against
 * the blueprint as it stood before the change (see checkPlacement), on the map as it stands, and one no longer where the
 * record says is never repainted. Each one in place has the cells it put down follow the tile cell rule (see
 * followTiles), one placement after another on one working copy of the map's tiles, so placements that overlap see each
 * other's cells and no cell is written twice.
 * @param {CopyPlanInput} input What the change is planned with.
 * @returns {{ tiles: CellChange[], lost: LostPlacement[] }} The cells to write, each once, and the placements left alone.
 */
const planTiles = (input: CopyPlanInput): { tiles: CellChange[]; lost: LostPlacement[] } =>
{
  const { change, ground, spots, stamp, mode } = input;
  if (change.cells.length === 0 || stamp.tiles === null || spots.length === 0)
  {
    return { tiles: [], lost: [] };
  }

  const working: TileGrid = { width: ground.width, height: ground.height, cells: Uint16Array.from(ground.cells) };
  const lost: LostPlacement[] = [];
  spots.forEach(spot =>
  {
    const problem = placementProblem(checkPlacement(ground, spot, stamp));
    if (problem !== null)
    {
      lost.push({ spot, reason: problem });
      return;
    }

    followTiles(working, spot, cellsWentDown(change.cells, spot, stamp), mode).writes.forEach(([ index, value ]) =>
    {
      working.cells[index] = value;
    });
  });

  // every cell the working copy now holds otherwise than the map is written, once.
  const tiles: CellChange[] = [];
  working.cells.forEach((value, index) =>
  {
    if (ground.cells[index] !== value)
    {
      tiles.push([ index, value ]);
    }
  });

  return { tiles, lost };
};

/**
 * Plans what one step's change to a blueprint comes to on one map: its tiles on every placement the record holds there,
 * and every copy of its events, by the field model (see planCopyChange and followTiles). A copy that has drifted too far,
 * and a placement no longer where it was, are never changed; each is named with why. Everything else of the map, every
 * other blueprint's copies included, is left exactly as it is. Which maps are planned at all is the caller's to say, and
 * nothing here writes.
 * @param {CopyPlanInput} input The change, the blueprint's stamp before it, the map with its placements of the blueprint,
 * its tileset mode, and the tags the modules read.
 * @returns {MapCopyPlan} What the map takes.
 */
const planCopiesOnMap = (input: CopyPlanInput): MapCopyPlan =>
{
  const { tiles, lost } = planTiles(input);
  const { events, drifted } = planEvents(input);
  return { tiles, events, drifted, lost };
};

/**
 * Reports whether a plan changes nothing on its map.
 * @param {MapCopyPlan} plan The plan.
 * @returns {boolean} True when it writes no cell and no event.
 */
const changesNothing = (plan: MapCopyPlan): boolean =>
{
  return plan.tiles.length === 0 && plan.events.length === 0;
};

export { changesNothing, copiesOf, planCopiesOnMap };
export type { CopyGround, CopyPlanInput, DriftedCopy, LostPlacement, MapCopy, MapCopyPlan };
