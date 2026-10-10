import type { DocumentChange } from '../../core/model/EditorDocument.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { pageEnemyId, pageLevelOf } from './battlerReading.ts';

/**
 * One battler standing on a map, as the battler brush counts them: an event once for every enemy its pages name, read
 * from the first of its pages naming that enemy, as the server finds an enemy's battlers for the brush (see
 * EnemyBattlerPage), with the level that page gives, or null for a page giving none.
 */
type MapBattler = {
  readonly enemyId: number;
  readonly level: number | null;
};

/**
 * Where a new battler's level comes from, in the order the rule tries them (see {@link newBattlerLevel}): the level set
 * for the map in Map Properties, the level that enemy already carries on the map, the map's level, or nowhere, which
 * leaves the battler at its enemy's own level.
 */
type LevelSource = 'setting' | 'enemy' | 'map' | 'none';

/**
 * The level a new battler starts at on a map, and where it comes from. A level of null, from nowhere, writes no level at
 * all, so the enemy's own level from the database applies.
 */
type NewBattlerLevel = {
  readonly level: number | null;
  readonly from: LevelSource;
};

/**
 * Lists the battlers standing on a map: each event once for every enemy its pages name, read from the first of its pages
 * naming that enemy, with the level that page gives, as J-LevelMaster reads it.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's events, by id, an empty slot null.
 * @returns {MapBattler[]} The battlers, by event, and within an event in the order its pages first name each enemy.
 */
const battlersOn = (events: readonly (RmmzMapEvent | null)[]): MapBattler[] =>
{
  return events.flatMap(event =>
  {
    if (event === null)
    {
      return [];
    }

    // a battler that changes enemy from page to page stands as each enemy it names, read from its first page naming it.
    const named = new Set<number>();
    return event.pages.flatMap(page =>
    {
      const enemyId = pageEnemyId(page);
      if (enemyId === null || named.has(enemyId))
      {
        return [];
      }

      named.add(enemyId);
      return [ { enemyId, level: pageLevelOf(page) } ];
    });
  });
};

/**
 * Finds the most common of some levels. A tie goes to the higher level, so the answer never hangs on the order the
 * battlers happen to stand in the map's list.
 * @param {readonly number[]} levels The levels.
 * @returns {number | null} The most common, or null for none at all.
 */
const mostCommonLevel = (levels: readonly number[]): number | null =>
{
  const counts = new Map<number, number>();
  levels.forEach(level => counts.set(level, (counts.get(level) ?? 0) + 1));

  // the best so far gives way to a level more common, or as common and higher.
  let best: { level: number; count: number } | null = null;
  for (const [ level, count ] of counts)
  {
    if (best === null || count > best.count || (count === best.count && level > best.level))
    {
      best = { level, count };
    }
  }

  return best === null
    ? null
    : best.level;
};

/**
 * Reads a map's level: the most common level its battlers give, a tie going to the higher. Battlers giving no level of
 * their own count for nothing, so a map learns its level from the first battler given one.
 * @param {readonly MapBattler[]} battlers The map's battlers.
 * @returns {number | null} The level, or null while no battler on the map gives one.
 */
const mapLevelOf = (battlers: readonly MapBattler[]): number | null =>
{
  return mostCommonLevel(battlers.flatMap(battler => (battler.level === null ? [] : [ battler.level ])));
};

/**
 * Works out the level a new battler of an enemy starts at on a map, trying in this order:
 *
 * 1. the level set for the map in Map Properties, whatever the enemy;
 * 2. the level that enemy already carries on the map, the most common among its battlers there;
 * 3. the map's level, the most common among all its battlers;
 * 4. none at all, so the enemy's own level applies.
 *
 * A tie between levels goes to the higher one. The map learns by reading its own battlers, nothing being kept beside
 * them: a level given a battler in the battler panel counts at once, and undoing that change takes it back again.
 * @param {readonly MapBattler[]} battlers The map's battlers, as they stand.
 * @param {number} enemyId The enemy the new battler fights as.
 * @param {number | null} setting The level set for the map, or null for none.
 * @returns {NewBattlerLevel} The level, and where it comes from.
 */
const newBattlerLevel = (battlers: readonly MapBattler[], enemyId: number, setting: number | null): NewBattlerLevel =>
{
  if (setting !== null)
  {
    return { level: setting, from: 'setting' };
  }

  const enemyLevel = mapLevelOf(battlers.filter(battler => battler.enemyId === enemyId));
  if (enemyLevel !== null)
  {
    return { level: enemyLevel, from: 'enemy' };
  }

  const mapLevel = mapLevelOf(battlers);
  return mapLevel === null
    ? { level: null, from: 'none' }
    : { level: mapLevel, from: 'map' };
};

/**
 * Says in a few words, beside the battler brush's pointer, which level the next battler starts at and why.
 * @param {NewBattlerLevel} choice The level, and where it comes from.
 * @returns {string} Such as "Level 12 · this map's setting", or "The enemy's own level".
 */
const levelWords = (choice: NewBattlerLevel): string =>
{
  switch (choice.from)
  {
    case 'setting':
      return `Level ${choice.level} · this map's setting`;
    case 'enemy':
      return `Level ${choice.level} · this enemy's level here`;
    case 'map':
      return `Level ${choice.level} · this map's level`;
    case 'none':
      return 'The enemy\'s own level';
  }
};

/**
 * Says, under the map's setting in Map Properties, what the next battler placed on the map starts at: the level set, or,
 * with none set, its enemy's level on the map before the map's level, and the enemy's own while the map has neither.
 * @param {number | null} setting The level set for the map, or null for none.
 * @param {number | null} mapLevel The map's level (see {@link mapLevelOf}), or null while no battler on it gives one.
 * @returns {string} The line.
 */
const nextBattlerWords = (setting: number | null, mapLevel: number | null): string =>
{
  if (setting !== null)
  {
    return `Next battler: level ${setting}, this map's setting.`;
  }

  return mapLevel === null
    ? 'Next battler: the enemy\'s own level.'
    : `Next battler: its enemy's level here, else level ${mapLevel}, this map's level.`;
};

/**
 * Reports whether a change to a map can change the levels its battlers give: a page of an event changed, or an event
 * placed or taken away; never a tile painted, nor an event moved or renamed, which change many times a second as the
 * author works and change no battler's level.
 * @param {DocumentChange} change The change.
 * @returns {boolean} True when the map's battlers may give other levels now.
 */
const touchesBattlerLevels = (change: DocumentChange): boolean =>
{
  if (change.kind === 'replaced')
  {
    return true;
  }

  const { patch } = change;
  if (patch.kind === 'tiles' || patch.kind === 'resize')
  {
    return false;
  }

  // the events list itself, or one whole event, or anything inside an event's pages.
  const [ root, , field ] = patch.path;
  return root === 'events' && (field === undefined || field === 'pages');
};

export { battlersOn, levelWords, mapLevelOf, mostCommonLevel, newBattlerLevel, nextBattlerWords, touchesBattlerLevels };
export type { LevelSource, MapBattler, NewBattlerLevel };
