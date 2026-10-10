import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventEdit } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { changeBattlerPage, changeBattlers } from '../../../../src/mapEditor/modules/jabs/battlerChanges.ts';
import { planBattlerChange, type BattlerChange, type BattlerContext } from '../../../../src/mapEditor/modules/jabs/battlerEdits.ts';
import { jabsDefaultsOf, pageEnemyId, readBattlerPage, type BattlerReading, type EnemyRecord } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import { motionDefaultsFrom, motionLinesOf } from '../../../../src/mapEditor/modules/jabs/motionTags.ts';
import { pluginBasename, readPluginEntries } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { applyEdits } from '../../support/eventKindFixtures.ts';

/*
 * The battler panel's writes held against every battler page the game ships, each read from the game's map files into
 * memory and changed there alone, a mirror nothing writes back to.
 *
 * Every row the panel offers is written on every page, and cleared: each number, switch, the team, the AI traits and
 * roles, the passives, the enemy, and each motion line, changed, taken off, and one added. After each write the page
 * reads the row as written; after each clear it reads no value of its own for it, so the enemy's applies; and after
 * either, every command not carrying the row's tag is exactly as it was, and every other row reads from the page as it
 * did. Writing a row back as it was leaves the page byte for byte as the game shipped it, and so does clearing a value
 * the page never set, where every way back exists.
 *
 * And every change made through a window's history, from a battler's quick panel or from its event window, undoes: each
 * shipped map, every battler on it changed and undone in turn, comes back byte for byte.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * One battler page, as an event of that page alone, and where it came from.
 */
type ShippedPage = {
  readonly where: string;
  readonly event: RmmzMapEvent;
};

/**
 * Applies a change to a page's event, as a quick panel's edits are applied.
 * @param {RmmzMapEvent} event The event, its battler page first.
 * @param {BattlerChange} change The change.
 * @param {BattlerContext} context The enemies and defaults.
 * @returns {RmmzMapEvent} The event changed.
 */
const changed = (event: RmmzMapEvent, change: BattlerChange, context: BattlerContext): RmmzMapEvent =>
{
  const edits: EventEdit[] = planBattlerChange(event.pages[0], 0, change, context);
  return applyEdits(event, edits);
};

/**
 * Reads what a page's own tags set for each row, and its motion lines.
 * @param {RmmzEventPage} page The page.
 * @param {BattlerContext} context The enemies and defaults.
 * @returns {Record<string, JsonValue>} Each row's value from the page.
 */
const pageValues = (page: RmmzEventPage, context: BattlerContext): Record<string, JsonValue> =>
{
  const reading = readBattlerPage(page, context.enemyOf, context.defaults) as BattlerReading;
  return {
    enemy: reading.enemyId,
    level: reading.level.event,
    moveSpeed: reading.moveSpeed.event,
    sight: reading.sight.event,
    pursuit: reading.pursuit.event,
    alertedSightBoost: reading.alertedSightBoost.event,
    alertedPursuitBoost: reading.alertedPursuitBoost.event,
    alertDuration: reading.alertDuration.event,
    aiTraits: reading.aiTraits.event as JsonValue,
    aiRoles: reading.aiRoles.event as JsonValue,
    inanimate: reading.inanimate.event,
    team: reading.team.event,
    idle: reading.idle.event,
    hpBar: reading.hpBar.event,
    name: reading.name.event,
    passives: reading.passives.event as JsonValue,
    motion: motionLinesOf(page).map(line => [ line.type, ...line.values, line.sync ? 'sync' : '' ]),
  };
};

/**
 * The tag each row writes, as the line it is on starts.
 */
