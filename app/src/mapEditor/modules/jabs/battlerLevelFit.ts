import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { Stamp } from '../../core/stamps/stamp.ts';
import type { FittedStamp, StampFit } from '../../core/tools/PaintState.ts';
import { pageAtLevel } from './battlerEdits.ts';
import { battlersOn, levelWords, newBattlerLevel } from './battlerLevelRule.ts';
import { levelSetFor, NEW_BATTLER_LEVELS_DOCUMENT } from './battlerLevelSetting.ts';
import { pageEnemyId } from './battlerReading.ts';

/**
 * What a battler brush's fit worked out last: for which map, at which of its revisions, against which revision of the
 * levels set in Map Properties, and what it came to.
 */
type LastFit = {
  readonly map: MapDocument;
  readonly mapRevision: number;
  readonly levelsRevision: number;
  readonly fitted: FittedStamp;
};

/**
 * Gives every battler page of a stamp's events a level, written as the battler panel writes one (see pageAtLevel); every
 * other page, and everything else the stamp holds, its id included, stays as it is.
 * @param {Stamp} stamp The stamp.
 * @param {number} level The level.
 * @returns {Stamp} A copy of the stamp at that level.
 */
const stampAtLevel = (stamp: Stamp, level: number): Stamp =>
{
  const events = stamp.events.map(event => ({
    ...event,
    pages: event.pages.map(page => (pageEnemyId(page) === null ? page : pageAtLevel(page, level))),
  }));
  return { ...stamp, events };
};

/**
 * Builds the battler brush's fit (see StampFit): every map the brush places on gives the battler the level the rule finds
 * there (see newBattlerLevel), from the level set for the map in Map Properties and the map's own battlers as they stand
 * at that moment, written into the battler's page as the panel writes one; and the words say which level and why. A
 * battler at no level goes down as the brush holds it, at its enemy's own.
 *
 * The preview asks on every move of the pointer, so what it comes to is kept until the map or the levels change, and the
 * stamp at each level is made once, so the ghost under the pointer keeps the same picture from one tile to the next.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents, the levels set in Map Properties among them.
 * @param {Stamp} stamp What the brush places, at no level.
 * @param {number} enemyId The enemy its battler fights as.
 * @returns {StampFit} The fit.
 */
const battlerLevelFit = (hub: Pick<DocumentHub, 'has' | 'document'>, stamp: Stamp, enemyId: number): StampFit =>
{
  const atLevel = new Map<number, Stamp>();
  let last: LastFit | null = null;

  /**
   * Finds the stamp at a level, made the first time that level is asked for.
   * @param {number} level The level.
   * @returns {Stamp} The stamp.
   */
  const stampFor = (level: number): Stamp =>
  {
    const known = atLevel.get(level);
    if (known !== undefined)
    {
      return known;
    }

    const made = stampAtLevel(stamp, level);
    atLevel.set(level, made);
    return made;
  };

  return map =>
  {
    // what came of the map as it stood last time still stands while neither it nor the levels have changed.
    const levelsRevision = hub.has(NEW_BATTLER_LEVELS_DOCUMENT) ? hub.document(NEW_BATTLER_LEVELS_DOCUMENT).revision : -1;
    if (last !== null && last.map === map && last.mapRevision === map.revision && last.levelsRevision === levelsRevision)
    {
      return last.fitted;
    }

    const choice = newBattlerLevel(battlersOn(map.events), enemyId, levelSetFor(hub, map.mapId));
    const fitted: FittedStamp = {
      stamp: choice.level === null ? stamp : stampFor(choice.level),
      words: levelWords(choice),
    };
    last = { map, mapRevision: map.revision, levelsRevision, fitted };
    return fitted;
  };
};

export { battlerLevelFit, stampAtLevel };
