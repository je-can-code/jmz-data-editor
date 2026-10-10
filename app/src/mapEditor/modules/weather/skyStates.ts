import { isDataKey, type SkyConfig, type SkyFace, type SkySeason, type SkyType } from './skyConfig.ts';
import { entryOf } from './weatherConfig.ts';

/**
 * The seasons' names as the sky block is written with them, by the season id J-TIME numbers them with
 * (SkyStates.Seasons).
 */
const SKY_SEASONS: readonly string[] = [ 'spring', 'summer', 'autumn', 'winter' ];

/**
 * The strengths the sky can be at, weakest first (SkyStates.Ladder): the order is what a strength is measured by.
 */
const SKY_LADDER: readonly string[] = [ 'light', 'moderate', 'heavy' ];

/**
 * The strength the sky's walk starts from, its middle rung (SkyForecast.lastState), which the editor gives a condition
 * picked with no strength wanted.
 */
const [ , USUAL_STRENGTH ] = SKY_LADDER;

/**
 * The answer to how far one condition is from another when there is no route at all (SkyWalk.Unreachable).
 */
const UNREACHABLE = -1;

/**
 * One condition the sky could move to next, and how much the graph wants it (a candidate of SkyWalk.candidatesFor).
 */
type SkyCandidate = {
  readonly type: string;
  readonly weight: number;
};

/**
 * Names a season by its id, as the sky block is written (SkyStates.seasonNameOf).
 * @param {number} seasonId The season id, 0 to 3.
 * @returns {string} The lowercase name, or empty text for an id off the calendar.
 */
const skySeasonName = (seasonId: number): string =>
{
  return SKY_SEASONS[seasonId] ?? '';
};

/**
 * Finds one condition's block (SkyStates.typeOf), the file's notes among the conditions being none.
 * @param {SkyConfig} sky The sky.
 * @param {string} typeName The condition.
 * @returns {SkyType | null} Its block, or null when the sky has no such condition.
 */
const skyTypeOf = (sky: SkyConfig, typeName: string): SkyType | null =>
{
  return isDataKey(typeName)
    ? entryOf(sky.types, typeName) ?? null
    : null;
};

/**
 * Finds one season's block, by its lowercase name.
 * @param {SkyConfig} sky The sky.
 * @param {string} seasonName The season.
 * @returns {SkySeason | null} Its block, or null for a season the sky does not list.
 */
const skySeasonOf = (sky: SkyConfig, seasonName: string): SkySeason | null =>
{
  return entryOf(sky.seasons, seasonName) ?? null;
};

/**
 * Lists the conditions a season allows the sky to be in at all (SkyStates.allowedIn): seasons hard-gate the sky, as it
 * never snows in a summer that does not allow snow.
 * @param {SkyConfig} sky The sky.
 * @param {string} seasonName The season.
 * @returns {readonly string[]} The conditions, none for a season the sky does not list.
 */
const allowedIn = (sky: SkyConfig, seasonName: string): readonly string[] =>
{
  return skySeasonOf(sky, seasonName)?.allowed ?? [];
};

/**
 * Reads what a month leans toward, as multipliers of the graph's weights by condition (SkyWalk.leanOf): a season says
 * what is possible, and a month what is likely within it. A month the sky names nothing for leans nowhere.
 * @param {SkyConfig} sky The sky.
 * @param {number} month The month, 1 to 12.
 * @returns {Readonly<Record<string, number>>} The multipliers, by condition.
 */
const monthLeanOf = (sky: SkyConfig, month: number): Readonly<Record<string, number>> =>
{
  const { months } = sky;
  if (months === undefined)
  {
    return {};
  }

  return entryOf(months, String(month)) ?? {};
};

/**
 * Reads how much a month wants one condition (SkyWalk.multiplierFor): its lean's multiplier for it, or one, leaving the
 * graph as authored, when the month names it not; nothing at all for a month that wants none of it, which is how a
 * condition ends rather than fades.
 * @param {SkyConfig} sky The sky.
 * @param {number} month The month, 1 to 12.
 * @param {string} typeName The condition.
 * @returns {number} The multiplier.
 */
const monthMultiplierFor = (sky: SkyConfig, month: number, typeName: string): number =>
{
  return entryOf(monthLeanOf(sky, month), typeName) ?? 1;
};

/**
 * Reports whether the sky can be in a condition at all in a month of a season: the season must allow it, and the month
 * must want some of it, since the walk never rolls into a condition a month weighs at nothing, nor stays in one, and a
 * season's last day only ever steers on from what the day before rolled.
 * @param {SkyConfig} sky The sky.
 * @param {string} typeName The condition.
 * @param {string} seasonName The season.
 * @param {number} month The month, 1 to 12.
 * @returns {boolean} True when the sky can be in it then.
 */
