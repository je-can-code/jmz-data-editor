import type { EnemyBattlerPage } from '../../core/api/MapEditorApi.ts';
import { parsableCommentLines } from '../../core/blueprints/blueprintFields.ts';
import { createEventPage } from '../../core/model/eventModel.ts';
import { cloneJson } from '../../core/model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { Stamp } from '../../core/stamps/stamp.ts';
import { LEVEL_TAG } from './battlerFields.ts';

/**
 * What a battler brush places for an enemy: the event's name and its one page, at no level, and how many of the enemy's
 * battlers already placed it copies, of how many; none for an enemy placed nowhere yet, which takes the game's most common
 * battler. The level each battler starts at is the map's to say, where it lands (see battlerLevelFit).
 */
type BattlerLook = {
  readonly name: string;
  readonly page: RmmzEventPage;
  readonly copies: number;
  readonly of: number;
};

/**
 * The comment command codes: a comment's first line, and each line after it.
 */
const COMMENT_FIRST = 108;
const COMMENT_NEXT = 408;

/**
 * Builds one comment line.
 * @param {number} code Whether it starts a comment or carries one on.
 * @param {string} text Its text.
 * @returns {RmmzEventCommand} The command.
 */
const comment = (code: number, text: string): RmmzEventCommand =>
{
  return { code, indent: 0, parameters: [ text ] };
};

/**
 * The page of the game's most common battler, from a survey of the 4,734 battlers Chef Adventure shipped on 2026-10-10
 * (each read from the first of its pages naming its enemy), for an enemy no battler stands for yet: drawn in line with
 * characters (4,263 of them) and started by the action button (4,648), fixed in place for J-ABS to move (4,509), at MZ's
 * speed and frequency of 3 (4,414 and 4,359), walking but not stepping (4,234 and 3,990), turning (4,121) and solid
 * (3,821), facing down (4,212) on its middle frame (4,233), with no conditions (4,622). Every one of those is the most
 * common setting by far, and together they are the most common whole (1,926). Its comments carry the most common set of
 * tags (1,073), each with its most common value among them, J-Motion's float (633) and a move speed of 4.1 (369), laid out
 * as most battlers lay theirs (1,305): the motion alone, then the enemy with its speed. As a whole page it is the single
 * most common battler the game ships, picture aside (239). Its picture is the enemy's own, which only the enemy's
 * battlers can say, so it draws none, and shows the battler marker until one is chosen.
 * @param {number} enemyId The enemy.
 * @returns {RmmzEventPage} The page.
 */
const commonPage = (enemyId: number): RmmzEventPage =>
{
  return {
    ...createEventPage(),
    image: { tileId: 0, characterName: '', direction: 2, pattern: 1, characterIndex: 0 },
    priorityType: 1,
    trigger: 0,
    moveType: 0,
    moveSpeed: 3,
    moveFrequency: 3,
    walkAnime: true,
    stepAnime: false,
    directionFix: false,
    through: false,
    list: [
      comment(COMMENT_FIRST, '<motion:[float]>'),
      comment(COMMENT_FIRST, `<enemyId:${enemyId}>`),
      comment(COMMENT_NEXT, '<moveSpeed:4.1>'),
      { code: 0, indent: 0, parameters: [] },
    ],
  };
};

/**
 * Takes a page's level lines out, a comment's first line handing its place to the line after it: a battler's level is
 * where it stands in the game, which a new battler takes from the map it lands on rather than from the battlers it is
 * shaped like, wherever those stand.
 * @param {RmmzEventPage} page The page.
 * @returns {RmmzEventPage} A copy of the page without its level.
 */
const withoutLevel = (page: RmmzEventPage): RmmzEventPage =>
{
  const levels = new Set(parsableCommentLines(page).filter(line => LEVEL_TAG.pattern.test(line.text)).map(line => line.listIndex));
  const list = cloneJson(page.list);
  [ ...levels ].sort((left, right) => right - left).forEach(index =>
  {
    const next = list[index + 1];
    if (list[index].code === COMMENT_FIRST && next !== undefined && next.code === COMMENT_NEXT)
    {
      list[index + 1] = { ...next, code: COMMENT_FIRST };
    }

    list.splice(index, 1);
  });
  return { ...cloneJson(page), list };
};

/**
 * Finds the most common of some values, the first seen winning a tie.
 * @param {readonly T[]} values The values.
 * @param {(value: T) => string} keyOf What makes two of them the same.
 * @returns {{ value: T, count: number } | null} The most common and how many there are, or null for none at all.
 */
const mostCommon = <T>(values: readonly T[], keyOf: (value: T) => string): { value: T; count: number } | null =>
{
  const counts = new Map<string, { value: T; count: number }>();
  values.forEach(value =>
  {
    const key = keyOf(value);
    const known = counts.get(key);
    counts.set(key, { value: known === undefined ? value : known.value, count: (known === undefined ? 0 : known.count) + 1 });
  });

  // a map keeps its keys in the order they came, so the first seen of equal counts stays ahead.
  return [ ...counts.values() ].reduce<{ value: T; count: number } | null>((best, each) => (best === null || each.count > best.count ? each : best), null);
};

/**
 * Names a new battler of an enemy placed nowhere yet the way the game names most of its battlers: the enemy's name in
 * lowercase, without the marks that sort it in the database.
 * @param {string} enemyName The enemy's name.
 * @returns {string} The name, such as "cave bat" for "Cave Bat", or "battler" for an enemy with no name.
 */
const battlerName = (enemyName: string): string =>
{
  const plain = enemyName.replace(/^[*@]+/u, '').trim().toLowerCase();
  return plain === ''
    ? 'battler'
    : plain;
};

/**
 * Works out what a battler brush places for an enemy: a copy of the most common of its battlers already placed, page and
 * all, but for its level, which the map it lands on gives; and the name most of them carry. An enemy placed nowhere yet
 * gets the game's most common battler (see {@link commonPage}), named for the enemy.
 * @param {number} enemyId The enemy.
 * @param {string} enemyName The enemy's name, or empty when the database has none by that id.
 * @param {readonly EnemyBattlerPage[]} battlers The enemy's battlers already placed, each with its page naming it.
 * @returns {BattlerLook} What the brush places.
 */
const battlerLookOf = (enemyId: number, enemyName: string, battlers: readonly EnemyBattlerPage[]): BattlerLook =>
{
  // battlers differing in their level alone are one look.
  const looks = battlers.map(battler => withoutLevel(battler.page));
  const look = mostCommon(looks, page => JSON.stringify(page));
  const name = mostCommon(battlers.map(battler => battler.eventName), each => each);
  if (look === null || name === null)
  {
    return { name: battlerName(enemyName), page: commonPage(enemyId), copies: 0, of: 0 };
  }

  return { name: name.value, page: look.value, copies: look.count, of: battlers.length };
};

/**
 * Builds the stamp a battler brush places with each click: one event, on the cell clicked, with no tiles, so it goes
 * down on any map and any tileset.
 * @param {string} id The stamp's id, unique across windows.
 * @param {BattlerLook} look What it places.
 * @returns {Stamp} The stamp.
 */
const battlerStamp = (id: string, look: BattlerLook): Stamp =>
{
  const event: RmmzMapEvent = { id: 1, name: look.name, note: '', pages: [ cloneJson(look.page) ], x: 0, y: 0 };
  return { id, mapId: 0, tilesetId: 0, origin: { x: 0, y: 0 }, width: 1, height: 1, tiles: null, events: [ event ] };
};

export { battlerLookOf, battlerName, battlerStamp, commonPage, withoutLevel };
export type { BattlerLook };