const ROW_TAGS: Readonly<Record<string, RegExp>> = {
  enemy: /^<enemyId:/i,
  level: /^<(?:lv|lvl|level):/i,
  moveSpeed: /^<moveSpeed:/i,
  sight: /^<sight:/i,
  pursuit: /^<pursuit:/i,
  alertedSightBoost: /^<alertedSightBoost:/i,
  alertedPursuitBoost: /^<alertedPursuitBoost:/i,
  alertDuration: /^<alertDuration:/i,
  aiTraits: /^<aiTrait:[ ]?(careful|executor|reckless|healer|cleanser|buffer|tactical|berserker)>$/i,
  aiRoles: /^<(aiRole:|aiTrait:[ ]?(leader|follower)>)/i,
  inanimate: /^<jabsConfig:[ ]?(inanimate|notInanimate)>$/i,
  team: /^<teamId:/,
  idle: /^<jabsConfig:[ ]?(noIdle|canIdle)>$/i,
  hpBar: /^<jabsConfig:[ ]?(noHpBar|showHpBar)>$/i,
  name: /^<jabsConfig:[ ]?(noName|showName)>$/i,
  passives: /^<passive:/i,
  motion: /^<motion:/i,
};

/**
 * Lists a page's commands but those carrying a row's tag, comment lines by their text alone.
 * @param {readonly RmmzEventCommand[]} list The commands.
 * @param {string} row The row.
 * @returns {string[]} The commands left, each as JSON.
 */
const othersOf = (list: readonly RmmzEventCommand[], row: string): string[] =>
{
  return list.flatMap(command =>
  {
    const [ text ] = command.parameters;
    const comment = command.code === 108 || command.code === 408;
    if (comment && typeof text === 'string')
    {
      return ROW_TAGS[row].test(text) ? [] : [ JSON.stringify([ command.indent, text ]) ];
    }

    return [ JSON.stringify(command) ];
  });
};

/**
 * Checks one change made to one page: the row reads as meant, and nothing else moved.
 * @param {ShippedPage} shipped The page.
 * @param {RmmzMapEvent} after The event once changed.
 * @param {string} row The row changed.
 * @param {JsonValue} meant What the row should read from the page.
 * @param {BattlerContext} context The enemies and defaults.
 * @returns {string[]} What went wrong; none when nothing did.
 */
const wrongChange = (shipped: ShippedPage, after: RmmzMapEvent, row: string, meant: JsonValue | undefined, context: BattlerContext): string[] =>
{
  const before = pageValues(shipped.event.pages[0], context);
  const now = pageValues(after.pages[0], context);
  const othersRead = Object.keys(before).every(key => key === row || JSON.stringify(before[key]) === JSON.stringify(now[key]));
  const othersKept = JSON.stringify(othersOf(shipped.event.pages[0].list, row)) === JSON.stringify(othersOf(after.pages[0].list, row));
  const rowRead = meant === undefined || JSON.stringify(now[row]) === JSON.stringify(meant);
  const pageKept = JSON.stringify({ ...shipped.event.pages[0], list: [] }) === JSON.stringify({ ...after.pages[0], list: [] });
  return othersRead && othersKept && rowRead && pageKept
    ? []
    : [ `${shipped.where} ${row}: ${JSON.stringify(now[row])} for ${JSON.stringify(meant)}, others read ${othersRead}, kept ${othersKept}` ];
};

/**
 * Checks a page came back exactly as shipped.
 * @param {ShippedPage} shipped The page.
 * @param {RmmzMapEvent} back The event once changed back.
 * @param {string} how What changed it back, for the message.
 * @returns {string[]} What went wrong; none when it came back byte for byte.
 */
const wrongReturn = (shipped: ShippedPage, back: RmmzMapEvent, how: string): string[] =>
{
  return JSON.stringify(back) === JSON.stringify(shipped.event)
    ? []
    : [ `${shipped.where}: ${how} did not bring the page back` ];
};

/**
 * The write-backs that came back reading as shipped but spelled the panel's way, such as a move speed of 4 coming back
 * as 4.0 once it has been 4.5, or a lowercase setting coming back in J-ABS's own case: the way back passes through
 * another value, which leaves the line in the panel's spelling. Each is still held to reading exactly as shipped, with
 * nothing else moved.
 */
type Respelled = string[];

