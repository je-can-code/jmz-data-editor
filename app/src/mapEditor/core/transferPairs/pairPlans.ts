import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { MapCell, MapSize } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import type { DoorLook } from './doorSprites.ts';
import { doorEvent, exitEvent, stripEvent, transferName, type Destination, type TransferSounds } from './pairEvents.ts';
import {
  arrivalThrough,
  facingLeaving,
  insideArrival,
  outsideArrival,
  partnerStrip,
  stripRect,
  type EdgeStrip,
} from './pairShapes.ts';

/**
 * The two kinds of transfer the editor places, from the author's habits: a door into a building, the way out inside being
 * a dip in the bottom wall the player walks onto; and a map's edge, a strip the player walks off into the next map.
 */
type PairKind = 'door' | 'edge';

/**
 * Whether a transfer is placed with its way back on the other map, or alone, as a point of no return is.
 */
type PairWays = 'both' | 'one';

/**
 * One of the two maps a transfer joins: its id, its name, which the transfer leading to it is named by, and its size.
 */
type PairMap = {
  readonly mapId: number;
  readonly name: string;
  readonly size: MapSize;
};

/**
 * What the author has picked so far, on the map the transfer leaves from and on the map it leads to. Each kind keeps its
 * own picks, so switching kinds and back loses nothing:
 * - the door's tile, and the exit's tile inside, for a door both ways;
 * - the strip along an edge, and the strip it pairs with on the other map, for an edge both ways, the other strip centred
 *   on the opposite edge until the author moves it;
 * - for either kind one way, the door or the strip, and the tile the player lands on.
 */
type PairPicks = {
  readonly kind: PairKind;
  readonly ways: PairWays;
  readonly door: MapCell | null;
  readonly exit: MapCell | null;
  readonly strip: EdgeStrip | null;
  readonly partner: EdgeStrip | null;
  readonly landing: MapCell | null;
};

/**
 * How the transfers placed look and sound: the door's picture, and the door's creak and the sound of passing through.
 */
type PairLooks = {
  readonly door: DoorLook;
  readonly sounds: TransferSounds;
};

/**
 * One end of a transfer about to be placed: the map it stands on, the tiles it covers, where it sends the player, and the
 * event itself, built once the map gives it an id.
 */
type PlannedEnd = {
  readonly mapId: number;
  readonly area: CellRect;
  readonly destination: Destination;
  readonly eventFor: (id: number) => RmmzMapEvent;
};

/**
 * Everything one placement makes: what the history calls it, and its ends, the one on the map it leaves from first.
 */
type PairPlan = {
  readonly label: string;
  readonly ends: readonly PlannedEnd[];
};

/**
 * Nothing picked yet, on either map.
 */
const NO_PICKS: PairPicks = { kind: 'door', ways: 'both', door: null, exit: null, strip: null, partner: null, landing: null };

/**
 * Finds the strip a pair's other end stands on: the one the author moved it to, or else the one centred on the opposite
 * edge of the other map.
 * @param {PairPicks} picks What the author picked.
 * @param {MapSize} size The other map's size.
 * @returns {EdgeStrip | null} The strip, or null while the first strip is not picked.
 */
const partnerOf = (picks: PairPicks, size: MapSize): EdgeStrip | null =>
{
  if (picks.strip === null)
  {
    return null;
  }

  return picks.partner ?? partnerStrip(picks.strip, size);
};

/**
 * Makes one tile into the area an event standing there covers.
 * @param {MapCell} cell The tile.
 * @returns {CellRect} The area.
 */
const tileArea = (cell: MapCell): CellRect =>
{
  return { x: cell.x, y: cell.y, width: 1, height: 1 };
};

/**
 * Plans a door into a building and its way out: the door outside sends the player to the tile north of the exit, facing
 * up, and the exit sends them back to the tile below the door, facing down.
 * @param {PairMap} near The map the door stands on.
 * @param {MapCell} door The door's tile.
 * @param {PairMap} far The map inside.
 * @param {MapCell} exit The exit's tile.
 * @param {PairLooks} looks How they look and sound.
 * @returns {PairPlan} The plan.
 */
const doorPairPlan = (near: PairMap, door: MapCell, far: PairMap, exit: MapCell, looks: PairLooks): PairPlan =>
{
  const inside: Destination = { mapId: far.mapId, ...insideArrival(exit), facing: 8 };
  const outside: Destination = { mapId: near.mapId, ...outsideArrival(door), facing: 2 };
  return {
    label: 'Place door pair',
    ends: [
      { mapId: near.mapId, area: tileArea(door), destination: inside, eventFor: id => doorEvent(id, door, transferName(far.name), looks.door, looks.sounds, inside) },
      { mapId: far.mapId, area: tileArea(exit), destination: outside, eventFor: id => exitEvent(id, exit, transferName(near.name), looks.sounds.movement, outside) },
    ],
  };
};

