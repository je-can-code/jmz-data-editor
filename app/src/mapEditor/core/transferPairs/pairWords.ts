import { landingWords, type LandingProblem } from '../locations/landingCheck.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { PairMap, PairPicks, PairPlan } from './pairPlans.ts';
import type { EdgeStrip } from './pairShapes.ts';

/**
 * What placing transfers says under the two maps: what to do next, or what the picks place, and whether that is a
 * problem the author must put right before anything can be placed.
 */
type PairReadout = {
  readonly text: string;
  readonly problem: boolean;
};

/**
 * Words a tile as the author reads one.
 * @param {MapCell} cell The tile.
 * @returns {string} The words, such as "14, 6".
 */
const tileWords = (cell: MapCell): string =>
{
  return `${cell.x}, ${cell.y}`;
};

/**
 * Says what the author should pick next, or null when every pick the kind needs is made.
 * @param {PairPicks} picks What the author picked.
 * @param {PairMap | null} far The map the transfer leads to, or null while none is chosen.
 * @returns {string | null} What to do next, or null.
 */
const nextPickWords = (picks: PairPicks, far: PairMap | null): string | null =>
{
  if (far === null)
  {
    return 'Choose the map the transfer leads to.';
  }

  const { kind, ways, door, exit, strip, landing } = picks;
  if (kind === 'door' && door === null)
  {
    return 'Click the door\'s tile on the left map.';
  }

  if (kind === 'edge' && strip === null)
  {
    return 'Drag along the left map\'s edge where the player walks off it.';
  }

  if (ways === 'one' && landing === null)
  {
    return 'Click where the player lands on the right map.';
  }

  return kind === 'door' && ways === 'both' && exit === null
    ? 'Click the way out on the right map: the dip in the wall the player leaves by. They arrive one tile north of it.'
    : null;
};

/**
 * Says where a planned end sends the player, as the readout lists it.
 * @param {PairPlan} plan The plan.
 * @param {number} index Which end.
 * @param {(mapId: number) => string} mapName Names a map.
 * @returns {string} The words, such as "lands on 8, 14 in Entrance".
 */
const landsWords = (plan: PairPlan, index: number, mapName: (mapId: number) => string): string =>
{
  const { destination } = plan.ends[index];
  return `lands on ${tileWords(destination)} in ${mapName(destination.mapId)}`;
};

/**
 * Names the end a planned transfer leaves by, as the readout starts with it: the door, or the strip along an edge.
 * @param {PairPicks} picks What the author picked, which a plan was made from, so the door or the strip is picked.
 * @returns {string} The words, such as "The door on 14, 6".
 */
const startWords = (picks: PairPicks): string =>
{
  if (picks.kind === 'door')
  {
    return `The door on ${tileWords(picks.door as MapCell)}`;
  }

  const strip = picks.strip as EdgeStrip;
  return `The ${strip.length}-tile strip along the ${strip.edge} edge`;
};

/**
 * Says what a complete plan places, end by end: the door or the strip, where it sends the player, and the way back.
 * @param {PairPicks} picks What the author picked.
 * @param {PairPlan} plan What the picks place.
 * @param {(mapId: number) => string} mapName Names a map.
 * @returns {string} The words.
 */
const planWords = (picks: PairPicks, plan: PairPlan, mapName: (mapId: number) => string): string =>
{
  const { kind, exit } = picks;
  const there = `${startWords(picks)} ${landsWords(plan, 0, mapName)}`;
  if (plan.ends.length === 1)
  {
    return `${there}. No way back is placed.`;
  }

  // a door planned both ways has its way out picked.
  const back = kind === 'door'
    ? `the way out on ${tileWords(exit as MapCell)}`
    : 'the strip on the other edge';
  return `${there}; ${back} ${landsWords(plan, 1, mapName)}.`;
};

/**
 * Says why the player cannot land where a planned end sends them, as the readout and a refusal word it.
 * @param {MapCell} cell Where it sends them.
 * @param {string} mapName The map it sends them to.
 * @param {LandingProblem} problem Why they cannot land there.
 * @returns {string} The words.
 */
const landingRefusalWords = (cell: MapCell, mapName: string, problem: LandingProblem): string =>
{
  return `The player can't land on ${tileWords(cell)} in ${mapName}. ${landingWords(problem)}`;
};

/**
 * Says what placing transfers holds under the maps: what to pick next; or what the picks place; or why the player could
 * not land where an end sends them, as the maps stand, which nothing is placed over.
 * @param {PairPicks} picks What the author picked.
 * @param {PairMap | null} far The map the transfer leads to, or null while none is chosen.
 * @param {PairPlan | null} plan What the picks place, or null while a pick is missing.
 * @param {readonly (LandingProblem | null)[]} problems Why the player cannot land where each end sends them, in the plan's
 * order, null where they can or where it is not judged yet.
 * @param {(mapId: number) => string} mapName Names a map.
 * @returns {PairReadout} The words.
 */
const pairReadout = (
  picks: PairPicks,
  far: PairMap | null,
  plan: PairPlan | null,
  problems: readonly (LandingProblem | null)[],
  mapName: (mapId: number) => string,
): PairReadout =>
{
  const next = nextPickWords(picks, far);
  if (next !== null)
  {
    return { text: next, problem: false };
  }

  // with every pick its kind needs made, the picks always plan something.
  const planned = plan as PairPlan;
  const failing = planned.ends.findIndex((_end, index) => (problems[index] ?? null) !== null);
  if (failing >= 0)
  {
    const { destination } = planned.ends[failing];
    return { text: landingRefusalWords(destination, mapName(destination.mapId), problems[failing] as LandingProblem), problem: true };
  }

  return { text: planWords(picks, planned, mapName), problem: false };
};

/**
 * Says what was placed, once it was, for the window's notice.
 * @param {PairPicks} picks What the author picked.
 * @returns {string} The words.
 */
const placedWords = (picks: PairPicks): string =>
{
  if (picks.ways === 'one')
  {
    return picks.kind === 'door' ? 'One-way door placed.' : 'One-way edge placed.';
  }

  return picks.kind === 'door' ? 'Door pair placed.' : 'Edge pair placed.';
};

export { landingRefusalWords, pairReadout, placedWords, tileWords };
export type { PairReadout };