/**
 * Writes one row with another value, then back, and clears it; or, for a row the page sets nothing for, writes it and
 * clears it: every way checked as {@link wrongChange} and {@link wrongReturn} check them.
 * @param {ShippedPage} shipped The page.
 * @param {string} row The row.
 * @param {JsonValue} own What the page sets for it, or null for nothing.
 * @param {JsonValue} other Another value for it.
 * @param {(value: JsonValue) => BattlerChange} change Builds the row's change.
 * @param {BattlerContext} context The enemies and defaults.
 * @param {Respelled} respelled Where a write-back coming back respelled is noted.
 * @param {boolean} cleanBack Whether writing the page's own value back must bring the page back byte for byte.
 * @returns {string[]} What went wrong; none when nothing did.
 */
const wrongRow = (
  shipped: ShippedPage,
  row: string,
  own: JsonValue,
  other: JsonValue,
  change: (value: JsonValue) => BattlerChange,
  context: BattlerContext,
  respelled: Respelled,
  cleanBack = true,
): string[] =>
{
  const written = changed(shipped.event, change(other), context);
  const cleared = changed(shipped.event, change(null), context);
  const emptied = row === 'passives' ? [] : null;
  const wrong = [ ...wrongChange(shipped, written, row, other, context), ...wrongChange(shipped, cleared, row, emptied, context) ];
  if (own === null || JSON.stringify(own) === '[]')
  {
    return [ ...wrong, ...wrongReturn(shipped, changed(written, change(null), context), `${row} cleared`) ];
  }

  const back = changed(written, change(own), context);
  const exact = cleanBack && wrongReturn(shipped, back, `${row} written back`).length === 0;
  if (cleanBack && exact === false)
  {
    respelled.push(`${shipped.where} ${row}`);
  }

  return exact
    ? wrong
    : [ ...wrong, ...wrongChange(shipped, back, row, own, context) ];
};

/**
 * Adds to a set the first word it lacks, in J-ABS's order, as an author ticking one more would.
 * @param {readonly string[]} set The set.
 * @param {readonly string[]} order Every word, in J-ABS's order.
 * @returns {string[]} The set with one more word, in J-ABS's order.
 */
const oneMore = (set: readonly string[], order: readonly string[]): string[] =>
{
  const added = order.find(word => set.includes(word) === false) as string;
  return order.filter(word => word === added || set.includes(word));
};

/**
 * Writes and clears every row the panel offers on one page.
 * @param {ShippedPage} shipped The page.
 * @param {BattlerContext} context The enemies and defaults.
 * @param {Respelled} respelled Where a write-back coming back respelled is noted.
 * @returns {string[]} What went wrong; none when nothing did.
 */
const wrongRows = (shipped: ShippedPage, context: BattlerContext, respelled: Respelled): string[] =>
{
  const own = pageValues(shipped.event.pages[0], context);
  const numbers: [ string, number ][] = [
    [ 'level', 1 ], [ 'moveSpeed', 0.5 ], [ 'sight', 1 ], [ 'pursuit', 1 ], [ 'alertedSightBoost', 1 ], [ 'alertedPursuitBoost', 1 ], [ 'alertDuration', 30 ],
  ];
  const numberWrongs = numbers.flatMap(([ row, step ]) =>
  {
    const value = own[row] as number | null;
    return wrongRow(shipped, row, value, (value ?? 0) + step, next => ({ row, value: next } as BattlerChange), context, respelled);
  });
  const switchWrongs = [ 'inanimate', 'idle', 'hpBar', 'name' ].flatMap(row =>
  {
    const value = own[row] as boolean | null;
    return wrongRow(shipped, row, value, value !== true, next => ({ row, value: next } as BattlerChange), context, respelled);
  });
  const team = own['team'] as number | null;
  const traits = own['aiTraits'] as string[] | null;
  const roles = own['aiRoles'] as string[] | null;
  const passives = own['passives'] as number[];
  const passiveLines = shipped.event.pages[0].list.filter(command => typeof command.parameters[0] === 'string' && /^<passive:/i.test(command.parameters[0])).length;
  const enemyId = own['enemy'] as number;
  const traitOrder = [ 'careful', 'executor', 'reckless', 'healer', 'cleanser', 'buffer', 'tactical', 'berserker' ];
  const roleOrder = [ 'leader', 'follower', 'guardian', 'ward', 'solo', 'sentinel' ];
  return [
    ...numberWrongs,
    ...switchWrongs,
    ...wrongRow(shipped, 'team', team, team === 3 ? 4 : 3, next => ({ row: 'team', value: next as number | null }), context, respelled),
    ...wrongRow(shipped, 'aiTraits', traits, oneMore(traits ?? [], traitOrder), next => ({ row: 'aiTraits', value: next as string[] | null }), context, respelled),
    ...wrongRow(shipped, 'aiRoles', roles, oneMore(roles ?? [], roleOrder), next => ({ row: 'aiRoles', value: next as string[] | null }), context, respelled),
    ...wrongRow(shipped, 'passives', passives, [ ...passives, 5 ], next => ({ row: 'passives', value: next as number[] | null }), context, respelled, passiveLines <= 1),
    ...wrongChange(shipped, changed(changed(shipped.event, { row: 'enemy', value: enemyId === 1 ? 2 : 1 }, context), { row: 'enemy', value: enemyId }, context), 'enemy', enemyId, context),
    ...wrongReturn(shipped, changed(changed(shipped.event, { row: 'enemy', value: enemyId === 1 ? 2 : 1 }, context), { row: 'enemy', value: enemyId }, context), 'the enemy written back'),
  ];
};

