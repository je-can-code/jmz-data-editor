import { MapEditorApiError } from '../api/MapEditorApi.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { Stamp } from '../stamps/stamp.ts';
import type { BlueprintCopy } from './blueprintCopies.ts';
import { cellsPlaced, type PlacedPart, type PlacedSpot } from './blueprintUses.ts';
import { checkPlacement, placementProblem, type PlacementGround } from './placementMatch.ts';

/**
 * One placement in the where-used list: the cell its corner was put down at, and the part of its blueprint it put down
 * when the map's edge cut some off.
 */
type UsedSpot = MapCell & { readonly placed?: PlacedPart };

/**
 * Where one blueprint is used on one map: the spots its tiles were placed at, and the events on the map that are copies
 * of its events.
 */
type MapUse = {
  readonly mapId: number;
  readonly spots: readonly UsedSpot[];
  readonly eventIds: readonly number[];
};

/**
 * What a look at a map a placement stands on came to: still on its way; the map, to check the placement against; gone,
 * deleted outside the editor; or not to be read, with why.
 */
type LookedMap =
  | { readonly kind: 'looking' }
  | { readonly kind: 'looked'; readonly ground: PlacementGround }
  | { readonly kind: 'gone' }
  | { readonly kind: 'unreadable'; readonly message: string };

/**
 * Where one placement stands, for the where-used list: still being checked; where the record says; no longer there, with
 * why, which the author can act on by forgetting it; or not to be told, with why, which waiting or fixing the map may
 * mend.
 */
type PlacementStanding =
  | { readonly kind: 'checking' }
  | { readonly kind: 'in-place' }
  | { readonly kind: 'lost'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string };

/**
 * Lists where one blueprint is used, map by map: the spots its tiles were placed at, row by row, each with its part
 * placed when it has one, and the events copied from its events, by id.
 * @param {readonly PlacedSpot[]} spots The blueprint's placements.
 * @param {readonly BlueprintCopy[]} copies The blueprint's event copies.
 * @returns {MapUse[]} Every map it is used on, by map id.
 */
const whereUsed = (spots: readonly PlacedSpot[], copies: readonly BlueprintCopy[]): MapUse[] =>
{
  const mapIds = [ ...new Set([ ...spots.map(spot => spot.mapId), ...copies.map(copy => copy.mapId) ]) ].sort((left, right) => left - right);
  return mapIds.map(mapId => ({
    mapId,
    spots: spots
      .filter(spot => spot.mapId === mapId)
      .sort((left, right) => left.y - right.y || left.x - right.x)
      .map(({ x, y, placed }) => (placed === undefined ? { x, y } : { x, y, placed })),
    eventIds: copies
      .filter(copy => copy.mapId === mapId)
      .map(copy => copy.eventId)
      .sort((left, right) => left - right),
  }));
};

/**
 * Reads what a failed look at a map says of it: a map whose file the server no longer has is gone; anything else kept
 * the map from being read, which says nothing about whether it is there.
 * @param {unknown} error What the look threw.
 * @returns {LookedMap} What the look came to.
 */
const lookFailure = (error: unknown): LookedMap =>
{
  if (error instanceof MapEditorApiError && error.status === 404)
  {
    return { kind: 'gone' };
  }

  return { kind: 'unreadable', message: error instanceof Error ? error.message : String(error) };
};

/**
 * Works out where one placement stands, from a look at its map: checked against its blueprint (see
 * {@link checkPlacement}) once the map is there to check, by the cells its tiles went down on, and no longer where it was
 * when the map itself is gone.
 * @param {LookedMap | undefined} looked The look at the placement's map, or undefined before one was asked for.
 * @param {UsedSpot} spot Where the record says the placement's top-left corner sits, and its part placed.
 * @param {Stamp} stamp The blueprint's stamp.
 * @returns {PlacementStanding} Where it stands.
 */
const standingOf = (looked: LookedMap | undefined, spot: UsedSpot, stamp: Stamp): PlacementStanding =>
{
  if (looked === undefined || looked.kind === 'looking')
  {
    return { kind: 'checking' };
  }

  if (looked.kind === 'gone')
  {
    return { kind: 'lost', reason: 'the map is gone' };
  }

  if (looked.kind === 'unreadable')
  {
    return { kind: 'unknown', reason: `the map could not be read (${looked.message})` };
  }

  const problem = placementProblem(checkPlacement(looked.ground, spot, stamp));
  return problem === null
    ? { kind: 'in-place' }
    : { kind: 'lost', reason: problem };
};

/**
 * Finds the cell to centre on to show a placement: the middle of the cells its tiles went down on, as near as a cell can
 * be, so one hanging over the map's edge is shown by the part on the map.
 * @param {UsedSpot} spot Where its top-left corner sits, and its part placed.
 * @param {{ width: number, height: number }} size How far its blueprint reaches.
 * @returns {MapCell} The cell.
 */
const placementMiddle = (spot: UsedSpot, size: { readonly width: number; readonly height: number }): MapCell =>
{
  const cells = cellsPlaced(spot, size);
  return { x: cells.x + Math.floor(cells.width / 2), y: cells.y + Math.floor(cells.height / 2) };
};

export { lookFailure, placementMiddle, standingOf, whereUsed };
export type { LookedMap, MapUse, PlacementStanding, UsedSpot };
