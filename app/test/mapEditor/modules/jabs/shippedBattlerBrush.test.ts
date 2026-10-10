import { describe, expect, it } from 'vitest';
import type { EnemyBattlerPage } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { parsableCommentLines } from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { placeStamp } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { battlersOn } from '../../../../src/mapEditor/modules/jabs/battlerLevelRule.ts';
import { battlerLookOf, battlerStamp, commonPage } from '../../../../src/mapEditor/modules/jabs/battlerLooks.ts';
import { pageEnemyId, pageLevelOf, type EnemyRecord } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The battler brush held against the battlers the game ships, read from its map files into memory, a mirror nothing writes
 * back to. The battlers each enemy already has are found as the server finds them for the brush: every event standing as
 * that enemy, with the first of its pages naming it.
 *
 * For every enemy with battlers, a battler placed with the brush, through the stamp tool's own placement on a free tile,
 * is compared field by field with the enemy's most common battler, its level aside: the picture, every page setting, the
 * conditions, the route and every command alike, and the name. It stands where it was clicked, under the map's next id,
 * as one step that undoes the map byte for byte, and the game reads it as a battler of that very enemy.
 *
 * For an enemy placed nowhere yet, the brush's battler is the game's most common battler, compared field by field, its
 * picture aside, with the most common battler page of all the game ships, every enemy's taken as one by its enemy line,
 * and each of its settings with the most common value of that setting alone.
 *
 * The level each battler is placed at is learnt from the battlers already on its map, which the level rule counts on
 * every shipped map exactly as the server counts an enemy's battlers, each at the level J-LevelMaster reads off it.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * Finds every battler the game ships as the server's battler-pages route finds them: each event once for every enemy its
 * pages name, with the first of its pages naming it, by enemy.
 * @param {string} root The project.
 * @returns {Map<number, EnemyBattlerPage[]>} The battlers, by enemy.
 */
const shippedBattlerPages = (root: string): Map<number, EnemyBattlerPage[]> =>
{
  const byEnemy = new Map<number, EnemyBattlerPage[]>();
  listMapFiles(root).forEach(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    const mapId = Number(file.slice(3, -5));
    (map.events.filter(each => each !== null) as RmmzMapEvent[]).forEach(shipped =>
    {
      const seen = new Set<number>();
      shipped.pages.forEach(shownPage =>
      {
        const enemyId = pageEnemyId(shownPage);
        if (enemyId === null || seen.has(enemyId))
        {
          return;
        }

        seen.add(enemyId);
        byEnemy.set(enemyId, [ ...byEnemy.get(enemyId) ?? [], { mapId, eventId: shipped.id, eventName: shipped.name, page: shownPage } ]);
      });
    });
  });

  return byEnemy;
};

/**
 * Reads a page with its level lines and its enemy's id set aside, and its picture too when asked, though never which way
 * it faces or the frame it stands on: the shape the brush is held to. A comment's lines are read as lines, wherever one
 * comment ends and the next begins.
 * @param {RmmzEventPage} shown The page.
 * @param {boolean} withImage Whether the picture counts.
 * @returns {string} The shape, as JSON.
 */
const shapeOf = (shown: RmmzEventPage, withImage: boolean): string =>
{
  const levels = new Set(parsableCommentLines(shown).filter(line => /^<(?:lv|lvl|level):/iu.test(line.text)).map(line => line.listIndex));
  const list = shown.list
    .filter((_, index) => levels.has(index) === false)
    .map(each => (each.code === 108 || each.code === 408 ? [ String(each.parameters[0]).replace(/<enemyId:[ ]?\d+>/iu, '<enemyId:N>'), each.indent ] : each));
  const image = withImage ? shown.image : { direction: shown.image.direction, pattern: shown.image.pattern };
  return JSON.stringify({ ...shown, list, image });
};

/**
 * Finds the most common of some values, the first seen winning a tie.
 * @param {readonly string[]} values The values.
 * @returns {string} The most common.
 */
const mostCommon = (values: readonly string[]): string =>
{
  const counts = new Map<string, number>();
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [ ...counts ].reduce((best, each) => (each[1] > best[1] ? each : best))[0];
};

/**
 * Places a battler with the brush on the free tile of a small map holding two events, as a click on a tile places the
 * stamp in hand.
 * @param {RmmzEventPage} brushPage What the brush places.
 * @param {string} name What it names the battler.
 * @returns {{ placed: RmmzMapEvent | null, ids: readonly number[], fresh: boolean, undone: boolean }} The battler placed,
 * the ids placed, whether its id lies past every slot the map's list held, and whether undoing the step brought the map
 * back byte for byte.
 */