/**
 * Changes, takes off and adds motions on one page.
 * @param {ShippedPage} shipped The page.
 * @param {BattlerContext} context The enemies and defaults.
 * @returns {string[]} What went wrong; none when nothing did.
 */
const wrongMotions = (shipped: ShippedPage, context: BattlerContext): string[] =>
{
  const [ page ] = shipped.event.pages;
  const lines = motionLinesOf(page);
  const changes = lines.flatMap((line, motion) =>
  {
    const others = lines.filter((_, index) => index !== motion).map(each => [ each.type, ...each.values, each.sync ? 'sync' : '' ]);
    const removed = changed(shipped.event, { row: 'motion', motion, value: null }, context);
    const removedWrong = wrongChange(shipped, removed, 'motion', others, context);
    if (line.known === false)
    {
      return removedWrong;
    }

    const type = line.type === 'pulse' ? 'float' : 'pulse';
    const written = changed(shipped.event, { row: 'motion', motion, value: { type, values: [], sync: line.sync } }, context);
    const expected = lines.map((each, index) => (index === motion ? [ type, line.sync ? 'sync' : '' ] : [ each.type, ...each.values, each.sync ? 'sync' : '' ]));
    const back = changed(written, { row: 'motion', motion, value: { type: line.type, values: line.values, sync: line.sync } }, context);
    return [ ...removedWrong, ...wrongChange(shipped, written, 'motion', expected, context), ...wrongReturn(shipped, back, 'a motion written back') ];
  });

  // a motion added and taken off again leaves the page as it was.
  const added = changed(shipped.event, { row: 'motion', motion: null, value: null }, context);
  const addedLines = motionLinesOf(added.pages[0]);
  const addedWrong = wrongChange(shipped, added, 'motion', [ ...lines.map(each => [ each.type, ...each.values, each.sync ? 'sync' : '' ]), [ 'stretch', '' ] ], context);
  const back = changed(added, { row: 'motion', motion: addedLines.length - 1, value: null }, context);
  return [ ...changes, ...addedWrong, ...wrongReturn(shipped, back, 'a motion added and taken off') ];
};