const isPossibleIn = (sky: SkyConfig, typeName: string, seasonName: string, month: number): boolean =>
{
  return allowedIn(sky, seasonName).includes(typeName) && monthMultiplierFor(sky, month, typeName) > 0;
};

/**
 * Lists the strengths a condition is ever drawn at (SkyStates.intensitiesOf): those it names, or the whole ladder.
 * @param {SkyConfig} sky The sky.
 * @param {string} typeName The condition.
 * @returns {readonly string[]} The strengths.
 */
const intensitiesOf = (sky: SkyConfig, typeName: string): readonly string[] =>
{
  return skyTypeOf(sky, typeName)?.intensities ?? SKY_LADDER;
};

/**
 * Picks which of a condition's strengths sits nearest a rung of the ladder (SkyStates.nearestRung): strictly nearer
 * wins, so a tie keeps the weaker, the sky understating rather than overstating.
 * @param {readonly string[]} permitted The strengths the condition is ever at.
 * @param {number} wanted The rung reached for.
 * @returns {string} The nearest strength.
 */
const nearestRung = (permitted: readonly string[], wanted: number): string =>
{
  let [ closest ] = permitted;
  let shortest = Number.MAX_SAFE_INTEGER;
  permitted.forEach(rung =>
  {
    const distance = Math.abs(SKY_LADDER.indexOf(rung) - wanted);
    if (distance < shortest)
    {
      shortest = distance;
      closest = rung;
    }
  });

  return closest;
};

/**
 * Pulls a strength into the range a condition is ever drawn at (SkyStates.clampIntensity): the nearest of its strengths,
 * or its first for a strength off the ladder.
 * @param {SkyConfig} sky The sky.
 * @param {string} typeName The condition.
 * @param {string} intensity The strength wanted.
 * @returns {string} A strength the condition is drawn at.
 */
const clampIntensity = (sky: SkyConfig, typeName: string, intensity: string): string =>
{
  const permitted = intensitiesOf(sky, typeName);
  const wanted = SKY_LADDER.indexOf(intensity);
  return wanted === -1
    ? permitted[0]
    : nearestRung(permitted, wanted);
};

/**
 * Reports whether one face applies at a season and a phase of the day (SkyStates.faceMatches): a key the face leaves out
 * matches every value of it.
 * @param {SkyFace} face The face.
 * @param {string} seasonName The season.
 * @param {number} phaseId The phase of the day, 0 to 5.
 * @returns {boolean} True when it applies.
 */
const faceMatches = (face: SkyFace, seasonName: string, phaseId: number): boolean =>
{
  if (face.seasons !== undefined && face.seasons.includes(seasonName) === false)
  {
    return false;
  }

  return face.phases === undefined || face.phases.includes(phaseId);
};

/**
 * Finds the look a condition wears at a season and a phase of the day (SkyStates.faceFor): the first of its faces that
 * applies, in the order written, or its own look when none does or it has none, such as a clear sky's starfall at night
 * and its fireflies on a summer night, the summer rule written first.
 * @param {SkyConfig} sky The sky.
 * @param {string} typeName The condition.
 * @param {string} seasonName The season.
 * @param {number} phaseId The phase of the day, 0 to 5.
 * @returns {string} The look, or empty text for a condition the sky does not have.
 */
const faceFor = (sky: SkyConfig, typeName: string, seasonName: string, phaseId: number): string =>
{
  const type = skyTypeOf(sky, typeName);
  if (type === null)
  {
    return '';
  }

  const match = type.faces?.find(face => faceMatches(face, seasonName, phaseId));
  return match === undefined
    ? type.preset
    : match.preset;
};

/**
 * Lists every condition a season allows, wanted equally (SkyWalk.anyOf).
 * @param {SkySeason} season The season.
 * @returns {SkyCandidate[]} The candidates.
 */
const anyOf = (season: SkySeason): SkyCandidate[] =>
{
  return season.allowed.map(type => ({ type, weight: 1 }));
};

/**
 * Lists where the sky could go from a condition within a season (SkyWalk.candidatesFor): the condition's row of the
 * season's graph, kept to what the season allows, or every condition the season allows when it has no row, or none
 * that is allowed.
 * @param {SkyConfig} sky The sky.
 * @param {string} currentType The condition the sky is in.
 * @param {string} seasonName The season.
 * @returns {SkyCandidate[]} The candidates, in the order the row writes them.
 */
