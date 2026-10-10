import { MapEditorApiError } from '../api/MapEditorApi.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { Stamp } from '../stamps/stamp.ts';
import type { BlueprintCopy } from './blueprintCopies.ts';
import { ownNoteOf, type CommentTagDefinition } from './blueprintFields.ts';
import { blueprintLinkOf } from './blueprintLink.ts';
import type { Blueprint } from './blueprints.ts';
import { cellsPlaced, type BlueprintSpot, type PlacedPart, type PlacedSpot } from './blueprintUses.ts';
import { pagesWords } from './copyChanges.ts';
import { copyGroupOf, type CopyGround } from './copyPlans.ts';
import { differencesOf, readCopy } from './copyReading.ts';
import { markWords } from './copyWords.ts';
import { checkPlacement, placementProblem } from './placementMatch.ts';

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
 * What a look at a map a blueprint is used on came to: still on its way; the map, its tiles and its events, to check each
 * placement and copy against; gone, deleted outside the editor; or not to be read, with why.
 */
type LookedMap =
  | { readonly kind: 'looking' }
  | { readonly kind: 'looked'; readonly ground: CopyGround }
  | { readonly kind: 'gone' }
  | { readonly kind: 'unreadable'; readonly message: string };

/**
 * Where one copy of a blueprint's events stands, for the where-used list: still being checked; following its blueprint;
 * drifted too far for a change to reach, with why, in words for the author; or not to be told, with why.
 */
type CopyStanding =
  | { readonly kind: 'checking' }
  | { readonly kind: 'following' }
  | { readonly kind: 'drifted'; readonly reason: string }
  | { readonly kind: 'unknown'; readonly reason: string };

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
 * Works out where one copy of a blueprint's events stands, from a look at its map: drifted when no change can reach it as
 * it stands (its page count is not its blueprint event's, the blueprint keeps no such event, or its note would read
 * otherwise without its link), or when the last change to the blueprint could not reach it, for the reason it gave; and
 * following otherwise. A copy no longer on its map as a copy of this blueprint stands nowhere it can be told.
 * @param {LookedMap | undefined} looked The look at the copy's map, or undefined before one was asked for.
 * @param {number} eventId The copy's id on its map.
 * @param {Stamp} stamp The blueprint's stamp.
 * @param {string} blueprintId The blueprint's id.
 * @param {string | null} lastReason Why the last change to the blueprint could not reach the copy, or null when it did.
 * @returns {CopyStanding} Where it stands.
 */
const copyStandingOf = (looked: LookedMap | undefined, eventId: number, stamp: Stamp, blueprintId: string, lastReason: string | null): CopyStanding =>
{
  if (looked === undefined || looked.kind === 'looking')
  {
    return { kind: 'checking' };
  }

  if (looked.kind !== 'looked')
  {
    return { kind: 'unknown', reason: looked.kind === 'gone' ? 'the map is gone' : `the map could not be read (${looked.message})` };
  }

  const copy = looked.ground.events[eventId] ?? null;
  const link = copy === null ? null : blueprintLinkOf(copy.note);
  if (copy === null || link === null || link.blueprintId !== blueprintId)
  {
    return { kind: 'unknown', reason: 'it is no longer a copy of this blueprint' };
  }

  const source = stamp.events.find(event => event.id === link.eventId) ?? null;
  if (source === null)
  {
    return { kind: 'drifted', reason: 'its blueprint keeps no such event any more' };
  }

  if (copy.pages.length !== source.pages.length)
  {
    return { kind: 'drifted', reason: `it has ${pagesWords(copy.pages.length)} and its blueprint has ${pagesWords(source.pages.length)}` };
  }

  try
  {
    ownNoteOf(copy);
  }
  catch (error)
  {
    return { kind: 'drifted', reason: `in its note, ${(error as Error).message}` };
  }

  return lastReason === null
    ? { kind: 'following' }
    : { kind: 'drifted', reason: lastReason };
};

/**
 * Says how far one copy of a blueprint's events stands apart from its blueprint, for the where-used list to mark beside
 * it, so a copy that stopped following in some fields is never silent: how many of its choices were set by hand and how
 * many of its numbers are pinned, and whether it keeps commands naming other events of the blueprint, read against the
 * blueprint as a change to it would read them (see readCopy), its group known by the blueprint's placements on its map,
 * in the words the copy's own panel uses (see copyWords' markWords). A number at an offset still follows, and is not
 * counted. A copy not yet looked at, no longer a copy of this blueprint, or not to be read field by field, is marked with
 * nothing: the list says on its own why such a copy no longer follows.
 * @param {LookedMap | undefined} looked The look at the copy's map, or undefined before one was asked for.
 * @param {number} eventId The copy's id on its map.
 * @param {Blueprint} blueprint The blueprint.
 * @param {readonly CommentTagDefinition[]} tags The tags the active modules read from comments as fields.
 * @param {readonly BlueprintSpot[]} spots The placements the record holds on the copy's map.
 * @returns {string} The words, such as "2 fields set by hand, 1 pinned"; empty when there is nothing to mark.
 */
const copyMarkOf = (
  looked: LookedMap | undefined,
  eventId: number,
  blueprint: Blueprint,
  tags: readonly CommentTagDefinition[],
  spots: readonly BlueprintSpot[],
): string =>
{
  if (looked === undefined || looked.kind !== 'looked')
  {
    return '';
  }

  const { events } = looked.ground;
  const copy = events[eventId] ?? null;
  const link = copy === null ? null : blueprintLinkOf(copy.note);
  if (copy === null || link === null || link.blueprintId !== blueprint.id)
  {
    return '';
  }

  // the copy's group is found on the very map it was looked at on.
  const references = copyGroupOf(events, copy, blueprint.stamp, spots);
  const reading = readCopy(copy, {
    blueprint: blueprintId => (blueprintId === blueprint.id ? blueprint : null),
    tags,
    ...(references === undefined ? {} : { references }),
  });
  return reading.kind === 'read'
    ? markWords(differencesOf(reading.fields))
    : '';
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

export { copyMarkOf, copyStandingOf, lookFailure, placementMiddle, standingOf, whereUsed };
export type { CopyStanding, LookedMap, MapUse, PlacementStanding, UsedSpot };