describe.skipIf(project === null)('the battler panel\'s writes on every shipped battler', () =>
{
  const root = project as string;
  const enemies = project === null ? [] : readDataFile(root, 'Enemies.json') as (EnemyRecord | null)[];
  const plugins = project === null ? [] : readPluginEntries(readFileSync(`${root}/js/plugins.js`, 'utf8'));
  const context: BattlerContext = {
    enemyOf: enemyId => enemies[enemyId] ?? null,
    defaults: jabsDefaultsOf(plugins.find(plugin => pluginBasename(plugin.name) === 'J-ABS')),
    motionDefaults: motionDefaultsFrom(project === null ? null : readDataFile(root, 'config.motion.json') as JsonValue),
  };
  const pages: ShippedPage[] = project === null
    ? []
    : listMapFiles(root).flatMap(file =>
    {
      const map = readDataFile(root, file) as RmmzMap;
      return (map.events.filter(event => event !== null) as RmmzMapEvent[])
        .flatMap(event => event.pages.map((page, index) => ({ where: `${file} event ${event.id} page ${index + 1}`, event: { ...event, pages: [ page ] } })))
        .filter(({ event }) => pageEnemyId(event.pages[0]) !== null);
    });

  it('writes and clears every row on every battler page, moving nothing else, and writes each back as it was', () =>
  {
    // Arrange: every battler page, read once above, and somewhere to note a write-back that comes back respelled.
    const respelled: Respelled = [];

    // Act.
    const wrong = pages.flatMap(shipped => wrongRows(shipped, context, respelled));

    // Assert: nothing wrong anywhere, and next to every write-back byte for byte: only a handful respelled, each of them
    // still reading as shipped with nothing else moved.
    expect([ pages.length > 4500, wrong.slice(0, 5), wrong.length, respelled.length < pages.length / 100 ])
      .toStrictEqual([ true, [], 0, true ]);
  }, 120_000);

  it('undoes every change on every shipped map byte for byte, from the map\'s history and from the event\'s', () =>
  {
    // Arrange: every map holding battlers, each held in a window of its own.
    const maps = listMapFiles(root).flatMap(file =>
    {
      const map = readDataFile(root, file) as RmmzMap;
      const battlers = (map.events.filter(each => each !== null) as RmmzMapEvent[]).filter(each => each.pages.some(shown => pageEnemyId(shown) !== null));
      return battlers.length === 0 ? [] : [ { mapId: Number(file.slice(3, -5)), map, battlers } ];
    });

    // Act: on each battler's first battler page, a sight written and a move speed cleared from the quick panel, and the
    // enemy changed from the event window, each undone at once; then every map read back whole.
    const wrong = maps.flatMap(({ mapId, map, battlers }) =>
    {
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt(mapDocumentKey(mapId), map as unknown as JsonValue);
      const before = JSON.stringify(hub.map(mapDocumentKey(mapId)).toJson());
      const steps = battlers.flatMap(battler =>
      {
        const pageIndex = battler.pages.findIndex(shown => pageEnemyId(shown) !== null);
        const reading = readBattlerPage(battler.pages[pageIndex], context.enemyOf, context.defaults) as BattlerReading;
        const made = [
          changeBattlers(hub, mapId, () => pageIndex, [ battler.id ], { row: 'sight', value: reading.sight.value + 1 }, context),
          hub.undo(mapHistoryKey(mapId)),
          changeBattlers(hub, mapId, () => pageIndex, [ battler.id ], { row: 'moveSpeed', value: null }, context),
          hub.undo(mapHistoryKey(mapId)),
          changeBattlerPage(hub, { mapId, eventId: battler.id }, pageIndex, { row: 'enemy', value: reading.enemyId + 1 }, context),
          hub.undo(eventHistoryKey(mapId, battler.id)),
        ];
        return made[0] === null ? [ `${mapId}/${battler.id} wrote no sight` ] : [];
      });
      const after = JSON.stringify(hub.map(mapDocumentKey(mapId)).toJson());
      return after === before ? steps : [ ...steps, `Map${mapId} did not come back byte for byte` ];
    });

    // Assert.
    expect([ maps.length > 200, wrong.slice(0, 5), wrong.length ])
      .toStrictEqual([ true, [], 0 ]);
  }, 120_000);

  it('changes, takes off and adds motions on every battler page, moving nothing else', () =>
  {
    // Arrange: nothing beyond every battler page, read once above.

    // Act.
    const wrong = pages.flatMap(shipped => wrongMotions(shipped, context));

    // Assert: thousands of motions among them, every one changed and taken off cleanly.
    const motions = pages.flatMap(({ event }) => motionLinesOf(event.pages[0]));
    expect([ motions.length > 4000, wrong.slice(0, 5), wrong.length ])
      .toStrictEqual([ true, [], 0 ]);
  }, 120_000);
});