/**
 * Plans a pair of edge strips: each sends the player one tile in from the other's edge, at its middle, facing the way
 * they walked.
 * @param {PairMap} near The map the first strip runs along.
 * @param {EdgeStrip} strip The first strip.
 * @param {PairMap} far The other map.
 * @param {EdgeStrip} partner The strip on the other map.
 * @param {PairLooks} looks How they sound.
 * @returns {PairPlan} The plan.
 */
const edgePairPlan = (near: PairMap, strip: EdgeStrip, far: PairMap, partner: EdgeStrip, looks: PairLooks): PairPlan =>
{
  const across: Destination = { mapId: far.mapId, ...arrivalThrough(partner, far.size), facing: facingLeaving(strip.edge) };
  const back: Destination = { mapId: near.mapId, ...arrivalThrough(strip, near.size), facing: facingLeaving(partner.edge) };
  const nearArea = stripRect(strip, near.size);
  const farArea = stripRect(partner, far.size);
  const { movement } = looks.sounds;
  return {
    label: 'Place edge pair',
    ends: [
      { mapId: near.mapId, area: nearArea, destination: across, eventFor: id => stripEvent(id, nearArea, transferName(far.name), movement, across) },
      { mapId: far.mapId, area: farArea, destination: back, eventFor: id => stripEvent(id, farArea, transferName(near.name), movement, back) },
    ],
  };
};

/**
 * Plans a door alone, with no way back: it sends the player to the tile picked, facing up, as a door into a building does.
 * @param {PairMap} near The map the door stands on.
 * @param {MapCell} door The door's tile.
 * @param {PairMap} far The map it leads to.
 * @param {MapCell} landing Where the player lands.
 * @param {PairLooks} looks How it looks and sounds.
 * @returns {PairPlan} The plan.
 */
const oneWayDoorPlan = (near: PairMap, door: MapCell, far: PairMap, landing: MapCell, looks: PairLooks): PairPlan =>
{
  const destination: Destination = { mapId: far.mapId, ...landing, facing: 8 };
  return {
    label: 'Place one-way door',
    ends: [ { mapId: near.mapId, area: tileArea(door), destination, eventFor: id => doorEvent(id, door, transferName(far.name), looks.door, looks.sounds, destination) } ],
  };
};

/**
 * Plans an edge strip alone, with no way back: it sends the player to the tile picked, facing the way they walked off.
 * @param {PairMap} near The map the strip runs along.
 * @param {EdgeStrip} strip The strip.
 * @param {PairMap} far The map it leads to.
 * @param {MapCell} landing Where the player lands.
 * @param {PairLooks} looks How it sounds.
 * @returns {PairPlan} The plan.
 */
const oneWayEdgePlan = (near: PairMap, strip: EdgeStrip, far: PairMap, landing: MapCell, looks: PairLooks): PairPlan =>
{
  const destination: Destination = { mapId: far.mapId, ...landing, facing: facingLeaving(strip.edge) };
  const area = stripRect(strip, near.size);
  return {
    label: 'Place one-way edge',
    ends: [ { mapId: near.mapId, area, destination, eventFor: id => stripEvent(id, area, transferName(far.name), looks.sounds.movement, destination) } ],
  };
};

/**
 * Plans what the author's picks place, once they are complete: the kind and ways chosen, with the picks each needs.
 * @param {PairPicks} picks What the author picked.
 * @param {PairMap} near The map the transfer leaves from.
 * @param {PairMap} far The map it leads to.
 * @param {PairLooks} looks How it looks and sounds.
 * @returns {PairPlan | null} The plan, or null while a pick it needs is missing.
 */
const pairPlanOf = (picks: PairPicks, near: PairMap, far: PairMap, looks: PairLooks): PairPlan | null =>
{
  const { kind, ways, door, exit, strip, landing } = picks;
  if (kind === 'door' && door !== null)
  {
    if (ways === 'both')
    {
      return exit === null ? null : doorPairPlan(near, door, far, exit, looks);
    }

    return landing === null ? null : oneWayDoorPlan(near, door, far, landing, looks);
  }

  if (kind === 'edge' && strip !== null)
  {
    if (ways === 'both')
    {
      return edgePairPlan(near, strip, far, partnerOf(picks, far.size) as EdgeStrip, looks);
    }

    return landing === null ? null : oneWayEdgePlan(near, strip, far, landing, looks);
  }

  return null;
};

export { NO_PICKS, pairPlanOf, partnerOf };
export type { PairKind, PairLooks, PairMap, PairPicks, PairPlan, PairWays, PlannedEnd };