const placeWithBrush = (brushPage: RmmzEventPage, name: string): { placed: RmmzMapEvent | null; ids: readonly number[]; fresh: boolean; undone: boolean } =>
{
  const hub = new DocumentHub({ clientId: 'window-a' });
  hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
  const before = JSON.stringify(hub.map('map:2').toJson());
  const slots = hub.map('map:2').events.length;
  const stamp = battlerStamp('window-a:1', { name, page: brushPage, copies: 0, of: 0 });
  const outcome = placeStamp(hub, 2, stamp, { at: { x: 1, y: 1 }, shaping: 'auto', mode: TilesetMode.area, linkRefusal: null }, 'Stamp');
  const ids = outcome.ok ? outcome.eventIds : [];
  const placed = ids.length === 1 ? hub.map('map:2').event(ids[0]) : null;
  hub.undo(mapHistoryKey(2));
  return { placed, ids, fresh: ids.every(id => id >= slots), undone: JSON.stringify(hub.map('map:2').toJson()) === before };
};

describe.skipIf(project === null)('the battler brush against the battlers the game ships', () =>
{
  const root = project as string;
  const byEnemy = project === null ? new Map<number, EnemyBattlerPage[]>() : shippedBattlerPages(root);
  const enemies = project === null ? [] : readDataFile(root, 'Enemies.json') as (EnemyRecord | null)[];

  it('places for every enemy a battler like its most common one, field by field, where it is clicked, undone byte for byte', () =>
  {
    // Arrange: every enemy with battlers, and its most common battler, level aside.
    const cases = [ ...byEnemy ].map(([ enemyId, battlers ]) => ({ enemyId, battlers, typical: mostCommon(battlers.map(battler => shapeOf(battler.page, true))) }));

    // Act.
    const wrong = cases.flatMap(({ enemyId, battlers, typical }) =>
    {
      const look = battlerLookOf(enemyId, enemies[enemyId]?.name ?? '', battlers);
      const { placed, ids, fresh, undone } = placeWithBrush(look.page, look.name);
      const name = mostCommon(battlers.map(battler => battler.eventName));
      const fine = placed !== null
        && shapeOf(placed.pages[0], true) === typical
        && placed.name === name
        && placed.pages.length === 1
        && pageEnemyId(placed.pages[0]) === enemyId
        && placed.x === 1
        && placed.y === 1
        && ids.length === 1
        && fresh
        && undone;
      return fine ? [] : [ `enemy ${enemyId}` ];
    });

    // Assert: well over a hundred enemies, every one placed like its own.
    expect([ cases.length > 100, wrong ])
      .toStrictEqual([ true, [] ]);
  }, 60_000);

  it('places for an enemy placed nowhere the game\'s most common battler, field by field, its picture aside', () =>
  {
    // Arrange: every battler the game ships, each once, by its first page naming each enemy.
    const all = [ ...byEnemy.values() ].flat();
    const typical = mostCommon(all.map(battler => shapeOf(battler.page, false)));
    const settings: (keyof RmmzEventPage)[] = [ 'priorityType', 'trigger', 'moveType', 'moveSpeed', 'moveFrequency', 'walkAnime', 'stepAnime', 'directionFix', 'through' ];

    // Act: an enemy no map holds, placed with the brush.
    const look = battlerLookOf(9999, 'Sky Whale', []);
    const { placed } = placeWithBrush(look.page, look.name);
    const [ placedPage ] = (placed as RmmzMapEvent).pages;
    const eachSetting = settings.map(setting => JSON.stringify(placedPage[setting]) === mostCommon(all.map(battler => JSON.stringify(battler.page[setting]))));

    // Assert.
    expect([ shapeOf(placedPage, false) === typical, eachSetting.every(same => same), placedPage.image.characterName, placed?.name, look.page.list.length === commonPage(9999).list.length ])
      .toStrictEqual([ true, true, '', 'sky whale', true ]);
  }, 60_000);

  it('counts the battlers on every map as the server counts them for the brush, each at the level J-LevelMaster reads', () =>
  {
    // Arrange: every battler the game ships, as the server's battler-pages route finds them, by map, enemy and level.
    const shipped = [ ...byEnemy ].flatMap(([ enemyId, battlers ]) => battlers.map(battler => `${battler.mapId}:${enemyId}:${pageLevelOf(battler.page)}`));

    // Act: every map's battlers, as the level rule counts them.
    const counted = listMapFiles(root).flatMap(file =>
    {
      const mapId = Number(file.slice(3, -5));
      const map = readDataFile(root, file) as RmmzMap;
      return battlersOn(map.events).map(battler => `${mapId}:${battler.enemyId}:${battler.level}`);
    });

    // Assert: well over four thousand battlers, the same ones at the same levels.
    expect([ counted.length > 4000, [ ...counted ].sort(), counted.filter(each => each.endsWith(':null') === false).length > 400 ])
      .toStrictEqual([ true, [ ...shipped ].sort(), true ]);
  }, 60_000);
});