const candidatesFor = (sky: SkyConfig, currentType: string, seasonName: string): SkyCandidate[] =>
{
  const season = skySeasonOf(sky, seasonName);
  if (season === null)
  {
    return [];
  }

  const row = entryOf(season.transitions, currentType);
  if (row === undefined)
  {
    return anyOf(season);
  }

  const candidates = Object.keys(row)
    .filter(target => season.allowed.includes(target))
    .map(target => ({ type: target, weight: row[target] }));
  return candidates.length === 0
    ? anyOf(season)
    : candidates;
};

/**
 * Counts the fewest steps from one condition to another within a season's graph, breadth first (SkyWalk.hopsTo).
 * @param {SkyConfig} sky The sky.
 * @param {string} fromType Where the walk starts.
 * @param {string} targetType Where it is going.
 * @param {string} seasonName The season.
 * @returns {number} The steps, or {@link UNREACHABLE} when there is no route.
 */
const hopsTo = (sky: SkyConfig, fromType: string, targetType: string, seasonName: string): number =>
{
  if (fromType === targetType)
  {
    return 0;
  }

  const seen = new Set([ fromType ]);
  let frontier = [ fromType ];
  let distance = 0;

  // each pass grows the frontier by one step, so the first sighting of the target is the shortest route to it.
  while (frontier.length > 0)
  {
    distance++;
    const next: string[] = [];
    frontier.forEach(type =>
    {
      candidatesFor(sky, type, seasonName).forEach(candidate =>
      {
        if (seen.has(candidate.type) === false)
        {
          seen.add(candidate.type);
          next.push(candidate.type);
        }
      });
    });

    if (next.includes(targetType))
    {
      return distance;
    }

    frontier = next;
  }

  return UNREACHABLE;
};

/**
 * Picks the candidate standing nearest the condition a settling day steers toward (SkyWalk.closestTo): the fewest steps
 * from it, the first written on a tie, and one with no route there never.
 * @param {SkyConfig} sky The sky.
 * @param {SkyCandidate[]} candidates Where the sky could go, at least one.
 * @param {string} target The condition steered toward.
 * @param {string} seasonName The season.
 * @returns {string} The condition.
 */
const closestTo = (sky: SkyConfig, candidates: SkyCandidate[], target: string, seasonName: string): string =>
{
  let best = candidates[0].type;
  let shortest = Number.MAX_SAFE_INTEGER;
  candidates.forEach(candidate =>
  {
    const hops = hopsTo(sky, candidate.type, target, seasonName);
    if (hops !== UNREACHABLE && hops < shortest)
    {
      shortest = hops;
      best = candidate.type;
    }
  });

  return best;
};

/**
 * Takes the sky one phase along a settling day (SkyWalk.settlingType): a sky already at the condition the sky settles
 * toward stays, and any other takes whichever next step stands nearest it, no roll involved, so a monsoon walks down
 * through the graph rather than snapping out of itself.
 * @param {SkyConfig} sky The sky.
 * @param {string} currentType The condition the sky is in.
 * @param {string} seasonName The season ending.
 * @returns {string} The condition the sky moves to.
 */
const settlingType = (sky: SkyConfig, currentType: string, seasonName: string): string =>
{
  if (currentType === sky.settleTo)
  {
    return currentType;
  }

  const candidates = candidatesFor(sky, currentType, seasonName);
  return candidates.length === 0
    ? currentType
    : closestTo(sky, candidates, sky.settleTo, seasonName);
};

/**
 * Finds the condition the sky is in at a phase of a settling day, from the condition it came into the day in: one
 * settling step for every phase of the day so far, the first phase's included, since the day before ended rolling.
 * @param {SkyConfig} sky The sky.
 * @param {string} enteringType The condition the sky came into the day in.
 * @param {string} seasonName The season ending.
 * @param {number} phaseId The phase of the day, 0 to 5.
 * @returns {string} The condition.
 */
const settledType = (sky: SkyConfig, enteringType: string, seasonName: string, phaseId: number): string =>
{
  let type = enteringType;
  for (let step = 0; step <= phaseId; step++)
  {
    type = settlingType(sky, type, seasonName);
  }

  return type;
};

export {
  allowedIn,
  candidatesFor,
  clampIntensity,
  closestTo,
  faceFor,
  faceMatches,
  hopsTo,
  intensitiesOf,
  isPossibleIn,
  monthMultiplierFor,
  nearestRung,
  settledType,
  settlingType,
  SKY_LADDER,
  SKY_SEASONS,
  skySeasonName,
  skyTypeOf,
  UNREACHABLE,
  USUAL_STRENGTH,
};
export type { SkyCandidate };
