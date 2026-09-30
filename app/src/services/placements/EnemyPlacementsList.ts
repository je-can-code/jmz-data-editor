import type { EnemyPlacement } from './EnemyPlacementsReader.ts';

/**
 * The placements on one map, which the board lists together under the map's heading.
 */
type MapPlacements = {
  /**
   * The map's id.
   */
  readonly mapId: number;

  /**
   * The heading: the map's name, or its number when the map tree has no name for it.
   */
  readonly title: string;

  /**
   * The line beside the heading: the map's number and how many placements it holds.
   */
  readonly caption: string;

  /**
   * The map's placements, in event order.
   */
  readonly placements: readonly EnemyPlacement[];
};

/**
 * Counts something: "1 event", "12 events".
 * @param {number} count How many.
 * @param {string} noun The thing counted, singular.
 * @returns {string} The count and the noun, plural when it needs to be.
 */
const countOf = (count: number, noun: string): string =>
{
  return count === 1
    ? `1 ${noun}`
    : `${count} ${noun}s`;
};

/**
 * Joins words into a list the way a sentence does: "1", "1 and 3", "1, 2 and 4".
 * @param {string[]} words The words, in order.
 * @returns {string} The words joined.
 */
const joinAsList = (words: string[]): string =>
{
  if (words.length < 2)
  {
    return words.join('');
  }

  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
};

/**
 * Names a map for its heading.
 * @param {EnemyPlacement} placement Any placement on the map.
 * @returns {string} The map's name, or "Map 12" when the map tree has no name for it.
 */
const titleOf = (placement: EnemyPlacement): string =>
{
  return placement.mapName === ''
    ? `Map ${placement.mapId}`
    : placement.mapName;
};

/**
 * Groups placements under their maps, maps in id order and the events on each in id order, so the list reads the
 * same way every time whatever order the placements came in.
 * @param {readonly EnemyPlacement[]} placements The placements of one enemy.
 * @returns {MapPlacements[]} One entry per map holding any of them.
 */
const groupPlacementsByMap = (placements: readonly EnemyPlacement[]): MapPlacements[] =>
{
  // sort a copy, leaving the caller's list as it was.
  const sorted = [ ...placements ].sort((left, right) => left.mapId - right.mapId || left.eventId - right.eventId);

  // gather each map's placements in the order they now stand.
  const byMap = new Map<number, EnemyPlacement[]>();
  sorted.forEach(placement =>
  {
    const onMap = byMap.get(placement.mapId) ?? [];
    onMap.push(placement);
    byMap.set(placement.mapId, onMap);
  });

  return [ ...byMap.values() ].map(onMap => (
    {
      mapId: onMap[0].mapId,
      title: titleOf(onMap[0]),
      caption: `Map ${onMap[0].mapId}, ${countOf(onMap.length, 'event')}`,
      placements: onMap,
    }
  ));
};

/**
 * Sums up where an enemy is placed, for the line under the card's title.
 * @param {readonly MapPlacements[]} groups The enemy's placements, grouped by map.
 * @returns {string} How many times and on how many maps, or that it is placed nowhere.
 */
const summarizePlacements = (groups: readonly MapPlacements[]): string =>
{
  // count every placement across the maps.
  const total = groups.reduce((sum, group) => sum + group.placements.length, 0);
  if (total === 0)
  {
    return 'Not placed on any map.';
  }

  if (total === 1)
  {
    return 'Placed once.';
  }

  if (groups.length === 1)
  {
    return `Placed ${total} times, all on one map.`;
  }

  return `Placed ${total} times across ${groups.length} maps.`;
};

/**
 * Names an event the way the enemy list names an enemy: its id, then its name.
 * @param {EnemyPlacement} placement The placement.
 * @returns {string} Such as "Event 12: Slime".
 */
const describeEvent = (placement: EnemyPlacement): string =>
{
  return `Event ${placement.eventId}: ${placement.eventName}`;
};

/**
 * Names the tile an event starts on.
 * @param {EnemyPlacement} placement The placement.
 * @returns {string} Such as "(10, 12)".
 */
const describePosition = (placement: EnemyPlacement): string =>
{
  return `(${placement.x}, ${placement.y})`;
};

/**
 * Says which of an event's pages make it the enemy, since on any other page it is something else, or nothing. An
 * event whose only page makes it the enemy has nothing worth saying.
 * @param {EnemyPlacement} placement The placement.
 * @returns {string} Such as "Page 2 of 2", "Pages 1 and 3 of 3" or "All 2 pages", and empty for a one-page event.
 */
const describePages = (placement: EnemyPlacement): string =>
{
  const { pageIndexes, pageCount } = placement;
  if (pageCount === 1)
  {
    return '';
  }

  if (pageIndexes.length === pageCount)
  {
    return `All ${pageCount} pages`;
  }

  // pages are numbered from 1 in the editor, as MZ numbers them.
  const numbers = pageIndexes.map(pageIndex => `${pageIndex + 1}`);
  const label = numbers.length === 1
    ? 'Page'
    : 'Pages';
  return `${label} ${joinAsList(numbers)} of ${pageCount}`;
};

/**
 * The line under an event in the list: where it starts, then its pages when they are worth a word.
 * @param {EnemyPlacement} placement The placement.
 * @returns {string} Such as "(10, 12)" or "(10, 12), page 2 of 2".
 */
const describeDetails = (placement: EnemyPlacement): string =>
{
  const position = describePosition(placement);
  const pages = describePages(placement);

  return pages === ''
    ? position
    : `${position}, ${pages.charAt(0).toLowerCase()}${pages.slice(1)}`;
};

export type { MapPlacements };
export { describeDetails, describeEvent, describePages, describePosition, groupPlacementsByMap, summarizePlacements };
